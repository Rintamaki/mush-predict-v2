"""
google_news.py
Free, no API key required.
Pulls competitor news from Google News RSS feeds.
Near-real-time — articles appear within hours of publication.
Covers press releases, contract announcements, executive quotes,
product launches, and anything that makes the news.
"""

import feedparser
import logging
from datetime import datetime, timedelta
from dateutil import parser as dateparser

logger = logging.getLogger(__name__)

LOOKBACK_DAYS = 60

# MUSH-relevant keywords to filter articles
RELEVANT_KEYWORDS = [
    "energy", "contract", "school", "hospital", "university", "municipal",
    "espc", "efficiency", "hvac", "building", "retrofit", "solar", "award",
    "partner", "acquire", "launch", "expand", "hire", "win", "deal",
    "facility", "facilities", "decarbonization", "automation", "controls",
    "k-12", "campus", "healthcare", "government", "public sector",
]


def _is_recent(date_str: str) -> bool:
    try:
        dt = dateparser.parse(date_str, ignoretz=True)
        return dt >= datetime.now() - timedelta(days=LOOKBACK_DAYS)
    except Exception:
        return True


def _is_relevant(text: str) -> bool:
    text_lower = text.lower()
    return any(kw in text_lower for kw in RELEVANT_KEYWORDS)


def _build_rss_urls(competitor: dict) -> list[str]:
    """Build targeted Google News RSS URLs for this competitor."""
    name    = competitor["name"].replace(" ", "+")
    queries = competitor.get("news_queries", [f'"{competitor["name"]}" energy contract MUSH'])
    urls    = []
    for q in queries:
        q_encoded = q.replace(" ", "+").replace('"', '%22')
        urls.append(
            f"https://news.google.com/rss/search?q={q_encoded}"
            f"&hl=en-US&gl=US&ceid=US:en"
        )
    return urls


def fetch_news(competitor: dict) -> list[dict]:
    """Pull recent relevant news articles for this competitor."""
    articles = []
    seen     = set()

    for url in _build_rss_urls(competitor):
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:15]:
                pub     = entry.get("published", "")
                title   = entry.get("title", "")
                summary = entry.get("summary", "")
                link    = entry.get("link", "")

                if not title or title.lower() in seen:
                    continue
                if not _is_recent(pub):
                    continue
                if not _is_relevant(title + " " + summary):
                    continue

                seen.add(title.lower())
                articles.append({
                    "source":    "google_news",
                    "title":     title[:180],
                    "summary":   summary[:300],
                    "url":       link,
                    "published": pub,
                })
        except Exception as e:
            logger.warning(f"Google News RSS failed for {competitor['name']}: {e}")

    logger.info(f"  Google News [{competitor['name']}]: {len(articles)} articles")
    return articles


def fetch_mush_news(keyword: str = "energy efficiency MUSH public sector") -> list[dict]:
    """
    Pull general MUSH market news — not competitor-specific.
    Used to populate the opportunity dashboard's news feed.
    """
    articles = []
    url = (
        f"https://news.google.com/rss/search"
        f"?q={keyword.replace(' ', '+')}&hl=en-US&gl=US&ceid=US:en"
    )
    try:
        feed = feedparser.parse(url)
        for entry in feed.entries[:20]:
            pub   = entry.get("published", "")
            title = entry.get("title", "")
            if title and _is_recent(pub):
                articles.append({
                    "title":     title[:180],
                    "summary":   entry.get("summary", "")[:300],
                    "url":       entry.get("link", ""),
                    "published": pub,
                    "source":    "Google News",
                })
    except Exception as e:
        logger.warning(f"MUSH news RSS failed: {e}")

    return articles
