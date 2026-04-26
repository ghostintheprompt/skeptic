import React, { useState, useEffect } from 'react';
import { 
  Github, 
  Shield, 
  Search, 
  LayoutDashboard, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  Lock,
  ChevronRight,
  Database,
  Globe,
  Loader2,
  Terminal,
  LogOut,
  Settings,
  X,
  Cpu,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { cn } from './lib/utils';

export interface SecurityFinding {
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  evidence: string;
  file: string;
  line?: number;
  confidence: number;
  reasoning: string;
}

export interface ScopingReport {
  projectOverview: string;
  techStack: string[];
  attackSurfaces: string[];
  highRiskFiles: string[];
  estimatedRiskScore: number;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<number[]>([]);
  const [auditing, setAuditing] = useState(false);
  const [reports, setReports] = useState<Record<number, { scoping?: ScopingReport; findings: SecurityFinding[]; logs?: any[] }>>({});
  const [activeReportId, setActiveReportId] = useState<number | null>(null);
  const [auditProgress, setAuditProgress] = useState("");
  const [repoRiskStats, setRepoRiskStats] = useState<Record<number, { score: number, status: string }>>({});
  
  const [config, setConfig] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [scopingReport, setScopingReport] = useState<ScopingReport | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [isScoping, setIsScoping] = useState(false);
  const [activeLogs, setActiveLogs] = useState<{ prover?: string; skeptic?: string } | null>(null);
  const [refactors, setRefactors] = useState<Record<string, { mitigation: string; critique: string; researchQueries: string[] }>>({});

  useEffect(() => {
    checkAuth();
    fetchConfig();
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const handleOAuthMessage = (event: MessageEvent) => {
    if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
      checkAuth();
    }
  };

  const fetchConfig = async () => {
    const res = await fetch('/api/config');
    const data = await res.json();
    setConfig(data);
    if (!data.hasGeminiKey || !data.hasGithubClientId) {
      setShowSettings(true);
    }
  };

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        fetchRepos();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchRepos = async () => {
    const res = await fetch('/api/github/repos');
    if (res.ok) {
      const data = await res.json();
      setRepos(data);
    }
  };

  const loginWithGithub = async () => {
    const res = await fetch('/api/auth/url');
    const { url } = await res.json();
    window.open(url, 'github_oauth', 'width=600,height=700');
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setRepos([]);
    setSelectedRepos([]);
  };

  const startScoping = async () => {
    if (selectedRepos.length === 0) return;
    const repoId = selectedRepos[0];
    const repo = repos.find(r => r.id === repoId);
    if (!repo) return;

    setIsScoping(true);
    setActiveReportId(repoId);
    setAuditProgress(`Mapping [${repo.name}]...`);

    try {
      const treeRes = await fetch(`/api/github/contents?owner=${repo.owner.login}&repo=${repo.name}`);
      const treeData = await treeRes.json();
      const filePaths = Array.isArray(treeData) ? treeData.map((f: any) => f.path) : [];

      const res = await fetch('/api/audit/scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filePaths })
      });
      const scoping = await res.json();
      setScopingReport(scoping);
      setSelectedFiles(scoping.highRiskFiles);
    } catch (e) {
      console.error(e);
    } finally {
      setIsScoping(false);
    }
  };

  const runDeepAudit = async () => {
    if (!scopingReport || selectedFiles.length === 0) return;
    const repoId = activeReportId!;
    const repo = repos.find(r => r.id === repoId)!;
    
    setAuditing(true);
    const allFindings: SecurityFinding[] = [];

    for (const targetPath of selectedFiles) {
      setAuditProgress(`Auditing ${targetPath}...`);
      try {
        const contentRes = await fetch(`/api/github/contents?owner=${repo.owner.login}&repo=${repo.name}&path=${targetPath}`);
        const contentData = await contentRes.json();
        
        if (contentData.content) {
          const rawContent = atob(contentData.content);
          const res = await fetch('/api/audit/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: targetPath, content: rawContent })
          });
          const { findings, logs } = await res.json();
          allFindings.push(...findings);
          setActiveLogs(logs);
        }
      } catch (e) {
        console.error(e);
      }
    }

    setReports(prev => ({
      ...prev,
      [repoId]: { scoping: scopingReport, findings: allFindings }
    }));
    setAuditing(false);
    setScopingReport(null);
  };

  const requestRefactor = async (finding: SecurityFinding) => {
    const repoId = activeReportId!;
    const repo = repos.find(r => r.id === repoId)!;
    const key = `${finding.file}-${finding.title}`;
    
    if (refactors[key]) return;

    try {
      const contentRes = await fetch(`/api/github/contents?owner=${repo.owner.login}&repo=${repo.name}&path=${finding.file}`);
      const contentData = await contentRes.json();
      const rawContent = atob(contentData.content);

      const res = await fetch('/api/audit/refactor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finding, content: rawContent })
      });
      const data = await res.json();
      setRefactors(prev => ({ ...prev, [key]: data }));
    } catch (e) {
      console.error(e);
    }
  };

  const saveConfig = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      setShowSettings(false);
      fetchConfig();
    }
  };

  if (loading) return (
    <div className="h-screen bg-[#0A0A0B] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
    </div>
  );

  if (!user) return (
    <div className="h-screen bg-[#0A0A0B] text-white flex flex-col items-center justify-center p-6 font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent opacity-50" />
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 text-center space-y-8 max-w-xl"
      >
        <div className="w-20 h-20 bg-blue-600/10 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-[0_0_50px_-12px_rgba(59,130,246,0.5)]">
          <Shield className="w-10 h-10 text-blue-500" />
        </div>
        <div className="space-y-4">
          <h1 className="text-5xl font-medium tracking-tight text-white leading-tight">
            Skeptic
          </h1>
          <p className="text-gray-400 text-lg leading-relaxed">
            Audit and fix common AI code mistakes, patterns, and hallucinations with professional precision.
          </p>
        </div>
        <button 
          onClick={loginWithGithub}
          className="group relative flex items-center gap-3 px-8 py-4 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 transition-all active:scale-95 shadow-[0_20px_40px_-10px_rgba(255,255,255,0.2)]"
        >
          <Github className="w-5 h-5" />
          Authorize with GitHub
          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </motion.div>
    </div>
  );

  const report = activeReportId ? reports[activeReportId] : null;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-gray-300 font-sans selection:bg-blue-500/30">
      <header className="sticky top-0 z-40 bg-[#0A0A0B]/80 backdrop-blur-md border-b border-gray-800/50 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-blue-500" />
          <span className="font-semibold text-white text-lg tracking-tight">SKEPTIC</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowSettings(true)} className="p-2 text-gray-500 hover:text-blue-400 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-medium text-white">{user.login}</span>
            <span className="text-xs text-gray-500">Authorized Operator</span>
          </div>
          <img src={user.avatar_url} className="w-10 h-10 rounded-lg border border-gray-800" alt="Avatar" />
          <button onClick={logout} className="p-2 text-gray-500 hover:text-red-400 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Fleet ({repos.length})</h2>
            {selectedRepos.length > 0 && (
              <button 
                onClick={startScoping}
                disabled={auditing || isScoping}
                className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black px-3 py-1 rounded transition-all flex items-center gap-1 active:scale-95 disabled:opacity-50"
              >
                <Terminal className="w-3 h-3" />
                INIT AUDIT
              </button>
            )}
          </div>
          <div className="space-y-1 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
            {repos.map(repo => (
              <button
                key={repo.id}
                onClick={() => {
                  if (auditing || isScoping) return;
                  setSelectedRepos([repo.id]);
                  if (reports[repo.id]) setActiveReportId(repo.id);
                  else setActiveReportId(null);
                }}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group",
                  activeReportId === repo.id || selectedRepos.includes(repo.id)
                    ? "bg-blue-600/10 border-blue-500/50 text-blue-400" 
                    : "bg-[#121214] border-gray-800/50 text-gray-400 hover:border-gray-700"
                )}
              >
                <div className="flex flex-col overflow-hidden max-w-[70%]">
                  <span className="truncate font-medium flex items-center gap-2">
                    {selectedRepos.includes(repo.id) ? (
                      <CheckCircle2 className="w-3 h-3 text-blue-500" />
                    ) : (
                      repo.private && <Lock className="w-3 h-3 text-orange-500" />
                    )}
                    {repo.name}
                  </span>
                  <span className="text-[10px] opacity-50 uppercase">{repo.language || "Unknown Tech"}</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all text-gray-600" />
              </button>
            ))}
          </div>
        </aside>

        <section className="lg:col-span-9 space-y-8">
          <AnimatePresence mode="wait">
            {showSettings && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#0A0A0B]/90 backdrop-blur-sm"
              >
                <div className="bg-[#121214] border border-gray-800 rounded-3xl w-full max-w-lg p-8 space-y-6 relative">
                  <button onClick={() => setShowSettings(false)} className="absolute top-6 right-6 text-gray-500 hover:text-white">
                    <X className="w-6 h-6" />
                  </button>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-semibold text-white">System Configuration</h3>
                    <p className="text-gray-500 text-sm">Provide your API credentials to enable the Chain of Verification engine.</p>
                  </div>
                  <form onSubmit={saveConfig} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">Gemini API Key</label>
                      <input name="geminiKey" type="password" placeholder="••••••••••••••••" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" defaultValue={config?.hasGeminiKey ? "********" : ""} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">GitHub Client ID</label>
                      <input name="githubClientId" placeholder="Iv1.xxxx" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" defaultValue={config?.appUrl ? config.hasGithubClientId ? "********" : "" : ""} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">GitHub Client Secret</label>
                      <input name="githubClientSecret" type="password" placeholder="••••••••••••••••" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" defaultValue={config?.hasGithubClientSecret ? "********" : ""} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">App URL (Callback)</label>
                      <input name="appUrl" placeholder="http://localhost:3000" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" defaultValue={config?.appUrl || ""} />
                    </div>
                    <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-blue-500/20">
                      SAVE CONFIGURATION
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {!report && !auditing && !isScoping && !scopingReport && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6 border border-dashed border-gray-800 rounded-3xl">
                <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.15)]">
                  <Database className="w-8 h-8 text-blue-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-medium text-white">Select a repository to scan</h3>
                  <p className="text-gray-500 max-w-sm mx-auto leading-relaxed">We will perform an initial scoping to rank the repo's "Code Toxicity" and prioritize your auditing schedule.</p>
                </div>
              </motion.div>
            )}

            {isScoping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-[60vh] flex flex-col items-center justify-center space-y-6">
                <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-mono text-white animate-pulse">{auditProgress}</h3>
                  <p className="text-xs font-mono text-gray-500">ANALYZING PROJECT ARCHITECTURE...</p>
                </div>
              </motion.div>
            )}

            {scopingReport && !auditing && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                <div className="bg-[#121214] border border-gray-800 p-8 rounded-3xl space-y-6">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <h2 className="text-3xl font-bold text-white tracking-tight">Scoping Report</h2>
                      <p className="text-gray-400 max-w-2xl">{scopingReport.projectOverview}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Toxicity Score</div>
                      <div className={cn(
                        "text-5xl font-bold font-mono",
                        scopingReport.estimatedRiskScore > 70 ? "text-red-500" : scopingReport.estimatedRiskScore > 40 ? "text-orange-500" : "text-green-500"
                      )}>
                        {scopingReport.estimatedRiskScore}%
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-gray-800">
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-bold uppercase text-blue-400 tracking-widest">High-Risk Targets</h4>
                      <div className="space-y-2">
                        {scopingReport.highRiskFiles.map(file => (
                          <label key={file} className="flex items-center gap-3 p-3 bg-black/40 rounded-xl border border-gray-800 hover:border-gray-700 cursor-pointer transition-colors">
                            <input 
                              type="checkbox" 
                              checked={selectedFiles.includes(file)} 
                              onChange={() => setSelectedFiles(prev => prev.includes(file) ? prev.filter(f => f !== file) : [...prev, file])}
                              className="w-4 h-4 rounded border-gray-700 bg-gray-900 checked:bg-blue-500"
                            />
                            <span className="text-sm font-mono text-gray-300">{file}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-bold uppercase text-orange-400 tracking-widest">Attack Surfaces</h4>
                        <div className="flex flex-wrap gap-2">
                          {scopingReport.attackSurfaces.map(s => (
                            <span key={s} className="px-3 py-1 bg-orange-500/10 text-orange-400 text-[10px] font-bold rounded-lg border border-orange-500/20">{s}</span>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-bold uppercase text-green-400 tracking-widest">Tech Stack</h4>
                        <div className="flex flex-wrap gap-2">
                          {scopingReport.techStack.map(s => (
                            <span key={s} className="px-3 py-1 bg-green-500/10 text-green-400 text-[10px] font-bold rounded-lg border border-green-500/20">{s}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={runDeepAudit}
                    disabled={selectedFiles.length === 0}
                    className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-gray-200 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    START DEEP AUDIT ({selectedFiles.length} FILES)
                  </button>
                </div>
              </motion.div>
            )}

            {auditing && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="flex flex-col items-center justify-center py-20 space-y-6 bg-[#121214] border border-gray-800 rounded-3xl">
                  <div className="relative">
                    <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
                    <Zap className="absolute inset-0 m-auto w-6 h-6 text-blue-500/50" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-mono text-white animate-pulse uppercase tracking-tighter">{auditProgress}</h3>
                    <p className="text-xs font-mono text-gray-500">PROVER_SKEPTIC_JUDGE_LOOP ACTIVE</p>
                  </div>
                </div>
                {activeLogs && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-black border border-gray-800 rounded-2xl overflow-hidden font-mono text-[10px]">
                    <div className="bg-gray-900 px-4 py-2 border-b border-gray-800 flex items-center justify-between">
                      <span className="text-gray-500 uppercase tracking-widest">Live Reasoning Logs</span>
                      <div className="flex gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-500/50" />
                        <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                        <div className="w-2 h-2 rounded-full bg-green-500/50" />
                      </div>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-4 max-h-60 overflow-y-auto custom-scrollbar">
                      <div className="space-y-2">
                        <div className="text-blue-500 font-bold uppercase tracking-tighter">[THE PROVER]</div>
                        <div className="text-gray-400 leading-relaxed whitespace-pre-wrap">{activeLogs.prover}</div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-orange-500 font-bold uppercase tracking-tighter">[THE SKEPTIC]</div>
                        <div className="text-gray-400 leading-relaxed whitespace-pre-wrap">{activeLogs.skeptic}</div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {report && !auditing && !isScoping && !scopingReport && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-20">
                <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                  <div className="flex items-center gap-3">
                    <Terminal className="w-6 h-6 text-gray-500" />
                    <h2 className="text-2xl font-medium text-white">Vulnerability Feed</h2>
                  </div>
                  <div className="flex gap-4">
                    <div className="bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full text-xs font-bold text-red-400">
                      {report.findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length} HIGH_RISK
                    </div>
                    <div className="bg-gray-800 px-3 py-1 rounded-full text-xs font-bold text-gray-400">
                      {report.findings.length} TOTAL_DETECTIONS
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {report.findings.map((finding, idx) => (
                    <motion.div key={idx} className="bg-[#121214] border border-gray-800 rounded-3xl overflow-hidden group hover:border-blue-500/30 transition-colors">
                      <div className="p-8 space-y-6">
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-black uppercase",
                                finding.severity === 'CRITICAL' ? "bg-red-500 text-white" :
                                finding.severity === 'HIGH' ? "bg-orange-500 text-black" :
                                finding.severity === 'MEDIUM' ? "bg-yellow-500 text-black" : "bg-blue-500 text-white"
                              )}>
                                {finding.severity}
                              </span>
                              <h4 className="text-2xl font-bold text-white">{finding.title}</h4>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
                              <FileText className="w-3 h-3" />
                              {finding.file}{finding.line ? `:${finding.line}` : ''}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-bold uppercase text-gray-500 mb-1">Confidence</div>
                            <div className={cn("text-3xl font-mono font-bold", finding.confidence > 0.8 ? "text-green-400" : "text-yellow-400")}>
                              {(finding.confidence * 100).toFixed(0)}%
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-gray-800/50">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <h5 className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">Evidence & Impact</h5>
                              <p className="text-sm text-gray-400 leading-relaxed">{finding.description}</p>
                              <div className="p-4 bg-black/60 border border-gray-800 rounded-xl text-xs font-mono text-blue-300 break-all leading-relaxed">
                                {finding.evidence}
                              </div>
                            </div>
                            <button 
                              onClick={() => requestRefactor(finding)}
                              className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 text-blue-400 text-xs font-bold rounded-lg border border-blue-500/20 hover:bg-blue-600/20 transition-all"
                            >
                              <Cpu className="w-3 h-3" />
                              SECURITY ADVISORY
                            </button>
                          </div>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <h5 className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">AI Reasoning Verification</h5>
                              <div className="text-sm text-gray-400 bg-blue-500/5 border border-blue-500/10 p-5 rounded-2xl italic relative leading-relaxed">
                                <AlertTriangle className="absolute top-5 right-5 w-4 h-4 text-orange-500/50" />
                                "{finding.reasoning}"
                              </div>
                            </div>
                            {refactors[`${finding.file}-${finding.title}`] && (
                              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-5 bg-green-500/5 border border-green-500/10 rounded-2xl space-y-4">
                                <div className="space-y-2">
                                  <h5 className="text-[10px] font-bold uppercase text-green-500 tracking-widest flex items-center gap-2">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Suggested Mitigation
                                  </h5>
                                  <div className="text-xs font-mono text-gray-300 markdown-content border-l-2 border-green-500/30 pl-4">
                                    <Markdown>{refactors[`${finding.file}-${finding.title}`].mitigation}</Markdown>
                                  </div>
                                </div>

                                <div className="space-y-2 bg-red-500/5 p-4 rounded-xl border border-red-500/10">
                                  <h5 className="text-[10px] font-bold uppercase text-red-400 tracking-widest flex items-center gap-2">
                                    <AlertTriangle className="w-3 h-3" />
                                    AI Self-Critique (Shaky Logic)
                                  </h5>
                                  <p className="text-xs text-red-300/80 leading-relaxed italic">
                                    {refactors[`${finding.file}-${finding.title}`].critique}
                                  </p>
                                </div>

                                <div className="space-y-2">
                                  <h5 className="text-[10px] font-bold uppercase text-blue-400 tracking-widest flex items-center gap-2">
                                    <Search className="w-3 h-3" />
                                    Verification Queries
                                  </h5>
                                  <div className="flex flex-wrap gap-2">
                                    {refactors[`${finding.file}-${finding.title}`].researchQueries.map((q, i) => (
                                      <a 
                                        key={i}
                                        href={`https://www.google.com/search?q=${encodeURIComponent(q)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 px-2 py-1 rounded border border-blue-500/20 transition-colors"
                                      >
                                        {q}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-[#0A0A0B] border-t border-gray-800 py-3 px-6 z-50 text-[10px] font-mono text-gray-500 flex justify-between uppercase tracking-tighter">
        <div className="flex gap-6">
          <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> System Status: Operational</span>
          <span className="hidden md:inline">Core: Gemini 2.0 Flash</span>
        </div>
        <div>
          Built by <a href="https://mdrn.app" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">MDRN Corp</a>
        </div>
      </footer>
    </div>
  );
}
