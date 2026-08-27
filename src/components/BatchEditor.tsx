import React, { useState } from "react";
import { CopyCheck, Sparkles, Check, FileCode, CheckSquare, Square, AlertCircle, ArrowRight } from "lucide-react";
import { DocumentFile } from "../types";

interface BatchEditorProps {
  files: DocumentFile[];
  onRefreshFiles: () => void;
}

export default function BatchEditor({ files, onRefreshFiles }: BatchEditorProps) {
  const [selectedFiles, setSelectedFiles] = useState<string[]>(files.map((f) => f.relativePath));
  const [instruction, setInstruction] = useState("replace '8080' with '9090'");
  const [loading, setLoading] = useState(false);
  const [batchResults, setBatchResults] = useState<any[] | null>(null);
  const [appliedStatus, setAppliedStatus] = useState<string | null>(null);

  const toggleSelectAll = () => {
    if (selectedFiles.length === files.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(files.map((f) => f.relativePath));
    }
  };

  const toggleFile = (relativePath: string) => {
    if (selectedFiles.includes(relativePath)) {
      setSelectedFiles(selectedFiles.filter((f) => f !== relativePath));
    } else {
      setSelectedFiles([...selectedFiles, relativePath]);
    }
  };

  const runBatch = async (dryRun: boolean) => {
    if (!instruction.trim() || selectedFiles.length === 0) return;
    setLoading(true);
    setAppliedStatus(null);
    try {
      const res = await fetch("/api/edit/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instruction.trim(),
          files: selectedFiles,
          dry_run: dryRun,
        }),
      });
      const data = await res.json();
      setBatchResults(data.results || []);
      if (!dryRun) {
        setAppliedStatus(`Successfully applied batch edits across ${data.results?.length || 0} files`);
        onRefreshFiles();
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] rounded border border-[#30363D] overflow-hidden font-mono text-[12px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161B22] border-b border-[#30363D]">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-[#121D2F] text-[#58A6FF] rounded border border-[#1f3554]">
            <CopyCheck className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-[11px] font-bold text-[#C9D1D9] uppercase tracking-wider">
              Batch Editing &amp; Multi-File Refactoring Pipeline
            </h2>
          </div>
        </div>
      </div>

      {/* Control Configuration Bar */}
      <div className="p-3 bg-[#0D1117] border-b border-[#30363D] space-y-2">
        <div>
          <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">
            Target Files ({selectedFiles.length} of {files.length} selected)
          </label>
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <button
              onClick={toggleSelectAll}
              className="px-2 py-0.5 bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] rounded text-[10px] font-bold transition-colors flex items-center gap-1 border border-[#30363D]"
            >
              {selectedFiles.length === files.length ? (
                <CheckSquare className="w-3 h-3 text-[#7EE787]" />
              ) : (
                <Square className="w-3 h-3" />
              )}
              <span>ALL</span>
            </button>
            {files.map((f) => {
              const isChecked = selectedFiles.includes(f.relativePath);
              return (
                <button
                  key={f.relativePath}
                  onClick={() => toggleFile(f.relativePath)}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors font-mono flex items-center gap-1 border ${
                    isChecked
                      ? "bg-[#112D18] text-[#7EE787] border-[#238636]/60 font-bold"
                      : "bg-[#161B22] text-[#8B949E] border-[#30363D] hover:text-[#C9D1D9]"
                  }`}
                >
                  {isChecked ? <CheckSquare className="w-2.5 h-2.5 text-[#7EE787]" /> : <Square className="w-2.5 h-2.5 text-[#7D8590]" />}
                  <span>{f.relativePath}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">Batch Transformation Instruction</label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. replace '8080' with '9090'..."
              className="flex-1 bg-[#161B22] border border-[#30363D] text-[#E2E8F0] text-[11px] rounded px-2.5 py-1.5 outline-none focus:border-[#58A6FF] font-mono placeholder:text-[#484F58]"
            />
            <button
              onClick={() => runBatch(true)}
              disabled={loading || !instruction.trim() || selectedFiles.length === 0}
              className="px-2.5 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] font-bold rounded text-[11px] transition-colors border border-[#30363D]"
            >
              DRY-RUN
            </button>
            <button
              onClick={() => runBatch(false)}
              disabled={loading || !instruction.trim() || selectedFiles.length === 0}
              className="px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 text-white font-bold rounded text-[11px] transition-colors flex items-center gap-1"
            >
              <Check className="w-3 h-3" />
              <span>APPLY ALL</span>
            </button>
          </div>
        </div>
      </div>

      {appliedStatus && (
        <div className="px-3 py-1.5 bg-[#112D18] border-b border-[#238636]/40 text-[11px] text-[#7EE787] font-bold flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-[#7EE787]" />
          <span>{appliedStatus}</span>
        </div>
      )}

      {/* Batch Results Grid */}
      <div className="flex-1 overflow-y-auto p-3 bg-[#0B0E14] space-y-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#8B949E] gap-2">
            <Sparkles className="w-5 h-5 text-[#58A6FF] animate-spin" />
            <p className="text-[11px]">Processing multi-file transformations...</p>
          </div>
        ) : batchResults && batchResults.length > 0 ? (
          batchResults.map((br, i) => (
            <div
              key={i}
              className={`bg-[#161B22] border rounded p-2.5 space-y-1.5 transition-colors ${
                br.changed ? "border-[#238636]/60" : "border-[#30363D] opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#C9D1D9]">
                  <FileCode className="w-3.5 h-3.5 text-[#58A6FF]" />
                  <span className="font-bold">{br.file}</span>
                </div>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                    br.changed
                      ? "bg-[#112D18] text-[#7EE787] border border-[#238636]/50"
                      : "bg-[#21262D] text-[#7D8590]"
                  }`}
                >
                  {br.changed ? (br.dry_run ? "CHANGED (PREVIEW)" : "APPLIED") : "NO MATCH"}
                </span>
              </div>

              {br.changed && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] font-mono pt-1">
                  <div className="bg-[#0D1117] p-2 rounded border border-[#30363D] text-[#8B949E]">
                    <p className="text-[9px] text-[#7D8590] uppercase mb-0.5 font-bold">Original</p>
                    <p className="line-clamp-3 whitespace-pre-wrap">{br.original_content}</p>
                  </div>
                  <div className="bg-[#0D1117] p-2 rounded border border-[#238636]/40 text-[#7EE787]">
                    <p className="text-[9px] text-[#238636] uppercase mb-0.5 font-bold">Revised</p>
                    <p className="line-clamp-3 whitespace-pre-wrap">{br.new_content}</p>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-[#7D8590] gap-2">
            <CopyCheck className="w-6 h-6 text-[#484F58]" />
            <p className="text-[11px]">Configure instruction and click "DRY-RUN" to inspect multi-file modifications.</p>
          </div>
        )}
      </div>
    </div>
  );
}
