"""
Wires the five agents into a LangGraph StateGraph:

    supervisor -> planner -> supervisor -> security -> supervisor
        -> refactor -> supervisor -> critic -> supervisor -> (refactor | END)

The Supervisor is consulted after every agent and decides the next
hop by inspecting the current state (see agents/supervisor.py). The
Critic can send the graph back to Refactor up to `max_loops` times.
"""

from langgraph.graph import StateGraph, END

from core.state import CatalystState
from agents import supervisor, planner, security, refactor, critic


def _supervisor_router(state: CatalystState) -> str:
    """Reads the `next_agent` field the supervisor node just set."""
    next_agent = state.get("next_agent", "end")
    if next_agent == "end" or state.get("error"):
        return END
    return next_agent


def build_graph():
    graph = StateGraph(CatalystState)

    graph.add_node("supervisor", supervisor.route)
    graph.add_node("planner", planner.run)
    graph.add_node("security", security.run)
    graph.add_node("refactor", refactor.run)
    graph.add_node("critic", critic.run)

    graph.set_entry_point("supervisor")

    # Every worker node reports back to the supervisor so it can decide
    # the next hop from a single source of truth.
    graph.add_edge("planner", "supervisor")
    graph.add_edge("security", "supervisor")
    graph.add_edge("refactor", "supervisor")
    graph.add_edge("critic", "supervisor")

    graph.add_conditional_edges(
        "supervisor",
        _supervisor_router,
        {
            "planner": "planner",
            "security": "security",
            "refactor": "refactor",
            "critic": "critic",
            END: END,
        },
    )

    return graph.compile()
