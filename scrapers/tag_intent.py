"""
tag_intent.py

ONE-TIME (and re-runnable) script that adds an `intent` field to every job
signal in signals.json, classifying it as Pursuit / Delivery / Leadership
based on the job title.

Only touches signals where type == 'job'. All other signal types are left
completely untouched. Safe to run repeatedly.

Makes a timestamped backup before writing.
"""

import json
import logging
import shutil
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from intent_classifier import classify_intent

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('tag-intent')

SIGNALS_FILE = Path(__file__).parent.parent / 'mush-predict-package' / 'public' / 'data' / 'signals.json'


def run():
    log.info('=' * 60)
    log.info('Job Intent Tagging')
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

    job_count = sum(1 for s in signals if s.get('type') == 'job')
    log.info(f'Of those, {job_count} are job signals')

    # Backup
    backup = SIGNALS_FILE.with_suffix(
        f'.backup-intent-{datetime.utcnow().strftime("%Y%m%d-%H%M%S")}.json'
    )
    shutil.copy(SIGNALS_FILE, backup)
    log.info(f'Backup written to {backup.name}')

    intent_counts = Counter()
    tagged = 0

    for s in signals:
        if s.get('type') != 'job':
            continue
        intent = classify_intent(s.get('title', ''))
        s['intent'] = intent  # may be '' (unknown) — that's fine
        if intent:
            tagged += 1
            intent_counts[intent] += 1
        else:
            intent_counts['(unknown)'] += 1

    with open(SIGNALS_FILE, 'w') as f:
        json.dump(signals, f, indent=2)

    log.info('-' * 60)
    log.info(f'✅ Tagged {tagged} of {job_count} job signals with a clear intent')
    log.info(f'Intent breakdown: {dict(intent_counts)}')
    log.info(f'Backup preserved as {backup.name}')
    log.info('-' * 60)

    return 0


if __name__ == '__main__':
    sys.exit(run())
