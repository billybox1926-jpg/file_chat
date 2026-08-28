import React, { useState, useEffect } from "react";
import { Settings, Save, CheckCircle, RefreshCw, X, Sliders, Cpu } from "lucide-react";
import { ConfigData } from "../types";

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ConfigModal({ isOpen, onClose }: ConfigModalProps) {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
    }
  }, [isOpen]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      setConfig(data.config);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("Config updated successfully");
        setTimeout(() => setStatus(null), 2500);
      }
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-mono text-[12px]">
      <div className="bg-[#0B0E14] border border-[#30363D] rounded w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#161B22] border-b border-[#30363D]">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-[#121D2F] text-[#58A6FF] rounded border border-[#1f3554]">
              <Settings className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-[11px] font-bold text-[#C9D1D9] uppercase tracking-wider">System Configuration (config.json)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#8B949E] hover:text-[#C9D1D9] hover:bg-[#21262D] rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-3.5 overflow-y-auto space-y-3 text-[11px] text-[#C9D1D9]">
          {config && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">AI Provider</label>
                  <select
                    value={config.provider}
                    onChange={(e) => setConfig({ ...config, provider: e.target.value })}
                    className="w-full bg-[#161B22] border border-[#30363D] text-[#E2E8F0] rounded px-2.5 py-1.5 outline-none focus:border-[#58A6FF] font-mono text-[11px]"
                  >
                    <option value="gemini">Gemini 3.7 Flash</option>
                    <option value="ollama">Ollama HTTP API</option>
                    <option value="offline">Offline / Fallback Mode</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">Model Identifier</label>
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    className="w-full bg-[#161B22] border border-[#30363D] text-[#E2E8F0] rounded px-2.5 py-1.5 outline-none focus:border-[#58A6FF] font-mono text-[11px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">Ollama Endpoint URL</label>
                <input
                  type="text"
                  value={config.ollama_url}
                  onChange={(e) => setConfig({ ...config, ollama_url: e.target.value })}
                  className="w-full bg-[#161B22] border border-[#30363D] text-[#E2E8F0] rounded px-2.5 py-1.5 outline-none focus:border-[#58A6FF] font-mono text-[11px]"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">Retrieval Top K</label>
                  <input
                    type="number"
                    value={config.top_k}
                    onChange={(e) => setConfig({ ...config, top_k: parseInt(e.target.value) || 4 })}
                    className="w-full bg-[#161B22] border border-[#30363D] text-[#E2E8F0] rounded px-2 py-1 outline-none focus:border-[#58A6FF] font-mono text-[11px]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">Chunk Size (chars)</label>
                  <input
                    type="number"
                    value={config.chunk_size}
                    onChange={(e) => setConfig({ ...config, chunk_size: parseInt(e.target.value) || 500 })}
                    className="w-full bg-[#161B22] border border-[#30363D] text-[#E2E8F0] rounded px-2 py-1 outline-none focus:border-[#58A6FF] font-mono text-[11px]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">Chunk Overlap</label>
                  <input
                    type="number"
                    value={config.chunk_overlap}
                    onChange={(e) => setConfig({ ...config, chunk_overlap: parseInt(e.target.value) || 50 })}
                    className="w-full bg-[#161B22] border border-[#30363D] text-[#E2E8F0] rounded px-2 py-1 outline-none focus:border-[#58A6FF] font-mono text-[11px]"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-[#30363D] space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer text-[#C9D1D9]">
                  <input
                    type="checkbox"
                    checked={config.watchdog_auto_index}
                    onChange={(e) => setConfig({ ...config, watchdog_auto_index: e.target.checked })}
                    className="rounded bg-[#161B22] border-[#30363D] text-[#238636] focus:ring-0"
                  />
                  <span>Watchdog Auto-Reindex on File Modifications</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-[#C9D1D9]">
                  <input
                    type="checkbox"
                    checked={config.git_enabled}
                    onChange={(e) => setConfig({ ...config, git_enabled: e.target.checked })}
                    className="rounded bg-[#161B22] border-[#30363D] text-[#238636] focus:ring-0"
                  />
                  <span>Enable Automatic Git Commits on Applied Diff Patches</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-[#C9D1D9]">
                  <input
                    type="checkbox"
                    checked={config.require_edit_confirmation || false}
                    onChange={(e) => setConfig({ ...config, require_edit_confirmation: e.target.checked })}
                    className="rounded bg-[#161B22] border-[#30363D] text-[#238636] focus:ring-0"
                  />
                  <span className="text-[#E3B341]">Require Edit Confirmation (Security Gate)</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">Temperature</label>
                  <input
                    type="number"
                    step="0.1"
                    value={config.temperature}
                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) || 0.2 })}
                    className="w-full bg-[#161B22] border border-[#30363D] text-[#E2E8F0] rounded px-2.5 py-1.5 outline-none focus:border-[#58A6FF] font-mono text-[11px]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">Watch Debounce (ms)</label>
                  <input
                    type="number"
                    value={config.watch_debounce_ms}
                    onChange={(e) => setConfig({ ...config, watch_debounce_ms: parseInt(e.target.value) || 300 })}
                    className="w-full bg-[#161B22] border border-[#30363D] text-[#E2E8F0] rounded px-2.5 py-1.5 outline-none focus:border-[#58A6FF] font-mono text-[11px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">Audit Log Path</label>
                  <input
                    type="text"
                    value={config.audit_log}
                    onChange={(e) => setConfig({ ...config, audit_log: e.target.value })}
                    className="w-full bg-[#161B22] border border-[#30363D] text-[#E2E8F0] rounded px-2.5 py-1.5 outline-none focus:border-[#58A6FF] font-mono text-[11px]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">Session Directory</label>
                  <input
                    type="text"
                    value={config.session_dir}
                    onChange={(e) => setConfig({ ...config, session_dir: e.target.value })}
                    className="w-full bg-[#161B22] border border-[#30363D] text-[#E2E8F0] rounded px-2.5 py-1.5 outline-none focus:border-[#58A6FF] font-mono text-[11px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-[#8B949E] mb-1">Retrieval Mode</label>
                <select
                  value={config.retrieval_mode}
                  onChange={(e) => setConfig({ ...config, retrieval_mode: e.target.value })}
                  className="w-full bg-[#161B22] border border-[#30363D] text-[#E2E8F0] rounded px-2.5 py-1.5 outline-none focus:border-[#58A6FF] font-mono text-[11px]"
                >
                  <option value="hybrid_tfidf_vector">Hybrid TF-IDF + Hash Vectors</option>
                  <option value="tfidf_only">TF-IDF Only</option>
                  <option value="vector_only">Hash Vector Only</option>
                </select>
              </div>

              {status && (
                <div className="p-2 bg-[#112D18] border border-[#238636]/50 rounded text-[#7EE787] font-bold flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-[#7EE787]" />
                  <span>{status}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-3 py-2 bg-[#161B22] border-t border-[#30363D]">
          <button
            onClick={onClose}
            className="px-2.5 py-1 bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] rounded text-[11px] font-bold transition-colors border border-[#30363D]"
          >
            CLOSE
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 bg-[#238636] hover:bg-[#2ea043] text-white font-bold rounded text-[11px] transition-colors flex items-center gap-1"
          >
            <Save className="w-3 h-3" />
            <span>SAVE CONFIG</span>
          </button>
        </div>
      </div>
    </div>
  );
}
