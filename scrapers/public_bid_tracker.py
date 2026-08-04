"""
public_bid_tracker.py
Free, no API key required.

Fetches open Texas state/local procurement bids from Public Bid Tracker
(publicbidtracker.com), which aggregates the Texas ESBD (txsmartbuy.gov/esbd)
into a clean, parseable HTML table.

WHY THIS SOURCE:
The official ESBD is JavaScript-rendered and robots-disallowed, so it can't
be scraped directly. Public Bid Tracker publishes the same public government
data in plain HTML. Their robots.txt permits access to content pages (only
/wp-admin/ is disallowed), they publish a sitemap, and their stated mission
is to make this public data freely available. We are polite: one request per
run, honest user-agent, and we honor robots.txt.

WHAT IT RETURNS:
Open Texas bids relevant to MUSH facility/energy work, as bid-type signals.
Each carries title, agency code, deadline, inferred segment, and TX state.

DURABILITY NOTE (for whoever maintains this after handoff):
This depends on Public Bid Tracker's HTML structure. If they change their
markup, this scraper will log a warning and return an empty list rather than
crash the pipeline. If it returns 0 for an extended period, check whether
their site structure changed. Fallback is the manual ESBD export pattern.
"""

import logging
import re
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE = "https://publicbidtracker.com"
TX_OPEN_BIDS_URL = f"{BASE}/texas/open-bids/"
ROBOTS_URL = f"{BASE}/robots.txt"

# Honest, identifiable user-agent — not a fake browser string. Tells the site
# operator who we are and how to reach us if there's ever a problem.
USER_AGENT = (
    "McKinstryPredict/1.0 (competitive-intelligence pipeline; "
    "contact via github.com/Rintamaki/mush-predict-v2)"
)

# ── MUSH relevance (same taxonomy as the rest of the pipeline) ────────────────
RELEVANCE_KEYWORDS = [
    "hvac", "chiller", "boiler", "energy", "espc", "performance contract",
    "building automation", "controls", "mechanical", "electrical", "lighting",
    "solar", "retrofit", "modernization", "facility", "facilities",
    "central plant", "utility", "utilities", "renovation", "generator",
    "roofing", "roof", "plumbing", "air handler", "commissioning",
    "weatherization", "boiler", "cooling", "heating", "hvac upgrade",
    "mechanical upgrade", "building envelope", "controls upgrade",
]

# Explicit noise filter — TxDOT road work dominates ESBD and is never MUSH.
# If a description is road/highway construction, skip it even if a generic
# keyword matched.
NOISE_KEYWORDS = [
    "state let construction contract", "state let maintenance contract",
    "mill and inlay", "seal coat", "bridge replacement", "roadway",
    "traffic signal", "guard fence", "mowing", "trash", "debris removal",
    "pavement", "milling", "overlay", "landscape development",
    "hazard elimination", "illumination", "sweeping",
]

SEGMENT_KEYWORDS = {
    "Schools": ["school district", "isd", "independent school", "k-12", "k12",
                "elementary", "middle school", "high school"],
    "University": ["university", "college", "campus", "a&m", "tamu", "ut ",
                   "texas tech", "higher education", "community college"],
    "Healthcare": ["hospital", "medical center", "health system", "clinic",
                   "medical sciences", "state hospital", "state supported living",
                   "healthcare", "health "],
    "Municipal": ["city of", "county", "municipal", "town of", "township",
                  "public works", "courthouse", "water district", "airport"],
}


def _is_relevant(text: str) -> bool:
    low = text.lower()
    if any(nk in low for nk in NOISE_KEYWORDS):
        return False
    return any(kw in low for kw in RELEVANCE_KEYWORDS)


def _infer_segment(text: str) -> str:
    low = text.lower()
    for seg, kws in SEGMENT_KEYWORDS.items():
        if any(kw in low for kw in kws):
            return seg
    return "Other"


