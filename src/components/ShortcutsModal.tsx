import React from "react";
import { Keyboard, X, Command } from "lucide-react";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: "Alt + 1", desc: "Switch to Interactive CLI (file_chat REPL)", category: "Navigation" },
    { key: "Alt + 2", desc: "Switch to Diff Inspector (Dry-run & Apply)", category: "Navigation" },
    { key: "Alt + 3", desc: "Switch to Document Explorer (Workspace Docs)", category: "Navigation" },
    { key: "Alt + 4", desc: "Switch to Hybrid Retrieval (TF-IDF & FAISS)", category: "Navigation" },
    { key: "Alt + 5", desc: "Switch to Watchdog Inotify Live Monitor", category: "Navigation" },
    { key: "Alt + 6", desc: "Switch to Batch Multi-File Editor", category: "Navigation" },
    { key: "Alt + 7", desc: "Switch to Unit Test Suite Runner", category: "Navigation" },
    { key: "Alt + 8", desc: "Switch to Audit Logs Action History", category: "Navigation" },
    { key: "Ctrl + Z", desc: "Trigger Quick Undo (:undo latest snapshot)", category: "Actions" },
    { key: "⌘ + Z", desc: "Trigger Quick Undo on macOS", category: "Actions" },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-mono text-[12px]">
      <div className="bg-[#0B0E14] border border-[#30363D] rounded w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#161B22] border-b border-[#30363D]">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-[#121D2F] text-[#58A6FF] rounded border border-[#1f3554]">
              <Keyboard className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-[11px] font-bold text-[#C9D1D9] uppercase tracking-wider">
              Global Keyboard Shortcuts
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#8B949E] hover:text-[#C9D1D9] hover:bg-[#21262D] rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-3.5 overflow-y-auto space-y-2">
          <div className="text-[10px] uppercase font-bold text-[#8B949E] mb-1">
            Active Global Keybindings
          </div>
          <div className="space-y-1">
            {shortcuts.map((sc, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-1.5 bg-[#161B22] border border-[#30363D] rounded hover:border-[#58A6FF]/40 transition-colors"
              >
                <span className="text-[11px] text-[#C9D1D9]">{sc.desc}</span>
                <kbd className="px-2 py-0.5 bg-[#21262D] text-[#58A6FF] border border-[#30363D] rounded text-[10px] font-bold font-mono shadow-xs shrink-0 ml-2">
                  {sc.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-3 py-2 bg-[#161B22] border-t border-[#30363D]">
          <button
            onClick={onClose}
            className="px-3 py-1 bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] rounded text-[11px] font-bold transition-colors border border-[#30363D]"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
