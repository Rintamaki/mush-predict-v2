"""
config.py
Central registry of tracked competitors with all identifiers
each data source needs.
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
        "usaspending_names":   ["JOHNSON CONTROLS INC", "JOHNSON CONTROLS", "JOHNSON CONTROLS US HOLDINGS"],
        "sec_cik":             "0000833444",
        "sec_ticker":          "JCI",
        "uspto_assignee":      "Johnson Controls",
        "adzuna_query":        "Johnson Controls",
        "lda_registrant_name": "Johnson Controls",
        "news_queries": [
            '"Johnson Controls" energy school hospital ESPC',
            '"Johnson Controls" MUSH municipal university contract',
            '"OpenBlue" building automation energy',
        ],
    },
    {
        "name":            "Trane Technologies",
        "segments":        ["Schools", "University", "Healthcare"],
        "offices":         [
            {"city": "Dallas",   "state": "TX"},
            {"city": "Davidson", "state": "NC"},
        ],
        "usaspending_names":   ["TRANE TECHNOLOGIES", "TRANE U.S. INC", "TRANE INC"],
        "sec_cik":             "0001466258",
        "sec_ticker":          "TT",
        "uspto_assignee":      "Trane Technologies",
        "adzuna_query":        "Trane Technologies",
        "lda_registrant_name": "Trane Technologies",
        "news_queries": [
            '"Trane Technologies" school district ESPC HVAC',
            '"Trane Technologies" energy contract award',
        ],
    },
    {
        "name":            "Ameresco",
        "segments":        ["Municipal", "University", "Schools"],
        "offices":         [
            {"city": "Framingham", "state": "MA"},
            {"city": "Austin",     "state": "TX"},
        ],
        "usaspending_names":   ["AMERESCO INC", "AMERESCO"],
        "sec_cik":             "0001488139",
        "sec_ticker":          "AMRC",
        "uspto_assignee":      "Ameresco",
        "adzuna_query":        "Ameresco",
        "lda_registrant_name": "Ameresco",
        "news_queries": [
            '"Ameresco" energy contract municipal solar',
            '"Ameresco" ESPC school university award',
        ],
    },
    {
        "name":            "Schneider Electric",
        "segments":        ["University", "Healthcare", "Municipal"],
        "offices":         [
            {"city": "Dallas", "state": "TX"},
            {"city": "Boston", "state": "MA"},
        ],
        "usaspending_names":   ["SCHNEIDER ELECTRIC BUILDINGS", "SCHNEIDER ELECTRIC USA", "SQUARE D"],
        "sec_cik":             None,
        "sec_ticker":          None,
        "uspto_assignee":      "Schneider Electric",
        "adzuna_query":        "Schneider Electric",
        "lda_registrant_name": "Schneider Electric",
        "news_queries": [
            '"Schneider Electric" university campus energy EaaS',
            '"Schneider Electric" healthcare decarbonization contract',
        ],
    },
    {
        "name":            "Siemens Smart Infrastructure",
        "segments":        ["Municipal", "University", "Healthcare"],
        "offices":         [
            {"city": "Houston",   "state": "TX"},
            {"city": "Princeton", "state": "NJ"},
        ],
        "usaspending_names":   ["SIEMENS INDUSTRY INC", "SIEMENS"],
        "sec_cik":             None,
        "sec_ticker":          None,
        "uspto_assignee":      "Siemens Industry",
        "adzuna_query":        "Siemens",
        "lda_registrant_name": "Siemens Corporation",
        "news_queries": [
            '"Siemens" building automation university hospital energy',
            '"Siemens Smart Infrastructure" MUSH contract award',
        ],
    },
]

# Mapping keywords to MUSH segments for USASpending categorization
SEGMENT_KEYWORDS = {
    "Schools":    ["school", "k-12", "education", "district", "isd"],
    "Healthcare": ["hospital", "medical", "health", "clinic", "VA medical"],
    "University": ["university", "college", "campus", "higher ed"],
    "Municipal":  ["city of", "county", "municipal", "town of", "public works", "court"],
}
