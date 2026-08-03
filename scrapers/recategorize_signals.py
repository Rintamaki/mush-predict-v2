"""
recategorize_signals.py

ONE-TIME cleanup script. Reads the existing accumulated signals.json,
re-infers the MUSH segment for each signal from its title text using the
same keyword logic the pipeline scrapers now use, and writes the file back.

WHAT IT FIXES:
Older signals were tagged segment="Other" because early versions of the
scrapers didn't infer segment. This re-scans every signal's title and
upgrades "Other" to a real segment (Schools / Healthcare / University /
Municipal) wherever the text makes it clear.

WHAT IT CAN'T FIX:
Signals whose titles genuinely contain no segment clue (e.g. "Regional
Sales Manager", "Q3 Earnings Call") stay "Other" — there's nothing to
infer from. That's correct, not a failure.

SAFETY:
- Only CHANGES a signal's segment when it can confidently infer one.
- Never downgrades a signal that already has a real segment to "Other".
- Makes a timestamped backup of the original file before writing.
- Prints a summary of exactly what changed.

HOW TO RUN:
Add a manual-trigger GitHub Actions workflow (or a step) that runs:
    python scrapers/recategorize_signals.py
Then commit/upload the updated signals.json (the workflow can reuse the
same GitHub-API upload pattern used elsewhere).
"""

import json
import logging
import shutil
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('recategorize')

SIGNALS_FILE = Path(__file__).parent.parent / 'mush-predict-package' / 'public' / 'data' / 'signals.json'

# ── Segment inference keywords ────────────────────────────────────────────────
# Ordered by specificity — more specific segments checked first so, e.g.,
# "university hospital" lands on Healthcare only if healthcare terms are
# stronger. In practice each title usually only hits one bucket.
SEGMENT_KEYWORDS = {
    "Schools": [
        "school district", "isd", "independent school", "k-12", "k12",
        "elementary school", "middle school", "high school", "public schools",
        "school board", "board of trustees", "cisd",  # consolidated ISD
    ],
    "University": [
        "university", "college", "campus", "higher education",
        "community college", "state college", "polytechnic",
    ],
    "Healthcare": [
        "hospital", "medical center", "health system", "clinic",
        "healthcare", "health care", "va medical", "medical district",
        "children's health", "regional medical",
    ],
    "Municipal": [
        "city of", "county of", "municipal", "town of", "township",
        "public works", "courthouse", "city hall", "county commissioners",
        "water district", "utility district", "mud ",  # municipal utility district
    ],
}


def infer_segment(title: str) -> str:
    """Infer a MUSH segment from title text; return 'Other' if none match."""
    if not title:
        return "Other"
    low = title.lower()
    # Check each segment; return the first that matches
    for segment, kws in SEGMENT_KEYWORDS.items():
        if any(kw in low for kw in kws):
            return segment
    return "Other"


def run():
    log.info('=' * 60)
    log.info('Signal Re-categorization (one-time cleanup)')
    log.info('=' * 60)

    if not SIGNALS_FILE.exists():
        log.error(f'signals.json not found at {SIGNALS_FILE}')
        return 1

    with open(SIGNALS_FILE) as f:
        signals = json.load(f)

    if not isinstance(signals, list):
        log.error('signals.json is not a JSON array — aborting')
        return 1

    log.info(f'Loaded {len(signals)} signals')

    # Backup first
    backup = SIGNALS_FILE.with_suffix(
        f'.backup-{datetime.utcnow().strftime("%Y%m%d-%H%M%S")}.json'
    )
    shutil.copy(SIGNALS_FILE, backup)
    log.info(f'Backup written to {backup.name}')

    # Count before
    before_counts = Counter(s.get('segment', 'Other') or 'Other' for s in signals)
    log.info(f'Before: {dict(before_counts)}')

    changed = 0
    changes_by_type = Counter()

    for s in signals:
        current = s.get('segment', 'Other') or 'Other'
        # Only try to upgrade signals currently tagged "Other" — never
        # overwrite a real segment that a scraper already assigned.
        if current != 'Other':
            continue
        inferred = infer_segment(s.get('title', ''))
        if inferred != 'Other':
            s['segment'] = inferred
            changed += 1
            changes_by_type[s.get('type', 'unknown')] += 1

    # Count after
    after_counts = Counter(s.get('segment', 'Other') or 'Other' for s in signals)

    with open(SIGNALS_FILE, 'w') as f:
        json.dump(signals, f, indent=2)

    log.info('-' * 60)
    log.info(f'✅ Re-categorized {changed} signals from "Other" to a real segment')
    log.info(f'After:  {dict(after_counts)}')
    if changes_by_type:
        log.info(f'Changes by signal type: {dict(changes_by_type)}')
    remaining_other = after_counts.get('Other', 0)
    log.info(f'Still "Other" (no segment clue in title): {remaining_other}')
    log.info('-' * 60)
    log.info(f'Wrote updated signals.json. Backup preserved as {backup.name}')

    return 0


if __name__ == '__main__':
    sys.exit(run())
