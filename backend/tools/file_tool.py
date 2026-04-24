from brain.llm import llm
from typing import List
from langchain_core.tools import tool


@tool
def create_file_tool(command: str, context: List[str]) -> str:
    """Generate a Linux file/directory management command."""

    prompt = (
        "You output ONE Linux shell command for file/directory ops only. "
        "No prose, no markdown.\n"
        "Allowed: ls, find, cp, mv, rm, mkdir, rmdir, touch, cat, less, head, tail, "
        "du, tree, zip, unzip, tar.\n"
        "Never emit: rm -rf /, rm -rf ~, wildcards on root.\n"
        "Prefer specific paths over wildcards. If ambiguous → ls / find.\n"
        "Reuse exact paths from context.\n"
        f"user: {command}\n"
        f"context: {context}\n"
        "command:"
    )
    return llm.invoke(prompt).content.strip()
