import React, { useState, useEffect } from "react";
import { GitCommit, Play, RotateCcw, Check, Sparkles, FileCode, Split, AlignLeft, ShieldCheck, AlertCircle } from "lucide-react";
import { DocumentFile, EditResponse } from "../types";

interface DiffViewerProps {
  files: DocumentFile[];
  selectedFile?: string;
  onRefreshFiles: () => void;
}

export default function DiffViewer({ files, selectedFile, onRefreshFiles }: DiffViewerProps) {
  const [activeFile, setActiveFile] = useState<string>(selectedFile || (files[0]?.name || ""));
  const [instruction, setInstruction] = useState<string>("replace '8080' with '9090'");
  const [diffResult, setDiffResult] = useState<EditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [appliedStatus, setAppliedStatus] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"unified" | "split">("unified");

  useEffect(() => {
    if (selectedFile) {
      setActiveFile(selectedFile);
    } else if (!activeFile && files.length > 0) {
      setActiveFile(files[0].name);
    }
  }, [selectedFile, files]);

  const presetInstructions: Record<string, string[]> = {
    "api_service.py": [
      "replace '8080' with '9090'",
      "add logging and timestamp header to handle_request",
      "add health_check endpoint to routes",
    ],
    "architecture.md": [
      "replace 'FAISS' with 'FAISS (Hierarchical NSW)'",
      "add section on Watchdog inotify performance",
    ],
    "payment_processor.py": [
      "replace 'USD' with 'EUR'",
      "add transaction retry logic with max_attempts=3",
    ],
  };

  const handleDryRun = async () => {
    if (!activeFile || !instruction.trim()) return;
    setLoading(true);
    setAppliedStatus(null);
    try {
      const res = await fetch("/api/edit/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: activeFile, instruction: instruction.trim() }),
      });
      const data = await res.json();
      setDiffResult(data);
    } catch (e: any) {
      setDiffResult({ success: false, error: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!activeFile) return;
    setLoading(true);
    try {
      const res = await fetch("/api/edit/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: activeFile,
          instruction: instruction.trim(),
          customContent: diffResult?.new_content,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAppliedStatus(data.message || `Successfully applied changes to ${activeFile}`);
        onRefreshFiles();
      } else {
        setAppliedStatus(`Failed to apply: ${data.error}`);
      }
    } catch (e: any) {
      setAppliedStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const renderUnifiedDiffLines = (rawDiff: string) => {
    const lines = rawDiff.split("\n");
    return lines.map((line, idx) => {
      let bg = "hover:bg-[#161B22]/50 text-[#C9D1D9]";
      if (line.startsWith("---") || line.startsWith("+++")) {
        bg = "bg-[#161B22] text-[#8B949E] font-bold";
      } else if (line.startsWith("@@")) {
        bg = "bg-[#161B22] text-[#7D8590] font-semibold border-y border-[#30363D]";
      } else if (line.startsWith("+")) {
        bg = "bg-[#112D18] text-[#7EE787] border-l-2 border-[#238636]";
      } else if (line.startsWith("-")) {
        bg = "bg-[#2D1212] text-[#FF7B72] border-l-2 border-[#ff7b72]";
      }

      return (
        <div key={idx} className={`flex px-2.5 py-0.5 font-mono text-[11px] leading-tight ${bg}`}>
          <span className="w-7 select-none text-[#484F58] text-right pr-2">{idx + 1}</span>
          <span className="flex-1 whitespace-pre-wrap break-all">{line}</span>
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] rounded border border-[#30363D] overflow-hidden font-mono text-[12px]">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161B22] border-b border-[#30363D]">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-[#121D2F] text-[#58A6FF] rounded border border-[#1f3554]">
            <FileCode className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-[11px] font-bold text-[#C9D1D9] flex items-center gap-1.5 uppercase tracking-wider">
              Diff Inspector &amp; Editing Pipeline
            </h2>
          </div>
        </div>

        {/* View Stats */}
        <div className="flex items-center gap-2">
          {diffResult?.stats && (
            <div className="flex items-center gap-2 text-[10px] font-mono px-2 py-0.5 bg-[#21262D] rounded border border-[#30363D]">
              <span className="text-[#7EE787] font-bold">+{diffResult.stats.additions}</span>
              <span className="text-[#FF7B72] font-bold">-{diffResult.stats.deletions}</span>
            </div>
          )}
        </div>
      </div>

      {/* Target Selector & Instruction Bar */}
      <div className="p-3 bg-[#0D1117] border-b border-[#30363D] space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">Target Document</label>
            <select
              value={activeFile}
              onChange={(e) => {
                setActiveFile(e.target.value);
                setDiffResult(null);
                setAppliedStatus(null);
              }}
              className="w-full bg-[#161B22] border border-[#30363D] text-[#C9D1D9] text-[11px] rounded px-2.5 py-1.5 outline-none focus:border-[#58A6FF]"
            >
              {files.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} ({f.extension || "doc"})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">Edit Instruction / Modification Request</label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. replace '8080' with '9090'..."
                className="flex-1 bg-[#161B22] border border-[#30363D] text-[#E2E8F0] text-[11px] rounded px-2.5 py-1.5 outline-none focus:border-[#58A6FF] font-mono placeholder:text-[#484F58]"
              />
              <button
                onClick={handleDryRun}
                disabled={loading || !instruction.trim()}
                className="px-2.5 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] font-bold rounded text-[11px] transition-colors border border-[#30363D]"
              >
                DRY-RUN
              </button>
              <button
                onClick={handleApply}
                disabled={loading || !diffResult}
                className="px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 text-white font-bold rounded text-[11px] transition-colors flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                <span>APPLY</span>
              </button>
            </div>
          </div>
        </div>

        {/* Preset Prompt Hints */}
        {presetInstructions[activeFile] && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#7D8590] flex-wrap">
            <span className="text-[#8B949E] font-bold uppercase">Presets:</span>
            {presetInstructions[activeFile].map((hint, idx) => (
              <button
                key={idx}
                onClick={() => setInstruction(hint)}
                className="px-2 py-0.5 bg-[#161B22] hover:bg-[#21262D] hover:text-[#58A6FF] text-[#8B949E] rounded border border-[#30363D] text-[10px] transition-colors font-mono"
              >
                {hint}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Applied Status Banner */}
      {appliedStatus && (
        <div className="px-3 py-1.5 bg-[#112D18] border-b border-[#238636]/40 flex items-center justify-between text-[11px] text-[#7EE787]">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#7EE787]" />
            <span>{appliedStatus}</span>
          </div>
          <span className="text-[#8B949E] text-[10px] font-mono">Snapshot saved for :undo</span>
        </div>
      )}

      {/* Diff Content Workspace */}
      <div className="flex-1 overflow-y-auto p-3 bg-[#0B0E14]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#8B949E] gap-2">
            <Sparkles className="w-5 h-5 text-[#58A6FF] animate-spin" />
            <p className="text-[11px]">Generating AST unified diff via FileChat engine...</p>
          </div>
        ) : diffResult?.diff ? (
          <div className="border border-[#30363D] rounded overflow-hidden bg-[#0D1117]">
            <div className="px-3 py-1.5 bg-[#161B22] border-b border-[#30363D] flex items-center justify-between text-[11px]">
              <span className="font-mono text-[#C9D1D9] flex items-center gap-1.5">
                <FileCode className="w-3 h-3 text-[#58A6FF]" />
                {activeFile}
              </span>
              <span className="text-[#8B949E] font-mono text-[10px]">
                {diffResult.dry_run ? "DRY-RUN PREVIEW" : "APPLIED"}
              </span>
            </div>
            <div className="py-1 overflow-x-auto select-text">
              {renderUnifiedDiffLines(diffResult.diff)}
            </div>
          </div>
        ) : diffResult?.error ? (
          <div className="p-3 bg-[#2D1212] border border-[#ff7b72]/40 rounded text-[#FF7B72] text-[11px] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#FF7B72] shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Diff Generation Error</p>
              <p className="mt-0.5">{diffResult.error}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-[#7D8590] gap-2">
            <Split className="w-6 h-6 text-[#484F58]" />
            <div className="text-center">
              <p className="text-[11px] font-bold text-[#8B949E]">NO ACTIVE DIFF</p>
              <p className="text-[10px] text-[#7D8590] mt-0.5">
                Select document and click "DRY-RUN" to preview unified line diffs.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
