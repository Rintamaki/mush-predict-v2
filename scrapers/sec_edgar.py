"""
sec_edgar.py
Free, no API key needed (just a User-Agent identifying you).
Pulls 10-K / 10-Q filings and extracts segment mentions.
"""

import requests
import logging
from datetime import datetime
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# SEC requires a User-Agent that identifies you
HEADERS = {
    "User-Agent":      "McKinstry MUSH Predict mush-bot@mckinstry.com",
    "Accept-Encoding": "gzip, deflate",
}

SEGMENTS = ["Schools", "Healthcare", "University", "Municipal"]


def fetch_recent_filings(competitor: dict) -> list[dict]:
    """
    Pull the 2 most recent 10-K / 10-Q filings and scan for segment mentions.
    Returns list of mentions: { quarter, topic, snippet }.
    """
    cik = competitor.get("sec_cik")
    if not cik:
        return []

    mentions = []
    # Pad CIK to 10 digits as SEC requires
    cik_padded = cik.zfill(10)

    try:
        # Step 1: Get filing index
        url = f"https://data.sec.gov/submissions/CIK{cik_padded}.json"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        forms      = data["filings"]["recent"]["form"]
        accessions = data["filings"]["recent"]["accessionNumber"]
        dates      = data["filings"]["recent"]["filingDate"]
        primary    = data["filings"]["recent"]["primaryDocument"]

        # Find most recent 10-K and 10-Q (last 8 = ~2 years of quarterly history)
        targets = []
        for f, acc, dt, doc in zip(forms, accessions, dates, primary):
            if f in ("10-K", "10-Q") and len(targets) < 8:
                targets.append((f, acc, dt, doc))

        for form, acc, dt, doc in targets:
            acc_clean = acc.replace("-", "")
            filing_url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_clean}/{doc}"
            try:
                r = requests.get(filing_url, headers=HEADERS, timeout=20)
                if not r.ok:
                    continue
                # Parse HTML and extract clean text
                soup = BeautifulSoup(r.text, "lxml")
                text = soup.get_text(separator=" ", strip=True).lower()

                # Determine "quarter" label
                quarter = _quarter_from_date(dt)

                # Look for segment mentions in surrounding context
                for seg in SEGMENTS:
                    seg_lower = seg.lower()
                    if seg == "Schools":
                        keywords = ["school district", "k-12", "education vertical"]
                    elif seg == "Healthcare":
                        keywords = ["healthcare", "hospital", "health system"]
                    elif seg == "University":
                        keywords = ["university", "higher education", "campus"]
                    else:
                        keywords = ["municipal", "county", "city government"]

                    for kw in keywords:
                        idx = text.find(kw)
                        if idx != -1:
                            # Extract a 140-char snippet around the keyword
                            start = max(0, idx - 50)
                            end   = min(len(text), idx + 90)
                            snippet = text[start:end].replace("\n", " ").strip()
                            mentions.append({
                                "quarter": quarter,
                                "topic":   seg,
                                "snippet": snippet[:140],
                            })
                            break  # one mention per segment per filing
            except Exception as e:
                logger.warning(f"SEC filing parse failed: {e}")

    except Exception as e:
        logger.warning(f"SEC EDGAR failed for {competitor['name']}: {e}")

    # Dedupe by (quarter, topic)
    seen, deduped = set(), []
    for m in mentions:
        key = (m["quarter"], m["topic"])
        if key not in seen:
            seen.add(key)
            deduped.append(m)

    logger.info(f"  SEC EDGAR [{competitor['name']}]: {len(deduped)} segment mentions")
    return deduped


def _quarter_from_date(date_str: str) -> str:
    """Convert '2025-11-04' → '2025-Q4'."""
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
        return f"{d.year}-Q{(d.month - 1) // 3 + 1}"
    except Exception:
        return date_str
