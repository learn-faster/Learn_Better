"""
Content filtering and sectioning utilities.

Produces a high-signal filtered text and section metadata from raw text,
removing boilerplate and low-value content while preserving core concepts.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from src.config import settings
from src.services.llm_service import llm_service
from src.models.schemas import LLMConfig
from src.utils.logger import logger


@dataclass
class FilterResult:
    filtered_text: str
    sections: List[Dict[str, any]]
    stats: Dict[str, any]


_WORD_RE = re.compile(r"\b[\w'-]+\b")


def _normalize_line(line: str) -> str:
    return re.sub(r"[\W_]+", "", line.lower()).strip()


def _split_by_pages(text: str) -> Optional[List[Tuple[str, str]]]:
    if "## Page" not in text:
        return None
    parts = re.split(r"(## Page \d+)", text)
    sections = []
    current_title = None
    buffer = []
    for part in parts:
        if part.startswith("## Page "):
            if buffer:
                sections.append((current_title or "Page", "\n\n".join(buffer).strip()))
                buffer = []
            current_title = part.strip()
        else:
            if part.strip():
                buffer.append(part.strip())
    if buffer:
        sections.append((current_title or "Page", "\n\n".join(buffer).strip()))
    return [(title, content) for title, content in sections if content]


def _split_into_sections(text: str, max_paragraphs: int = 3) -> List[Tuple[str, str]]:
    by_pages = _split_by_pages(text)
    if by_pages:
        return by_pages

    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    sections: List[Tuple[str, str]] = []
    buffer: List[str] = []
    for paragraph in paragraphs:
        buffer.append(paragraph)
        if len(buffer) >= max_paragraphs:
            sections.append(("", "\n\n".join(buffer)))
            buffer = []
    if buffer:
        sections.append(("", "\n\n".join(buffer)))
    return sections


def _strip_boilerplate(sections: List[Tuple[str, str]]) -> Tuple[List[Tuple[str, str]], int]:
    line_counts: Dict[str, int] = {}
    for _, content in sections:
        for line in content.splitlines():
            normalized = _normalize_line(line)
            if 3 <= len(normalized) <= 120:
                line_counts[normalized] = line_counts.get(normalized, 0) + 1

    # lines repeated often are boilerplate
    repeated = {line for line, cnt in line_counts.items() if cnt >= 3}
    removed_lines = 0
    cleaned_sections: List[Tuple[str, str]] = []
    for title, content in sections:
        cleaned_lines = []
        for line in content.splitlines():
            normalized = _normalize_line(line)
            if normalized and normalized in repeated:
                removed_lines += 1
                continue
            cleaned_lines.append(line)
        cleaned_content = "\n".join(cleaned_lines).strip()
        if cleaned_content:
            cleaned_sections.append((title, cleaned_content))
    return cleaned_sections, removed_lines


def _heuristic_score(text: str) -> float:
    if not text or not text.strip():
        return 0.0
    words = _WORD_RE.findall(text)
    word_count = len(words)
    alpha_ratio = sum(c.isalpha() for c in text) / max(len(text), 1)
    length_factor = min(1.0, word_count / 80.0)
    alpha_factor = min(1.0, alpha_ratio * 1.2)
    score = 0.15 + 0.75 * length_factor * alpha_factor
    return float(max(0.0, min(1.0, score)))


async def _llm_filter_sections(
    sections: List[Dict[str, any]],
    config: Optional[LLMConfig]
) -> Dict[int, float]:
    if not sections:
        return {}

    max_sections = settings.filter_llm_max_sections
    batch_size = 30
    scored: Dict[int, float] = {}

    for offset in range(0, min(len(sections), max_sections), batch_size):
        batch = sections[offset:offset + batch_size]
        payload = [
            {
                "index": item["section_index"],
                "title": item.get("title") or "",
                "snippet": (item.get("excerpt") or item.get("content") or "")[:220]
            }
            for item in batch
        ]
        prompt = f"""
