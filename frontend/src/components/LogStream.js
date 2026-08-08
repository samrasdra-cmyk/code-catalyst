import React, { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

const AGENT_COLORS = {
  supervisor: "text-purple-400 border-purple-500/30 bg-purple-500/10",
  planner: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
  security: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  refactor: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  critic: "text-rose-400 border-rose-500/30 bg-rose-500/10",
  system: "text-slate-400 border-slate-700 bg-slate-800/40",
};

export default function LogStream({ jobId, onAgentUpdate }) {
  const [activeTab, setActiveTab] = useState("logs");
  const [lines, setLines] = useState([]);
  const [filterAgent, setFilterAgent] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [result, setResult] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;

    const joinJobRoom = () => {
      socket.emit("join_job", jobId);
    };

    joinJobRoom();
    socket.on("connect", joinJobRoom);

    function appendLine(agent, text, type = "status") {
      setLines((prev) => [
        ...prev,
        {
          id: prev.length,
          agent: agent || "system",
          text,
          type,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    }

    function onAgentStatus(data) {
      const statusText = `[${data.agent.toUpperCase()}] ${data.status}${data.next ? ` ➔ next: ${data.next}` : ""}`;
      appendLine(data.agent, statusText, "status");
      if (onAgentUpdate) {
        onAgentUpdate(data.agent, data.status, data.next);
      }
    }

    function onAgentLog(data) {
      appendLine(data.agent, `[${data.agent.toUpperCase()}] ${data.message}`, "log");
    }

    function onJobComplete(data) {
      appendLine("system", "🎉 Job execution finished successfully!", "success");
      setResult(data);
      if (onAgentUpdate) {
        onAgentUpdate("complete", "done", null);
      }
    }

    function onJobError(data) {
      appendLine("system", `❌ Job execution error: ${data.message}`, "error");
      if (onAgentUpdate) {
        onAgentUpdate("error", "error", null);
      }
    }

    socket.on("agent_status", onAgentStatus);
    socket.on("agent_log", onAgentLog);
    socket.on("job_complete", onJobComplete);
    socket.on("job_error", onJobError);

    return () => {
      socket.off("agent_status", onAgentStatus);
      socket.off("agent_log", onAgentLog);
      socket.off("job_complete", onJobComplete);
      socket.off("job_error", onJobError);
      socket.off("connect", joinJobRoom);
    };
  }, [jobId, onAgentUpdate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const filteredLines = lines.filter((l) => {
    const matchesAgent = filterAgent === "all" || l.agent === filterAgent;
    const matchesSearch = !searchQuery || l.text.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesAgent && matchesSearch;
  });

  const copyToClipboard = (text, setCopiedState) => {
    navigator.clipboard.writeText(text);
    setCopiedState(true);
    setTimeout(() => setCopiedState(false), 2000);
  };

  return (
    <div className="w-full bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl shadow-2xl overflow-hidden mb-12">
      {/* Navigation Tabs Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-3 gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === "logs"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            💻 Live Console ({lines.length})
          </button>
          <button
            onClick={() => setActiveTab("diff")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === "diff"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            ⚡ Code Refactor Diff {result?.refactored_code && "✨"}
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === "security"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            🛡️ Vulnerabilities ({result?.vulnerabilities?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("deps")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === "deps"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            📦 Dependencies & Files ({result?.files?.length || 0})
          </button>
        </div>

        {/* Console Controls */}
        {activeTab === "logs" && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={() => copyToClipboard(lines.map((l) => l.text).join("\n"), setCopiedLogs)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono rounded transition-colors"
            >
              {copiedLogs ? "Copied! ✓" : "Copy Logs"}
            </button>
          </div>
        )}
      </div>

      {/* Tab 1: Live Terminal Log Console */}
      {activeTab === "logs" && (
        <div className="p-4">
          {/* Agent Filters */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs font-mono">
            <span className="text-slate-500 mr-1">Filter Agent:</span>
            {["all", "supervisor", "planner", "security", "refactor", "critic"].map((ag) => (
              <button
                key={ag}
                onClick={() => setFilterAgent(ag)}
                className={`px-2 py-0.5 rounded capitalize transition-all ${
                  filterAgent === ag
                    ? "bg-cyan-500 text-slate-950 font-bold"
                    : "bg-slate-950/60 text-slate-400 hover:bg-slate-800"
                }`}
              >
                {ag}
              </button>
            ))}
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 h-80 overflow-y-auto font-mono text-xs space-y-1.5 shadow-inner">
            {filteredLines.length === 0 ? (
              <div className="text-slate-600 italic">Waiting for incoming agent stream...</div>
            ) : (
              filteredLines.map((line) => {
                const colorClass = AGENT_COLORS[line.agent] || AGENT_COLORS.system;
                return (
                  <div key={line.id} className="flex items-start gap-2 hover:bg-slate-900/50 p-1 rounded transition-colors">
                    <span className="text-slate-600 select-none text-[10px]">{line.timestamp}</span>
                    <span className={`px-1.5 py-0.2 rounded border text-[10px] font-semibold uppercase ${colorClass}`}>
                      {line.agent}
                    </span>
                    <span
                      className={`break-all ${
                        line.type === "error"
                          ? "text-rose-400 font-bold"
                          : line.type === "success"
                          ? "text-emerald-400 font-bold"
                          : "text-slate-300"
                      }`}
                    >
                      {line.text}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {/* Tab 2: Code Diff Viewer */}
      {activeTab === "diff" && (
        <div className="p-5 font-mono">
          {!result?.refactored_code ? (
            <div className="text-slate-500 text-xs py-8 text-center bg-slate-950/50 rounded-xl border border-slate-800">
              Refactoring code preview will appear here once the Refactor & Critic agents complete.
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-slate-400">
                  Transformed Output File: <span className="text-cyan-400 font-semibold">{result.current_file || "source file"}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(result.refactored_code, setCopiedCode)}
                  className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs rounded-lg transition-colors font-medium"
                >
                  {copiedCode ? "Copied Code! ✓" : "Copy Refactored Code"}
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-x-auto text-xs text-emerald-300 font-mono leading-relaxed shadow-inner">
                <pre>{result.refactored_code}</pre>
              </div>

              {result.critic_feedback && (
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs">
                  <div className="font-semibold mb-1">Critic Review Notes:</div>
                  <div>{result.critic_feedback}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Security & Vulnerabilities */}
      {activeTab === "security" && (
        <div className="p-5 font-mono text-xs">
          {!result ? (
            <div className="text-slate-500 text-xs py-8 text-center bg-slate-950/50 rounded-xl border border-slate-800">
              Security audit scan in progress...
            </div>
          ) : result.vulnerabilities?.length === 0 ? (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              ✓ No vulnerabilities or unsafe execution patterns detected. Code satisfies AST & RAG security guidelines.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-amber-400 font-semibold mb-2">
                Found {result.vulnerabilities.length} Security / Risk Item(s):
              </div>
              {result.vulnerabilities.map((vuln, i) => (
                <div key={i} className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 flex items-start gap-2">
                  <span className="text-amber-400">⚠️</span>
                  <span>{vuln}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Dependencies & Repository Tree */}
      {activeTab === "deps" && (
        <div className="p-5 font-mono text-xs space-y-6">
          {!result ? (
            <div className="text-slate-500 text-xs py-8 text-center bg-slate-950/50 rounded-xl border border-slate-800">
              Discovered repository structure will appear here.
            </div>
          ) : (
            <>
              <div>
                <div className="text-cyan-400 font-semibold mb-2">
                  Discovered Source Files ({result.files?.length || 0})
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.files?.map((f, i) => (
                    <span key={i} className="px-2.5 py-1 bg-slate-950 border border-slate-800 text-slate-300 rounded-lg">
                      📄 {f}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-purple-400 font-semibold mb-2">
                  Extracted Package Dependencies ({Object.keys(result.dependencies || {}).length})
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(result.dependencies || {}).map(([name, ver]) => (
                    <div key={name} className="p-2 bg-slate-950 border border-slate-800 rounded-lg flex justify-between text-slate-300">
                      <span className="font-semibold text-slate-200">{name}</span>
                      <span className="text-slate-500">{ver}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
