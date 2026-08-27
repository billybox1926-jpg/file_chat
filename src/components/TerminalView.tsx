import React, { useState, useEffect, useRef } from "react";
import { Terminal, Send, Play, Sparkles, Trash2, ArrowUpRight, HelpCircle, CheckCircle2 } from "lucide-react";

interface TerminalLine {
  id: string;
  type: "input" | "output" | "system" | "error" | "diff";
  text: string;
  timestamp: string;
}

interface TerminalViewProps {
  onExecuteEdit?: (file: string, instruction: string, dryRun: boolean) => void;
  onOpenDiff?: (file: string, diff: string) => void;
  onSelectForDiff?: (file: string, diff?: string) => void;
}

export default function TerminalView({ onExecuteEdit, onOpenDiff, onSelectForDiff }: TerminalViewProps) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: "1",
      type: "system",
      text: "FileChat Interactive CLI v1.2.4 [Retrieval: TF-IDF + FAISS | Engine: Gemini 3.7 & Ollama]",
      timestamp: new Date().toLocaleTimeString(),
    },
    {
      id: "2",
      type: "system",
      text: "Target directory: ./workspace_docs | Type :help for commands or type queries/instructions directly.",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, loading]);

  const quickCommands = [
    { label: ":docs", cmd: ":docs" },
    { label: "Search rate limit", cmd: ":query rate limit" },
    { label: "Dry-run Port Edit", cmd: ':dry-run api_service.py "replace \'8080\' with \'9090\'"' },
    { label: "Search Architecture", cmd: ":query incremental indexing" },
    { label: "Run Help", cmd: ":help" },
    { label: "View Audit Log", cmd: ":audit" },
  ];

  const executeCommand = async (cmdToRun?: string) => {
    const text = (cmdToRun || input).trim();
    if (!text || loading) return;

    const time = new Date().toLocaleTimeString();
    const inputLine: TerminalLine = {
      id: `${Date.now()}-in`,
      type: "input",
      text: text,
      timestamp: time,
    };

    setLines((prev) => [...prev, inputLine]);
    setHistory((prev) => [text, ...prev]);
    setHistoryIdx(-1);
    setInput("");
    setLoading(true);

    try {
      const resp = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: text }),
      });
      const data = await resp.json();

      const outputLine: TerminalLine = {
        id: `${Date.now()}-out`,
        type: data.error ? "error" : "output",
        text: data.output || data.error || "[No output returned]",
        timestamp: new Date().toLocaleTimeString(),
      };
      setLines((prev) => [...prev, outputLine]);
    } catch (err: any) {
      setLines((prev) => [
        ...prev,
        {
          id: `${Date.now()}-err`,
          type: "error",
          text: `Command execution failed: ${err.message}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      executeCommand();
    } else if (e.key === "ArrowUp") {
      if (history.length > 0 && historyIdx < history.length - 1) {
        const nextIdx = historyIdx + 1;
        setHistoryIdx(nextIdx);
        setInput(history[nextIdx]);
      }
    } else if (e.key === "ArrowDown") {
      if (historyIdx > 0) {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        setInput(history[nextIdx]);
      } else if (historyIdx === 0) {
        setHistoryIdx(-1);
        setInput("");
      }
    }
  };

  const clearTerminal = () => {
    setLines([
      {
        id: `${Date.now()}`,
        type: "system",
        text: "Terminal cleared. FileChat REPL ready.",
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] rounded border border-[#30363D] overflow-hidden font-mono text-[12px]">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161B22] border-b border-[#30363D] select-none">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF7B72]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#E3B341]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#238636]" />
          </div>
          <span className="text-[11px] font-bold text-[#8B949E] ml-1 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-[#58A6FF]" />
            <span>python3 file_chat.py --interactive</span>
          </span>
          <span className="text-[10px] px-1.5 py-0.2 bg-[#121D2F] text-[#58A6FF] rounded border border-[#1f3554]">
            REPL ONLINE
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearTerminal}
            className="px-2 py-0.5 bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#C9D1D9] rounded border border-[#30363D] transition-colors text-[10px] flex items-center gap-1"
            title="Clear terminal"
          >
            <Trash2 className="w-3 h-3" />
            <span>CLEAR</span>
          </button>
        </div>
      </div>

      {/* Suggested Quick Commands */}
      <div className="px-3 py-1.5 bg-[#0D1117] border-b border-[#30363D] flex items-center gap-1.5 overflow-x-auto text-[11px] no-scrollbar">
        <span className="text-[#7D8590] text-[10px] uppercase font-bold whitespace-nowrap">Shortcuts:</span>
        {quickCommands.map((qc, i) => (
          <button
            key={i}
            onClick={() => executeCommand(qc.cmd)}
            className="px-2 py-0.5 bg-[#21262D] hover:bg-[#30363D] hover:text-[#58A6FF] text-[#C9D1D9] rounded transition-colors whitespace-nowrap flex items-center gap-1 border border-[#30363D] text-[10px]"
          >
            <span>{qc.label}</span>
            <ArrowUpRight className="w-2.5 h-2.5 text-[#7D8590]" />
          </button>
        ))}
      </div>

      {/* Terminal Scroll Output */}
      <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto space-y-2 select-text text-[#C9D1D9] bg-[#0B0E14]">
        {lines.map((line) => (
          <div key={line.id} className="leading-relaxed break-words">
            {line.type === "input" && (
              <div className="flex items-start gap-2 text-[#58A6FF]">
                <span className="text-[#58A6FF] font-bold select-none">&gt;</span>
                <span className="text-[#E2E8F0] font-semibold">{line.text}</span>
              </div>
            )}
            {line.type === "output" && (
              <div className="text-[#C9D1D9] whitespace-pre-wrap pl-4 border-l border-[#30363D] py-0.5 my-1 text-[11px] bg-[#161B22]/60 rounded-r p-2 border-r border-t border-b border-[#21262D]">
                {line.text}
              </div>
            )}
            {line.type === "system" && (
              <div className="text-[#8B949E] text-[11px] flex items-center gap-2 py-0.5">
                <span className="text-[#484F58]">[{line.timestamp}]</span>
                <span>{line.text}</span>
              </div>
            )}
            {line.type === "error" && (
              <div className="text-[#FF7B72] bg-[#2D1212] border border-[#ff7b72]/40 p-2 rounded text-[11px] whitespace-pre-wrap pl-3">
                {line.text}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-[#8B949E] pl-4 text-[11px]">
            <Sparkles className="w-3 h-3 text-[#58A6FF] animate-spin" />
            <span>Processing local retrieval &amp; diff synthesis...</span>
          </div>
        )}
      </div>

      {/* Input Prompt Box */}
      <div className="h-14 border-t border-[#30363D] p-2.5 flex items-center gap-2 bg-[#0D1117]">
        <div className="text-[#58A6FF] font-bold text-sm px-1 select-none">&gt;</div>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type command (e.g. :query rate limit, :edit api_service.py 'replace 8080 with 9090', :undo)..."
          className="flex-1 bg-[#161B22] border border-[#30363D] focus:border-[#58A6FF] text-[#E2E8F0] text-[12px] px-2.5 py-1.5 rounded outline-none font-mono placeholder:text-[#484F58]"
          disabled={loading}
          autoFocus
        />
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => executeCommand(input.startsWith(":edit") ? input.replace(":edit", ":dry-run") : input)}
            disabled={!input.trim() || loading}
            className="px-2.5 py-1.5 bg-[#21262D] hover:bg-[#30363D] disabled:opacity-40 text-[#C9D1D9] border border-[#30363D] rounded text-[11px] font-bold transition-colors"
          >
            DRY-RUN
          </button>
          <button
            onClick={() => executeCommand()}
            disabled={!input.trim() || loading}
            className="px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 text-white font-bold rounded text-[11px] transition-colors flex items-center gap-1"
          >
            <span>EXEC</span>
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
