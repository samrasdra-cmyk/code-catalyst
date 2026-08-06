"""
Security Auditor: queries the local ChromaDB CVE-pattern collection
for chunks of the current file that look similar to known vulnerable
patterns, and cross-checks with fast regex/AST rules. Works even if
ChromaDB is unreachable, since chroma_client.py degrades to an
in-memory client and the regex/AST layer never depends on it at all.
"""

from worker.core.status import emit_status
from worker.rag.chroma_client import get_cve_collection
from worker.parsers.ast_analyzer import scan_python_vulnerabilities, scan_js_vulnerabilities


def _rag_similarity_check(code: str, distance_threshold: float = 0.9) -> list:
    """Query the seeded CVE collection for snippets similar to this code."""
    try:
        collection = get_cve_collection()
        results = collection.query(query_texts=[code[:2000]], n_results=3)
        findings = []
        docs = results.get("documents", [[]])[0]
        distances = results.get("distances", [[]])[0]
        for doc, distance in zip(docs, distances):
            if distance <= distance_threshold:
                findings.append(f"RAG match: {doc}")
        return findings
    except Exception as exc:  # noqa: BLE001
        print(f"[security] RAG lookup failed, skipping: {exc}")
        return []


def run(state: dict) -> dict:
    job_id = state["job_id"]
    emit_status(job_id, "agent_status", {"agent": "security", "status": "thinking"})

    code = state.get("original_code", "")
    current_file = state.get("current_file") or ""

    if current_file.endswith(".py"):
        pattern_findings = scan_python_vulnerabilities(code)
    else:
        pattern_findings = scan_js_vulnerabilities(code)

    rag_findings = _rag_similarity_check(code)

    vulnerabilities = sorted(set(pattern_findings + rag_findings))

    emit_status(
        job_id, "agent_status",
        {"agent": "security", "status": "done", "vulnerabilities_found": len(vulnerabilities)},
    )

    return {
        "vulnerabilities": vulnerabilities,
        "security_done": True,
        "last_agent": "security",
        "log": state.get("log", []) + [f"Security found {len(vulnerabilities)} potential issue(s)"],
    }