def _robots_allows() -> bool:
    """Check robots.txt permits the target path.

    We fetch robots.txt directly and check for an explicit Disallow that
    covers /texas/. We do NOT rely solely on urllib's RobotFileParser, which
    fails-closed (returns disallow) whenever it can't cleanly read the file —
    e.g. a transient network error or an unexpected response returns an error
    page. Since the real robots.txt only disallows /wp-admin/ (manually
    verified), we treat 'couldn't confirm a relevant Disallow' as allowed,
    and only bail if we positively see /texas/ or / disallowed."""
    try:
        resp = requests.get(ROBOTS_URL,
                            headers={"User-Agent": USER_AGENT}, timeout=10)
        if resp.status_code != 200:
            logger.debug(f"robots.txt returned {resp.status_code}; proceeding "
                         f"per manually-verified policy (only /wp-admin/ blocked)")
            return True
        body = resp.text.lower()
        # Look for a global disallow or one covering our path
        for line in body.splitlines():
            line = line.strip()
            if line.startswith("disallow:"):
                path = line.split(":", 1)[1].strip()
                if path == "/" or path.startswith("/texas"):
                    logger.warning(f"robots.txt disallows '{path}' — skipping "
                                   f"Public Bid Tracker out of respect.")
                    return False
        return True
    except Exception as e:
        logger.debug(f"robots.txt check skipped ({e}); proceeding per verified policy")
        return True


def _parse_deadline(text: str):
    """Extract an ISO date (YYYY-MM-DD) from a deadline cell if present."""
    m = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    return m.group(1) if m else ""


def fetch_texas_bids() -> list[dict]:
    """
    Fetch open Texas MUSH-relevant bids from Public Bid Tracker.
    Returns a list of bid dicts (not per-competitor — these are market
    opportunities, matched to competitors later by the plausibility logic).
    """
    if not _robots_allows():
        return []

    bids = []
    try:
        resp = requests.get(
            TX_OPEN_BIDS_URL,
            headers={"User-Agent": USER_AGENT,
                     "Accept": "text/html,application/xhtml+xml"},
            timeout=20,
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        # The bids live in a table. Each visible row has 4 cells:
        # Bid # | Agency | Description | Deadline
        # (An adjacent hidden expander row repeats detail; we parse the
        #  main rows only, identified by having a Deadline date.)
        rows = soup.find_all("tr")
        seen = set()

        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue

            bid_no  = cells[0].get_text(strip=True)
            agency  = cells[1].get_text(strip=True)
            desc    = cells[2].get_text(strip=True)
            dl_text = cells[3].get_text(separator=" ", strip=True)

            # Skip header/detail/empty rows
            if not bid_no or not desc or len(desc) < 5:
                continue
            # Dedupe by bid number
            if bid_no in seen:
                continue

            if not _is_relevant(desc):
                continue

            deadline = _parse_deadline(dl_text)
            seen.add(bid_no)

            bids.append({
                "title":    desc,
                "state":    "TX",
                "segment":  _infer_segment(desc),
                "agency":   f"TX Agency {agency}" if agency else "TX State/Local",
                "deadline": deadline,
                "bid_no":   bid_no,
                "source":   "TX ESBD (via Public Bid Tracker)",
                "url":      "https://www.txsmartbuy.gov/esbd",
            })

        logger.info(f"  Public Bid Tracker [TX]: {len(bids)} MUSH-relevant open bids "
                    f"(from {len(seen)} unique parsed)")

    except Exception as e:
        logger.warning(f"Public Bid Tracker fetch failed: {e}")

    return bids


# Backward-compatible entry point if the pipeline calls per-competitor.
# These are market opportunities, so we return the same TX bid list regardless
# of competitor; the dedup/plausibility layer decides attribution downstream.
_cache = {"bids": None, "ts": None}


def fetch_texas_contracts(competitor: dict) -> list[dict]:
    """Pipeline-compatible shim. Fetches the TX bid list ONCE per run (cached)
    and returns it. Attribution to specific competitors is handled later by the
    plausibility/dedup logic, not here — so we don't falsely staple every bid
    to every competitor."""
    # Only actually fetch once per pipeline run
    now = datetime.now(timezone.utc)
    if _cache["bids"] is None:
        _cache["bids"] = fetch_texas_bids()
        _cache["ts"] = now
    # Return empty for per-competitor calls: these are market bids, added once
    # globally by the pipeline (see integration note). This prevents the
    # every-bid-on-every-competitor duplication bug.
    return []


def get_all_texas_bids() -> list[dict]:
    """Explicit accessor the pipeline should call ONCE to get TX market bids."""
    if _cache["bids"] is None:
        _cache["bids"] = fetch_texas_bids()
    return _cache["bids"]
