"""
texas_esbd.py
Free, no API key required.
Scrapes the Texas Electronic State Business Daily (ESBD) for
state agency contracts and RFPs mentioning competitor names.

The ESBD is the official Texas government procurement portal —
every state agency RFP and contract award must be posted here.
This is the highest-value Texas-specific data source.

Portal: https://www.txsmartbuy.gov/esbd
"""

import requests
import logging
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
import time

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

SEARCH_URL = "https://www.txsmartbuy.gov/esbd"

MUSH_KEYWORDS = [
    "energy", "hvac", "building automation", "mechanical",
    "school", "university", "hospital", "municipal", "county",
    "facility", "retrofit", "efficiency", "solar", "controls",
]

def _is_mush_relevant(text: str) -> bool:
    return any(kw in text.lower() for kw in MUSH_KEYWORDS)


def fetch_texas_contracts(competitor: dict) -> list[dict]:
    """
    Search ESBD for Texas state contracts awarded to this competitor.
    """
    results = []
    name    = competitor["name"]

    try:
        # ESBD search via GET parameters
        params = {
            "CustNum":    "",
            "searchTerm": name,
            "searchType": "agency",
            "PageNum":    1,
        }
        resp = requests.get(SEARCH_URL, params=params, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        # Parse result rows — ESBD uses table-based layout
        rows = soup.find_all("tr", class_=lambda c: c and "result" in c.lower())
        if not rows:
            # Fallback: grab any table rows with relevant content
            rows = soup.find_all("tr")

        seen = set()
        for row in rows[:30]:
            text = row.get_text(separator=" ", strip=True)
            if len(text) < 20 or text in seen:
                continue
            if not _is_mush_relevant(text):
                continue
            if name.lower() not in text.lower():
                continue
            seen.add(text)

            # Try to extract cells
            cells = row.find_all("td")
            title      = cells[0].get_text(strip=True) if len(cells) > 0 else text[:100]
            agency     = cells[1].get_text(strip=True) if len(cells) > 1 else "TX State Agency"
            date_str   = cells[2].get_text(strip=True) if len(cells) > 2 else ""
            value_str  = cells[3].get_text(strip=True) if len(cells) > 3 else ""

            # Parse value
            value = 0
            try:
                value = float(
                    value_str.replace("$", "").replace(",", "").strip()
                    or "0"
                )
            except Exception:
                pass

            results.append({
                "date":        date_str or datetime.utcnow().strftime("%Y-%m-%d"),
                "value":       value,
                "state":       "TX",
                "segment":     _classify_tx_segment(agency + " " + title),
                "agency":      agency,
                "description": title[:140],
                "source":      "TX ESBD",
            })

    except Exception as e:
        logger.warning(f"Texas ESBD failed for {name}: {e}")

    logger.info(f"  TX ESBD [{name}]: {len(results)} contracts")
    return results


def fetch_texas_rfps(keyword: str = "energy efficiency") -> list[dict]:
    """
    Pull open Texas state RFPs for MUSH energy services.
    Used by the opportunities dashboard.
    """
    rfps = []
    try:
        params = {
            "searchTerm": keyword,
            "searchType": "keyword",
            "PageNum":    1,
        }
        resp = requests.get(SEARCH_URL, params=params, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        rows = soup.find_all("tr")
        seen = set()
        for row in rows[:30]:
            text = row.get_text(separator=" ", strip=True)
            if len(text) < 20 or text in seen:
                continue
            if not _is_mush_relevant(text):
                continue
            seen.add(text)
            cells = row.find_all("td")
            rfps.append({
                "title":       (cells[0].get_text(strip=True) if cells else text[:120]),
                "agency":      (cells[1].get_text(strip=True) if len(cells) > 1 else "TX State Agency"),
                "deadline":    (cells[2].get_text(strip=True) if len(cells) > 2 else ""),
                "state":       "TX",
                "source":      "TX ESBD",
                "keyword_hit": keyword,
            })
    except Exception as e:
        logger.warning(f"Texas ESBD RFP fetch failed: {e}")

    return rfps


def _classify_tx_segment(text: str) -> str:
    text_lower = text.lower()
    if any(k in text_lower for k in ["school", "isd", "k-12", "education"]):
        return "Schools"
    if any(k in text_lower for k in ["hospital", "health", "medical"]):
        return "Healthcare"
    if any(k in text_lower for k in ["university", "college", "campus"]):
        return "University"
    if any(k in text_lower for k in ["city", "county", "municipal", "water"]):
        return "Municipal"
    return "Other"
