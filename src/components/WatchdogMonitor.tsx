import React, { useState, useEffect } from "react";
import { Activity, Bell, RefreshCw, FileText, CheckCircle2, Zap, Play, Eye } from "lucide-react";
import { WatchEvent, DocumentFile } from "../types";

interface WatchdogMonitorProps {
  files: DocumentFile[];
  onRefreshFiles: () => void;
}

export default function WatchdogMonitor({ files, onRefreshFiles }: WatchdogMonitorProps) {
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/watchdog/events");
      const data = await res.json();
      setEvents(data.events || []);
    } catch (e) {
      console.error(e);
    }
  };

  const simulateFileModification = async (filename: string) => {
    setSimulating(true);
    try {
      const text = `\n# [Watchdog update: ${new Date().toLocaleTimeString()}]\n`;
      await fetch("/api/files/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filename, text }),
      });
      setTimeout(() => {
        fetchEvents();
        onRefreshFiles();
        setSimulating(false);
      }, 500);
    } catch (e) {
      console.error(e);
      setSimulating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] rounded border border-[#30363D] overflow-hidden font-mono text-[12px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161B22] border-b border-[#30363D]">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-[#121D2F] text-[#58A6FF] rounded border border-[#1f3554]">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-[11px] font-bold text-[#C9D1D9] flex items-center gap-2 uppercase tracking-wider">
              Watchdog Live Inotify &amp; Incremental Index Monitor
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#112D18] text-[#7EE787] border border-[#238636]/50">
                <span className="w-1.5 h-1.5 rounded-full bg-[#238636] mr-1 animate-pulse" />
                ACTIVE
              </span>
            </h2>
          </div>
        </div>

        <button
          onClick={fetchEvents}
          className="p-1 text-[#8B949E] hover:text-[#C9D1D9] hover:bg-[#21262D] rounded border border-[#30363D] transition-colors"
          title="Refresh Event Log"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Simulator Action Panel */}
      <div className="p-3 bg-[#0D1117] border-b border-[#30363D] flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[#8B949E] font-bold uppercase text-[10px]">Simulate document touch:</span>
          {files.slice(0, 3).map((f) => (
            <button
              key={f.name}
              onClick={() => simulateFileModification(f.name)}
              disabled={simulating}
              className="px-2 py-0.5 bg-[#161B22] hover:bg-[#21262D] hover:text-[#58A6FF] disabled:opacity-40 text-[#C9D1D9] rounded transition-colors border border-[#30363D] font-mono text-[10px]"
            >
              Touch {f.name}
            </button>
          ))}
        </div>
        <span className="text-[#7D8590] text-[10px] font-mono">
          DEBOUNCE: 300MS
        </span>
      </div>

      {/* Event Stream List */}
      <div className="flex-1 overflow-y-auto p-3 bg-[#0B0E14] space-y-1.5">
        {events.length > 0 ? (
          events.map((ev) => {
            const isCreated = ev.type === "created";
            const isDeleted = ev.type === "deleted";

            return (
              <div
                key={ev.id}
                className="flex items-center justify-between p-2 bg-[#161B22] border border-[#30363D] rounded text-[11px] hover:border-[#58A6FF]/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.2 rounded font-mono font-bold text-[9px] uppercase ${
                      isCreated
                        ? "bg-[#112D18] text-[#7EE787] border border-[#238636]/50"
                        : isDeleted
                        ? "bg-[#2D1212] text-[#FF7B72] border border-[#ff7b72]/50"
                        : "bg-[#2A1F0D] text-[#E3B341] border border-[#d29922]/50"
                    }`}
                  >
                    {ev.type}
                  </span>
                  <span className="font-mono text-[#E2E8F0] font-bold">{ev.filename}</span>
                </div>
                <div className="flex items-center gap-3 text-[#7D8590] text-[10px] font-mono">
                  <span>{ev.details || "Refreshed chunks"}</span>
                  <span className="text-[#484F58]">[{ev.timestamp}]</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-[#7D8590] gap-2">
            <Activity className="w-6 h-6 text-[#484F58]" />
            <p className="text-[11px]">No file system events recorded. Click "Touch" above to trigger live inotify events.</p>
          </div>
        )}
      </div>
    </div>
  );
}
