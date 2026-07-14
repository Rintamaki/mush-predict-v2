"""
district_intelligence.py

Aggregates multiple manually-downloaded Texas public data sources into a
single per-district intelligence file with computed opportunity scores.

DATA SOURCES (all manually downloaded once a year — see each loader's
docstring for the download page and expected local filename):

  1. TEA Financial Data        -> tea_data/summarized-financial-data.xlsx  (already built)
  2. TEA Enrollment Data       -> tea_data/enrollment-data.csv
  3. TX Bond Review Board Debt -> tea_data/bond_debt.csv
  4. TX Bond Elections         -> tea_data/bond_elections.csv
  5. Census Building Permits   -> tea_data/census_permits.csv

Each loader is independent and gracefully skipped if its file isn't
present — you don't need all 5 sources for this to produce useful output.
More sources = more complete scores.

COMPUTED SCORES per district (0-100 scale, where data allows):
  - enrollment_growth_score   : YoY / multi-year enrollment trend
  - plant_mo_trend_score      : Plant M&O spending trajectory
  - construction_spend_score  : Capital/construction spending trajectory
  - bond_cycle_stage          : text label — Just Passed / Planning /
                                 Active RFP Window / Mid-Cycle / Complete
  - debt_capacity_score       : how much borrowing room remains (low debt
                                 ratio = high capacity = more likely to
                                 pass future bonds)
  - housing_growth_score      : local building permit activity (proxy for
                                 enrollment growth pressure ahead)
  - opportunity_score         : blended overall score (simple average of
                                 whichever sub-scores have real data)

This is intentionally a v1 framework. Real-world TEA/BRB/Census file
formats vary and may need column-mapping fixes on first run — same
iterative pattern used to get the TEA financial scraper working. Each
loader logs its detected columns so mismatches are easy to diagnose and
fix.
"""

import csv
import io
import json
import logging
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('district-intel')

SCRIPT_DIR  = Path(__file__).parent
DATA_DIR    = SCRIPT_DIR / 'tea_data'
OUTPUT_FILE = SCRIPT_DIR.parent / 'mush-predict-package' / 'public' / 'data' / 'district_intelligence.json'


# ── Generic helpers ──────────────────────────────────────────────────────────
def normalize_district_name(name):
    """Normalize district names so different sources' naming can match up.
    e.g. 'Plano ISD' / 'PLANO ISD' / 'Plano Independent School District'
    all become 'plano isd'."""
    if not name:
        return ''
    n = name.upper().strip()
    n = n.replace('INDEPENDENT SCHOOL DISTRICT', 'ISD')
    n = n.replace(' I S D', ' ISD')
    n = ' '.join(n.split())
    return n.lower()


def load_csv_with_diagnostics(path, source_label):
    """Read a CSV, auto-detecting the real header row (TEA exports often
    have title/letterhead rows above the actual data table), log columns,
    return (rows, fieldnames) or (None, None)."""
    if not path.exists():
        log.warning(f'[{source_label}] File not found: {path} — skipping this data source')
        return None, None

    log.info(f'[{source_label}] Reading {path} ({path.stat().st_size / 1e6:.1f} MB)')

    with open(path, 'r', encoding='utf-8-sig', errors='ignore') as f:
        raw_lines = f.readlines()

    # Scan the first 30 lines for the one that looks most like a real header:
    # highest comma count, and not just a single decorative title string.
    best_idx = 0
    best_commas = -1
    scan_limit = min(30, len(raw_lines))
    for i in range(scan_limit):
        commas = raw_lines[i].count(',')
        if commas > best_commas:
            best_commas = commas
            best_idx = i

    if best_commas < 2:
        log.error(f'[{source_label}] Could not find a real header row in the first {scan_limit} lines '
                  f'(best candidate had only {best_commas} commas). File may not be a standard CSV export.')
        log.error(f'[{source_label}] First few lines: {[l.strip() for l in raw_lines[:5]]}')
        return None, None

    if best_idx > 0:
        log.info(f'[{source_label}] Detected {best_idx} title/letterhead row(s) before the real header — skipping them')

    data_str = ''.join(raw_lines[best_idx:])
    reader = csv.DictReader(io.StringIO(data_str))
    rows = list(reader)
    fieldnames = reader.fieldnames

    log.info(f'[{source_label}] {len(rows)} rows, columns: {fieldnames}')
    return rows, fieldnames


