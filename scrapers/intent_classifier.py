"""
intent_classifier.py

Shared logic for classifying a job posting's strategic INTENT from its title.
Used by both buildSignals (for new jobs) and the retroactive tagging script
(for existing accumulated jobs).

The three intents answer "what does this hire tell us about the competitor's
next move?":

  PURSUIT   — sales / business development / capture roles.
              Signal: they're gearing up to WIN new work in this area.

  DELIVERY  — project management / engineering / field / technician roles.
              Signal: they already WON work and are staffing to deliver it.

  LEADERSHIP— director / VP / regional executive roles.
              Signal: a strategic bet on a region or segment.

  (unknown) — title too generic to classify. Left untagged.

Judgment note: PURSUIT is the most forward-looking signal (they haven't won
yet, they're chasing). DELIVERY is more of a lagging confirmation (they
already won). LEADERSHIP is the strongest long-term signal but rarest.
"""

# Order matters: check leadership first (a "VP of Sales" is leadership-level
# intent, more strategically significant than a rank-and-file sales role),
# then pursuit, then delivery.
INTENT_KEYWORDS = [
    ("Leadership", [
        "vice president", "vp ", "vp,", "senior director", "sr director",
        "sr. director", "director of", "director,", "director -", "director –",
        "director ", " director", "regional director", "general manager",
        "managing director", "head of", "chief", "president",
        "regional vice", "area manager", "market leader",
    ]),
    ("Pursuit", [
        "sales", "business development", "bus dev", "bd ", "account executive",
        "account manager", "capture", "proposal", "estimator", "estimating",
        "pre-construction", "preconstruction", "client executive",
        "market development", "sales engineer", "solutions engineer",
        "account director", "client development", "growth",
    ]),
    ("Delivery", [
        "project manager", "project engineer", "field engineer", "technician",
        "superintendent", "installer", "service tech", "commissioning",
        "controls engineer", "mechanical engineer", "electrical engineer",
        "construction manager", "operations", "foreman", "site manager",
        "project coordinator", "field service", "maintenance", "startup",
        "design engineer", "cad", "drafter", "estimating coordinator",
    ]),
]


def classify_intent(title: str) -> str:
    """Return 'Pursuit', 'Delivery', 'Leadership', or '' (unknown) for a job title."""
    if not title:
        return ""
    low = title.lower()
    for intent, kws in INTENT_KEYWORDS:
        if any(kw in low for kw in kws):
            return intent
    return ""
