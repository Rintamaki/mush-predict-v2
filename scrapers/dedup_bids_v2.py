"""
dedup_bids_v2.py

Smart open-bid deduplication that fixes the "one generic bid attached to
every competitor" problem (the SERVO,ELEVATION bug) WITHOUT nuking
legitimate bids.

DESIGN (non-circular by construction):
  This script never uses model predictions or scores to decide attribution
  (that would be circular — predictions feeding the data that feeds
  predictions). It uses only:
    - Objective bid content (keywords in title/agency)
    - Static competitor profile facts from config.py (office states, served
      segments) — fixed inputs, never model outputs

  TWO FILTERS applied to bids attached to 2+ competitors:

  FILTER 1 — Relevance:
    A bid with no facility/energy/MUSH keyword at all is junk (SERVO,ELEVATION
    is an elevator servo part — zero facility relevance). Removed from
    EVERYONE. This objective filter kills most of the duplicate problem.

  FILTER 2 — Geographic + segment plausibility:
    A relevant but over-attached bid is kept for a competitor only if that
    competitor's STATIC profile makes it plausible: they have an office in
    (or in the same region as) the bid's state, AND the bid's inferred
    segment is one they publicly serve. Uses config.py only — not circular.

  SAFETY CAP:
    If a relevant bid is STILL attached to more than MAX_PLAUSIBLE
    competitors after filtering, it's too generic to attribute to anyone —
    removed from all (kept out of per-competitor signals; it's a market
    opportunity, not a competitor signal).

SAFETY / PROCESS:
  - DRY-RUN BY DEFAULT. Writes nothing unless run with --apply. Prints a full
    report of what it WOULD remove so you can review first.
  - When --apply is used, commits backup copies of both files to the repo
    (the workflow uploads them), so a real restore point exists.
  - Only touches bid data. Every other signal type is untouched.
"""

import argparse
import json
import logging
import shutil
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('dedup2')

DATA_DIR    = Path(__file__).parent.parent / 'mush-predict-package' / 'public' / 'data'
COMPETITORS = DATA_DIR / 'competitors.json'
SIGNALS     = DATA_DIR / 'signals.json'

# A bid attached to more than this many competitors AFTER plausibility
# filtering is treated as too-generic and removed from all.
MAX_PLAUSIBLE = 4

# ── Relevance keywords (Filter 1) ─────────────────────────────────────────────
RELEVANCE_KEYWORDS = [
    'hvac', 'chiller', 'boiler', 'energy', 'espc', 'performance contract',
    'building automation', 'controls', 'mechanical', 'electrical', 'lighting',
    'solar', 'retrofit', 'modernization', 'facility', 'facilities',
    'central plant', 'utility', 'utilities', 'renovation', 'construction',
    'maintenance', 'roofing', 'roof', 'plumbing', 'generator', 'boiler',
    'air handler', 'commissioning', 'weatherization', 'infrastructure',
]

# ── Segment inference (Filter 2) ──────────────────────────────────────────────
SEGMENT_KEYWORDS = {
    'Schools':    ['school district', 'isd', 'independent school', 'k-12', 'k12',
                   'elementary', 'middle school', 'high school', 'public schools'],
    'University': ['university', 'college', 'campus', 'higher education', 'community college'],
    'Healthcare': ['hospital', 'medical center', 'health system', 'clinic', 'healthcare',
                   'va medical', 'veterans affairs medical'],
    'Municipal':  ['city of', 'county of', 'municipal', 'town of', 'township',
                   'public works', 'courthouse', 'city hall'],
}

# Region grouping so "near" counts, not just exact-state
STATE_REGIONS = {
    'PNW':        ['WA', 'OR', 'ID', 'MT', 'AK'],
    'TX_SOUTH':   ['TX', 'OK', 'LA', 'AR', 'NM'],
    'CALIFORNIA': ['CA', 'NV', 'AZ', 'HI'],
    'MIDWEST':    ['IL', 'IN', 'OH', 'MI', 'WI', 'MN', 'IA', 'MO', 'KS', 'NE', 'SD', 'ND'],
    'NORTHEAST':  ['NY', 'NJ', 'PA', 'MA', 'CT', 'RI', 'NH', 'VT', 'ME'],
    'SOUTHEAST':  ['FL', 'GA', 'SC', 'NC', 'VA', 'WV', 'KY', 'TN', 'AL', 'MS'],
    'MOUNTAIN':   ['CO', 'UT', 'WY'],
}


def region_of(state):
    if not state:
        return None
    s = state.upper()
    for region, states in STATE_REGIONS.items():
        if s in states:
            return region
    return None


def is_relevant(text):
    low = (text or '').lower()
    return any(kw in low for kw in RELEVANCE_KEYWORDS)


