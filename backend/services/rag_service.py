"""Lightweight RAG service shim used by graph.py.

This keeps the graph integration working even before a vector store backend is wired.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def get_context(user_id: str, query: str, k: int = 5) -> str:
    """Return retrieved context for a user/query.

    Current implementation is intentionally no-op until vector retrieval is added.
    """
    return ""


def ingest_interaction(
    user_id: str,
    intent: str,
    command: str,
    output: str,
    critic_decision: str,
    risk_level: str,
    tool_used: str,
) -> None:
    """Ingest an interaction into long-term memory.

    Current implementation is intentionally no-op until vector ingestion is added.
    """
    logger.debug(
        "rag_ingest_stub user_id=%s tool=%s decision=%s risk=%s",
        user_id,
        tool_used,
        critic_decision,
        risk_level,
    )
