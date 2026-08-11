"""
municipal_intelligence.py

Reads normalized HB103 records (from municipal_finance.json), aggregates
them per municipality, computes an opportunity score, and writes
municipal_intelligence.json for the dashboard.

Modeled on scrapers/district_intelligence.py — same shape, same scoring
philosophy (multi-signal weighted average with an audit trail carrying raw
numbers so every score can be inspected).

STATUS: SKELETON.
Works today with the placeholder JSON tx_municipal_finance produces.
Search for "TODO" for spots that will benefit from real-data calibration
once the pipeline has run once with the actual HB103 file.
"""

import json
import logging
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("municipal_intelligence")

ROOT   = Path(__file__).parent.parent
INPUT  = ROOT / "mush-predict-package" / "public" / "data" / "municipal_finance.json"
OUTPUT = ROOT / "mush-predict-package" / "public" / "data" / "municipal_intelligence.json"

# Keywords that mark a bond as facility/energy/infrastructure — reused from
# the sam_gov.py / public_bid_tracker.py relevance filter. If a bond's
# purpose mentions any of these, it's a positive McKinstry signal.
FACILITY_KEYWORDS = [
    "hvac", "chiller", "boiler", "energy", "espc", "performance contract",
    "building automation", "controls", "mechanical", "electrical", "lighting",
    "solar", "retrofit", "modernization", "facility", "facilities",
    "central plant", "utility", "utilities", "renovation", "construction",
    "generator", "roofing", "roof", "plumbing", "commissioning",
    "weatherization", "infrastructure", "public works", "city hall",
    "courthouse", "library", "fire station", "police station",
    "recreation center", "community center", "wastewater", "water treatment",
]

# Bond activity within this many years is treated as "recent" (fresh capital
# appetite). Older activity still counts but decayed.
RECENT_YEARS = 5


def is_facility_relevant(purpose):
    """True if the bond purpose mentions facility/energy/infrastructure work."""
    if not purpose:
        return False
    low = str(purpose).lower()
    return any(kw in low for kw in FACILITY_KEYWORDS)


def parse_year(date_str):
    """Pull a 4-digit year out of a date-ish string. Returns None if none found."""
    if not date_str:
        return None
    m = re.search(r"(19|20)\d{2}", str(date_str))
    return int(m.group(0)) if m else None


def years_ago(year):
    if year is None:
        return None
    return datetime.utcnow().year - year


# ─────────────────────────────────────────────────────────────────────────────
# Sub-scores — each returns a 0-100 (or None if not enough data)
# ─────────────────────────────────────────────────────────────────────────────

def score_bond_activity(records):
    """Recent bond-election activity. More recent + more passed = higher score.

    TODO: after first real-data run, calibrate the saturation cap.
    Currently: 3+ passed bonds in the last 5 years = 100, scaled linearly.
    """
    if not records:
        return None, {"passed_recent": 0, "total_recent": 0}
    recent = [r for r in records
              if (y := years_ago(parse_year(r.get("election_date")))) is not None
              and y <= RECENT_YEARS]
    passed_recent = sum(1 for r in recent if r.get("passed") is True)
    total_recent = len(recent)
    if total_recent == 0:
        return None, {"passed_recent": 0, "total_recent": 0}
    score = min(100, int((passed_recent / 3.0) * 100))
    return score, {"passed_recent": passed_recent, "total_recent": total_recent}


def score_facility_relevance(records):
    """% of bond activity that names facility/energy/infrastructure work."""
    if not records:
        return None, {"facility_bonds": 0, "total_bonds": 0}
    total = len(records)
    facility = sum(1 for r in records if is_facility_relevant(r.get("purpose")))
    if total == 0:
        return None, {"facility_bonds": 0, "total_bonds": 0}
    return int((facility / total) * 100), {
        "facility_bonds": facility, "total_bonds": total,
    }


