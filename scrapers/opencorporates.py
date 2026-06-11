"""
opencorporates.py
Free API tier available — no key needed for basic searches.
Tracks business entity registrations and officer filings.

When a competitor registers a new LLC in Texas or files a new
registered agent, that's an expansion signal — often appears
3-6 months before any press release about entering a new market.

API docs: https://api.opencorporates.com
Free tier: 500 requests/month
"""

import requests
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

BASE_URL      = "https://api.opencorporates.com/v0.4"
LOOKBACK_DAYS = 365

# Texas and key McKinstry markets
TARGET_JURISDICTIONS = ["us_tx", "us_wa", "us_or", "us_co", "us_ca"]


def fetch_entity_registrations(competitor: dict) -> list[dict]:
    """
    Search for new business entity registrations by this competitor
    in target states. New registrations = new market entry signal.
    """
    results    = []
    name       = competitor["name"]
    cutoff     = (datetime.utcnow() - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%d")

    for jurisdiction in TARGET_JURISDICTIONS:
        try:
            params = {
                "q":              name,
                "jurisdiction_code": jurisdiction,
                "inactive":       "false",
                "normalise_company_name": "true",
                "per_page":       5,
            }
            resp = requests.get(
                f"{BASE_URL}/companies/search",
                params=params,
                timeout=12,
            )

            if not resp.ok:
                continue

            data = resp.json()
            companies = data.get("results", {}).get("companies", [])

            for item in companies:
                company   = item.get("company", {})
                co_name   = company.get("name", "")
                inc_date  = company.get("incorporation_date", "")
                status    = company.get("current_status", "")
                reg_addr  = (company.get("registered_address") or {}).get("street_address", "")
                state_code = jurisdiction.replace("us_", "").upper()

                # Only flag if relatively recent registration
                if inc_date and inc_date < cutoff:
                    continue

                # Check it's actually related to the competitor
                if not any(
                    word.lower() in co_name.lower()
                    for word in name.split()
                    if len(word) > 3
                ):
                    continue

                results.append({
                    "source":    "opencorporates",
                    "title":     f"{co_name} registered in {state_code} — possible expansion signal",
                    "summary":   f"Entity: {co_name}, Status: {status}, Address: {reg_addr}",
                    "url":       company.get("opencorporates_url", ""),
                    "published": inc_date or datetime.utcnow().strftime("%Y-%m-%d"),
                    "state":     state_code,
                })

        except Exception as e:
            logger.debug(f"OpenCorporates failed for {name} in {jurisdiction}: {e}")

    logger.info(f"  OpenCorporates [{name}]: {len(results)} entity registrations")
    return results
