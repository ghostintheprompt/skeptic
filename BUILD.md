# Build & Release Skeptic

### Prerequisites
- Node.js 18+
- npm

### Development
1. Clone the repo:
   ```bash
   git clone https://github.com/ghostintheprompt/skeptic.git
   ```
2. Install:
   ```bash
   npm install
   ```
3. Run:
   ```bash
   npm run dev
   ```

### Production Build
1. Build the frontend:
   ```bash
   npm run build
   ```
2. The `dist/` directory contains the production-ready assets.
3. The server can be run using `npm start`.

### First-Launch Instructions
- Ensure `.env` is populated with `ANTHROPIC_API_KEY` and/or `GEMINI_API_KEY` (Claude runs when both are set), plus `VITE_GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
- Launch the app and authorize with GitHub to start auditing.
- To run the eval harness: `npm run eval` (see `docs/EVAL.md`).