def infer_segment(text):
    low = (text or '').lower()
    for seg, kws in SEGMENT_KEYWORDS.items():
        if any(kw in low for kw in kws):
            return seg
    return None  # unknown segment — don't use segment as a filter then


# ── Load static competitor profiles from config.py ────────────────────────────
def load_profiles():
    """Return {name: {'states': set, 'regions': set, 'segments': set}} from config."""
    profiles = {}
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from config import COMPETITORS as CONF
        for c in CONF:
            states = set()
            for o in c.get('offices', []):
                st = (o.get('state') or '').upper()
                if st:
                    states.add(st)
            regions = {region_of(s) for s in states if region_of(s)}
            segments = set(c.get('segments', []))
            profiles[c['name']] = {'states': states, 'regions': regions, 'segments': segments}
        log.info(f'Loaded static profiles for {len(profiles)} competitors from config.py')
    except Exception as e:
        log.warning(f'Could not load config.py ({e}). Plausibility filter will be '
                    f'permissive (keeps all relevant bids under the cap).')
    return profiles


def is_plausible(bid_state, bid_segment, profile):
    """Static, non-circular plausibility: geography AND segment must fit."""
    if not profile:
        return True  # no profile data -> don't over-prune, rely on relevance + cap

    # Geography: same state, or same region (near). If bid has no state, skip geo test.
    geo_ok = True
    if bid_state:
        st = bid_state.upper()
        geo_ok = st in profile['states'] or region_of(st) in profile['regions']

    # Segment: if we could infer one, it must be served. If unknown, skip segment test.
    seg_ok = True
    if bid_segment and profile['segments']:
        seg_ok = bid_segment in profile['segments']

    return geo_ok and seg_ok


def bid_key(bid):
    title = (bid.get('title') or '').strip().lower()
    deadline = (bid.get('deadline') or '').strip()
    return f'{title}|{deadline}'


# ── Core audit logic (shared by competitors.json and signals.json) ────────────
def audit_attachments(attachments, profiles):
    """
    attachments: dict of bid_key -> list of (owner_name, bid_obj, container_ref)
    Returns a decision per (bid_key, owner): 'keep' or a removal reason.
    """
    decisions = {}  # (bid_key, idx) -> ('keep'|'remove', reason)
    report = {'irrelevant': [], 'implausible': [], 'over_cap': [], 'kept_multi': []}

    for k, owners in attachments.items():
        n = len(owners)
        # Only scrutinize bids attached to 2+ owners
        if n < 2:
            for i, (name, bid, ref) in enumerate(owners):
                decisions[(k, i)] = ('keep', 'unique')
            continue

        sample_bid = owners[0][1]
        text = f"{sample_bid.get('title','')} {sample_bid.get('agency','')}"

        # FILTER 1 — relevance
        if not is_relevant(text):
            for i, (name, bid, ref) in enumerate(owners):
                decisions[(k, i)] = ('remove', 'irrelevant')
            report['irrelevant'].append((k, n))
            continue

        # FILTER 2 — geographic + segment plausibility
        seg = infer_segment(text)
        state = sample_bid.get('state')
        plausible_idx = []
        for i, (name, bid, ref) in enumerate(owners):
            if is_plausible(bid.get('state', state), seg, profiles.get(name)):
                plausible_idx.append(i)

        # SAFETY CAP — still too many after plausibility => too generic
        if len(plausible_idx) > MAX_PLAUSIBLE:
            for i, (name, bid, ref) in enumerate(owners):
                decisions[(k, i)] = ('remove', 'over_cap')
            report['over_cap'].append((k, len(plausible_idx)))
            continue

        # Otherwise: keep the plausible ones, remove the rest
        kept_names = []
        for i, (name, bid, ref) in enumerate(owners):
            if i in plausible_idx:
                decisions[(k, i)] = ('keep', 'plausible')
                kept_names.append(name)
            else:
                decisions[(k, i)] = ('remove', 'implausible')
                report['implausible'].append((k, name))
        if kept_names:
            report['kept_multi'].append((k, kept_names))

    return decisions, report


