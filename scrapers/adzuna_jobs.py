"""
adzuna_jobs.py
Free API key required (250 calls/day on free tier).
Sign up at https://developer.adzuna.com

Pulls recent job postings naming each competitor as the employer,
broken down by state and segment.
"""

import requests
import os
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

BASE_URL = "https://api.adzuna.com/v1/api/jobs/us/search/1"
LOOKBACK_DAYS = 180  # 6 months

# Tag job postings by inferred segment
SEGMENT_KEYWORDS = {
    "Schools":    ["k-12", "school district", "education", "isd"],
    "Healthcare": ["healthcare", "hospital", "health system", "clinical"],
    "University": ["university", "higher ed", "campus", "college"],
    "Municipal":  ["municipal", "city", "county", "public works"],
}

# State extraction from location strings
US_STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY",
}


def _extract_state(location_obj: dict) -> str:
    """Pull state code from Adzuna location object."""
    area = location_obj.get("area", []) if location_obj else []
    # Adzuna's area: ["US", "California", "San Francisco"]
    for piece in area:
        if piece.upper() in US_STATES:
            return piece.upper()
        # Try to match full state name → code
        state_map = {
            "Texas": "TX", "California": "CA", "Washington": "WA", "Oregon": "OR",
            "Florida": "FL", "New York": "NY", "Illinois": "IL", "Colorado": "CO",
            "Massachusetts": "MA", "North Carolina": "NC", "Wisconsin": "WI",
            "New Jersey": "NJ", "Pennsylvania": "PA", "Ohio": "OH", "Michigan": "MI",
            "Georgia": "GA", "Arizona": "AZ", "Virginia": "VA",
        }
        if piece in state_map:
            return state_map[piece]
    return ""


def _classify_segment(title: str, description: str) -> tuple[str, list[str]]:
    """Return (primary segment, tag list) based on text matching."""
    text = f"{title} {description}".lower()
    tags = []
    for seg, keywords in SEGMENT_KEYWORDS.items():
        if any(k in text for k in keywords):
            tags.append(seg)
    return (tags[0] if tags else "Other", tags)


def fetch_job_postings(competitor: dict) -> list[dict]:
    """Pull recent job postings for this competitor from Adzuna."""
    app_id  = os.environ.get("ADZUNA_APP_ID")
    app_key = os.environ.get("ADZUNA_APP_KEY")
    if not (app_id and app_key):
        logger.debug("Adzuna keys missing — skipping")
        return []

    postings = []
    cutoff   = (datetime.utcnow() - timedelta(days=LOOKBACK_DAYS))

    try:
        params = {
            "app_id":      app_id,
            "app_key":     app_key,
            "what":        competitor.get("adzuna_query", competitor["name"]),
            "where":       "US",
            "results_per_page": 30,
            "max_days_old": LOOKBACK_DAYS,
            "sort_by":     "date",
        }
        resp = requests.get(BASE_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        for job in data.get("results", []):
            company = (job.get("company") or {}).get("display_name", "")
            # Make sure this is actually the competitor, not just a mention
            if competitor["adzuna_query"].lower() not in company.lower():
                continue

            title       = job.get("title", "")
            description = job.get("description", "")
            location    = job.get("location") or {}
            state       = _extract_state(location)
            segment, tags = _classify_segment(title, description)
            posted_date = job.get("created", "")[:10]

            postings.append({
                "title":       title[:120],
                "state":       state,
                "segment":     segment,
                "tags":        tags,
                "postedDate":  posted_date,
            })

    except Exception as e:
        logger.warning(f"Adzuna failed for {competitor['name']}: {e}")

    logger.info(f"  Adzuna [{competitor['name']}]: {len(postings)} job postings")
    return postings
