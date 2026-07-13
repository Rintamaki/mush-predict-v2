"""
tx_district_finance.py

Scrapes TEA (Texas Education Agency) PEIMS financial data to identify
Texas school districts by their facility-related spending. Output goes
to mush-predict-package/public/data/tx_district_finance.json.

TEA publishes annual PEIMS data — actual expenditures by district,
categorized by "function code" per the TEA Financial Accountability
System Resource Guide.

FUNCTION CODES that matter for McKinstry work:
  51 = Plant Maintenance & Operations (HVAC, custodial, utilities)
  52 = Security & Monitoring Services
  81 = Facilities Acquisition & Construction (capital projects, bonds)

Data is annual (not real-time) and lags by 1-2 years, but tells you
which Texas ISDs are the biggest facility spenders — useful for
prioritizing pursuits and identifying where the money actually goes.
"""

import io
import json
import logging
import os
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('tea')

# ── Config ──────────────────────────────────────────────────────────────────
# Primary URL for the summarized xlsx. If TEA changes this URL, set
# TEA_XLSX_URL env var to override without editing code.
DEFAULT_XLSX_URL = (
    'https://tea.texas.gov/finance-and-grants/state-funding/'
    'state-funding-reports-and-data/summarized-peims-actual-financial-data.xlsx'
)

# Function codes we care about
FACILITY_FUNCTIONS = {
    '51': 'plant_maintenance',
    '52': 'security_monitoring',
    '81': 'facilities_construction',
}

# Keep only recent years to keep output small
YEARS_TO_KEEP = 3

OUTPUT_FILE = Path(__file__).parent.parent / 'mush-predict-package' / 'public' / 'data' / 'tx_district_finance.json'


