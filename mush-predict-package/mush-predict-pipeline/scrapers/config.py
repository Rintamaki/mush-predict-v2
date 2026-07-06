"""
config.py
Central registry of tracked competitors with all identifiers each
data source needs (USASpending search names, SEC ticker, USPTO assignee
name, Adzuna search term, etc.)
"""

COMPETITORS = [
    {
        "name":            "Johnson Controls",
        "segments":        ["Schools", "Healthcare", "Municipal", "University"],
        "offices":         [
            {"city": "Dallas",    "state": "TX"},
            {"city": "Houston",   "state": "TX"},
            {"city": "Milwaukee", "state": "WI"},
            {"city": "Seattle",   "state": "WA"},
        ],
        "usaspending_names": ["JOHNSON CONTROLS INC", "JOHNSON CONTROLS", "JOHNSON CONTROLS US HOLDINGS"],
        "sec_cik":           "0000833444",
        "sec_ticker":        "JCI",
        "uspto_assignee":    "Johnson Controls",
        "adzuna_query":      "Johnson Controls",
    },
    {
        "name":            "Trane Technologies",
        "segments":        ["Schools", "University", "Healthcare"],
        "offices":         [
            {"city": "Dallas",   "state": "TX"},
            {"city": "Davidson", "state": "NC"},
        ],
        "usaspending_names": ["TRANE TECHNOLOGIES", "TRANE U.S. INC", "TRANE INC"],
        "sec_cik":           "0001466258",
        "sec_ticker":        "TT",
        "uspto_assignee":    "Trane Technologies",
        "adzuna_query":      "Trane Technologies",
    },
    {
        "name":            "Ameresco",
        "segments":        ["Municipal", "University", "Schools"],
        "offices":         [
            {"city": "Framingham", "state": "MA"},
            {"city": "Austin",     "state": "TX"},
        ],
        "usaspending_names": ["AMERESCO INC", "AMERESCO"],
        "sec_cik":           "0001488139",
        "sec_ticker":        "AMRC",
        "uspto_assignee":    "Ameresco",
        "adzuna_query":      "Ameresco",
    },
    {
        "name":            "Schneider Electric",
        "segments":        ["University", "Healthcare", "Municipal"],
        "offices":         [
            {"city": "Dallas", "state": "TX"},
            {"city": "Boston", "state": "MA"},
        ],
        "usaspending_names": ["SCHNEIDER ELECTRIC BUILDINGS", "SCHNEIDER ELECTRIC USA", "SQUARE D"],
        "sec_cik":           None,   # foreign filer, no SEC
        "sec_ticker":        None,
        "uspto_assignee":    "Schneider Electric",
        "adzuna_query":      "Schneider Electric",
    },
    {
        "name":            "Siemens Smart Infrastructure",
        "segments":        ["Municipal", "University", "Healthcare"],
        "offices":         [
            {"city": "Houston",   "state": "TX"},
            {"city": "Princeton", "state": "NJ"},
        ],
        "usaspending_names": ["SIEMENS INDUSTRY INC", "SIEMENS"],
        "sec_cik":           None,
        "sec_ticker":        None,
        "uspto_assignee":    "Siemens Industry",
        "adzuna_query":      "Siemens",
    },
# ============================================================================
# NEW COMPETITORS — 10 additions
# ============================================================================
#
# Copy each of these dict entries into the COMPETITORS list inside your
# existing scrapers/config.py file — add them alongside the existing five
# (Johnson Controls, Trane Technologies, Ameresco, Schneider Electric,
# Siemens Smart Infrastructure).
#
# The pattern is: each entry is a dict, all separated by commas, all inside
# the COMPETITORS = [ ... ] list.
#
# For public companies I've included ticker only — leave sec_cik out and
# the scraper will skip SEC EDGAR gracefully. If you want SEC data flowing
# for those, look up the CIK on sec.gov/cgi-bin/browse-edgar and add it.
#
# For private companies (no ticker/CIK), you'll naturally see fewer signals
# — no earnings calls, no patents in most cases. That's expected.
# ============================================================================

    {
        "name": "Cenergistic",
        "segments": ["Schools", "University", "Healthcare", "Municipal"],
        "offices": [
            {"city": "Dallas", "state": "TX"},
        ],
        "usaspending_recipient": "CENERGISTIC LLC",
        "sam_gov_search": "Cenergistic",
        "uspto_assignee": "Cenergistic",
        "adzuna_company": "Cenergistic",
        "lda_registrant_name": "Cenergistic",
    },
    {
        "name": "Willdan Group",
        "segments": ["Municipal", "Schools", "University"],
        "offices": [
            {"city": "Anaheim", "state": "CA"},
            {"city": "Houston", "state": "TX"},
        ],
        "usaspending_recipient": "WILLDAN GROUP INC",
        "sam_gov_search": "Willdan",
        "sec_ticker": "WLDN",
        "uspto_assignee": "Willdan Energy Solutions",
        "adzuna_company": "Willdan",
        "lda_registrant_name": "Willdan Group",
    },
    {
        "name": "Energy Systems Group",
        "segments": ["Schools", "University", "Healthcare", "Municipal"],
        "offices": [
            {"city": "Newburgh", "state": "IN"},
            {"city": "Houston", "state": "TX"},
        ],
        "usaspending_recipient": "ENERGY SYSTEMS GROUP LLC",
        "sam_gov_search": "Energy Systems Group",
        "uspto_assignee": "Energy Systems Group",
        "adzuna_company": "Energy Systems Group",
        "lda_registrant_name": "Energy Systems Group",
    },
    {
        "name": "NORESCO",
        "segments": ["Schools", "University", "Healthcare", "Municipal"],
        "offices": [
            {"city": "Westborough", "state": "MA"},
        ],
        "usaspending_recipient": "NORESCO LLC",
        "sam_gov_search": "NORESCO",
        "uspto_assignee": "NORESCO",
        "adzuna_company": "NORESCO",
        "lda_registrant_name": "NORESCO",
    },
    {
        "name": "EMCOR Group",
        "segments": ["Healthcare", "University", "Municipal"],
        "offices": [
            {"city": "Norwalk", "state": "CT"},
            {"city": "Dallas", "state": "TX"},
            {"city": "Houston", "state": "TX"},
        ],
        "usaspending_recipient": "EMCOR GOVERNMENT SERVICES INC",
        "sam_gov_search": "EMCOR",
        "sec_ticker": "EME",
        "uspto_assignee": "EMCOR Group",
        "adzuna_company": "EMCOR",
        "lda_registrant_name": "EMCOR Group",
    },
    {
        "name": "Ideal Impact",
        "segments": ["Schools", "University"],
        "offices": [
            {"city": "Fort Worth", "state": "TX"},
        ],
        "usaspending_recipient": "IDEAL IMPACT INC",
        "sam_gov_search": "Ideal Impact",
        "uspto_assignee": "Ideal Impact",
        "adzuna_company": "Ideal Impact",
        "lda_registrant_name": "Ideal Impact",
    },
    {
        "name": "ENGIE Services US",
        "segments": ["University", "Healthcare", "Municipal", "Schools"],
        "offices": [
            {"city": "Oakland", "state": "CA"},
            {"city": "Houston", "state": "TX"},
        ],
        "usaspending_recipient": "ENGIE SERVICES US INC",
        "sam_gov_search": "ENGIE Services",
        "uspto_assignee": "ENGIE",
        "adzuna_company": "ENGIE",
        "lda_registrant_name": "ENGIE North America",
    },
    {
        "name": "Bernhard",
        "segments": ["University", "Healthcare", "Municipal"],
        "offices": [
            {"city": "Baton Rouge", "state": "LA"},
            {"city": "Houston", "state": "TX"},
            {"city": "Dallas", "state": "TX"},
        ],
        "usaspending_recipient": "BERNHARD LLC",
        "sam_gov_search": "Bernhard",
        "uspto_assignee": "Bernhard",
        "adzuna_company": "Bernhard",
        "lda_registrant_name": "Bernhard",
    },
    {
        "name": "CMTA",
        "segments": ["Schools", "University", "Healthcare", "Municipal"],
        "offices": [
            {"city": "Louisville", "state": "KY"},
            {"city": "Austin", "state": "TX"},
        ],
        "usaspending_recipient": "CMTA INC",
        "sam_gov_search": "CMTA",
        "uspto_assignee": "CMTA",
        "adzuna_company": "CMTA",
        "lda_registrant_name": "CMTA",
    },
    {
        "name": "Southland Industries",
        "segments": ["Healthcare", "University", "Municipal"],
        "offices": [
            {"city": "Garden Grove", "state": "CA"},
            {"city": "Dallas", "state": "TX"},
        ],
        "usaspending_recipient": "SOUTHLAND INDUSTRIES",
        "sam_gov_search": "Southland Industries",
        "uspto_assignee": "Southland Industries",
        "adzuna_company": "Southland Industries",
        "lda_registrant_name": "Southland Industries",
    },
]

# Mapping NAICS / PSC codes to MUSH segments for USASpending categorization
SEGMENT_KEYWORDS = {
    "Schools":    ["school", "k-12", "education", "district", "isd"],
    "Healthcare": ["hospital", "medical", "health", "clinic", "VA medical"],
    "University": ["university", "college", "campus", "higher ed"],
    "Municipal":  ["city of", "county", "municipal", "town of", "public works", "court"],
}
