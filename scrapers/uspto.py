"""
uspto.py
Free, no API key required.
Pulls recent patent filings naming the competitor as assignee.
"""

import requests
import logging
import json
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

BASE_URL      = "https://api.patentsview.org/api/v1/patent/"
LOOKBACK_DAYS = 1825  # 5 years

SEGMENT_TAGS = {
    "Schools":    ["school", "k-12", "classroom", "education"],
    "Healthcare": ["hospital", "medical", "healthcare", "clinical"],
    "University": ["university", "campus", "higher education"],
    "Municipal":  ["municipal", "water", "wastewater", "city"],
    "HVAC":       ["hvac", "air handling", "boiler", "chiller", "heating"],
    "AI":         ["artificial intelligence", "machine learning", "autonomous", "reinforcement learning"],
    "Solar":      ["solar", "photovoltaic", "pv"],
}


def _tag_patent(title: str, abstract: str) -> list[str]:
    text = f"{title} {abstract}".lower()
    return [tag for tag, kws in SEGMENT_TAGS.items() if any(k in text for k in kws)]


def fetch_patents(competitor: dict) -> list[dict]:
    """Pull recent patent filings naming the competitor as assignee."""
    assignee = competitor.get("uspto_assignee")
    if not assignee:
        return []

    cutoff   = (datetime.utcnow() - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    patents  = []

    try:
        # PatentsView v2 — must send proper JSON strings, not Python repr
        query = {
            "_and": [
                {"_text_phrase": {"assignees.assignee_organization": assignee}},
                {"_gte":          {"patent_date": cutoff}},
            ]
        }
        params = {
            "q": json.dumps(query),
            "f": json.dumps(["patent_title", "patent_abstract", "patent_date"]),
            "s": json.dumps([{"patent_date": "desc"}]),
            "o": json.dumps({"size": 50}),
        }
        resp = requests.get(BASE_URL, params=params, timeout=20)

        if not resp.ok:
            logger.warning(f"USPTO returned HTTP {resp.status_code} for {assignee}")
            return []

        data = resp.json()
        for p in data.get("patents", []) or []:
            title    = p.get("patent_title", "") or ""
            abstract = p.get("patent_abstract", "") or ""
            date     = p.get("patent_date", "")
            if not title:
                continue
            tags = _tag_patent(title, abstract)
            if not tags:
                continue   # only keep MUSH-relevant patents
            patents.append({
                "date":  date,
                "title": title[:140],
                "tags":  tags,
            })

    except Exception as e:
        logger.warning(f"USPTO failed for {competitor['name']}: {e}")

    logger.info(f"  USPTO [{competitor['name']}]: {len(patents)} relevant patents")
    return patents
