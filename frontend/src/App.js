import React, { useState, useEffect, useCallback } from "react";
import Header from "./components/Header";
import AgentGraph from "./components/AgentGraph";
import RepoInput from "./components/RepoInput";
import LogStream from "./components/LogStream";
import { socket } from "./socket";

export default function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [jobId, setJobId] = useState(null);
  const [currentAgent, setCurrentAgent] = useState(null);
  const [agentStatuses, setAgentStatuses] = useState({});
  const [loopCount, setLoopCount] = useState(0);
  const [jobStatus, setJobStatus] = useState("idle");
  const [jobResult, setJobResult] = useState(null);

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }
    function onDisconnect() {
      setIsConnected(false);
    }
    function onJobComplete(data) {
      setJobStatus("completed");
      setCurrentAgent(null);
      setJobResult(data);
    }
    function onJobError(data) {
      setJobStatus("error");
      setCurrentAgent(null);
      setJobResult(data);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("job_complete", onJobComplete);
    socket.on("job_error", onJobError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("job_complete", onJobComplete);
      socket.off("job_error", onJobError);
    };
  }, []);

  const handleJobStarted = (id, repoUrl, instruction) => {
    setJobId(id);
    setCurrentAgent("supervisor");
    setJobStatus("running");
    setJobResult(null);
    setAgentStatuses({
      supervisor: "thinking",
      planner: "idle",
      security: "idle",
      refactor: "idle",
      critic: "idle",
    });
    setLoopCount(0);
  };

  const handleAgentUpdate = useCallback((agent, status, next) => {
    if (agent === "complete" || agent === "error") {
      setCurrentAgent(null);
      setJobStatus(agent === "complete" ? "completed" : "error");
      return;
    }

    if (agent === "supervisor" && status === "done" && next === "end") {
      setCurrentAgent(null);
      setJobStatus("completed");
      return;
    }

    setCurrentAgent(agent);
    setAgentStatuses((prev) => ({
      ...prev,
      [agent]: status,
    }));

    if (agent === "critic" && status === "done") {
      setLoopCount((prev) => prev + 1);
    }
  }, []);

  const isRunning = jobStatus === "running" || Boolean(currentAgent);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 py-10 px-4 sm:px-6 lg:px-8 selection:bg-cyan-500 selection:text-slate-950">
      {/* App Header */}
      <Header isConnected={isConnected} />

      {/* Main Container */}
      <main className="max-w-6xl mx-auto space-y-6">
        {/* Repository Input Section */}
        <RepoInput onJobStarted={handleJobStarted} isRunning={isRunning} />

        {/* Live LangGraph Visualizer Node Pipeline */}
        <AgentGraph
          currentAgent={currentAgent}
          agentStatuses={agentStatuses}
          loopCount={loopCount}
        />

        {/* Log Stream Console & Result Inspector */}
        {jobId && <LogStream jobId={jobId} onAgentUpdate={handleAgentUpdate} />}
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto mt-16 pt-6 border-t border-slate-900 text-center text-xs text-slate-600 font-mono">
        CodeCatalyst • Multi-Agent Repository Migration System • React + Express + Socket.IO + RabbitMQ + LangGraph
      </footer>
    </div>
  );
}