def find_col(fieldnames, candidates):
    """Find the first fieldname that contains any of the candidate substrings."""
    if not fieldnames:
        return None
    low = {f.lower(): f for f in fieldnames}
    for cand in candidates:
        for lf, orig in low.items():
            if cand.lower() in lf:
                return orig
    return None


# ── Source 1: TEA Financial Data (reuses the working tx_district_finance.json) ─
def load_financial_data():
    """
    Rather than re-parse the xlsx here, reuse the output already produced
    by tx_district_finance.py — avoids duplicating that parsing logic.
    Run tx_district_finance.py first if this file doesn't exist yet.
    """
    fin_file = SCRIPT_DIR.parent / 'mush-predict-package' / 'public' / 'data' / 'tx_district_finance.json'
    if not fin_file.exists():
        log.warning(f'[Financial] {fin_file} not found — run tx_district_finance.py first. Skipping.')
        return {}

    with open(fin_file) as f:
        data = json.load(f)

    result = {}
    for d in data.get('districts', []):
        key = normalize_district_name(d['district_name'])
        history = d.get('history', [])
        # Compute plant M&O trend and construction spend trend from history
        plant_trend = compute_trend([h['plant_maintenance'] for h in history])
        constr_trend = compute_trend([h['facilities_construction'] for h in history])
        result[key] = {
            'district_name':            d['district_name'],
            'latest_plant_maintenance': d['spending']['plant_maintenance'],
            'latest_construction':      d['spending']['facilities_construction'],
            'plant_mo_trend_score':     plant_trend,
            'construction_spend_score': constr_trend,
        }
    log.info(f'[Financial] Loaded {len(result)} districts from existing tx_district_finance.json')
    return result


def compute_trend(values):
    """Given a list of yearly values (oldest to newest), return a 0-100
    trend score. 50 = flat. Higher = growing. Lower = shrinking.
    Requires a minimum baseline value to avoid tiny districts (e.g. small
    charter schools) producing misleading extreme swings off near-zero bases."""
    values = [v for v in values if v is not None]
    if len(values) < 2 or values[0] < 50000:  # ignore baselines under $50K — too noisy
        return None
    pct_change = (values[-1] - values[0]) / values[0]
    # Map -50%..+50% change to 0..100, clamped
    score = 50 + (pct_change * 100)
    return max(0, min(100, round(score)))


# ── Source 2: TEA Enrollment Data ────────────────────────────────────────────
def load_enrollment_data():
    """
    Download from: https://tea.texas.gov/data-reports/student-data/standard-reports/peims-standard-reports
    Look for a district-level enrollment export (CSV).
    Save to: scrapers/tea_data/enrollment-data.csv

    NOTE: exact column names are unverified — this is a first pass. If the
    log shows a column mismatch, send the logged column list back and
    we'll fix the find_col() candidates below.
    """
    path = DATA_DIR / 'enrollment-data.csv'
    rows, fieldnames = load_csv_with_diagnostics(path, 'Enrollment')
    if rows is None:
        return {}

    col_name = find_col(fieldnames, ['district name', 'district'])
    col_year = find_col(fieldnames, ['year', 'school year'])
    col_enroll = find_col(fieldnames, ['enrollment', 'total students', 'student count'])

    if not all([col_name, col_year, col_enroll]):
        log.error(f'[Enrollment] Could not find required columns. '
                  f'name={col_name}, year={col_year}, enrollment={col_enroll}')
        log.error(f'[Enrollment] Available columns: {fieldnames}')
        return {}

    by_district = defaultdict(list)
    for row in rows:
        try:
            name = row[col_name].strip()
            year = row[col_year].strip()
            enrollment = float(row[col_enroll].replace(',', ''))
        except (ValueError, AttributeError, KeyError):
            continue
        if not name:
            continue
        by_district[normalize_district_name(name)].append((year, enrollment, name))

    result = {}
    for key, records in by_district.items():
        records.sort(key=lambda r: r[0])  # sort by year
        values = [r[1] for r in records]
        # Skip enrollment trend for very small districts/schools — same
        # noise problem as the financial trend calc.
        enroll_trend = compute_enrollment_trend(values)
        result[key] = {
            'district_name':             records[-1][2],
            'latest_enrollment':         values[-1],
            'enrollment_growth_score':   enroll_trend,
        }
    log.info(f'[Enrollment] Parsed {len(result)} districts')
    return result


