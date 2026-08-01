"""
Supervisor: decides which agent runs next. Tries Groq (Llama-3.1-70B)
first with a strict, token-cheap prompt. If Groq is unavailable
(missing key, rate limited, network error) it falls back to a
deterministic linear order, so the graph never stalls.
"""

import os
from groq import Groq, GroqError

from core.status import emit_status

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile")

_LINEAR_ORDER = ["planner", "security", "refactor", "critic", "end"]

_SYSTEM_PROMPT = (
    "You are a Supervisor agent in a code-migration pipeline. "
    "Given the current state, respond with ONLY one lowercase word: "
    "'planner', 'security', 'refactor', 'critic', or 'end'. "
    "No punctuation, no explanation, nothing else."
)


def _client_or_none():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None
    try:
        return Groq(api_key=api_key)
    except Exception:
        return None


def _fallback_route(state: dict) -> str:
    """Deterministic linear routing used when Groq can't be reached."""
    if not state.get("files"):
        return "planner"
    if not state.get("security_done"):
        return "security"
    if not state.get("refactored_code"):
        return "refactor"
    if state.get("critic_passed"):
        return "end"
    if state.get("last_agent") == "critic":
        return "refactor"
    return "critic"


def route(state: dict) -> dict:
    job_id = state["job_id"]
    emit_status(job_id, "agent_status", {"agent": "supervisor", "status": "thinking"})

    client = _client_or_none()
    next_agent = None

    if client is not None:
        try:
            summary = (
                f"files_discovered={len(state.get('files', []))}, "
                f"vulnerabilities_scanned={state.get('security_done', False)}, "
                f"has_refactor={bool(state.get('refactored_code'))}, "
                f"critic_passed={state.get('critic_passed')}, "
                f"loop_count={state.get('loop_count', 0)}/{state.get('max_loops', 3)}"
            )
            response = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": summary},
                ],
                max_tokens=5,
                temperature=0,
            )
            candidate = response.choices[0].message.content.strip().lower()
            if candidate in _LINEAR_ORDER:
                next_agent = candidate
        except (GroqError, Exception) as exc:  # noqa: BLE001
            emit_status(
                job_id, "agent_log",
                {"agent": "supervisor", "message": f"Groq unavailable ({exc}); using fallback routing"},
            )

    if next_agent is None:
        next_agent = _fallback_route(state)

    emit_status(job_id, "agent_status", {"agent": "supervisor", "status": "done", "next": next_agent})
    return {"next_agent": next_agent, "log": state.get("log", []) + [f"Supervisor -> {next_agent}"]}
