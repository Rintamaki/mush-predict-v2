"""
run_pipeline.py
Main entry point for the Predict pipeline.

Orchestrates 6 data sources and writes a consolidated competitors.json
in the exact format the React dashboard's scoring engine expects.

Run locally:  python scrapers/run_pipeline.py
Run on CI:    triggered daily at 6am CT via .github/workflows/refresh.yml
"""

import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config            import COMPETITORS
from usaspending       import fetch_contract_awards
from sam_gov           import fetch_active_bids
from sec_edgar         import fetch_recent_filings
from uspto             import fetch_patents
from adzuna_jobs       import fetch_job_postings
from socrata_permits   import fetch_permit_mentions

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Output path ───────────────────────────────────────────────────────────────
ROOT        = Path(__file__).parent.parent
OUTPUT_PATH = ROOT / "public" / "data" / "competitors.json"
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)


def _generate_summary(competitor: dict) -> str:
    """Build a short human-readable summary from the strongest signals."""
    bits = []
    awards = competitor.get("contractAwards", [])
    if awards:
        recent = awards[0]
        bits.append(f"Recent ${recent['value']/1e6:.1f}M {recent['segment']} win in {recent['state']}")
    bids = competitor.get("activeBids", [])
    if bids:
        bits.append(f"{len(bids)} open bid{'s' if len(bids)>1 else ''}")
    jobs = competitor.get("jobPostings", [])
    if jobs:
        bits.append(f"{len(jobs)} active job posting{'s' if len(jobs)>1 else ''}")
    if not bits:
        return "Limited recent signal activity."
    return ". ".join(bits) + "."


def _infer_status(competitor: dict) -> str:
    """Quick status classification from signal volume."""
    score  = 0
    score += len(competitor.get("contractAwards",  [])) * 2
    score += len(competitor.get("activeBids",      [])) * 3
    score += len(competitor.get("jobPostings",     [])) * 1
    score += len(competitor.get("patents",         [])) * 2
    score += len(competitor.get("permitMentions",  [])) * 2
    if score >= 30: return "risk"
    if score >= 15: return "watch"
    if score >= 5:  return "grow"
    return "stable"


def build_competitor_record(competitor: dict) -> dict:
    """Pull from every source and build the unified record."""
    logger.info(f"\n→ {competitor['name']}")

    record = {
        "name":     competitor["name"],
        "segments": competitor["segments"],
        "offices":  competitor["offices"],
    }

    # Source 1: USASpending federal awards
    record["contractAwards"] = fetch_contract_awards(competitor)
    time.sleep(0.5)

    # Source 2: SAM.gov active bids
    record["activeBids"] = fetch_active_bids(competitor)
    time.sleep(0.5)

    # Source 3: SEC EDGAR earnings call mentions
    record["earningsCallMentions"] = fetch_recent_filings(competitor)
    time.sleep(0.5)

    # Source 4: USPTO patents
    record["patents"] = fetch_patents(competitor)
    time.sleep(0.5)

    # Source 5: Adzuna job postings
    record["jobPostings"] = fetch_job_postings(competitor)
    time.sleep(0.5)

    # Source 6: Socrata building permits
    record["permitMentions"] = fetch_permit_mentions(competitor)
    time.sleep(0.5)

    # Derived fields the engine uses
    record["historicalBids"] = [{"segment": a["segment"]} for a in record["contractAwards"]]

    # Convenience fields for the UI
    record["statusToday"]          = _infer_status(record)
    record["recentSignalSummary"]  = _generate_summary(record)
    record["executiveMoves"]       = []  # placeholder for Tier 3 (LinkedIn — needs auth)
    record["lobbyingActivity"]     = []  # placeholder for Tier 3 (LDA bulk download)
    record["conferences"]          = []  # placeholder for Tier 3 (manual entry)

    return record


def run():
    logger.info("=" * 60)
    logger.info(f"MUSH Predict Pipeline — {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    logger.info("Sources: USASpending · SAM.gov · SEC EDGAR · USPTO · Adzuna · Socrata")
    logger.info("=" * 60)

    competitors = [build_competitor_record(c) for c in COMPETITORS]

    today = datetime.utcnow().strftime("%Y-%m-%d")
    output = {
        "last_updated":         today,
        "last_updated_display": datetime.utcnow().strftime("%B %d, %Y"),
        "data_sources_active":  [
            "USASpending.gov", "SAM.gov", "SEC EDGAR",
            "USPTO PatentsView", "Adzuna", "Socrata permits",
        ],
        "competitors":          competitors,
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    # Print summary stats
    logger.info(f"\n{'=' * 60}")
    logger.info(f"✓ Wrote {len(competitors)} competitors → {OUTPUT_PATH}")
    for c in competitors:
        sig_count = sum(
            len(c.get(k, []))
            for k in ["contractAwards","activeBids","earningsCallMentions","patents","jobPostings","permitMentions"]
        )
        logger.info(f"  {c['name']:<32} {sig_count} signals  →  {c['statusToday']}")

    logger.info("\nPipeline complete.")


if __name__ == "__main__":
    run()
