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

    NOTE: this file is broken down by district/year/ETHNICITY subgroup —
    each row is a partial count, not the district total. We must sum all
    ethnicity rows for a given district+year before computing any trend.
    """
    path = DATA_DIR / 'enrollment-data.csv'
    rows, fieldnames = load_csv_with_diagnostics(path, 'Enrollment')
    if rows is None:
        return {}

    col_name = find_col(fieldnames, ['district name'])
    col_year = find_col(fieldnames, ['year'])
    col_enroll = find_col(fieldnames, ['enrollment'])

    if not all([col_name, col_year, col_enroll]):
        log.error(f'[Enrollment] Could not find required columns. '
                  f'name={col_name}, year={col_year}, enrollment={col_enroll}')
        log.error(f'[Enrollment] Available columns: {fieldnames}')
        return {}

    # Sum across ethnicity subgroups: key is (district_key, year)
    by_district_year = defaultdict(lambda: {'total': 0.0, 'name': ''})
    for row in rows:
        try:
            name = row[col_name].strip()
            year = row[col_year].strip()
            enrollment = float(str(row[col_enroll]).replace(',', '') or 0)
        except (ValueError, AttributeError, KeyError):
            continue
        if not name:
            continue
        key = (normalize_district_name(name), year)
        by_district_year[key]['total'] += enrollment
        by_district_year[key]['name'] = name

    # Now build a per-district time series from the summed year totals
    by_district = defaultdict(list)
    for (district_key, year), data in by_district_year.items():
        by_district[district_key].append((year, data['total'], data['name']))

    result = {}
    for key, records in by_district.items():
        records.sort(key=lambda r: r[0])  # sort by year
        values = [r[1] for r in records]
        result[key] = {
            'district_name':             records[-1][2],
            'latest_enrollment':         values[-1],
            'enrollment_growth_score':   compute_enrollment_trend(values),
        }
    log.info(f'[Enrollment] Parsed {len(result)} districts (summed across ethnicity subgroups)')
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

    NOTE: the file you have is a narrower report on Capital Appreciation
    Bonds (CABs) specifically — columns are GovernmentName,
    CABPrincipalOutstanding, CABInterestOutstanding, CABDebtService. This
    is real data but only covers CAB-type debt, not a district's total
    outstanding debt or assessed valuation. Without valuation, we can't
    compute a true debt-to-valuation capacity ratio — so this produces a
    much rougher score based on CAB principal alone (lower CAB debt =
    higher rough "capacity" score). If you can find BRB's general debt
    search results with total debt + assessed valuation, that would
    produce a much more meaningful score — this is a placeholder using
    what's actually available.
    """
    path = DATA_DIR / 'bond_debt.csv'
    rows, fieldnames = load_csv_with_diagnostics(path, 'Bond Debt')
    if rows is None:
        return {}

    col_name = find_col(fieldnames, ['governmentname', 'entity name', 'district name'])
    col_debt = find_col(fieldnames, ['cabprincipaloutstanding', 'debt outstanding', 'total debt'])

    if not all([col_name, col_debt]):
        log.error(f'[Bond Debt] Could not find required columns. name={col_name}, debt={col_debt}')
        log.error(f'[Bond Debt] Available columns: {fieldnames}')
        return {}

    log.info(f'[Bond Debt] Using CAB-principal-only data (no valuation available) — rough capacity proxy only')

    debts = []
    result_raw = {}
    for row in rows:
        try:
            name = row[col_name].strip()
            debt = float(str(row[col_debt]).replace(',', '').replace('$', '') or 0)
        except (ValueError, AttributeError, KeyError):
            continue
        if not name:
            continue
        result_raw[normalize_district_name(name)] = {'district_name': name, 'debt_outstanding': debt}
        debts.append(debt)

    if not debts:
        return {}

    # Without valuation, rank districts by CAB debt relative to the range
    # seen in this file — inverted so lower debt = higher capacity score.
    # This is a rough proxy, clearly labeled as such in the notes field.
    max_debt = max(debts) or 1
    result = {}
    for key, data in result_raw.items():
        capacity_score = round(100 - (data['debt_outstanding'] / max_debt * 100))
        result[key] = {
            'district_name':       data['district_name'],
            'debt_outstanding':    data['debt_outstanding'],
            'assessed_valuation':  None,
            'debt_capacity_score': capacity_score,
        }
    log.info(f'[Bond Debt] Parsed {len(result)} districts (CAB-only, rough relative scoring)')
    return result


# ── Source 4: TX Bond Elections ──────────────────────────────────────────────
def load_bond_elections_data():
    """
    Download from: https://debtsearch.brb.texas.gov/bond_elections_search.aspx
    Save results as CSV to: scrapers/tea_data/bond_elections.csv

    NOTE: this file has NO header row — first line is already data. Based
    on the observed column order:
      [0] District name       (e.g. "Liberty Hill ISD")
      [1] Entity type          (e.g. "ISD")
      [2] County                (e.g. "Williamson")
      [3] Election date         (e.g. "5/7/2016")
      [4] Proposition number
      [5] Outcome               (e.g. "Carried" / "Failed")
      [6] Amount                (e.g. "35000000.0000")
      [7] Category              (e.g. "Building")
      [8] Description
      [9] Votes for
      [10] Votes against
    If BRB changes their export format, these indices will need updating —
    check the logged sample row if this stops matching.
    """
    path = DATA_DIR / 'bond_elections.csv'
    if not path.exists():
        log.warning(f'[Bond Elections] File not found: {path} — skipping this data source')
        return {}

    log.info(f'[Bond Elections] Reading {path} ({path.stat().st_size / 1e6:.1f} MB)')
    with open(path, 'r', encoding='utf-8-sig', errors='ignore') as f:
        reader = csv.reader(f)
        raw_rows = list(reader)

    log.info(f'[Bond Elections] {len(raw_rows)} rows. Sample first row: {raw_rows[0] if raw_rows else "EMPTY"}')

    IDX_NAME, IDX_DATE, IDX_OUTCOME, IDX_AMOUNT = 0, 3, 5, 6

    by_district = defaultdict(list)
    skipped = 0
    for row in raw_rows:
        if len(row) <= max(IDX_NAME, IDX_DATE, IDX_OUTCOME, IDX_AMOUNT):
            skipped += 1
            continue
        try:
            name = row[IDX_NAME].strip()
            date = row[IDX_DATE].strip()
            outcome = row[IDX_OUTCOME].strip()
            amount = float(row[IDX_AMOUNT].replace(',', '').replace('$', '') or 0)
        except (ValueError, IndexError):
            skipped += 1
            continue
        if not name or not date:
            skipped += 1
            continue
        by_district[normalize_district_name(name)].append({
            'date': date, 'amount': amount, 'outcome': outcome, 'name': name,
        })

    if skipped:
        log.info(f'[Bond Elections] Skipped {skipped} malformed rows')

    result = {}
    for key, elections in by_district.items():
        elections.sort(key=lambda e: e['date'], reverse=True)
        passed = [e for e in elections if 'carr' in e['outcome'].lower() or 'pass' in e['outcome'].lower() or 'approve' in e['outcome'].lower()]
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
