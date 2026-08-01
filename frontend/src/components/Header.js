import React, { useState } from "react";

export default function Header({ isConnected }) {
  const [showArchitecture, setShowArchitecture] = useState(false);

  return (
    <header className="w-full max-w-6xl mx-auto mb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <span className="text-2xl">⚡</span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-cyan-400 bg-clip-text text-transparent">
                CodeCatalyst AI
              </h1>
              <span className="px-2.5 py-0.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono rounded-full font-medium">
                LangGraph Multi-Agent
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Automated Repository Refactoring, RAG Security Auditing & Structural Code Migration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Socket status badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/80 border border-slate-800 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
            <span className={isConnected ? "text-emerald-400" : "text-rose-400"}>
              {isConnected ? "Gateway Online" : "Connecting Gateway..."}
            </span>
          </div>

          <button
            onClick={() => setShowArchitecture(!showArchitecture)}
            className="px-3.5 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 font-medium transition-colors"
          >
            {showArchitecture ? "Hide Specs" : "System Architecture"}
          </button>
        </div>
      </div>

      {/* Architecture Info Modal / Expandable Panel */}
      {showArchitecture && (
        <div className="mt-4 p-5 bg-slate-900/90 border border-cyan-500/30 rounded-2xl text-xs text-slate-300 space-y-3 font-mono animate-fadeIn">
          <div className="text-cyan-400 font-semibold text-sm">System Pipeline Architecture & Zero-Cost Fallbacks</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-slate-400">
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
              <div className="text-purple-400 font-bold mb-1">Supervisor & Refactor</div>
              Groq (Llama-3.1-70B) orchestrator with deterministic AST rule fallbacks if API limits occur.
            </div>
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
              <div className="text-amber-400 font-bold mb-1">Security Auditor RAG</div>
              ChromaDB vector collection for CVE snippet similarity search + static pattern regex checks.
            </div>
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
              <div className="text-rose-400 font-bold mb-1">Critic Guardrail</div>
              Pylint / ESLint validation with fallback AST syntax tree verification & automatic retry loop.
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