def score_bond_value(records):
    """Total dollar volume of passed bonds. Log-scale so a $1B mega-city
    doesn't crush a $50M mid-sized city.

    TODO: calibrate the log cap after seeing real distributions.
    """
    if not records:
        return None, {"total_passed_amount": 0}
    total_passed = sum(r.get("amount", 0) for r in records if r.get("passed") is True)
    if total_passed <= 0:
        return None, {"total_passed_amount": 0}
    # Log scale: $1M -> 0, $10M -> 25, $100M -> 50, $1B -> 75, $10B -> 100
    import math
    score = max(0, min(100, int((math.log10(total_passed) - 6) * 25)))
    return score, {"total_passed_amount": total_passed}


def compute_opportunity_score(sub_scores):
    """Weighted average of sub-scores, ignoring any that are None."""
    weights = {
        "bond_activity":      0.35,
        "facility_relevance": 0.40,   # highest weight — most predictive
        "bond_value":         0.25,
    }
    available = {k: v for k, v in sub_scores.items() if v is not None}
    if len(available) < 2:
        return None  # need at least 2 signals to score honestly
    total_w = sum(weights[k] for k in available)
    weighted = sum(available[k] * weights[k] for k in available)
    return int(weighted / total_w)


# ─────────────────────────────────────────────────────────────────────────────

def build_entity_intelligence(entity_key, records):
    """Aggregate one municipality's records into an intelligence record."""
    display_name = records[0]["entity_name"]
    entity_type  = records[0].get("entity_type")
    county       = records[0].get("county")

    ba_score, ba_audit = score_bond_activity(records)
    fr_score, fr_audit = score_facility_relevance(records)
    bv_score, bv_audit = score_bond_value(records)

    sub_scores = {
        "bond_activity":      ba_score,
        "facility_relevance": fr_score,
        "bond_value":         bv_score,
    }
    overall = compute_opportunity_score(sub_scores)

    # Pull out the facility-relevant bonds so a Pre-Call Brief can name them
    facility_bonds = [
        {
            "date":    r.get("election_date"),
            "purpose": r.get("purpose"),
            "amount":  r.get("amount"),
            "passed":  r.get("passed"),
        }
        for r in records if is_facility_relevant(r.get("purpose"))
    ]

    return {
        "entity_key":         entity_key,
        "entity_name":        display_name,
        "entity_type":        entity_type,
        "county":             county,
        "total_bonds_seen":   len(records),
        "sub_scores":         sub_scores,
        "opportunity_score":  overall,
        "facility_bonds":     facility_bonds,
        # Raw audit trail — every score's underlying figures, so anyone can
        # verify by hand. Mirrors the district audit trail.
        "audit": {
            "bond_activity":      ba_audit,
            "facility_relevance": fr_audit,
            "bond_value":         bv_audit,
        },
    }


def run():
    log.info("=" * 60)
    log.info("Municipal Intelligence — Aggregate")
    log.info("=" * 60)

    if not INPUT.exists():
        log.error(f"Missing input: {INPUT}")
        log.error("Run tx_municipal_finance.py first.")
        return 1

    with open(INPUT) as f:
        data = json.load(f)

    if data.get("status") != "ok":
        log.warning(f"Input status: {data.get('status')}. Writing empty output.")
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        with open(OUTPUT, "w") as f:
            json.dump({
                "status":       "upstream_not_configured",
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "municipalities": [],
            }, f, indent=2)
        return 0

    records = data.get("records", [])
    log.info(f"Read {len(records)} normalized records")

    # Group by normalized entity key
    by_entity = defaultdict(list)
    for r in records:
        key = r.get("entity_key")
        if not key:
            continue
        by_entity[key].append(r)

    municipalities = []
    for key, recs in by_entity.items():
        municipalities.append(build_entity_intelligence(key, recs))

    # Rank by opportunity score for the dashboard's default sort
    municipalities.sort(
        key=lambda m: (m["opportunity_score"] or -1),
        reverse=True,
    )

    log.info(f"Built intelligence for {len(municipalities)} municipalities")
    scored = sum(1 for m in municipalities if m["opportunity_score"] is not None)
    log.info(f"  {scored} have enough data for an overall score")

    output = {
        "status":         "ok",
        "generated_at":   datetime.now(timezone.utc).isoformat(),
        "municipalities": municipalities,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w") as f:
        json.dump(output, f, indent=2)
    log.info(f"Wrote {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(run())
