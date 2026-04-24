from langchain_core.tools import tool
from brain.llm import llm
from typing import List


@tool
def create_os_command(command: str, context: List[str]) -> str:
    """Generate a Linux OS shell command from a natural language instruction and context."""

    prompt = (
        "You output ONE Linux shell command. No prose, no markdown, no explanation.\n"
        "Scope: OS-level only (file ops, process, network, package mgmt, permissions).\n"
        "Never emit: rm -rf /, mkfs.*, dd if=/dev/*, shutdown, reboot, poweroff.\n"
        "Reuse paths/PIDs/services from context when relevant.\n"
        "If ambiguous → prefer a safe inspection command (ls, ps, df).\n"
        f"user: {command}\n"
        f"context: {context}\n"
        "command:"
    )
    return llm.invoke(prompt).content.strip()
