import React, { useState, useEffect } from "react";
import { History, FileText, RefreshCw, CheckCircle, ShieldCheck, Clock } from "lucide-react";
import { AuditRecord } from "../types";

export default function AuditLogView() {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAudit();
  }, []);

  const fetchAudit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/audit");
      const data = await res.json();
      setRecords(data.records || []);
    } catch (e) {
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
            <History className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-[11px] font-bold text-[#C9D1D9] uppercase tracking-wider">
              Audit Logging &amp; Action History Trail
            </h2>
          </div>
        </div>

        <button
          onClick={fetchAudit}
          className="p-1 text-[#8B949E] hover:text-[#C9D1D9] hover:bg-[#21262D] rounded border border-[#30363D] transition-colors"
          title="Refresh Audit Log"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Audit Log Entries */}
      <div className="flex-1 overflow-y-auto p-3 bg-[#0B0E14] space-y-2">
        {records.length > 0 ? (
          records.map((rec, idx) => (
            <div
              key={idx}
              className="bg-[#161B22] border border-[#30363D] rounded p-2.5 space-y-1.5 hover:border-[#58A6FF]/40 transition-colors text-[11px] font-mono"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                      rec.action === "apply_edit"
                        ? "bg-[#112D18] text-[#7EE787] border border-[#238636]/50"
                        : "bg-[#2A1F0D] text-[#E3B341] border border-[#d29922]/50"
                    }`}
                  >
                    {rec.action || "EVENT"}
                  </span>
                  <span className="text-[#E2E8F0] font-bold">
                    {rec.file ? rec.file.split("workspace_docs").pop()?.replace(/^[\\/]*/, "") || rec.file : "system"}
                  </span>
                </div>
                <span className="text-[#7D8590] text-[10px] flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {rec.timestamp}
                </span>
              </div>

              {rec.details && (
                <div className="bg-[#0D1117] p-2 rounded border border-[#30363D] text-[#8B949E] text-[10px] whitespace-pre-wrap">
                  {JSON.stringify(rec.details, null, 2)}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-[#7D8590] gap-2">
            <History className="w-6 h-6 text-[#484F58]" />
            <p className="text-[11px]">No audit records logged yet. Execute dry-run or apply edits to generate trail.</p>
          </div>
        )}
      </div>
    </div>
  );
}
