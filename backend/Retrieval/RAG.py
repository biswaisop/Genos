import logging
from typing import List, Dict
import re
import hashlib
import time

from connectors.chroma_connector import SSHMemoryStore

logger = logging.getLogger(__name__)

MAX_OUTPUT_CHARS = 300
MAX_CONTEXT_ITEMS = 3
MIN_RELEVANCE_SCORE = 0.25


def _truncate(text: str, limit: int = MAX_OUTPUT_CHARS) -> str:
    return text[:limit] + ("..." if len(text) > limit else "")


def _hash_interaction(intent: str, command: str) -> str:
    key = f"{intent.strip().lower()}::{command.strip().lower()}"
    return hashlib.md5(key.encode()).hexdigest()


def _bm25_score(query: str, text: str) -> float:
    q_terms = query.lower().split()
    t_terms = text.lower().split()
    score = 0.0
    for term in q_terms:
        tf = t_terms.count(term)
        if tf > 0:
            score += tf / (len(t_terms) + 1)
    return score


def _rrf(rank_sem: int, rank_kw: int, k: int = 60) -> float:
    return (1 / (k + rank_sem)) + (1 / (k + rank_kw))


def _deduplicate(results: List[Dict]) -> List[Dict]:
    seen = set()
    deduped = []
    for r in results:
        key = _hash_interaction(r.get("intent", ""), r.get("command", ""))
        if key not in seen:
            seen.add(key)
            deduped.append(r)
    return deduped


def _compress_output(output: str) -> str:
    if not output:
        return ""
    output = output.strip()
    if len(output) <= MAX_OUTPUT_CHARS:
        return output
    lines = output.split("\n")
    return "\n".join(lines[:5]) + "\n..."


def _expand_query(query: str) -> List[str]:
    return [
        query,
        query.replace("kill", "terminate"),
        query.replace("files", "documents"),
        query.replace("list", "show"),
    ]


def ingest_interaction(
    user_id: str,
    intent: str,
    command: str,
    output: str,
    critic_decision: str = "ALLOW",
    risk_level: str = "low",
    tool_used: str = "unknown",
) -> dict:
    try:
        if not output or len(output.strip()) < 5:
            return {"status": "skipped", "reason": "low_signal"}

        importance = 1.0
        if "error" in output.lower():
            importance += 2
        if risk_level == "high":
            importance += 2
        if critic_decision != "ALLOW":
            importance += 3

        success = "error" not in output.lower()

        store = SSHMemoryStore(user_id)

        result = store.ingest(
            intent=intent,
            command=command,
            output=_truncate(output),
            critic_decision=critic_decision,
            risk_level=risk_level,
            tool_used=tool_used,
            importance=importance,
            timestamp=time.time(),
            success=success,
        )

        logger.info("RAG stored: %s → %s", intent[:40], command)
        return result

    except Exception as e:
        logger.error("RAG ingest failed: %s", e)
        return {"status": "failed", "error": str(e)}


def get_context(
    user_id: str,
    query: str,
    k: int = MAX_CONTEXT_ITEMS,
) -> str:
    try:
        store = SSHMemoryStore(user_id)

        expanded_queries = _expand_query(query)

        all_results = []
        for q in expanded_queries:
            res = store.search(q, k=k * 2) or []
            for r in res:
                r["_query"] = q
            all_results.extend(res)

        if not all_results:
            return ""

        results = _deduplicate(all_results)

        semantic_sorted = sorted(results, key=lambda x: x.get("score", 0), reverse=True)
        keyword_sorted = sorted(
            results,
            key=lambda x: _bm25_score(query, x.get("intent", "") + " " + x.get("command", "")),
            reverse=True
        )

        sem_rank_map = {id(r): i for i, r in enumerate(semantic_sorted)}
        kw_rank_map = {id(r): i for i, r in enumerate(keyword_sorted)}

        fused = []
        for r in results:
            sem_rank = sem_rank_map.get(id(r), 1000)
            kw_rank = kw_rank_map.get(id(r), 1000)

            rrf_score = _rrf(sem_rank, kw_rank)

            importance = r.get("importance", 1.0)
            success_penalty = 0.5 if not r.get("success", True) else 1.0

            final_score = rrf_score * importance * success_penalty

            if final_score >= MIN_RELEVANCE_SCORE:
                r["final_score"] = final_score
                fused.append(r)

        if not fused:
            return ""

        fused.sort(key=lambda x: x["final_score"], reverse=True)
        top_results = fused[:k]

        context_lines = [f"Relevant past interactions for {user_id}:"]

        for i, r in enumerate(top_results, 1):
            intent = r.get("intent", "")
            command = r.get("command", "")
            output = _compress_output(r.get("output", ""))

            context_lines.append(
                f"[{i}] Task: {intent}\n"
                f"Command: {command}\n"
                f"Result: {output}\n"
            )

        return "\n".join(context_lines)

    except Exception as e:
        logger.error("RAG retrieval failed: %s", e)
        return ""