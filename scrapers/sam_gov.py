"""
sam_gov.py
Free public API key required.
Pulls open federal RFPs where the competitor name genuinely appears in the
solicitation, and infers a MUSH segment from the title.

FIXES vs previous version:
  1. Verifies the competitor name actually appears in the opportunity title
     or description — SAM.gov's `keyword` param does loose matching and was
     returning generic bids (e.g. "SERVO,ELEVATION") that got attached to
     every competitor. We now filter those out.
  2. Infers segment (Schools / Healthcare / University / Municipal) from the
     title text instead of hardcoding "Other".
  3. Skips obviously-generic solicitations that don't relate to any MUSH
     facility/energy work at all.
"""

import requests
import os
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

BASE_URL = "https://api.sam.gov/opportunities/v2/search"

# ── Segment inference keywords ────────────────────────────────────────────────
SEGMENT_KEYWORDS = {
    "Schools": [
        "school district", "isd", "independent school", "k-12", "k12",
        "elementary", "middle school", "high school", "public schools",
    ],
    "University": [
        "university", "college", "campus", "higher education", "community college",
    ],
    "Healthcare": [
        "hospital", "medical center", "health system", "clinic", "healthcare",
        "va medical", "veterans affairs medical",
    ],
    "Municipal": [
        "city of", "county of", "municipal", "town of", "township",
        "public works", "courthouse", "city hall",
    ],
}

# ── Relevance keywords — bid must relate to facility/energy work at all ──────
# A federal bid mentioning a competitor but about, say, catering, isn't a
# meaningful competitive signal. Require at least one facility/energy term.
RELEVANCE_KEYWORDS = [
    "hvac", "chiller", "boiler", "energy", "espc", "performance contract",
    "building automation", "controls", "mechanical", "electrical", "lighting",
    "solar", "retrofit", "modernization", "facility", "facilities",
    "central plant", "utility", "utilities", "renovation", "construction",
    "maintenance", "roofing", "roof", "plumbing", "generator",
]


def infer_segment(text: str) -> str:
    """Infer a MUSH segment from title/description text; default 'Other'."""
    low = text.lower()
    for segment, kws in SEGMENT_KEYWORDS.items():
        if any(kw in low for kw in kws):
            return segment
    return "Other"


def is_relevant(text: str) -> bool:
    """True if the bid text relates to facility/energy work at all."""
    low = text.lower()
    return any(kw in low for kw in RELEVANCE_KEYWORDS)


def mentions_competitor(text: str, competitor: dict) -> bool:
    """Verify the competitor is actually named in the opportunity text.

    SAM.gov's keyword search is loose, so we confirm the company name (or a
    recognizable variant) genuinely appears before trusting the match."""
    low = text.lower()

    # Build a list of name variants to check
    variants = [competitor["name"].lower()]
    # Also check usaspending_names if present (legal entity variants)
    for v in competitor.get("usaspending_names", []):
        variants.append(v.lower())
    # And a shortened first-word version for multi-word names
    # (e.g. "Trane" from "Trane Technologies") — but only if it's distinctive
    first_word = competitor["name"].split()[0].lower()
    if len(first_word) >= 5:  # avoid short generic words
        variants.append(first_word)

    return any(v in low for v in variants)


def fetch_active_bids(competitor: dict) -> list[dict]:
    """Return open SAM.gov opportunities that genuinely mention this competitor
    AND relate to facility/energy work."""
    api_key = os.environ.get("SAM_GOV_API_KEY")
    if not api_key:
        logger.debug("No SAM_GOV_API_KEY — skipping SAM.gov")
        return []

    bids = []
    seen_notice_ids = set()  # dedupe within this competitor's results
    posted_from = (datetime.utcnow() - timedelta(days=60)).strftime("%m/%d/%Y")
    posted_to   = datetime.utcnow().strftime("%m/%d/%Y")

    try:
        params = {
            "api_key":    api_key,
            "keyword":    competitor["name"],
            "postedFrom": posted_from,
            "postedTo":   posted_to,
            "limit":      20,   # pull more since we now filter aggressively
        }
        resp = requests.get(BASE_URL, params=params, timeout=15)
        resp.raise_for_status()

        raw_count = 0
        filtered_no_mention = 0
        filtered_not_relevant = 0

        for opp in resp.json().get("opportunitiesData", []):
            raw_count += 1
            title = opp.get("title", "")
            description = opp.get("description", "") or ""
            combined = f"{title} {description}"
            notice_id = opp.get("noticeId", "") or opp.get("_id", "") or title

            # Dedupe
            if notice_id in seen_notice_ids:
                continue

            # FILTER 1: competitor must actually be named
            if not mentions_competitor(combined, competitor):
                filtered_no_mention += 1
                continue

            # FILTER 2: bid must relate to facility/energy work
            if not is_relevant(combined):
                filtered_not_relevant += 1
                continue

            seen_notice_ids.add(notice_id)
            state = (opp.get("placeOfPerformance") or {}).get("state", {}).get("code", "")

            bids.append({
                "title":    title,
                "state":    state,
                "segment":  infer_segment(combined),
                "keywords": [k.strip() for k in title.lower().split() if len(k) > 4][:5],
                "agency":   opp.get("departmentName", opp.get("organizationName", "")),
                "deadline": opp.get("responseDeadLine", ""),
                "notice_id": notice_id,
            })

        logger.info(
            f"  SAM.gov [{competitor['name']}]: {len(bids)} relevant bids "
            f"(from {raw_count} raw; dropped {filtered_no_mention} no-mention, "
            f"{filtered_not_relevant} not-relevant)"
        )

    except Exception as e:
        logger.warning(f"SAM.gov failed for {competitor['name']}: {e}")

    return bids
