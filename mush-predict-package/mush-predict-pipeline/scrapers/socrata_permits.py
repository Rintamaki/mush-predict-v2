"""
socrata_permits.py
Free, no API key required (rate-limited without app token).
Scans city open-data portals for building permits naming competitors.
"""

import requests
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

HEADERS = {"Accept": "application/json"}
LOOKBACK_DAYS = 365

# Socrata-powered city permit endpoints
CITIES = [
    {"name": "Dallas, TX",  "state": "TX", "url": "https://www.dallasopendata.com/resource/sn5s-eq6s.json"},
    {"name": "Austin, TX",  "state": "TX", "url": "https://data.austintexas.gov/resource/3syk-w9eu.json"},
    {"name": "Seattle, WA", "state": "WA", "url": "https://data.seattle.gov/resource/mags-97de.json"},
]


def fetch_permit_mentions(competitor: dict) -> list[dict]:
    """Search city permit databases for the competitor by name."""
    results = []
    name    = competitor["name"]
    cutoff  = (datetime.utcnow() - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%dT%H:%M:%S")

    for city in CITIES:
        try:
            # Socrata SoQL query: search for competitor in description fields
            params = {
                "$limit": 10,
                "$where": (
                    f"(upper(description) like upper('%{name}%') "
                    f"OR upper(contractor) like upper('%{name}%') "
                    f"OR upper(applicant_name) like upper('%{name}%')) "
                    f"AND issue_date > '{cutoff}'"
                ),
            }
            resp = requests.get(city["url"], headers=HEADERS, params=params, timeout=12)
            if resp.ok:
                for p in resp.json():
                    description = (p.get("description") or p.get("work_description") or "")[:100]
                    address     = p.get("address") or p.get("location") or city["name"]
                    issue_date  = (p.get("issue_date") or "")[:10]
                    if not issue_date:
                        continue
                    results.append({
                        "date":     issue_date,
                        "location": f"{city['name']} — {address}",
                        "state":    city["state"],
                    })
        except Exception:
            # Cities update their schema occasionally; fail soft
            pass

    logger.info(f"  Permits [{competitor['name']}]: {len(results)} permit mentions")
    return results