You are a relevance filter for learning materials.
Select the sections that contain core concepts, definitions, or key explanations.
Return JSON: {{"scores":[{{"index":0,"score":0.0}}]}}
Score between 0 and 1. Focus on conceptual density, not filler.
Sections: {payload}
"""
        try:
            response = await llm_service.get_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                response_format="json",
                config=config
            )
            data = llm_service._extract_and_parse_json(response)
            for item in data.get("scores", []):
                try:
                    idx = int(item.get("index"))
                    score = float(item.get("score", 0))
                    scored[idx] = max(scored.get(idx, 0), score)
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"LLM relevance filtering failed: {e}")
            break

    return scored


async def filter_document_content(
    raw_text: str,
    llm_config: Optional[LLMConfig] = None,
    enable_llm: Optional[bool] = None
) -> FilterResult:
    if not raw_text or not raw_text.strip():
        return FilterResult(filtered_text="", sections=[], stats={
            "raw_word_count": 0,
            "filtered_word_count": 0,
            "dedup_ratio": 0.0,
            "boilerplate_removed_lines": 0,
            "sections_total": 0,
            "sections_included": 0
        })

    enable_llm = settings.filter_enable_llm if enable_llm is None else enable_llm

    sections_raw = _split_into_sections(raw_text)
    sections_no_boiler, removed_lines = _strip_boilerplate(sections_raw)

    seen_hashes = set()
    sections: List[Dict[str, any]] = []
    deduped = 0

    for idx, (title, content) in enumerate(sections_no_boiler):
        normalized = re.sub(r"[\W_]+", "", content.lower())
        if normalized in seen_hashes:
            deduped += 1
            continue
        seen_hashes.add(normalized)
        excerpt = content.strip().splitlines()[0][:200] if content else ""
        sections.append({
            "section_index": idx,
            "title": title if title else None,
            "content": content,
            "excerpt": excerpt,
            "heuristic_score": _heuristic_score(content),
            "relevance_score": 0.0,
            "included": True
        })

    llm_scores: Dict[int, float] = {}
    if enable_llm and sections:
        llm_scores = await _llm_filter_sections(sections, llm_config)

    for section in sections:
        h_score = section.get("heuristic_score", 0.0)
        l_score = llm_scores.get(section["section_index"])
        if l_score is not None:
            score = (0.6 * h_score) + (0.4 * l_score)
        else:
            score = h_score
        section["relevance_score"] = float(max(0.0, min(1.0, score)))
        section["included"] = section["relevance_score"] >= 0.45 and len(section["content"]) >= settings.filter_min_section_chars

    # Ensure minimum inclusion
    included = [s for s in sections if s["included"]]
    if len(included) < 3 and sections:
        for s in sorted(sections, key=lambda x: x["relevance_score"], reverse=True)[:3]:
            s["included"] = True

    filtered_text = "\n\n".join([s["content"] for s in sections if s["included"]]).strip()
    raw_word_count = len(_WORD_RE.findall(raw_text))
    filtered_word_count = len(_WORD_RE.findall(filtered_text))
    dedup_ratio = (deduped / max(len(sections_no_boiler), 1))

    stats = {
        "raw_word_count": raw_word_count,
        "filtered_word_count": filtered_word_count,
        "dedup_ratio": round(dedup_ratio, 3),
        "boilerplate_removed_lines": removed_lines,
        "sections_total": len(sections),
        "sections_included": len([s for s in sections if s["included"]])
    }

    return FilterResult(filtered_text=filtered_text, sections=sections, stats=stats)


def rebuild_filtered_from_sections(sections: List[Dict[str, any]]) -> str:
    if not sections:
        return ""
    ordered = sorted(sections, key=lambda s: s.get("section_index", 0))
    return "\n\n".join([s["content"] for s in ordered if s.get("included")]).strip()