# ── competitors.json ──────────────────────────────────────────────────────────
def process_competitors(profiles, apply):
    if not COMPETITORS.exists():
        log.warning(f'{COMPETITORS} not found — skipping')
        return
    with open(COMPETITORS) as f:
        data = json.load(f)
    competitors = data.get('competitors', [])

    # Build attachments: bid_key -> [(comp_name, bid_obj, comp_index)]
    attachments = defaultdict(list)
    for ci, c in enumerate(competitors):
        for b in (c.get('activeBids') or []):
            attachments[bid_key(b)].append((c['name'], b, ci))

    decisions, report = audit_attachments(attachments, profiles)

    total_before = sum(len(c.get('activeBids') or []) for c in competitors)

    # Apply decisions
    removed = 0
    if apply:
        for ci, c in enumerate(competitors):
            new_bids = []
            seen = set()
            # recompute per-competitor keeping decisions
            idx_by_key = defaultdict(int)
            for b in (c.get('activeBids') or []):
                k = bid_key(b)
                # find this owner's index within the attachment list
                owners = attachments[k]
                my_i = next((i for i,(nm,bb,cc) in enumerate(owners) if cc == ci and bb is b), None)
                decision = decisions.get((k, my_i), ('keep', 'unique'))[0] if my_i is not None else 'keep'
                # also drop exact repeats within the same competitor
                if k in seen:
                    removed += 1
                    continue
                if decision == 'keep':
                    new_bids.append(b)
                    seen.add(k)
                else:
                    removed += 1
            c['activeBids'] = new_bids

    _print_report('competitors.json', report, total_before, removed, apply)

    if apply:
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
        backup = COMPETITORS.with_suffix(f'.backup-dedup2-{stamp}.json')
        shutil.copy(COMPETITORS, backup)
        with open(COMPETITORS, 'w') as f:
            json.dump(data, f, indent=2)
        log.info(f'[competitors.json] APPLIED. Backup: {backup.name}')


# ── signals.json ──────────────────────────────────────────────────────────────
def process_signals(profiles, apply):
    if not SIGNALS.exists():
        log.warning(f'{SIGNALS} not found — skipping')
        return
    with open(SIGNALS) as f:
        signals = json.load(f)
    if not isinstance(signals, list):
        log.error('signals.json is not an array — skipping')
        return

    bid_signals = [s for s in signals if s.get('type') == 'bid']
    other = [s for s in signals if s.get('type') != 'bid']

    attachments = defaultdict(list)
    for si, s in enumerate(bid_signals):
        attachments[bid_key(s)].append((s.get('company'), s, si))

    decisions, report = audit_attachments(attachments, profiles)

    removed = 0
    kept_signals = []
    if apply:
        seen = set()
        for si, s in enumerate(bid_signals):
            k = bid_key(s)
            owners = attachments[k]
            my_i = next((i for i,(nm,bb,cc) in enumerate(owners) if cc == si and bb is s), None)
            decision = decisions.get((k, my_i), ('keep', 'unique'))[0] if my_i is not None else 'keep'
            dedupe_key = f'{k}|{s.get("company")}'
            if dedupe_key in seen:
                removed += 1
                continue
            if decision == 'keep':
                kept_signals.append(s)
                seen.add(dedupe_key)
            else:
                removed += 1

    _print_report('signals.json', report, len(bid_signals), removed, apply)

    if apply:
        new_signals = other + kept_signals
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
        backup = SIGNALS.with_suffix(f'.backup-dedup2-{stamp}.json')
        shutil.copy(SIGNALS, backup)
        with open(SIGNALS, 'w') as f:
            json.dump(new_signals, f, indent=2)
        log.info(f'[signals.json] APPLIED. {len(signals)} -> {len(new_signals)} signals. Backup: {backup.name}')


def _print_report(label, report, total_before, removed, apply):
    log.info('=' * 60)
    log.info(f'{label} — {"APPLY" if apply else "DRY RUN (no changes written)"}')
    log.info('=' * 60)
    log.info(f'  Bids/attachments before: {total_before}')
    log.info(f'  Irrelevant bids (removed from everyone): {len(report["irrelevant"])}')
    for k, n in report['irrelevant'][:8]:
        log.info(f'      "{k.split("|")[0][:55]}"  (was on {n} competitors)')
    log.info(f'  Over-cap generic bids (removed from all): {len(report["over_cap"])}')
    for k, n in report['over_cap'][:8]:
        log.info(f'      "{k.split("|")[0][:55]}"  (still {n} after plausibility)')
    log.info(f'  Implausible attachments trimmed: {len(report["implausible"])}')
    log.info(f'  Bids narrowed to plausible competitors: {len(report["kept_multi"])}')
    for k, names in report['kept_multi'][:8]:
        log.info(f'      "{k.split("|")[0][:45]}" -> kept for: {", ".join(names)}')
    if apply:
        log.info(f'  >>> Removed {removed} attachments total')
    else:
        log.info(f'  >>> DRY RUN: nothing written. Re-run with --apply to make these changes.')


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true',
                        help='Actually write changes. Without this, dry-run only.')
    args = parser.parse_args()

    log.info('#' * 60)
    log.info(f'# Smart Bid Dedup v2 — {"APPLY MODE" if args.apply else "DRY-RUN MODE"}')
    log.info('#' * 60)

    profiles = load_profiles()
    process_competitors(profiles, args.apply)
    process_signals(profiles, args.apply)

    log.info('')
    if not args.apply:
        log.info('Review the report above. If it looks right, re-run with --apply.')
    else:
        log.info('Changes applied. Backups committed alongside. Verify the dashboard.')
    return 0


if __name__ == '__main__':
    sys.exit(run())
