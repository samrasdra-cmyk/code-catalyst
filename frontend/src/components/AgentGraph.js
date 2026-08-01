import React from "react";

const AGENTS = [
  { id: "supervisor", name: "Supervisor", role: "Orchestrator", color: "purple", border: "border-purple-500", text: "text-purple-400", bg: "bg-purple-950/40", shadow: "shadow-purple-500/20" },
  { id: "planner", name: "Planner", role: "Repo & Deps", color: "cyan", border: "border-cyan-500", text: "text-cyan-400", bg: "bg-cyan-950/40", shadow: "shadow-cyan-500/20" },
  { id: "security", name: "Security", role: "RAG & Vulnerabilities", color: "amber", border: "border-amber-500", text: "text-amber-400", bg: "bg-amber-950/40", shadow: "shadow-amber-500/20" },
  { id: "refactor", name: "Refactor", role: "Code Transformer", color: "emerald", border: "border-emerald-500", text: "text-emerald-400", bg: "bg-emerald-950/40", shadow: "shadow-emerald-500/20" },
  { id: "critic", name: "Critic", role: "AST & Linter Guard", color: "rose", border: "border-rose-500", text: "text-rose-400", bg: "bg-rose-950/40", shadow: "shadow-rose-500/20" },
];

export default function AgentGraph({ currentAgent, agentStatuses = {}, loopCount = 0 }) {
  return (
    <div className="w-full bg-slate-900/60 backdrop-blur border border-slate-800 rounded-2xl p-6 shadow-2xl mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
          <h2 className="text-lg font-semibold text-slate-100 tracking-wide">
            Multi-Agent LangGraph Execution Pipeline
          </h2>
        </div>
        {loopCount > 0 && (
          <span className="px-3 py-1 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono rounded-full">
            Critic Loop #{loopCount}
          </span>
        )}
      </div>

      {/* Grid of Agent Nodes */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 relative">
        {AGENTS.map((agent, index) => {
          const status = agentStatuses[agent.id] || "idle";
          const isActive = currentAgent === agent.id;
          const isDone = status === "done";
          const isThinking = status === "thinking";
          const isError = status === "error";

          return (
            <div
              key={agent.id}
              className={`relative flex flex-col items-center p-4 rounded-xl border transition-all duration-300 ${
                isActive
                  ? `${agent.border} ${agent.bg} shadow-lg ${agent.shadow} ring-2 ring-offset-2 ring-offset-slate-950 ring-${agent.color}-400/50 scale-105 z-10`
                  : isDone
                  ? "border-slate-700 bg-slate-850/80 text-slate-300 opacity-90"
                  : "border-slate-800/80 bg-slate-950/50 opacity-60"
              }`}
            >
              {/* Header Badge */}
              <div className="flex items-center justify-between w-full mb-2">
                <span className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">
                  Node 0{index + 1}
                </span>
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isThinking
                      ? "bg-amber-400 animate-pulse"
                      : isDone
                      ? "bg-emerald-400"
                      : isError
                      ? "bg-rose-500"
                      : "bg-slate-700"
                  }`}
                />
              </div>

              {/* Agent Title & Role */}
              <div className="text-center my-1">
                <div className={`font-semibold text-base ${isActive ? agent.text : "text-slate-200"}`}>
                  {agent.name}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{agent.role}</div>
              </div>

              {/* Live Status Pill */}
              <div className="mt-3 w-full text-center">
                <span
                  className={`inline-block px-2.5 py-0.5 text-[11px] font-mono rounded-full border ${
                    isThinking
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300 animate-pulse"
                      : isDone
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : isError
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                      : "bg-slate-800/50 border-slate-700/50 text-slate-500"
                  }`}
                >
                  {isThinking ? "Thinking..." : isDone ? "Completed" : isError ? "Error" : "Standby"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
