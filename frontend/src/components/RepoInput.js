import React, { useState } from "react";

const API_URL = process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === "production"
    ? window.location.origin
    : "http://localhost:5000");

const SAMPLE_REPOS = [
  { label: "Express.js", url: "https://github.com/expressjs/express" },
  { label: "Flask (Python)", url: "https://github.com/pallets/flask" },
  { label: "Lodash", url: "https://github.com/lodash/lodash" },
];

const PRESET_INSTRUCTIONS = [
  "Convert JavaScript to TypeScript",
  "Audit and fix security vulnerabilities",
  "Modernize syntax and optimize code structure",
];

export default function RepoInput({ onJobStarted, isRunning }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [instruction, setInstruction] = useState("Convert JavaScript to TypeScript");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    setError(null);

    if (!repoUrl || !repoUrl.includes("github.com")) {
      setError("Please enter a valid GitHub repository URL (e.g. https://github.com/owner/repo).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/repo/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, instruction }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to queue analysis job.");
        return;
      }

      onJobStarted(data.jobId, repoUrl, instruction);
    } catch (err) {
      setError("Could not reach backend gateway. Make sure backend service is running on port 5000.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl p-6 shadow-2xl mb-8">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              GitHub Repository URL
            </label>
            {/* Sample Repos */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-mono">Quick Samples:</span>
              {SAMPLE_REPOS.map((sample) => (
                <button
                  key={sample.url}
                  type="button"
                  onClick={() => setRepoUrl(sample.url)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 font-mono text-sm">
              🐙
            </div>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repository"
              className="w-full pl-10 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-200 text-sm font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder:text-slate-600"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Refactoring / Migration Instruction
            </label>
          </div>
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Convert JS to TS or Fix Security Flaws"
            className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-200 text-sm font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder:text-slate-600 mb-2"
          />
          {/* Preset instruction chips */}
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_INSTRUCTIONS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setInstruction(preset)}
                className={`px-2.5 py-1 rounded-full text-xs font-mono transition-colors border ${
                  instruction === preset
                    ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                    : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                }`}
              >
                + {preset}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-mono flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || isRunning}
          className="w-full py-3.5 rounded-xl font-semibold text-sm tracking-wide text-slate-950 bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <svg className="animate-spin h-4 w-4 text-slate-950" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Queuing Job onto RabbitMQ...</span>
            </>
          ) : isRunning ? (
            <span>Agent Pipeline Executing...</span>
          ) : (
            <>
              <span>Launch Multi-Agent Pipeline</span>
              <span>🚀</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
