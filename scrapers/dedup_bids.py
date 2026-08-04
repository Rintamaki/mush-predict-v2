"""
dedup_bids.py

ONE-TIME audit + cleanup for the duplicate open-bid problem (the
"SERVO,ELEVATION attached to every competitor" bug).

The old sam_gov.py attached the same generic federal bid to many competitors
because its keyword search was loose and it never verified the competitor was
actually named in the bid. The scraper is now fixed for NEW data, but bad
copies already sit in the accumulated files. This cleans them.

WHAT IT DOES:
  1. Scans competitors.json activeBids and signals.json bid signals.
  2. Groups bids by identity (normalized title + deadline).
  3. For any bid attached to MULTIPLE competitors, keeps it ONLY for the
     competitors whose name (or a known variant) actually appears in the
     bid title. Drops it everywhere it can't be verified.
  4. Also removes exact duplicate bids repeated under a SINGLE competitor.
  5. Prints a full audit report of what was found and what changed.

SAFETY:
  - Timestamped backups of both files before writing.
  - Prints the report BEFORE writing, so the log is a permanent record.
  - Never touches non-bid signals or any other competitor field.
"""

import json
import logging
import shutil
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('dedup')

DATA_DIR       = Path(__file__).parent.parent / 'mush-predict-package' / 'public' / 'data'
COMPETITORS    = DATA_DIR / 'competitors.json'
SIGNALS        = DATA_DIR / 'signals.json'

# How many competitors a single bid must touch before we treat it as suspect.
# A genuine bid rarely names 2+ of your tracked competitors, so 2 is a safe bar.
SUSPECT_THRESHOLD = 2


# ── Name verification (mirrors sam_gov.py) ───────────────────────────────────
def name_variants(competitor_name, usaspending_names=None):
    variants = [competitor_name.lower()]
    for v in (usaspending_names or []):
        variants.append(v.lower())
    first = competitor_name.split()[0].lower()
    if len(first) >= 5:
        variants.append(first)
    return variants


def mentions_competitor(text, competitor_name, usaspending_names=None):
    low = (text or '').lower()
    return any(v in low for v in name_variants(competitor_name, usaspending_names))


def bid_identity(bid):
    """A stable identity for a bid: normalized title + deadline."""
    title = (bid.get('title') or '').strip().lower()
    deadline = (bid.get('deadline') or bid.get('response_deadline') or '').strip()
    notice = (bid.get('notice_id') or '').strip()
    # Prefer notice_id when present (most precise), else title+deadline
    return notice if notice else f'{title}|{deadline}'


# ── Load competitor name variants from config if available ───────────────────
def load_name_map():
    """Try to read usaspending_names variants from scrapers/config.py so
    verification is as forgiving as the scraper. Falls back to just the name."""
    name_map = {}
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from config import COMPETITORS
        for c in COMPETITORS:
            name_map[c['name']] = c.get('usaspending_names', [])
        log.info(f'Loaded name variants for {len(name_map)} competitors from config.py')
    except Exception as e:
        log.warning(f'Could not load config.py name variants ({e}); using names only')
    return name_map


# ── Audit + clean competitors.json ───────────────────────────────────────────
def clean_competitors(name_map):
    if not COMPETITORS.exists():
        log.warning(f'{COMPETITORS} not found — skipping')
        return None

    with open(COMPETITORS) as f:
        data = json.load(f)

    competitors = data.get('competitors', [])

    # Map bid identity -> list of competitor names it's attached to
    bid_to_comps = defaultdict(list)
    for c in competitors:
        for b in (c.get('activeBids') or []):
            bid_to_comps[bid_identity(b)].append(c['name'])

    # Identify suspect bids (attached to 2+ competitors)
    suspects = {bid: comps for bid, comps in bid_to_comps.items() if len(comps) >= SUSPECT_THRESHOLD}

    log.info('=' * 60)
    log.info('COMPETITORS.JSON AUDIT')
    log.info('=' * 60)
    log.info(f'Total distinct bids: {len(bid_to_comps)}')
    log.info(f'Bids attached to {SUSPECT_THRESHOLD}+ competitors (suspect): {len(suspects)}')
    for bid, comps in sorted(suspects.items(), key=lambda x: -len(x[1]))[:15]:
        log.info(f'  "{bid[:60]}" → {len(comps)} competitors: {", ".join(comps[:6])}{"..." if len(comps) > 6 else ""}')

    # Clean: for each competitor, keep a bid only if verified OR the bid isn't suspect
    removed_total = 0
    dupe_within_removed = 0
    for c in competitors:
        bids = c.get('activeBids') or []
        seen_ids = set()
        kept = []
        for b in bids:
            ident = bid_identity(b)

            # Remove exact duplicate repeated under the same competitor
            if ident in seen_ids:
                dupe_within_removed += 1
                continue
            seen_ids.add(ident)

            # For suspect bids, require name verification
            if ident in suspects:
                text = f"{b.get('title','')} {b.get('description','')}"
                if mentions_competitor(text, c['name'], name_map.get(c['name'], [])):
                    kept.append(b)  # verified — keep
                else:
                    removed_total += 1  # unverified attachment — drop
            else:
                kept.append(b)  # not suspect — keep as-is
        c['activeBids'] = kept

    log.info(f'Removed {removed_total} unverified bid attachments')
    log.info(f'Removed {dupe_within_removed} exact duplicates within single competitors')

    return data, removed_total + dupe_within_removed