def compute_enrollment_trend(values):
    """Same idea as compute_trend() but with an enrollment-appropriate
    minimum baseline (100 students) instead of a dollar amount."""
    values = [v for v in values if v is not None]
    if len(values) < 2 or values[0] < 100:
        return None
    pct_change = (values[-1] - values[0]) / values[0]
    score = 50 + (pct_change * 100)
    return max(0, min(100, round(score)))


# ── Source 3: TX Bond Review Board — Debt Data ───────────────────────────────
def load_bond_debt_data():
    """
    Download from: https://debtsearch.brb.texas.gov/local_debt_search.aspx
    Search/export for Texas school districts, save the result as CSV.
    Save to: scrapers/tea_data/bond_debt.csv

    NOTE: this is a search tool, not a bulk download page — you may need to
    search "school district" as the entity type and export results, or
    check if BRB offers a bulk data file elsewhere on their site. Column
    names below are best-guess and will likely need adjustment.
    """
    path = DATA_DIR / 'bond_debt.csv'
    rows, fieldnames = load_csv_with_diagnostics(path, 'Bond Debt')
    if rows is None:
        return {}

    col_name = find_col(fieldnames, ['entity name', 'district name', 'issuer'])
    col_debt = find_col(fieldnames, ['debt outstanding', 'total debt', 'outstanding'])
    col_valuation = find_col(fieldnames, ['assessed valuation', 'taxable value'])

    if not all([col_name, col_debt]):
        log.error(f'[Bond Debt] Could not find required columns. '
                  f'name={col_name}, debt={col_debt}, valuation={col_valuation}')
        log.error(f'[Bond Debt] Available columns: {fieldnames}')
        return {}

    result = {}
    for row in rows:
        try:
            name = row[col_name].strip()
            debt = float(row[col_debt].replace(',', '').replace('$', ''))
            valuation = float(row[col_valuation].replace(',', '').replace('$', '')) if col_valuation else None
        except (ValueError, AttributeError, KeyError):
            continue
        if not name:
            continue

        # Debt capacity score: lower debt-to-valuation ratio = more room to
        # borrow = higher capacity for a future bond. If we don't have
        # valuation, fall back to raw debt level (lower = higher capacity,
        # very rough).
        if valuation and valuation > 0:
            ratio = debt / valuation
            # Typical Texas ISD debt ratios run roughly 0-15% of valuation.
            # Map that range to a 100 (low debt, high capacity) .. 0 (high debt) score.
            capacity_score = max(0, min(100, round(100 - (ratio / 0.15 * 100))))
        else:
            capacity_score = None

        result[normalize_district_name(name)] = {
            'district_name':        name,
            'debt_outstanding':     debt,
            'assessed_valuation':   valuation,
            'debt_capacity_score':  capacity_score,
        }
    log.info(f'[Bond Debt] Parsed {len(result)} districts')
    return result


