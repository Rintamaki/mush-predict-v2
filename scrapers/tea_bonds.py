"""
tea_bonds.py
Free, no API key required.
Pulls Texas school district bond election results and capital project data
from the Texas Education Agency and Texas Bond Review Board.

Bond elections are the single best leading indicator for K-12 energy
and HVAC opportunities — a passed bond means construction/retrofit money
is coming 12-24 months later. This catches it at the source.

TEA: https://tea.texas.gov
TX Bond Review Board: https://www.brb.texas.gov
"""

import requests
import logging
from datetime import datetime, timedelta
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    )
}

# Texas Bond Review Board - education bond issuances
BRB_URL      = "https://www.brb.texas.gov/bond/education.aspx"

# TEA capital projects data
TEA_DATA_URL = "https://tea.texas.gov/finance-and-grants/state-funding/additional-finance-resources/school-district-bond-guarantee-program"

# Socrata endpoint for Texas school bond elections (Austin open data)
TX_BONDS_SOCRATA = "https://data.texas.gov/resource/8ixb-hufm.json"

ENERGY_KEYWORDS = [
    "energy", "hvac", "mechanical", "building", "renovation",
    "technology", "facility", "infrastructure", "efficiency",
    "construction", "modernization",
]

LOOKBACK_DAYS = 730  # 2 years of bond history


def fetch_bond_elections() -> list[dict]:
    """
    Pull recent Texas school district bond elections from state data portal.
    Returns opportunities — districts with passed bonds are prime targets.
    """
    bonds = []
    cutoff = (datetime.utcnow() - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%dT%H:%M:%S")

    try:
        # Texas open data portal — school bond elections
        params = {
            "$limit":  100,
            "$order":  "election_date DESC",
            "$where":  f"election_date > '{cutoff}' AND result = 'PASSED'",
        }
        resp = requests.get(TX_BONDS_SOCRATA, params=params, headers=HEADERS, timeout=15)

        if resp.ok:
            for bond in resp.json():
                district = bond.get("district_name", bond.get("name", ""))
                amount   = bond.get("proposition_amount", bond.get("amount", 0))
                date     = bond.get("election_date", "")[:10]
                purpose  = bond.get("purpose", bond.get("description", ""))

                try:
                    amount = float(str(amount).replace(",", "").replace("$", "") or 0)
                except Exception:
                    amount = 0

                if amount < 1_000_000:
                    continue  # skip tiny bonds

                bonds.append({
                    "id":          f"tx-bond-{hash(district + date) % 100000}",
                    "title":       f"{district} — ${amount/1e6:.1f}M bond passed",
                    "agency":      district,
                    "type":        "Bond Election — Passed",
                    "posted":      date,
                    "deadline":    "",
                    "state":       "TX",
                    "value":       amount,
                    "description": purpose[:200] if purpose else f"${amount/1e6:.1f}M bond election passed. Energy/facility projects likely to follow.",
                    "url":         TEA_DATA_URL,
                    "source":      "TX Bond Review Board",
                    "keyword_hit": "bond election",
                    "segment":     "Schools",
                })

        logger.info(f"  TX Bonds: {len(bonds)} passed bond elections found")

    except Exception as e:
        logger.warning(f"TX bond data failed: {e}")
        # Fallback — scrape BRB directly
        bonds = _scrape_brb_page()

    return bonds


def _scrape_brb_page() -> list[dict]:
    """Fallback scraper for Texas Bond Review Board education page."""
    results = []
    try:
        resp = requests.get(BRB_URL, headers=HEADERS, timeout=15)
        if not resp.ok:
            return results

        soup = BeautifulSoup(resp.text, "lxml")
        rows = soup.find_all("tr")
        seen = set()

        for row in rows[:30]:
            text = row.get_text(separator=" ", strip=True)
            if len(text) < 20 or text in seen:
                continue
            seen.add(text)
            cells = row.find_all("td")
            if len(cells) < 2:
                continue

            name   = cells[0].get_text(strip=True)
            amount = cells[1].get_text(strip=True) if len(cells) > 1 else ""

            try:
                value = float(amount.replace("$", "").replace(",", "").strip() or 0)
            except Exception:
                value = 0

            if value < 1_000_000:
                continue

            results.append({
                "id":          f"brb-{hash(name) % 100000}",
                "title":       f"{name} — ${value/1e6:.1f}M education bond",
                "agency":      name,
                "type":        "Education Bond Issuance",
                "posted":      datetime.utcnow().strftime("%Y-%m-%d"),
                "state":       "TX",
                "value":       value,
                "description": f"Texas education bond issuance of ${value/1e6:.1f}M",
                "url":         BRB_URL,
                "source":      "TX Bond Review Board",
                "keyword_hit": "education bond",
                "segment":     "Schools",
            })

    except Exception as e:
        logger.warning(f"BRB scrape fallback failed: {e}")

    return results


def check_competitor_in_bonds(competitor: dict, bonds: list[dict]) -> list[dict]:
    """
    Check if a competitor's name appears in any bond-related news or filings.
    Rare but strong signal — means they're already engaged with that district.
    Returns article-style dicts compatible with the pipeline.
    """
    mentions = []
    name     = competitor["name"].lower()

    for bond in bonds:
        text = f"{bond.get('title', '')} {bond.get('description', '')}".lower()
        if name in text:
            mentions.append({
                "source":    "tx_bonds",
                "title":     f"{competitor['name']} mentioned in TX bond activity: {bond['title'][:80]}",
                "summary":   bond.get("description", ""),
                "url":       bond.get("url", ""),
                "published": bond.get("posted", ""),
            })

    return mentions
