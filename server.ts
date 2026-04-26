import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { Octokit } from "octokit";
import fs from "fs";
import { scopeProject, auditFile, refactorCode } from "./aiService.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function updateEnv(updates: Record<string, string>) {
  const envPath = path.join(process.cwd(), ".env");
  let content = "";
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf-8");
  }

  const lines = content.split("\n");
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(`${key}=`)) {
        lines[i] = `${key}=${value}`;
        found = true;
        break;
      }
    }
    if (!found) {
      lines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(envPath, lines.join("\n"), "utf-8");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "skeptic-auth-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    })
  );

  // --- Auth Routes ---
  app.get("/api/auth/url", (req, res) => {
    const clientId = process.env.VITE_GITHUB_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "GitHub Client ID not configured" });
    }
    const redirectUri = `${process.env.APP_URL}/auth/callback`;
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo,read:user`;
    res.json({ url });
  });

  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.VITE_GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const data = await response.json();
      if (data.access_token) {
        (req.session as any).githubToken = data.access_token;
        
        // Fetch user info to store in session
        const octokit = new Octokit({ auth: data.access_token });
        const { data: user } = await octokit.rest.users.getAuthenticated();
        (req.session as any).user = user;

        res.send(`
          <html>
            <body>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                  window.close();
                } else {
                  window.location.href = '/';
                }
              </script>
              <p>Authentication successful. Window closing...</p>
            </body>
          </html>
        `);
      } else {
        res.status(400).send("Failed to exchange code for token");
      }
    } catch (error) {
      console.error("OAuth Error:", error);
      res.status(500).send("Internal Server Error during OAuth");
    }
  });

  app.get("/api/auth/me", (req, res) => {
    if ((req.session as any).user) {
      res.json({ user: (req.session as any).user });
    } else {
      res.status(401).json({ error: "Not authenticated" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // --- Update Checker ---
  app.get("/api/update-check", (req, res) => {
    res.json({ 
      version: "1.0.0", 
      url: "https://github.com/ghostintheprompt/skeptic/releases/latest" 
    });
  });

  // --- Config Management ---
  app.get("/api/config", (req, res) => {
    res.json({
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      hasGithubClientId: !!process.env.VITE_GITHUB_CLIENT_ID,
      hasGithubClientSecret: !!process.env.GITHUB_CLIENT_SECRET,
      appUrl: process.env.APP_URL || ""
    });
  });

  app.post("/api/config", (req, res) => {
    const { geminiKey, githubClientId, githubClientSecret, appUrl } = req.body;
    const updates: Record<string, string> = {};
    if (geminiKey) updates.GEMINI_API_KEY = geminiKey;
    if (githubClientId) updates.VITE_GITHUB_CLIENT_ID = githubClientId;
    if (githubClientSecret) updates.GITHUB_CLIENT_SECRET = githubClientSecret;
    if (appUrl) updates.APP_URL = appUrl;

    try {
      updateEnv(updates);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- AI Audit Endpoints ---
  app.post("/api/audit/scope", async (req, res) => {
    const { files } = req.body;
    try {
      const report = await scopeProject(files);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/audit/file", async (req, res) => {
    const { fileName, content } = req.body;
    try {
      const result = await auditFile(fileName, content);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/audit/refactor", async (req, res) => {
    const { finding, content } = req.body;
    try {
      const refactor = await refactorCode(finding, content);
      res.json({ refactor });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- GitHub API Proxy (Secure) ---
  app.get("/api/github/repos", async (req, res) => {
    const token = (req.session as any).githubToken;
    if (!token) return res.status(401).json({ error: "No GitHub token" });

    try {
      const octokit = new Octokit({ auth: token });
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({
        sort: "updated",
        per_page: 50,
      });
      res.json(data);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message });
    }
  });

  app.get("/api/github/contents", async (req, res) => {
    const token = (req.session as any).githubToken;
    const { owner, repo, path: filePath } = req.query;
    if (!token) return res.status(401).json({ error: "No GitHub token" });

    try {
      const octokit = new Octokit({ auth: token });
      const { data } = await octokit.rest.repos.getContent({
        owner: owner as string,
        repo: repo as string,
        path: filePath as string || "",
      });
      res.json(data);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
