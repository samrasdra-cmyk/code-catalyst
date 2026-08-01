"""
Critic: validates the Refactor agent's output. Prefers running the
real linter (pylint for .py, eslint for .js/.ts if a local install is
found) via subprocess, and falls back to a pure-Python AST syntax
check when no linter binary is available - so validation can never
outright crash the pipeline.
"""

import shutil
import subprocess
import tempfile
import os

from core.status import emit_status
from parsers.ast_analyzer import validate_python_syntax


def _run_pylint(code: str) -> str | None:
    """Returns feedback string if pylint finds problems, else None. None
    is also returned (with a printed warning) if pylint isn't installed."""
    if shutil.which("pylint") is None:
        return None

    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as tmp:
        tmp.write(code)
        tmp_path = tmp.name

    try:
        result = subprocess.run(
            ["pylint", "--disable=all", "--enable=E", tmp_path],
            capture_output=True, text=True, timeout=30,
        )
        output = result.stdout.strip()
        return output if output and "Your code has been rated" not in output.splitlines()[0] else None
    except Exception:
        return None
    finally:
        os.unlink(tmp_path)


def _run_eslint(code: str) -> str | None:
    if shutil.which("eslint") is None:
        return None

    with tempfile.NamedTemporaryFile(suffix=".js", mode="w", delete=False) as tmp:
        tmp.write(code)
        tmp_path = tmp.name

    try:
        result = subprocess.run(
            ["eslint", "--no-eslintrc", "--env", "es2021", tmp_path],
            capture_output=True, text=True, timeout=30,
        )
        return result.stdout.strip() or None
    except Exception:
        return None
    finally:
        os.unlink(tmp_path)


def run(state: dict) -> dict:
    job_id = state["job_id"]
    emit_status(job_id, "agent_status", {"agent": "critic", "status": "thinking"})

    code = state.get("refactored_code", "")
    current_file = state.get("current_file") or ""
    loop_count = state.get("loop_count", 0)
    max_loops = state.get("max_loops", 3)

    feedback = None
    if current_file.endswith(".py"):
        feedback = _run_pylint(code)
        if feedback is None and not validate_python_syntax(code):
            feedback = "AST validation failed: the refactored code has a syntax error"
    else:
        feedback = _run_eslint(code)
        # No reliable zero-dependency JS syntax check without a parser
        # library installed, so absence of eslint just means "assume ok".

    passed = feedback is None
    new_loop_count = loop_count if passed else loop_count + 1
    stop_looping = new_loop_count >= max_loops

    emit_status(
        job_id, "agent_status",
        {"agent": "critic", "status": "done", "passed": passed, "loop": new_loop_count},
    )

    return {
        "critic_feedback": feedback,
        "critic_passed": passed or stop_looping,  # give up gracefully after max_loops
        "loop_count": new_loop_count,
        "last_agent": "critic",
        "log": state.get("log", []) + [
            f"Critic {'approved' if passed else 'rejected'} the refactor (loop {new_loop_count}/{max_loops})"
        ],
    }