# ── Source 4: TX Bond Elections ──────────────────────────────────────────────
def load_bond_elections_data():
    """
    Download from: https://debtsearch.brb.texas.gov/bond_elections_search.aspx
    Save results as CSV to: scrapers/tea_data/bond_elections.csv

    NOTE: same caveat as bond debt — this looks like a search tool rather
    than a bulk export. Column names are best-guess.
    """
    path = DATA_DIR / 'bond_elections.csv'
    rows, fieldnames = load_csv_with_diagnostics(path, 'Bond Elections')
    if rows is None:
        return {}

    col_name = find_col(fieldnames, ['entity name', 'district name', 'issuer'])
    col_date = find_col(fieldnames, ['election date', 'date'])
    col_amount = find_col(fieldnames, ['proposition amount', 'amount', 'bond amount'])
    col_outcome = find_col(fieldnames, ['outcome', 'result', 'passed'])

    if not all([col_name, col_date]):
        log.error(f'[Bond Elections] Could not find required columns. '
                  f'name={col_name}, date={col_date}')
        log.error(f'[Bond Elections] Available columns: {fieldnames}')
        return {}

    by_district = defaultdict(list)
    for row in rows:
        try:
            name = row[col_name].strip()
            date = row[col_date].strip()
            amount = float(row[col_amount].replace(',', '').replace('$', '')) if col_amount and row.get(col_amount) else 0
            outcome = row[col_outcome].strip() if col_outcome else ''
        except (ValueError, AttributeError, KeyError):
            continue
        if not name or not date:
            continue
        by_district[normalize_district_name(name)].append({
            'date': date, 'amount': amount, 'outcome': outcome, 'name': name,
        })

    result = {}
    for key, elections in by_district.items():
        elections.sort(key=lambda e: e['date'], reverse=True)
        passed = [e for e in elections if 'pass' in e['outcome'].lower() or 'approve' in e['outcome'].lower()]
        most_recent_passed = passed[0] if passed else None

        bond_cycle_stage = None
        if most_recent_passed:
            months_ago = months_since(most_recent_passed['date'])
            bond_cycle_stage = infer_bond_cycle_stage(months_ago)

        result[key] = {
            'district_name':        elections[0]['name'],
            'most_recent_bond':      most_recent_passed,
            'bond_cycle_stage':      bond_cycle_stage,
            'total_bond_elections': len(elections),
        }
    log.info(f'[Bond Elections] Parsed {len(result)} districts')
    return result


def months_since(date_str):
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%m/%d/%y'):
        try:
            then = datetime.strptime(date_str, fmt)
            now = datetime.utcnow()
            return (now.year - then.year) * 12 + (now.month - then.month)
        except ValueError:
            continue
    return None


def infer_bond_cycle_stage(months_ago):
    if months_ago is None:
        return None
    if months_ago <= 6:
        return 'Just Passed'
    if months_ago <= 12:
        return 'Early Program Planning'
    if months_ago <= 24:
        return 'Active RFP Window'
    if months_ago <= 48:
        return 'Mid-Cycle Execution'
    return 'Cycle Likely Complete'


# ── Source 5: Census Building Permits ─────────────────────────────────────────
def load_census_permits_data():
    """
    Download from: https://www.census.gov/construction/bps/current.html
    Get county or place-level annual permit totals for Texas, save as CSV to:
    scrapers/tea_data/census_permits.csv

    NOTE: Census permit data is by COUNTY or CITY, not by school district —
    there's no direct district match. This loader keys by county name; the
    aggregator does a best-effort match using each district's known county
    if we have that info, otherwise this data won't merge with district
    records. This is the weakest link in the chain and may need a
    district-to-county mapping table to be genuinely useful.
    """
    path = DATA_DIR / 'census_permits.csv'
    rows, fieldnames = load_csv_with_diagnostics(path, 'Census Permits')
    if rows is None:
        return {}

    col_area  = find_col(fieldnames, ['county', 'place', 'area name'])
    col_units = find_col(fieldnames, ['total units', 'units', 'permits'])

    if not all([col_area, col_units]):
        log.error(f'[Census Permits] Could not find required columns. '
                  f'area={col_area}, units={col_units}')
        log.error(f'[Census Permits] Available columns: {fieldnames}')
        return {}

    result = {}
    for row in rows:
        try:
            area = row[col_area].strip()
            units = float(row[col_units].replace(',', ''))
        except (ValueError, AttributeError, KeyError):
            continue
        if not area:
            continue
        result[area.lower()] = {'area_name': area, 'annual_permits': units}
    log.info(f'[Census Permits] Parsed {len(result)} areas (county/city level, not district-matched yet)')
    return result


