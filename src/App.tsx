import React, { useState, useEffect } from "react";
import {
  Terminal,
  FileCode,
  FolderOpen,
  Layers,
  Activity,
  CopyCheck,
  Shield,
  History,
  Settings,
  RotateCcw,
  CheckCircle2,
  GitBranch,
  Keyboard,
} from "lucide-react";
import TerminalView from "./components/TerminalView";
import DiffViewer from "./components/DiffViewer";
import DocumentExplorer from "./components/DocumentExplorer";
import RetrievalExplorer from "./components/RetrievalExplorer";
import WatchdogMonitor from "./components/WatchdogMonitor";
import BatchEditor from "./components/BatchEditor";
import TestSuiteRunner from "./components/TestSuiteRunner";
import AuditLogView from "./components/AuditLogView";
import ConfigModal from "./components/ConfigModal";
import ShortcutsModal from "./components/ShortcutsModal";
import { DocumentFile } from "./types";
import { useKeyboardShortcuts, TabId } from "./hooks/useKeyboardShortcuts";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("terminal");
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [selectedFileForDiff, setSelectedFileForDiff] = useState<string>("");
  const [showConfig, setShowConfig] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [undoStatus, setUndoStatus] = useState<string | null>(null);
  const [shortcutFeedback, setShortcutFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleQuickUndo = async () => {
    try {
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: ":undo" }),
      });
      const data = await res.json();
      const msg = data.output || "Reverted latest edit snapshot";
      setUndoStatus(msg);
      setTimeout(() => setUndoStatus(null), 3500);
      fetchFiles();
    } catch (e: any) {
      setUndoStatus(`Undo failed: ${e.message}`);
    }
  };

  const showShortcutNotification = (msg: string) => {
    setShortcutFeedback(msg);
    setTimeout(() => setShortcutFeedback(null), 2000);
  };

  // Global Keyboard Shortcut Manager
  useKeyboardShortcuts({
    onSelectTab: (tab) => setActiveTab(tab),
    onQuickUndo: handleQuickUndo,
    onShowNotification: showShortcutNotification,
  });

  const navItems = [
    { id: "terminal", label: "Interactive CLI", icon: Terminal, badge: "--interactive", shortcut: "Alt+1" },
    { id: "diff", label: "Diff Inspector", icon: FileCode, badge: "Dry-Run / Apply", shortcut: "Alt+2" },
    { id: "explorer", label: "Documents", icon: FolderOpen, badge: `${files.length} files`, shortcut: "Alt+3" },
    { id: "retrieval", label: "FAISS + TF-IDF", icon: Layers, badge: "Hybrid", shortcut: "Alt+4" },
    { id: "watchdog", label: "Watchdog Inotify", icon: Activity, badge: "Live", shortcut: "Alt+5" },
    { id: "batch", label: "Batch Editor", icon: CopyCheck, badge: "Multi-File", shortcut: "Alt+6" },
    { id: "tests", label: "Test Suite", icon: Shield, badge: "Tests", shortcut: "Alt+7" },
    { id: "audit", label: "Audit Logs", icon: History, badge: "audit.log", shortcut: "Alt+8" },
  ] as const;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0B0E14] text-[#E2E8F0] font-mono text-[12px] select-none overflow-hidden antialiased relative">
      {/* HUD Keyboard Shortcut Notification Toast */}
      {shortcutFeedback && (
        <div className="absolute top-12 left-1/2 transform -translate-x-1/2 z-50 bg-[#161B22] border border-[#58A6FF] text-[#58A6FF] px-3 py-1.5 rounded shadow-xl flex items-center gap-2 text-[11px] font-bold animate-fade-in pointer-events-none">
          <Keyboard className="w-3.5 h-3.5" />
          <span>{shortcutFeedback}</span>
        </div>
      )}

      {/* High Density Header Bar */}
      <header className="h-11 border-b border-[#2D333B] flex items-center justify-between px-3 bg-[#161B22] shrink-0 z-10">
        {/* Left: CLI status & Session indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#238636] animate-pulse"></span>
            <span className="font-bold text-[#C9D1D9] tracking-tight">file_chat.py</span>
          </div>
          <span className="text-[#484F58]">/</span>
          <div className="flex items-center gap-1.5 text-[11px] text-[#8B949E]">
            <span>session:</span>
            <span className="text-[#58A6FF] bg-[#121D2F] px-1.5 py-0.5 rounded border border-[#1f3554]">
              workspace_docs
            </span>
          </div>
        </div>

        {/* Center/Right Status & Action badges */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-[#7D8590]">
            <span>CONFIG: <span className="text-[#58A6FF]">config.json</span></span>
            <span>INDEX: <span className="text-[#238636]">HYBRID_FAISS</span></span>
            <span>WATCHDOG: <span className="text-[#238636]">ACTIVE</span></span>
          </div>

          <div className="flex items-center gap-1.5">
            {undoStatus && (
              <span className="text-[10px] text-[#7EE787] font-mono px-2 py-0.5 bg-[#112D18] border border-[#238636] rounded">
                {undoStatus}
              </span>
            )}

            <button
              onClick={handleQuickUndo}
              className="px-2 py-1 bg-[#21262D] hover:bg-[#30363D] hover:text-[#C9D1D9] text-[#8B949E] rounded border border-[#30363D] transition-colors flex items-center gap-1.5 text-[11px]"
              title="Revert latest edit snapshot (:undo) [Ctrl + Z]"
            >
              <RotateCcw className="w-3 h-3 text-[#7D8590]" />
              <span>:undo</span>
              <kbd className="px-1 py-0.2 bg-[#0D1117] text-[#58A6FF] rounded border border-[#30363D] text-[9px] font-bold">
                Ctrl+Z
              </kbd>
            </button>

            <button
              onClick={() => setActiveTab("tests")}
              className="px-2 py-1 bg-[#21262D] hover:bg-[#30363D] hover:text-[#C9D1D9] text-[#8B949E] rounded border border-[#30363D] transition-colors flex items-center gap-1 text-[11px]"
            >
              <Shield className="w-3 h-3 text-[#58A6FF]" />
              <span>Run Tests</span>
            </button>

            <button
              onClick={() => setShowShortcuts(true)}
              className="p-1 bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#C9D1D9] rounded border border-[#30363D] transition-colors"
              title="Keyboard Shortcuts Guide (Alt+1-8, Ctrl+Z)"
            >
              <Keyboard className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setShowConfig(true)}
              className="p-1 bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#C9D1D9] rounded border border-[#30363D] transition-colors"
              title="Configuration"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <div className="bg-[#21262D] px-2 py-0.5 rounded border border-[#30363D] text-[10px] text-[#7D8590]">
              v1.2.4
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden">
        {/* High Density Left Sidebar */}
        <aside className="w-56 border-r border-[#30363D] bg-[#0D1117] flex flex-col shrink-0">
          <div className="p-2.5 border-b border-[#30363D] bg-[#161B22] flex justify-between items-center">
            <span className="uppercase tracking-widest text-[9px] font-bold text-[#8B949E]">
              Tool Navigation
            </span>
            <span className="text-[#238636] text-[10px] font-semibold">{files.length} Docs</span>
          </div>

          {/* Navigation Items with Keyboard Shortcut Badges */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={`${item.label} (${item.shortcut})`}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-[11px] font-mono transition-colors ${
                    isActive
                      ? "bg-[#1F242C] text-[#C9D1D9] border border-[#30363D] font-bold"
                      : "text-[#8B949E] hover:bg-[#161B22] hover:text-[#C9D1D9] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-[#58A6FF]" : "text-[#7D8590]"}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <kbd className="text-[9px] px-1 py-0.2 rounded bg-[#0B0E14] text-[#7D8590] border border-[#21262D]">
                      {item.shortcut}
                    </kbd>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Git & Shortcuts Quick Info */}
          <div className="mt-auto p-2.5 border-t border-[#30363D] bg-[#161B22] space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between text-[#8B949E]">
              <span className="uppercase tracking-wider font-bold">Shortcuts</span>
              <span className="text-[#58A6FF] font-bold">Alt+[1-8]</span>
            </div>
            <div className="flex items-center justify-between text-[#7D8590]">
              <span>Quick Undo:</span>
              <span className="text-[#7EE787] font-bold">Ctrl+Z</span>
            </div>
            <div className="flex items-center justify-between text-[#7D8590]">
              <span>Git Status:</span>
              <span className="text-[#E3B341] font-bold">main*</span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col bg-[#0B0E14] overflow-hidden">
          {activeTab === "terminal" && (
            <TerminalView
              onSelectForDiff={(file) => {
                setSelectedFileForDiff(file);
                setActiveTab("diff");
              }}
            />
          )}

          {activeTab === "diff" && (
            <DiffViewer
              files={files}
              selectedFile={selectedFileForDiff}
              onRefreshFiles={fetchFiles}
            />
          )}

          {activeTab === "explorer" && (
            <DocumentExplorer
              files={files}
              onRefresh={fetchFiles}
              onSelectForDiff={(file) => {
                setSelectedFileForDiff(file);
                setActiveTab("diff");
              }}
            />
          )}

          {activeTab === "retrieval" && <RetrievalExplorer />}

          {activeTab === "watchdog" && (
            <WatchdogMonitor files={files} onRefreshFiles={fetchFiles} />
          )}

          {activeTab === "batch" && (
            <BatchEditor files={files} onRefreshFiles={fetchFiles} />
          )}

          {activeTab === "tests" && <TestSuiteRunner />}

          {activeTab === "audit" && <AuditLogView />}
        </main>
      </div>

      {/* High Density Telemetry Footer */}
      <footer className="h-7 bg-[#238636] text-[#0B0E14] px-3 flex items-center justify-between text-[10px] font-bold shrink-0">
        <div className="flex items-center gap-4">
          <span>SHORTCUTS: ALT+[1-8] TABS | CTRL+Z UNDO</span>
          <span className="hidden sm:inline">PERSISTENCE: ATOMIC SNAPSHOTS</span>
          <span>CORPUS: {files.length} DOCS</span>
        </div>
        <div className="flex items-center gap-4 font-mono">
          <span className="hidden md:inline">HYBRID_SCORE: 0.6 TFIDF + 0.4 VEC</span>
          <span>UNDO STACK: READY</span>
          <span className="bg-[#0B0E14] text-[#7EE787] px-1.5 py-0.5 rounded text-[9px]">ONLINE</span>
        </div>
      </footer>

      {/* Configuration Settings Modal */}
      <ConfigModal isOpen={showConfig} onClose={() => setShowConfig(false)} />

      {/* Global Keyboard Shortcuts Modal */}
      <ShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}
