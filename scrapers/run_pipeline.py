"""
run_pipeline.py
Main entry point — orchestrates all data sources and writes competitors.json.

Sources:
  TIER 1 (no key):   USASpending · SEC EDGAR · USPTO · Socrata · Google News
                     TX ESBD · TEA Bonds · OpenCorporates · Dodge Construction
  TIER 2 (free key): SAM.gov · Adzuna Jobs
  TIER 3 (wired):    LDA Lobbying
"""

import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config              import COMPETITORS
from usaspending         import fetch_contract_awards
from sam_gov             import fetch_active_bids
from sec_edgar           import fetch_recent_filings
from uspto               import fetch_patents
from adzuna_jobs         import fetch_job_postings
from socrata_permits     import fetch_permit_mentions
from google_news         import fetch_news
from lda_lobbying        import fetch_lobbying
from texas_esbd          import fetch_texas_contracts
from tea_bonds           import fetch_bond_elections, check_competitor_in_bonds
from opencorporates      import fetch_entity_registrations
from dodge_construction  import fetch_construction_projects

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

ROOT        = Path(__file__).parent.parent
OUTPUT_PATH = ROOT / "public" / "data" / "competitors.json"
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)


def _generate_summary(c: dict) -> str:
    bits = []
    awards = c.get("contractAwards", [])
    if awards:
        r = awards[0]
        bits.append(f"Recent ${r['value']/1e6:.1f}M {r['segment']} win in {r['state']}")
    if c.get("activeBids"):
        bits.append(f"{len(c['activeBids'])} open bids")
    if c.get("jobPostings"):
        bits.append(f"{len(c['jobPostings'])} active job postings")
    if c.get("lobbyingActivity"):
        bits.append(f"Lobbying on {c['lobbyingActivity'][0]['topics'][0]}")
    return ". ".join(bits) + "." if bits else "No recent signal activity."


def _infer_status(c: dict) -> str:
    score = 0
    score += len(c.get("contractAwards",     [])) * 2
    score += len(c.get("activeBids",         [])) * 3
    score += len(c.get("jobPostings",        [])) * 1
    score += len(c.get("patents",            [])) * 2
    score += len(c.get("permitMentions",     [])) * 2
    score += len(c.get("newsArticles",       [])) * 1
    score += len(c.get("lobbyingActivity",   [])) * 3
    score += len(c.get("texasContracts",     [])) * 3
    score += len(c.get("entityRegistrations",[])) * 2
    if score >= 35: return "risk"
    if score >= 18: return "watch"
    if score >= 6:  return "grow"
    return "stable"


def build_competitor_record(competitor: dict, bond_data: list) -> dict:
    logger.info(f"\n→ {competitor['name']}")

    record = {
        "name":     competitor["name"],
        "segments": competitor["segments"],
        "offices":  competitor["offices"],
    }

    # TIER 1 — no key required
    record["contractAwards"]      = fetch_contract_awards(competitor);     time.sleep(0.5)
    record["earningsCallMentions"]= fetch_recent_filings(competitor);      time.sleep(0.5)
    record["patents"]             = fetch_patents(competitor);             time.sleep(0.5)
    record["permitMentions"]      = fetch_permit_mentions(competitor);     time.sleep(0.5)
    record["newsArticles"]        = fetch_news(competitor);                time.sleep(0.5)
    record["lobbyingActivity"]    = fetch_lobbying(competitor);            time.sleep(0.5)
    record["texasContracts"]      = fetch_texas_contracts(competitor);     time.sleep(0.5)
    record["entityRegistrations"] = fetch_entity_registrations(competitor);time.sleep(0.5)

    # Bond mentions — check against pre-fetched bond data
    record["bondMentions"] = check_competitor_in_bonds(competitor, bond_data)

    # TIER 2 — free key required
    record["activeBids"]   = fetch_active_bids(competitor);   time.sleep(0.5)
    record["jobPostings"]  = fetch_job_postings(competitor);  time.sleep(0.5)

    # Derived fields
    record["historicalBids"]       = [{"segment": a["segment"]} for a in record["contractAwards"]]
    record["statusToday"]          = _infer_status(record)
    record["recentSignalSummary"]  = _generate_summary(record)
    record["executiveMoves"]       = []  # Phase 3 — LinkedIn
    record["conferences"]          = []  # Phase 3 — manual entry

    # Signal count for logging
    total = sum(len(record.get(k, [])) for k in [
        "contractAwards","activeBids","earningsCallMentions","patents",
        "jobPostings","permitMentions","newsArticles","lobbyingActivity",
        "texasContracts","entityRegistrations","bondMentions",
    ])
    logger.info(f"  Total signals: {total} → {record['statusToday']}")
    return record


def run():
    logger.info("=" * 60)
    logger.info(f"MUSH Predict Pipeline — {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    logger.info("Tier 1: USASpending · SEC · USPTO · Socrata · News · LDA")
    logger.info("        TX ESBD · TEA Bonds · OpenCorporates · Dodge")
    logger.info("Tier 2: SAM.gov · Adzuna")
    logger.info("=" * 60)

    # Pre-fetch bond data once — shared across all competitors
    logger.info("\nPre-fetching Texas bond election data...")
    bond_data = fetch_bond_elections()
    logger.info(f"  {len(bond_data)} passed TX bond elections loaded")

    # Pre-fetch construction projects once
    logger.info("Pre-fetching construction project feeds...")
    construction_data = fetch_construction_projects()
    logger.info(f"  {len(construction_data)} MUSH construction projects loaded")

    competitors = [build_competitor_record(c, bond_data) for c in COMPETITORS]

    today  = datetime.utcnow().strftime("%Y-%m-%d")
    output = {
        "last_updated":          today,
        "last_updated_display":  datetime.utcnow().strftime("%B %d, %Y"),
        "data_sources_active": [
            "USASpending.gov", "SAM.gov", "SEC EDGAR", "USPTO PatentsView",
            "Adzuna Jobs", "Socrata permits", "Google News RSS",
            "Senate LDA lobbying", "TX ESBD", "TEA bond data",
            "OpenCorporates", "Construction feeds",
        ],
        "bond_opportunities":         bond_data,
        "construction_opportunities": construction_data,
        "competitors":                competitors,
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    logger.info(f"\n{'='*60}")
    logger.info(f"✓ Wrote {len(competitors)} competitors → {OUTPUT_PATH}")
    logger.info(f"  {len(bond_data)} TX bond opportunities")
    logger.info(f"  {len(construction_data)} construction opportunities")
    for c in competitors:
        total = sum(len(c.get(k, [])) for k in [
            "contractAwards","activeBids","earningsCallMentions","patents",
            "jobPostings","permitMentions","newsArticles","lobbyingActivity",
            "texasContracts","entityRegistrations",
        ])
        logger.info(f"  {c['name']:<32} {total:>3} signals → {c['statusToday']}")
    logger.info("\nPipeline complete.")


if __name__ == "__main__":
    run()
