import React, { useState } from "react";
import { Search, Layers, Zap, BookOpen, Sparkles, Filter, CheckCircle2 } from "lucide-react";
import { RetrievalResult } from "../types";

export default function RetrievalExplorer() {
  const [query, setQuery] = useState("rate limit");
  const [results, setResults] = useState<RetrievalResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const sampleQueries = [
    "rate limit",
    "incremental indexing",
    "payment charge rollback",
    "presentation layer",
    "watchdog inotify",
    "authenticate user",
  ];

  const handleSearch = async (queryText?: string) => {
    const q = (queryText || query).trim();
    if (!q) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch("/api/retrieval/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      setResults(data.results || []);
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
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-[11px] font-bold text-[#C9D1D9] uppercase tracking-wider">
              Retrieval Index &amp; Hybrid Lexical Search
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="px-2 py-0.5 bg-[#21262D] text-[#8B949E] rounded border border-[#30363D] font-mono">
            HYBRID: 60% TF-IDF + 40% VECTOR
          </span>
        </div>
      </div>

      {/* Query Search Bar */}
      <div className="p-3 bg-[#0D1117] border-b border-[#30363D] space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[#7D8590] absolute left-2.5 top-2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search indexed corpus (e.g. rate limit, authentication)..."
              className="w-full bg-[#161B22] border border-[#30363D] text-[#E2E8F0] text-[11px] rounded pl-8 pr-2.5 py-1.5 outline-none focus:border-[#58A6FF] font-mono placeholder:text-[#484F58]"
            />
          </div>
          <button
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
            className="px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 text-white font-bold rounded text-[11px] transition-colors flex items-center gap-1"
          >
            <Zap className="w-3 h-3" />
            <span>SEARCH</span>
          </button>
        </div>

        {/* Quick Sample Queries */}
        <div className="flex items-center gap-1.5 text-[10px] text-[#7D8590] flex-wrap">
          <span className="text-[#8B949E] font-bold uppercase">Presets:</span>
          {sampleQueries.map((sq, i) => (
            <button
              key={i}
              onClick={() => {
                setQuery(sq);
                handleSearch(sq);
              }}
              className="px-2 py-0.5 bg-[#161B22] hover:bg-[#21262D] hover:text-[#58A6FF] text-[#8B949E] rounded border border-[#30363D] text-[10px] transition-colors font-mono"
            >
              {sq}
            </button>
          ))}
        </div>
      </div>

      {/* Scored Results Cards */}
      <div className="flex-1 overflow-y-auto p-3 bg-[#0B0E14] space-y-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#8B949E] gap-2">
            <Sparkles className="w-5 h-5 text-[#58A6FF] animate-spin" />
            <p className="text-[11px]">Computing TF-IDF cosine similarity &amp; hash vector scores...</p>
          </div>
        ) : results.length > 0 ? (
          results.map((r, idx) => (
            <div
              key={idx}
              className="bg-[#161B22] border border-[#30363D] rounded p-3 space-y-2 hover:border-[#58A6FF]/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-[#121D2F] border border-[#1f3554] text-[#58A6FF] text-[10px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-[#C9D1D9] truncate">
                    {r.file.split("workspace_docs").pop()?.replace(/^[\\/]*/, "") || r.file}
                  </span>
                </div>
                {/* Score Pills */}
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  <span className="px-1.5 py-0.5 bg-[#112D18] text-[#7EE787] rounded border border-[#238636]/50 font-bold">
                    HYBRID: {(r.score * 100).toFixed(1)}%
                  </span>
                  <span className="px-1.5 py-0.5 bg-[#21262D] text-[#8B949E] rounded border border-[#30363D]">
                    TF-IDF: {(r.tfidf * 100).toFixed(0)}%
                  </span>
                  <span className="px-1.5 py-0.5 bg-[#21262D] text-[#8B949E] rounded border border-[#30363D]">
                    Hash Vec: {(r.vector * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Chunk Snippet */}
              <div className="bg-[#0D1117] p-2.5 rounded border border-[#30363D] font-mono text-[11px] text-[#C9D1D9] whitespace-pre-wrap leading-relaxed select-text">
                {r.text}
              </div>
            </div>
          ))
        ) : hasSearched ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#7D8590] gap-2">
            <BookOpen className="w-6 h-6 text-[#484F58]" />
            <p className="text-[11px]">No indexed chunks scored above threshold for this query.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-[#7D8590] gap-2">
            <Layers className="w-6 h-6 text-[#484F58]" />
            <p className="text-[11px]">Enter a query or select a preset to test hybrid retrieval.</p>
          </div>
        )}
      </div>
    </div>
  );
}
