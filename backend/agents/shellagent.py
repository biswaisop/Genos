"""
Planner node for the GenOS agent graph.

Responsibility: given the user's natural language message, call the correct
command-generator tool and return the proposed bash command in state.

It does NOT execute the command — that happens in the executor node,
and only after the critic clears it.

Generator tools available:
  create_os_command      → general shell, scripts, package management
  create_file_tool       → file / directory operations
  create_process_command → process monitoring, kill, service management
  create_network_command → network diagnostics, curl, ping, ss
"""
import logging

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from langgraph.prebuilt import ToolNode

from brain.llm import llm
from tools.all_tools import all_tools as GENERATOR_TOOLS

logger = logging.getLogger(__name__)

# Limits to keep planner context small (token budget)
MAX_PLANNER_HISTORY_MSGS = 3          # only last N messages forwarded to the LLM
MAX_MSG_CHAR = 400                    # truncate each message content to this many chars
MAX_CONTEXT_ITEMS = 3                 # max entries in "context" list given to tool
MAX_CONTEXT_ITEM_CHAR = 400           # truncate each context item to this many chars

# ── Prompt ────────────────────────────────────────────────────────────────────

PLANNER_PROMPT = (
    "Pick ONE tool to generate a single bash command for the user's request.\n"
    "Tools: create_os_command (shell/pkg), create_file_tool (ls/cp/mv/rm), "
    "create_process_command (ps/kill/systemctl), create_network_command (ping/curl/ss).\n"
    "Pass the user's request as 'command' and recent context as 'context'. "
    "Do not execute anything."
)


def _shrink(content: str, limit: int) -> str:
    if not content:
        return ""
    text = str(content)
    if len(text) <= limit:
        return text
    return text[: limit] + "…"

# ── Tool node (generator tools only — no run_command) ─────────────────────────
_generator_tool_node = ToolNode(GENERATOR_TOOLS)


# ── Planner node ──────────────────────────────────────────────────────────────

def planner_node(state: dict) -> dict:
    """
    LangGraph node.

    1. Binds generator tools to the LLM (tool_choice='any' forces a tool call).
    2. Calls the selected tool to get the proposed bash command.
    3. Returns the proposed command in state — does NOT execute it.
    """
    messages = state.get("messages", [])

    # ── RAG context from ChromaDB (injected by context_retrieval_node) ────────
    rag_context: str = state.get("context", "")

    # Build context list: RAG first, then last few conversation turns (truncated)
    context_parts: list[str] = []
    if rag_context:
        context_parts.append(_shrink(rag_context, MAX_CONTEXT_ITEM_CHAR))
    for m in messages[-MAX_PLANNER_HISTORY_MSGS:]:
        content = getattr(m, "content", None)
        if content:
            context_parts.append(_shrink(content, MAX_CONTEXT_ITEM_CHAR))
    context_parts = context_parts[:MAX_CONTEXT_ITEMS]

    # ── Step 1: LLM picks the right generator tool ─────────────────────────────
    # Only forward the most recent HumanMessage to the planner — full history
    # bloats token usage and the generator tool re-receives pruned context.
    latest_human: HumanMessage | None = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_human = msg
            break

    planning_messages = [SystemMessage(content=PLANNER_PROMPT)]
    if latest_human is not None:
        planning_messages.append(
            HumanMessage(content=_shrink(latest_human.content, MAX_MSG_CHAR))
        )

    llm_with_tools = llm.bind_tools(GENERATOR_TOOLS, tool_choice="any")
    ai_response = llm_with_tools.invoke(planning_messages)

    tool_names = [tc["name"] for tc in (ai_response.tool_calls or [])]
    logger.info("planner tool calls: %s", tool_names)
    tool_used = tool_names[0] if tool_names else "unknown"

    # ── Step 2: Execute the selected generator tool ────────────────────────────
    new_messages     = [ai_response]
    proposed_command = ""

    if ai_response.tool_calls:
        for tc in ai_response.tool_calls:
            if "context" in tc.get("args", {}):
                tc["args"]["context"] = context_parts

        tool_input_state = {"messages": planning_messages + [ai_response]}
        tool_result = _generator_tool_node.invoke(tool_input_state)
        tool_msg: ToolMessage = tool_result["messages"][-1]

        new_messages.append(tool_msg)
        proposed_command = tool_msg.content.strip()

        logger.info("planner proposed command: %s", proposed_command)
    else:
        # Fallback: LLM wrote command directly in content
        proposed_command = ai_response.content.strip()
        logger.warning("planner made no tool call — using content as command")

    return {
        "messages":         new_messages,
        "proposed_command": proposed_command,
        "tool_used":        tool_used,
    }