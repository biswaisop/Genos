from brain.llm import llm
from typing import List
from langchain_core.tools import tool


@tool
def create_network_command(command: str, context: List[str]) -> str:
    """Generate a Linux network diagnostics command."""

    prompt = (
        "You output ONE Linux shell command for network ops only. "
        "No prose, no markdown.\n"
        "Allowed: ping, curl, wget, netstat, ss, dig, nslookup, traceroute, ip, ifconfig.\n"
        "Never emit aggressive scans (nmap full) or exploitation commands.\n"
        "Reuse exact IPs/domains/ports from context. If ambiguous → ss -tuln or ping -c 4.\n"
        f"user: {command}\n"
        f"context: {context}\n"
        "command:"
    )
    return llm.invoke(prompt).content.strip()
