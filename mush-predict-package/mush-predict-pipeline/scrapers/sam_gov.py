"""
sam_gov.py
Free public API key required.
Pulls open federal RFPs where competitor name appears in solicitation text.
"""

import requests
import os
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

BASE_URL = "https://api.sam.gov/opportunities/v2/search"


def fetch_active_bids(competitor: dict) -> list[dict]:
    """Return open SAM.gov opportunities mentioning this competitor."""
    api_key = os.environ.get("SAM_GOV_API_KEY")
    if not api_key:
        logger.debug("No SAM_GOV_API_KEY — skipping SAM.gov")
        return []

    bids = []
    posted_from = (datetime.utcnow() - timedelta(days=60)).strftime("%m/%d/%Y")
    posted_to   = datetime.utcnow().strftime("%m/%d/%Y")

    try:
        params = {
            "api_key":    api_key,
            "keyword":    competitor["name"],
            "postedFrom": posted_from,
            "postedTo":   posted_to,
            "limit":      10,
        }
        resp = requests.get(BASE_URL, params=params, timeout=15)
        resp.raise_for_status()
        for opp in resp.json().get("opportunitiesData", []):
            title = opp.get("title", "")
            state = (opp.get("placeOfPerformance") or {}).get("state", {}).get("code", "")
            bids.append({
                "title":    title,
                "state":    state,
                "segment":  "Other",  # not always knowable from SAM data
                "keywords": [k.strip() for k in title.lower().split() if len(k) > 4][:5],
                "agency":   opp.get("departmentName", opp.get("organizationName", "")),
                "deadline": opp.get("responseDeadLine", ""),
            })
    except Exception as e:
        logger.warning(f"SAM.gov failed for {competitor['name']}: {e}")

    logger.info(f"  SAM.gov [{competitor['name']}]: {len(bids)} open bids")
    return bids
