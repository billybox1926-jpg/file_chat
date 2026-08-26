import React, { useState, useEffect } from "react";
import { FolderOpen, FileText, Plus, Save, Trash2, RefreshCw, FileCode, CheckCircle, Upload } from "lucide-react";
import { DocumentFile } from "../types";

interface DocumentExplorerProps {
  files: DocumentFile[];
  onRefresh: () => void;
  onSelectForDiff?: (file: string) => void;
}

export default function DocumentExplorer({ files, onRefresh, onSelectForDiff }: DocumentExplorerProps) {
  const [selectedPath, setSelectedPath] = useState<string>(files[0]?.relativePath || "");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (selectedPath) {
      loadFileContent(selectedPath);
    } else if (files.length > 0) {
      setSelectedPath(files[0].relativePath);
      loadFileContent(files[0].relativePath);
    }
  }, [selectedPath, files]);

  const loadFileContent = async (relPath: string) => {
    if (!relPath) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/files/content?path=${encodeURIComponent(relPath)}`);
      const data = await res.json();
      setContent(data.content || "");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPath) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch("/api/files/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedPath, content }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus("File saved & watchdog updated");
        setTimeout(() => setSaveStatus(null), 3000);
        onRefresh();
      }
    } catch (e: any) {
      setSaveStatus(`Save error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    try {
      const res = await fetch("/api/files/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newFileName.trim(), content: "# New Document\n" }),
      });
      const data = await res.json();
      if (data.success) {
        setNewFileName("");
        setShowCreateModal(false);
        onRefresh();
        setSelectedPath(data.path);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteFile = async (relPath: string) => {
    if (!confirm(`Delete ${relPath}?`)) return;
    try {
      await fetch(`/api/files/delete?path=${encodeURIComponent(relPath)}`, { method: "DELETE" });
      onRefresh();
      if (selectedPath === relPath) {
        setSelectedPath(files.find((f) => f.relativePath !== relPath)?.relativePath || "");
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex h-full bg-[#0B0E14] rounded border border-[#30363D] overflow-hidden font-mono text-[12px]">
      {/* File Sidebar */}
      <div className="w-60 border-r border-[#30363D] bg-[#161B22] flex flex-col">
        <div className="p-2.5 border-b border-[#30363D] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5 text-[#58A6FF]" />
            <span className="text-[11px] font-bold text-[#C9D1D9] uppercase">workspace_docs</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-1 text-[#8B949E] hover:text-[#C9D1D9] hover:bg-[#21262D] rounded border border-transparent hover:border-[#30363D] transition-colors"
              title="Create Document"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={onRefresh}
              className="p-1 text-[#8B949E] hover:text-[#C9D1D9] hover:bg-[#21262D] rounded border border-transparent hover:border-[#30363D] transition-colors"
              title="Refresh Files"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {files.map((file) => {
            const isSelected = selectedPath === file.relativePath;
            return (
              <div
                key={file.relativePath}
                onClick={() => setSelectedPath(file.relativePath)}
                className={`group flex items-center justify-between px-2 py-1.5 rounded cursor-pointer text-[11px] transition-colors ${
                  isSelected
                    ? "bg-[#121D2F] text-[#58A6FF] border border-[#1f3554] font-bold"
                    : "text-[#8B949E] hover:bg-[#21262D] hover:text-[#C9D1D9]"
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <FileText className={`w-3 h-3 shrink-0 ${isSelected ? "text-[#58A6FF]" : "text-[#7D8590]"}`} />
                  <span className="truncate">{file.name}</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(file.relativePath);
                    }}
                    className="p-0.5 text-[#7D8590] hover:text-[#FF7B72] rounded"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-2 border-t border-[#30363D] text-[10px] text-[#7D8590] flex justify-between bg-[#0D1117]">
          <span>{files.length} indexed files</span>
          <span className="text-[#238636] font-bold">● LIVE</span>
        </div>
      </div>

      {/* Main File Content / Editor */}
      <div className="flex-1 flex flex-col bg-[#0B0E14]">
        {/* Editor Toolbar */}
        <div className="px-3 py-2 bg-[#161B22] border-b border-[#30363D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5 text-[#58A6FF]" />
            <span className="text-[11px] font-mono font-bold text-[#C9D1D9]">{selectedPath || "No file selected"}</span>
            {saveStatus && (
              <span className="text-[10px] text-[#7EE787] font-mono flex items-center gap-1 ml-2">
                <CheckCircle className="w-3 h-3" />
                {saveStatus}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {onSelectForDiff && selectedPath && (
              <button
                onClick={() => onSelectForDiff(selectedPath)}
                className="px-2 py-1 bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] rounded border border-[#30363D] text-[11px] font-bold transition-colors"
              >
                DIFF INSPECTOR
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || loading || !selectedPath}
              className="px-3 py-1 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 text-white font-bold rounded text-[11px] transition-colors flex items-center gap-1"
            >
              <Save className="w-3 h-3" />
              <span>SAVE</span>
            </button>
          </div>
        </div>

        {/* Editor Textarea */}
        <div className="flex-1 p-3 bg-[#0B0E14]">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={loading || !selectedPath}
            placeholder="Select a document or create one to start editing..."
            className="w-full h-full bg-transparent text-[#C9D1D9] font-mono text-[11px] outline-none resize-none leading-relaxed select-text"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Create File Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#161B22] border border-[#30363D] rounded p-4 w-full max-w-sm shadow-2xl space-y-3 font-mono">
            <h3 className="text-[12px] font-bold text-[#C9D1D9] uppercase">Create New Document</h3>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="e.g. database_schema.sql or notes.md"
              className="w-full bg-[#0D1117] border border-[#30363D] text-[#C9D1D9] text-[11px] px-2.5 py-1.5 rounded outline-none focus:border-[#58A6FF] font-mono"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1 bg-[#21262D] text-[#8B949E] hover:bg-[#30363D] text-[11px] font-bold rounded border border-[#30363D] transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleCreateFile}
                className="px-3 py-1 bg-[#238636] text-white font-bold hover:bg-[#2ea043] text-[11px] rounded transition-colors"
              >
                CREATE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
