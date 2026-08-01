"""
Shared state object that flows through every node of the LangGraph.
Kept as a TypedDict (not a class instance) because LangGraph's
StateGraph merges partial updates returned by each node into this
dict automatically.
"""

from typing import TypedDict, List, Dict, Optional


class CatalystState(TypedDict, total=False):
    job_id: str
    repo_url: str
    instruction: str

    local_path: str
    files: List[str]
    dependencies: Dict[str, str]

    current_file: Optional[str]
    original_code: str
    refactored_code: str

    vulnerabilities: List[str]
    security_done: bool

    critic_feedback: Optional[str]
    critic_passed: bool

    loop_count: int
    max_loops: int

    next_agent: str          # set by the Supervisor to route the graph
    last_agent: Optional[str]
    log: List[str]           # human-readable trail of what happened
    error: Optional[str]


def new_state(job_id: str, repo_url: str, instruction: str, max_loops: int = 3) -> CatalystState:
    return CatalystState(
        job_id=job_id,
        repo_url=repo_url,
        instruction=instruction,
        local_path="",
        files=[],
        dependencies={},
        current_file=None,
        original_code="",
        refactored_code="",
        vulnerabilities=[],
        security_done=False,
        critic_feedback=None,
        critic_passed=False,
        loop_count=0,
        max_loops=max_loops,
        next_agent="planner",
        last_agent=None,
        log=[],
        error=None,
    )

