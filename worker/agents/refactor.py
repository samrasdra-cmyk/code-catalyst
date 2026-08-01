"""
Refactor (CodeGen): asks Groq to rewrite the current file according to
the user's instruction (e.g. "convert to TypeScript"), respecting any
critic feedback from a prior loop. Falls back to a deterministic
var->let AST-adjacent transform if Groq is unavailable - not as smart,
but guaranteed to return *something* runnable.
"""

import os
from groq import Groq, GroqError

from core.status import emit_status
from parsers.ast_analyzer import js_var_to_let_fallback

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile")

_SYSTEM_PROMPT = (
    "You are a precise code refactoring engine. Rewrite the given source file "
    "according to the instruction. Preserve behavior exactly. "
    "Respond with ONLY the rewritten code - no markdown fences, no commentary."
)


def _client_or_none():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None
    try:
        return Groq(api_key=api_key)
    except Exception:
        return None


def run(state: dict) -> dict:
    job_id = state["job_id"]
    emit_status(job_id, "agent_status", {"agent": "refactor", "status": "thinking"})

    original_code = state.get("original_code", "")
    instruction = state.get("instruction", "Modernize this code")
    critic_feedback = state.get("critic_feedback")
    current_file = state.get("current_file") or ""

    client = _client_or_none()
    refactored = None

    if client is not None:
        user_content = f"Instruction: {instruction}\n\nFile: {current_file}\n\nCode:\n{original_code}"
        if critic_feedback:
            user_content += f"\n\nThe previous attempt failed review with this feedback:\n{critic_feedback}\nFix it."

        try:
            response = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                max_tokens=2048,
                temperature=0.2,
            )
            refactored = response.choices[0].message.content.strip()
        except (GroqError, Exception) as exc:  # noqa: BLE001
            emit_status(
                job_id, "agent_log",
                {"agent": "refactor", "message": f"Groq unavailable ({exc}); using AST fallback"},
            )

    if refactored is None:
        # Deterministic fallback: only handles var -> let for JS/TS files.
        # For Python files (or anything else) it returns the code unchanged
        # rather than risk corrupting it without an LLM to verify semantics.
        if current_file.endswith((".js", ".jsx", ".ts", ".tsx")):
            refactored = js_var_to_let_fallback(original_code)
        else:
            refactored = original_code

    emit_status(job_id, "agent_status", {"agent": "refactor", "status": "done"})

    return {
        "refactored_code": refactored,
        "last_agent": "refactor",
        "log": state.get("log", []) + ["Refactor produced a new version of the file"],
    }
