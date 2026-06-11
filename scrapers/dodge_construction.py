"""
dodge_construction.py
Scrapes publicly available construction project data from:
1. Dodge Data construction news RSS feed (free)
2. ENR (Engineering News-Record) RSS feed (free)
3. Construction Dive RSS feed (free)

New hospital, school, university, or municipal building construction
= guaranteed energy/HVAC opportunity 12-24 months out.
Full Dodge Data API requires paid subscription; this uses their
free RSS news feed plus ENR and Construction Dive as supplements.
"""

import feedparser
import logging
from datetime import datetime, timedelta
from dateutil import parser as dateparser

logger = logging.getLogger(__name__)

LOOKBACK_DAYS = 30

# Free RSS feeds covering construction project announcements
CONSTRUCTION_FEEDS = [
    {
        "name":   "Dodge Data",
        "url":    "https://www.probuilder.com/rss.xml",
        "source": "Dodge/ProBuilder",
    },
    {
        "name":   "ENR",
        "url":    "https://www.enr.com/rss/news",
        "source": "ENR",
    },
    {
        "name":   "Construction Dive",
        "url":    "https://www.constructiondive.com/feeds/news/",
        "source": "Construction Dive",
    },
    {
        "name":   "Building Design+Construction",
        "url":    "https://www.bdcnetwork.com/rss.xml",
        "source": "BD+C",
    },
]

# Keywords indicating MUSH construction projects
MUSH_CONSTRUCTION_KEYWORDS = [
    "school", "k-12", "hospital", "medical center", "university",
    "campus", "city hall", "courthouse", "public works", "fire station",
    "library", "municipal", "healthcare", "student", "academic",
]

ENERGY_KEYWORDS = [
    "energy", "hvac", "mechanical", "leed", "green", "sustainable",
    "efficiency", "retrofit", "renovation", "modernization", "net zero",
    "solar", "microgrid", "building automation",
]


def _is_recent(date_str: str) -> bool:
    try:
        dt = dateparser.parse(date_str, ignoretz=True)
        return dt >= datetime.now() - timedelta(days=LOOKBACK_DAYS)
    except Exception:
        return True


def _classify_segment(text: str) -> str:
    text_lower = text.lower()
    if any(k in text_lower for k in ["school", "k-12", "elementary", "high school", "district"]):
        return "Schools"
    if any(k in text_lower for k in ["hospital", "medical", "health system", "clinic", "healthcare"]):
        return "Healthcare"
    if any(k in text_lower for k in ["university", "college", "campus", "higher ed"]):
        return "University"
    if any(k in text_lower for k in ["city", "county", "municipal", "courthouse", "library", "public"]):
        return "Municipal"
    return "Other"


def fetch_construction_projects() -> list[dict]:
    """
    Pull recent MUSH construction project announcements from
    industry RSS feeds. Returns opportunities for the dashboard.
    """
    projects = []
    seen     = set()

    for feed_info in CONSTRUCTION_FEEDS:
        try:
            feed = feedparser.parse(feed_info["url"])
            for entry in feed.entries[:20]:
                title   = entry.get("title", "")
                summary = entry.get("summary", "")
                pub     = entry.get("published", "")
                link    = entry.get("link", "")
                text    = f"{title} {summary}".lower()

                if not title or title in seen:
                    continue
                if not _is_recent(pub):
                    continue

                # Must mention MUSH facility type
                has_mush   = any(k in text for k in MUSH_CONSTRUCTION_KEYWORDS)
                has_energy = any(k in text for k in ENERGY_KEYWORDS)

                if not (has_mush or has_energy):
                    continue

                seen.add(title)
                segment = _classify_segment(text)
                if segment == "Other":
                    continue

                projects.append({
                    "id":          f"construction-{hash(title) % 100000}",
                    "title":       title[:160],
                    "agency":      feed_info["name"],
                    "type":        "Construction Project",
                    "posted":      pub,
                    "deadline":    "",
                    "state":       "",  # often not extractable from feed
                    "description": summary[:300],
                    "url":         link,
                    "source":      feed_info["source"],
                    "keyword_hit": "construction",
                    "segment":     segment,
                })

        except Exception as e:
            logger.warning(f"Construction feed failed for {feed_info['name']}: {e}")

    logger.info(f"  Construction feeds: {len(projects)} MUSH projects found")
    return projects
