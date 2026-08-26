import React, { useState } from "react";
import { CheckCircle2, XCircle, Play, Sparkles, Terminal, Shield, RefreshCw } from "lucide-react";
import { TestSuiteResult } from "../types";

export default function TestSuiteRunner() {
  const [result, setResult] = useState<TestSuiteResult | null>(null);
  const [loading, setLoading] = useState(false);

  const testCases = [
    { name: "test_chunking_logic", desc: "Text splitting, boundary heuristics, sentence break points and chunk overlap validation" },
    { name: "test_incremental_indexing", desc: "Verifies incremental addition, modification, and removal without rebuilding whole index" },
    { name: "test_hybrid_search_scoring", desc: "Hybrid TF-IDF inverted index combined with dense vector dot-product scoring" },
    { name: "test_diff_generation_and_stats", desc: "Unified diff generation, addition/deletion line counting and hunk formatting" },
    { name: "test_dry_run_vs_apply_execution", desc: "Verifies dry-run preview does not write to disk while apply writes changes" },
    { name: "test_undo_redo_pipeline", desc: "Restoration of exact original document content via snapshot stack" },
    { name: "test_audit_logging", desc: "JSONL structured audit logging trail with timestamps and file hashes" },
    { name: "test_watchdog_event_handler", desc: "Inotify/watchdog event processing and automated incremental reindexing callback" },
  ];

  const runTests = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tests/run", { method: "POST" });
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setResult({
        passed: false,
        code: 1,
        output: e.message,
        rawStdout: "",
        rawStderr: e.message,
        timestamp: new Date().toLocaleTimeString(),
      });
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
            <Shield className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-[11px] font-bold text-[#C9D1D9] uppercase tracking-wider">
              Unit &amp; Integration Test Suite (test_file_chat.py)
            </h2>
          </div>
        </div>

        <button
          onClick={runTests}
          disabled={loading}
          className="px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 text-white font-bold rounded text-[11px] transition-colors flex items-center gap-1"
        >
          {loading ? <Sparkles className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          <span>RUN ALL TESTS</span>
        </button>
      </div>

      {/* Summary Status Bar */}
      {result && (
        <div
          className={`px-3 py-1.5 border-b flex items-center justify-between text-[11px] ${
            result.passed
              ? "bg-[#112D18] border-[#238636]/50 text-[#7EE787]"
              : "bg-[#2D1212] border-[#ff7b72]/50 text-[#FF7B72]"
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold">
            {result.passed ? <CheckCircle2 className="w-3.5 h-3.5 text-[#7EE787]" /> : <XCircle className="w-3.5 h-3.5 text-[#FF7B72]" />}
            <span>
              {result.passed ? "ALL 8 TEST CASES PASSED (OK)" : "TEST FAILURES DETECTED"}
            </span>
          </div>
          <span className="font-mono text-[10px] opacity-80">Ran at {result.timestamp}</span>
        </div>
      )}

      {/* Test Cases Checklist */}
      <div className="flex-1 overflow-y-auto p-3 bg-[#0B0E14] space-y-2">
        <h3 className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wider">Test Matrix</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {testCases.map((tc, idx) => (
            <div
              key={idx}
              className="bg-[#161B22] border border-[#30363D] rounded p-2.5 space-y-1 hover:border-[#58A6FF]/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-[#C9D1D9]">{tc.name}</span>
                {result ? (
                  result.passed ? (
                    <span className="flex items-center gap-1 text-[10px] text-[#7EE787] font-mono font-bold">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>PASS</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-[#FF7B72] font-mono font-bold">
                      <XCircle className="w-3 h-3" />
                      <span>FAIL</span>
                    </span>
                  )
                ) : (
                  <span className="text-[10px] text-[#7D8590] font-mono">READY</span>
                )}
              </div>
              <p className="text-[10px] text-[#8B949E] leading-relaxed font-sans">{tc.desc}</p>
            </div>
          ))}
        </div>

        {/* Raw Test Runner Output */}
        {result?.output && (
          <div className="mt-3 border border-[#30363D] rounded overflow-hidden bg-[#0D1117]">
            <div className="px-3 py-1.5 bg-[#161B22] border-b border-[#30363D] text-[10px] font-mono text-[#8B949E] flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold uppercase">
                <Terminal className="w-3 h-3 text-[#58A6FF]" />
                Test Runner Console Output
              </span>
              <span className="text-[10px]">EXIT CODE: {result.code}</span>
            </div>
            <pre className="p-2.5 text-[11px] font-mono text-[#C9D1D9] whitespace-pre-wrap select-text leading-relaxed">
              {result.output}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
