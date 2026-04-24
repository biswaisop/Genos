from brain.llm import llm
from typing import List
from langchain_core.tools import tool


@tool
def create_process_command(command: str, context: List[str]) -> str:
    """Generate a Linux process/service management command."""

    prompt = (
        "You output ONE Linux shell command for process/service ops only. "
        "No prose, no markdown.\n"
        "Allowed: ps, top, kill, pkill, pgrep, nice, renice, uptime, "
        "systemctl status|start|stop|restart <service>.\n"
        "Never emit: kill -9 -1, pkill with broad patterns.\n"
        "Prefer graceful kill over -9. Reuse exact PIDs/service names from context.\n"
        "If ambiguous → ps aux or pgrep -fl <name>.\n"
        f"user: {command}\n"
        f"context: {context}\n"
        "command:"
    )
    return llm.invoke(prompt).content.strip()