# ── Audit + clean signals.json ───────────────────────────────────────────────
def clean_signals(name_map):
    if not SIGNALS.exists():
        log.warning(f'{SIGNALS} not found — skipping')
        return None

    with open(SIGNALS) as f:
        signals = json.load(f)

    if not isinstance(signals, list):
        log.warning('signals.json is not an array — skipping')
        return None

    bid_signals = [s for s in signals if s.get('type') == 'bid']

    # identity -> companies
    bid_to_comps = defaultdict(list)
    for s in bid_signals:
        bid_to_comps[bid_identity(s)].append(s.get('company'))

    suspects = {bid: comps for bid, comps in bid_to_comps.items() if len(comps) >= SUSPECT_THRESHOLD}

    log.info('=' * 60)
    log.info('SIGNALS.JSON AUDIT')
    log.info('=' * 60)
    log.info(f'Total bid signals: {len(bid_signals)}')
    log.info(f'Distinct bids: {len(bid_to_comps)}')
    log.info(f'Bids attached to {SUSPECT_THRESHOLD}+ competitors (suspect): {len(suspects)}')

    # Rebuild the signals list
    kept = []
    removed = 0
    seen_company_bid = set()
    for s in signals:
        if s.get('type') != 'bid':
            kept.append(s)
            continue

        ident = bid_identity(s)
        company = s.get('company')
        cb_key = f'{company}|{ident}'

        # Remove exact duplicate (same company + same bid)
        if cb_key in seen_company_bid:
            removed += 1
            continue
        seen_company_bid.add(cb_key)

        # For suspect bids, require verification
        if ident in suspects:
            text = f"{s.get('title','')} {s.get('description','')}"
            if mentions_competitor(text, company, name_map.get(company, [])):
                kept.append(s)
            else:
                removed += 1
        else:
            kept.append(s)

    log.info(f'Removed {removed} duplicate / unverified bid signals')
    log.info(f'Signals: {len(signals)} → {len(kept)}')

    return kept, removed


# ── Main ─────────────────────────────────────────────────────────────────────
def run():
    log.info('Open-Bid Deduplication & Audit')
    name_map = load_name_map()

    stamp = datetime.utcnow().strftime('%Y%m%d-%H%M%S')

    # Competitors
    comp_result = clean_competitors(name_map)
    if comp_result:
        data, comp_removed = comp_result
        if comp_removed > 0:
            backup = COMPETITORS.with_suffix(f'.backup-dedup-{stamp}.json')
            shutil.copy(COMPETITORS, backup)
            with open(COMPETITORS, 'w') as f:
                json.dump(data, f, indent=2)
            log.info(f'✅ Wrote cleaned competitors.json (backup: {backup.name})')
        else:
            log.info('No changes needed in competitors.json')

    # Signals
    sig_result = clean_signals(name_map)
    if sig_result:
        kept, sig_removed = sig_result
        if sig_removed > 0:
            backup = SIGNALS.with_suffix(f'.backup-dedup-{stamp}.json')
            shutil.copy(SIGNALS, backup)
            with open(SIGNALS, 'w') as f:
                json.dump(kept, f, indent=2)
            log.info(f'✅ Wrote cleaned signals.json (backup: {backup.name})')
        else:
            log.info('No changes needed in signals.json')

    log.info('Done.')
    return 0


if __name__ == '__main__':
    sys.exit(run())