# ── Data fetch ──────────────────────────────────────────────────────────────
def download_tea_data():
    """Download the TEA PEIMS xlsx. Returns file bytes or None on failure."""
    url = os.environ.get('TEA_XLSX_URL', DEFAULT_XLSX_URL)
    log.info(f'Downloading TEA PEIMS data from {url}')

    req = urllib.request.Request(url, headers={
        'User-Agent': 'mush-predict/1.0 (McKinstry public-sector research)',
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
            log.info(f'Downloaded {len(data)/1e6:.1f} MB')
            return data
    except Exception as e:
        log.error(f'TEA download failed: {e}')
        log.error(
            'The TEA URL may have changed. Set TEA_XLSX_URL env var to override, '
            'or check https://tea.texas.gov/reports-and-data/financial-reports for '
            'the current link to "Summarized PEIMS Actual Financial Data".'
        )
        return None


# ── Parse ───────────────────────────────────────────────────────────────────
def parse_tea_xlsx(data: bytes):
    """Parse the TEA xlsx into a district-level structure.

    TEA's summarized file has rows keyed by (district_id, district_name,
    year, function_code, ...) with actual expenditure amounts. We
    aggregate to district-level totals for the facility functions.

    Returns a dict: {district_id: {'name': ..., 'years': {year: {func: amount}}}}
    """
    try:
        import openpyxl
    except ImportError:
        log.error('openpyxl not installed — add openpyxl to requirements.txt')
        return None

    log.info('Parsing xlsx (this takes ~1 min for a 19MB file)…')
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb.active
    log.info(f'Opened workbook: sheet "{ws.title}"')

    # Discover column layout from header row
    header = [str(c.value).strip() if c.value else '' for c in next(ws.iter_rows(min_row=1, max_row=1))]
    log.info(f'Detected columns: {header[:12]}…')

    # Find the columns we need. TEA uses a few naming conventions across
    # years — we try multiple candidates for each column.
    def find_col(candidates):
        low_hdr = [h.lower() for h in header]
        for name in candidates:
            for i, h in enumerate(low_hdr):
                if name in h:
                    return i
        return None

    col_dist_id     = find_col(['district id', 'district-id', 'district number', 'cdn'])
    col_dist_name   = find_col(['district name', 'district-name'])
    col_year        = find_col(['school year', 'year'])
    col_function    = find_col(['function-code', 'function code', 'function'])
    col_amount      = find_col(['actual-amount', 'actual amount', 'amount', 'total'])

    if None in (col_dist_id, col_dist_name, col_year, col_function, col_amount):
        log.error(f'Could not locate all required columns in the TEA xlsx.')
        log.error(f'Column indices found: dist_id={col_dist_id}, dist_name={col_dist_name}, year={col_year}, function={col_function}, amount={col_amount}')
        log.error(f'Available columns: {header}')
        return None

    log.info(f'Column mapping: dist_id={col_dist_id}, dist_name={col_dist_name}, year={col_year}, function={col_function}, amount={col_amount}')

    # Aggregate — for each district, year, function code, sum the amount
    districts = defaultdict(lambda: {'name': '', 'years': defaultdict(lambda: defaultdict(float))})
    row_count = 0

    for row in ws.iter_rows(min_row=2, values_only=True):
        row_count += 1
        if row_count % 100000 == 0:
            log.info(f'  Processed {row_count:,} rows…')

        try:
            dist_id   = str(row[col_dist_id]).strip() if row[col_dist_id] else ''
            dist_name = str(row[col_dist_name]).strip() if row[col_dist_name] else ''
            year      = str(row[col_year]).strip() if row[col_year] else ''
            function  = str(row[col_function]).strip().zfill(2) if row[col_function] else ''
            amount    = float(row[col_amount]) if row[col_amount] else 0.0
        except (ValueError, TypeError, IndexError):
            continue

        if not dist_id or not year or function not in FACILITY_FUNCTIONS:
            continue

        # Extract just the "2024" from "2024-2025" for easier sorting
        year_short = year[:9] if len(year) >= 9 else year

        d = districts[dist_id]
        if not d['name']:
            d['name'] = dist_name
        d['years'][year_short][FACILITY_FUNCTIONS[function]] += amount

    log.info(f'Parsed {row_count:,} rows into {len(districts)} districts')
    return dict(districts)


# ── Build output ────────────────────────────────────────────────────────────
def build_output(districts_data):
    """Convert the aggregated dict into a clean, ranked JSON structure."""
    if not districts_data:
        return None

    # Discover the years present in the data, keep the newest N
    all_years = set()
    for d in districts_data.values():
        all_years.update(d['years'].keys())
    sorted_years = sorted(all_years, reverse=True)[:YEARS_TO_KEEP]
    log.info(f'Keeping years: {sorted_years}')

    # Build district records
    records = []
    for dist_id, d in districts_data.items():
        if not d['name']:
            continue

        history = []
        for y in sorted(sorted_years):
            year_data = d['years'].get(y, {})
            if not year_data:
                continue
            history.append({
                'year': y,
                'plant_maintenance':      round(year_data.get('plant_maintenance',      0), 0),
                'security_monitoring':    round(year_data.get('security_monitoring',    0), 0),
                'facilities_construction': round(year_data.get('facilities_construction', 0), 0),
            })

        if not history:
            continue

        # Latest year's spending
        latest = history[-1]
        total_facility = (
            latest['plant_maintenance'] +
            latest['security_monitoring'] +
            latest['facilities_construction']
        )
        if total_facility < 100000:  # skip micro-districts (< $100K total facility spend)
            continue

        records.append({
            'district_id':   dist_id,
            'district_name': d['name'],
            'latest_year':   latest['year'],
            'spending':      {**latest, 'total_facility': total_facility},
            'history':       history,
        })

    # Sort by latest total facility spend, descending
    records.sort(key=lambda r: r['spending']['total_facility'], reverse=True)

    # Rank
    for i, r in enumerate(records):
        r['rank'] = i + 1

    output = {
        'generated_at':   datetime.utcnow().isoformat() + 'Z',
        'source':         'Texas Education Agency PEIMS Summarized Actual Financial Data',
        'source_url':     'https://tea.texas.gov/finance-and-grants/state-funding/state-funding-reports-and-data/peims-financial-data-downloads',
        'years_included': sorted_years,
        'notes': (
            'Annual actual expenditures per Texas ISD. Data is 1-2 years behind current. '
            'Function 51 = Plant Maintenance & Operations. Function 52 = Security. '
            'Function 81 = Facilities Acquisition & Construction (capital/bond spend).'
        ),
        'district_count': len(records),
        'districts':      records,
    }
    return output


# ── Main ────────────────────────────────────────────────────────────────────
def run():
    log.info('=' * 60)
    log.info('TEA District Finance Scraper')
    log.info('=' * 60)

    raw = download_tea_data()
    if not raw:
        log.error('Aborting — no data downloaded')
        return 1

    districts = parse_tea_xlsx(raw)
    if not districts:
        log.error('Aborting — could not parse TEA data')
        return 1

    output = build_output(districts)
    if not output:
        log.error('Aborting — no output records built')
        return 1

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    top5 = output['districts'][:5]
    log.info(f'✅ Wrote {output["district_count"]} districts to {OUTPUT_FILE}')
    log.info('Top 5 by facility spend (latest year):')
    for r in top5:
        log.info(f'  #{r["rank"]}  {r["district_name"]:40s}  ${r["spending"]["total_facility"]/1e6:,.1f}M')

    return 0


if __name__ == '__main__':
    sys.exit(run())
