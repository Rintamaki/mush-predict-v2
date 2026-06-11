"""
lda_lobbying.py
Free, no API key required.
Pulls lobbying disclosures from the Senate Lobbying Disclosure Act database.

When competitors lobby for school infrastructure funding, healthcare
facility legislation, or municipal energy bills — that's their pipeline
strategy on paper. This catches it.

API docs: https://lda.senate.gov/api/
"""

import requests
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

BASE_URL     = "https://lda.senate.gov/api/v1"
HEADERS      = {"Accept": "application/json"}
LOOKBACK_DAYS = 365

# Keywords indicating MUSH-relevant lobbying activity
MUSH_LOBBY_KEYWORDS = [
    "energy efficiency", "school", "k-12", "hospital", "healthcare",
    "university", "municipal", "building", "hvac", "infrastructure",
    "facilities", "espc", "performance contract", "federal buildings",
    "clean energy", "decarbonization", "renewable",
]


def _is_mush_relevant(text: str) -> bool:
    text_lower = text.lower()
    return any(kw in text_lower for kw in MUSH_LOBBY_KEYWORDS)


def fetch_lobbying(competitor: dict) -> list[dict]:
    """
    Pull recent lobbying filings where this competitor is the registrant.
    Returns list of { date, topics, bills, amount } dicts.
    """
    activities   = []
    registrant   = competitor.get("lda_registrant_name", competitor["name"])
    cutoff_year  = (datetime.utcnow() - timedelta(days=LOOKBACK_DAYS)).year

    try:
        params = {
            "registrant_name": registrant,
            "filing_year":     cutoff_year,
            "filing_type":     "1",  # LD-1 registrations + LD-2 reports
            "format":          "json",
            "page_size":       20,
        }
        resp = requests.get(f"{BASE_URL}/filings/", params=params, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        for filing in data.get("results", []):
            # Extract issue areas from the filing
            lobbying_activities = filing.get("lobbying_activities", [])
            topics = []
            bills  = []

            for activity in lobbying_activities:
                general_issue = activity.get("general_issue_code_display", "")
                description   = activity.get("description", "")
                if _is_mush_relevant(general_issue + " " + description):
                    topics.append(general_issue)
                    # Extract bill numbers mentioned
                    for gov_entity in activity.get("government_entities", []):
                        if gov_entity.strip():
                            bills.append(gov_entity.strip())

            if not topics:
                continue

            period_start = filing.get("period_of_report_start", "")
            income       = filing.get("income", "0") or "0"

            activities.append({
                "date":   period_start[:7] if period_start else str(cutoff_year),
                "topics": list(set(topics))[:4],
                "bills":  list(set(bills))[:4],
                "amount": float(income.replace(",", "").replace("$", "") or 0),
            })

    except Exception as e:
        logger.warning(f"LDA lobbying failed for {competitor['name']}: {e}")

    logger.info(f"  LDA Lobbying [{competitor['name']}]: {len(activities)} filings")
    return activities