# ── Merge everything ──────────────────────────────────────────────────────────
def build_district_intelligence():
    financial   = load_financial_data()
    enrollment  = load_enrollment_data()
    bond_debt   = load_bond_debt_data()
    bond_elect  = load_bond_elections_data()
    permits     = load_census_permits_data()  # not merged by district yet — see note above

    all_keys = set(financial) | set(enrollment) | set(bond_debt) | set(bond_elect)
    log.info(f'Merging {len(all_keys)} unique districts across all available sources')

    districts = []
    for key in all_keys:
        fin   = financial.get(key, {})
        enr   = enrollment.get(key, {})
        debt  = bond_debt.get(key, {})
        bond  = bond_elect.get(key, {})

        name = fin.get('district_name') or enr.get('district_name') or \
               debt.get('district_name') or bond.get('district_name') or key.title()

        sub_scores = {
            'enrollment_growth_score':   enr.get('enrollment_growth_score'),
            'plant_mo_trend_score':      fin.get('plant_mo_trend_score'),
            'construction_spend_score':  fin.get('construction_spend_score'),
            'debt_capacity_score':       debt.get('debt_capacity_score'),
            # housing_growth_score intentionally omitted until permits
            # can be reliably matched to districts by county
        }

        available = [v for v in sub_scores.values() if v is not None]
        # Require at least 2 real sub-scores before computing an overall
        # opportunity score — a single noisy trend from one small district
        # shouldn't be able to claim a top-5 spot on its own.
        opportunity_score = round(sum(available) / len(available)) if len(available) >= 2 else None

        districts.append({
            'district_key':          key,
            'district_name':         name,
            'sub_scores':            sub_scores,
            'opportunity_score':     opportunity_score,
            'bond_cycle_stage':      bond.get('bond_cycle_stage'),
            'most_recent_bond':      bond.get('most_recent_bond'),
            'latest_enrollment':     enr.get('latest_enrollment'),
            'latest_plant_maintenance': fin.get('latest_plant_maintenance'),
            'latest_construction':   fin.get('latest_construction'),
            'debt_outstanding':      debt.get('debt_outstanding'),
            'data_completeness': {
                'financial':   bool(fin),
                'enrollment':  bool(enr),
                'bond_debt':   bool(debt),
                'bond_elections': bool(bond),
            },
        })

    districts.sort(key=lambda d: d['opportunity_score'] or 0, reverse=True)
    for i, d in enumerate(districts):
        d['rank'] = i + 1

    return {
        'generated_at':   datetime.utcnow().isoformat() + 'Z',
        'sources_used': {
            'financial':      len(financial) > 0,
            'enrollment':     len(enrollment) > 0,
            'bond_debt':      len(bond_debt) > 0,
            'bond_elections': len(bond_elect) > 0,
            'census_permits': len(permits) > 0,
        },
        'notes': (
            'District Opportunity Score blends whichever sub-scores have available data: '
            'enrollment growth, Plant M&O spending trend, construction spending trend, and '
            'debt capacity. Housing/permit growth is tracked separately but not yet merged '
            'per-district (Census data is county-level; needs a district-to-county mapping '
            'to integrate cleanly). Bond cycle stage inferred from most recent passed bond election.'
        ),
        'district_count': len(districts),
        'districts':      districts,
    }


def run():
    log.info('=' * 60)
    log.info('District Intelligence Aggregator')
    log.info('=' * 60)

    output = build_district_intelligence()

    if output['district_count'] == 0:
        log.error('No districts produced — check that at least one data source loaded successfully')
        return 1

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    log.info(f'✅ Wrote {output["district_count"]} districts to {OUTPUT_FILE}')
    log.info(f'Sources used: {output["sources_used"]}')
    log.info('Top 5 by opportunity score:')
    for d in output['districts'][:5]:
        log.info(f'  #{d["rank"]}  {d["district_name"]:40s}  score={d["opportunity_score"]}')

    return 0


if __name__ == '__main__':
    sys.exit(run())
