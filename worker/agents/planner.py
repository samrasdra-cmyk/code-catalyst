"""
Planner: no LLM involved at all. Clones the target repo (via GitPython,
falling back to a raw `git clone` subprocess if the GitHub API/GitPython
path fails), walks the tree, and parses package.json / requirements.txt
for a dependency map.
"""

import json
import os
import re
import subprocess
import tempfile

import git

from core.status import emit_status
from parsers.ast_analyzer import SUPPORTED_EXTENSIONS as _  # noqa: F401 (re-export not needed, kept for clarity)

_CODE_EXTENSIONS = (".py", ".js", ".ts", ".jsx", ".tsx")


def _clone_repo(repo_url: str) -> str:
    """Clone via GitPython; fall back to a raw subprocess git clone if that fails."""
    dest = tempfile.mkdtemp(prefix="codecatalyst-")
    try:
        git.Repo.clone_from(repo_url, dest, depth=1)
        return dest
    except Exception:
        # Fallback path described in the design doc: shell out to git directly.
        subprocess.run(
            ["git", "clone", "--depth", "1", repo_url, dest],
            check=True,
            capture_output=True,
        )
        return dest


def _walk_source_files(local_path: str):
    files = []
    for root, dirs, filenames in os.walk(local_path):
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "venv", "__pycache__")]
        for filename in filenames:
            if filename.endswith(_CODE_EXTENSIONS):
                rel = os.path.relpath(os.path.join(root, filename), local_path)
                files.append(rel)
    return files


def _parse_package_json(local_path: str) -> dict:
    path = os.path.join(local_path, "package.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        deps = {}
        deps.update(data.get("dependencies", {}))
        deps.update(data.get("devDependencies", {}))
        return deps
    except (OSError, json.JSONDecodeError):
        return {}


def _parse_requirements_txt(local_path: str) -> dict:
    path = os.path.join(local_path, "requirements.txt")
    if not os.path.exists(path):
        return {}
    deps = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                match = re.match(r"^([A-Za-z0-9_\-.]+)\s*([=<>!~]{0,2})\s*([\w.]*)", line)
                if match:
                    name, _op, version = match.groups()
                    deps[name] = version or "*"
    except OSError:
        pass
    return deps


def run(state: dict) -> dict:
    job_id = state["job_id"]
    repo_url = state["repo_url"]
    emit_status(job_id, "agent_status", {"agent": "planner", "status": "thinking"})

    try:
        local_path = _clone_repo(repo_url)
    except Exception as exc:
        emit_status(job_id, "agent_status", {"agent": "planner", "status": "error"})
        return {"error": f"Planner failed to clone repo: {exc}", "next_agent": "end"}

    files = _walk_source_files(local_path)
    dependencies = {**_parse_package_json(local_path), **_parse_requirements_txt(local_path)}

    emit_status(
        job_id, "agent_status",
        {"agent": "planner", "status": "done", "files_found": len(files), "deps_found": len(dependencies)},
    )

    current_file = files[0] if files else None
    original_code = ""
    if current_file:
        with open(os.path.join(local_path, current_file), "r", encoding="utf-8", errors="ignore") as f:
            original_code = f.read()

    return {
        "local_path": local_path,
        "files": files,
        "dependencies": dependencies,
        "current_file": current_file,
        "original_code": original_code,
        "last_agent": "planner",
        "log": state.get("log", []) + [f"Planner found {len(files)} files, {len(dependencies)} dependencies"],
    }
