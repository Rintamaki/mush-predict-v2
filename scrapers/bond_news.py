"""
bond_news.py
Free, no API key required.

Pulls news coverage of Texas school district bond elections, capital
projects, and facility bonds from Google News RSS. Catches bond passes
within 24-48 hours of being announced.

This replaces the (broken) direct Bond Review Board scraper with a more
reliable signal: when a Texas district passes a meaningful bond for
facility work, local news outlets cover it within a day, and Google News
catches that coverage.

The output is bond opportunities — districts with passed bonds are prime
MUSH energy/HVAC pursuit targets 12-24 months out.
"""

import feedparser
import logging
import re
from datetime import datetime, timedelta
from dateutil import parser as dateparser

logger = logging.getLogger(__name__)

LOOKBACK_DAYS = 180  # 6 months — bonds stay relevant for ~24 months but news cycle is short

# Targeted queries — designed for high precision on bond passes
BOND_NEWS_QUERIES = [
    'Texas "ISD" bond passed approved',
    'Texas school district "bond election" results',
    'Texas school district "bond" million facility',
    'Texas ISD "bond proposition" voters approved',
    'Texas school "bond program" construction',
    '"bond passes" Texas school district',
]

# Keywords that strengthen MUSH/facility relevance
FACILITY_KEYWORDS = [
    'facility', 'facilities', 'hvac', 'mechanical', 'building',
    'renovation', 'modernization', 'new school', 'construction',
    'campus', 'classroom', 'infrastructure', 'technology',
    'energy', 'efficiency', 'retrofit',
]

# Keywords that indicate the bond actually passed (vs. just being proposed)
PASS_KEYWORDS = [
    'passed', 'passes', 'approved', 'approve', 'voters approved',
    'voters pass', 'green-light', 'green light', 'authorized',
    'wins approval', 'win approval',
]

# Patterns to extract dollar amounts in headlines/summaries
VALUE_PATTERNS = [
    r'\$\s?(\d+(?:\.\d+)?)\s?billion',
    r'\$\s?(\d+(?:,\d{3})*(?:\.\d+)?)\s?million',
    r'\$\s?(\d+(?:,\d{3})*)',
]

# District-name extraction
DISTRICT_PATTERN = re.compile(
    r'([A-Z][A-Za-z\.\-]+(?:\s+[A-Z][A-Za-z\.\-]+)*\s+(?:ISD|Independent School District))',
    re.UNICODE,
)


def _is_recent(date_str: str) -> bool:
    try:
        dt = dateparser.parse(date_str, ignoretz=True)
        return dt >= datetime.now() - timedelta(days=LOOKBACK_DAYS)
    except Exception:
        return True


def _bond_passed(text: str) -> bool:
    """Return True if the article suggests the bond was actually passed."""
    text_lower = text.lower()
    return any(kw in text_lower for kw in PASS_KEYWORDS)


def _has_facility_signal(text: str) -> bool:
    """Return True if the article mentions facility/MUSH-relevant work."""
    text_lower = text.lower()
    return any(kw in text_lower for kw in FACILITY_KEYWORDS)


def _extract_value(text: str) -> float:
    """Best-effort extraction of bond dollar amount from headline/summary."""
    text_lower = text.lower()
    for pattern in VALUE_PATTERNS:
        m = re.search(pattern, text_lower)
        if m:
            num = float(m.group(1).replace(',', ''))
            if 'billion' in pattern:
                return num * 1_000_000_000
            elif 'million' in pattern:
                return num * 1_000_000
            else:
                return num
    return 0


def _extract_district(text: str) -> str:
    """Best-effort extraction of district name from headline."""
    m = DISTRICT_PATTERN.search(text)
    if m:
        return m.group(1).strip()
    return ''


def _build_url(query: str) -> str:
    q_encoded = query.replace(' ', '+').replace('"', '%22')
    return f"https://news.google.com/rss/search?q={q_encoded}&hl=en-US&gl=US&ceid=US:en"


def fetch_bond_news() -> list[dict]:
    """
    Pull bond election news from Google News across multiple targeted queries.
    Returns bond opportunities — districts with passed bonds, ranked by recency.
    """
    bonds = []
    seen_titles = set()

    for query in BOND_NEWS_QUERIES:
        url = _build_url(query)
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:25]:
                title   = entry.get('title', '')
                summary = entry.get('summary', '')
                pub     = entry.get('published', '')
                link    = entry.get('link', '')
                text    = f"{title} {summary}"

                if not title or title.lower() in seen_titles:
                    continue
                if not _is_recent(pub):
                    continue

                # Must look like a passed bond AND have a facility/MUSH angle
                passed   = _bond_passed(text)
                facility = _has_facility_signal(text)
                if not passed:
                    continue   # skip proposals/pending bonds — we only want passed

                seen_titles.add(title.lower())

                district = _extract_district(text)
                value    = _extract_value(text)

                # Skip if we can't even identify the district
                if not district:
                    continue

                # Skip tiny bonds — facility work needs scale
                if value > 0 and value < 1_000_000:
                    continue

                bonds.append({
                    'id':          f"bond-news-{hash(title) % 100000}",
                    'title':       title[:180],
                    'agency':      district,
                    'type':        'Passed Bond Election',
                    'posted':      pub,
                    'deadline':    '',
                    'state':       'TX',
                    'value':       value,
                    'description': summary[:300],
                    'url':         link,
                    'source':      'Texas Bond News (Google News)',
                    'keyword_hit': 'bond passed',
                    'segment':     'Schools',
                    'facility_signal': facility,  # bonus flag if facility work mentioned
                })

        except Exception as e:
            logger.warning(f"Bond news fetch failed for query '{query}': {e}")

    # Sort by recency
    def _sort_key(b):
        try:
            return dateparser.parse(b['posted'], ignoretz=True)
        except Exception:
            return datetime.min

    bonds.sort(key=_sort_key, reverse=True)
    logger.info(f"  Bond News: {len(bonds)} recent Texas bond passes detected")
    return bonds
