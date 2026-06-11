"""
usaspending.py
Free, no API key required.
Pulls recent federal contract awards TO each competitor.
"""

import requests
import logging
from datetime import datetime, timedelta
from config import SEGMENT_KEYWORDS

logger = logging.getLogger(__name__)

BASE_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
HEADERS  = {"Content-Type": "application/json"}
LOOKBACK_DAYS = 1825  # 5 years for win history (was 2)


def _date_range():
    end   = datetime.utcnow()
    start = end - timedelta(days=LOOKBACK_DAYS)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def _classify_segment(agency: str, description: str) -> str:
    """Guess MUSH segment from agency name + contract description."""
    text = f"{agency} {description}".lower()
    for segment, keywords in SEGMENT_KEYWORDS.items():
        if any(k in text for k in keywords):
            return segment
    return "Other"


def fetch_contract_awards(competitor: dict) -> list[dict]:
    """Pull federal contract awards over the past 2 years."""
    awards = []
    start, end = _date_range()

    for search_name in competitor.get("usaspending_names", []):
        try:
            payload = {
                "filters": {
                    "recipient_search_text": [search_name],
                    "time_period":           [{"start_date": start, "end_date": end}],
                    "award_type_codes":      ["A", "B", "C", "D"],
                },
                "fields": [
                    "Award ID", "Recipient Name", "Award Amount",
                    "Awarding Agency", "Start Date", "Description",
                    "Place of Performance State Code",
                ],
                "page":  1,
                "limit": 100,
                "sort":  "Award Amount",
                "order": "desc",
            }
            resp = requests.post(BASE_URL, json=payload, headers=HEADERS, timeout=20)
            resp.raise_for_status()
            data = resp.json()

            for a in data.get("results", []):
                amount      = float(a.get("Award Amount") or 0)
                if amount < 50_000:
                    continue  # skip noise
                agency      = a.get("Awarding Agency", "")
                description = a.get("Description", "") or ""
                state       = a.get("Place of Performance State Code", "")
                date        = a.get("Start Date", "")
                segment     = _classify_segment(agency, description)
                if segment == "Other":
                    continue

                awards.append({
                    "date":        date,
                    "value":       amount,
                    "state":       state,
                    "segment":     segment,
                    "agency":      agency,
                    "description": description[:140],
                })

            if awards:
                break  # found data via this name, no need to try alternates

        except Exception as e:
            logger.warning(f"USASpending fetch failed for {competitor['name']} ({search_name}): {e}")

    logger.info(f"  USASpending [{competitor['name']}]: {len(awards)} contract awards")
    return awards
