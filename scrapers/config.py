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
    {
        "name":            "Cenergistic",
        "segments":        ["Schools", "University", "Healthcare", "Municipal"],
        "offices":         [
            {"city": "Dallas", "state": "TX"},
        ],
        "usaspending_names":   ["CENERGISTIC LLC", "CENERGISTIC"],
        "sec_cik":             None,
        "sec_ticker":          None,
        "uspto_assignee":      "Cenergistic",
        "adzuna_query":        "Cenergistic",
        "lda_registrant_name": "Cenergistic",
        "news_queries": [
            '"Cenergistic" school district energy conservation',
            '"Cenergistic" university healthcare ENERGY STAR',
        ],
    },
    {
        "name":            "Willdan Group",
        "segments":        ["Municipal", "Schools", "University"],
        "offices":         [
            {"city": "Anaheim", "state": "CA"},
            {"city": "Houston", "state": "TX"},
        ],
        "usaspending_names":   ["WILLDAN GROUP INC", "WILLDAN ENERGY SOLUTIONS", "WILLDAN"],
        "sec_cik":             None,
        "sec_ticker":          "WLDN",
        "uspto_assignee":      "Willdan Energy Solutions",
        "adzuna_query":        "Willdan",
        "lda_registrant_name": "Willdan Group",
        "news_queries": [
            '"Willdan" municipal energy efficiency contract',
            '"Willdan Energy Solutions" school university award',
        ],
    },
    {
        "name":            "Energy Systems Group",
        "segments":        ["Schools", "University", "Healthcare", "Municipal"],
        "offices":         [
            {"city": "Newburgh", "state": "IN"},
            {"city": "Houston",  "state": "TX"},
        ],
        "usaspending_names":   ["ENERGY SYSTEMS GROUP LLC", "ENERGY SYSTEMS GROUP"],
        "sec_cik":             None,
        "sec_ticker":          None,
        "uspto_assignee":      "Energy Systems Group",
        "adzuna_query":        "Energy Systems Group",
        "lda_registrant_name": "Energy Systems Group",
        "news_queries": [
            '"Energy Systems Group" ESPC school award',
            '"Energy Systems Group" municipal healthcare contract',
        ],
    },
    {
        "name":            "NORESCO",
        "segments":        ["Schools", "University", "Healthcare", "Municipal"],
        "offices":         [
            {"city": "Westborough", "state": "MA"},
        ],
        "usaspending_names":   ["NORESCO LLC", "NORESCO"],
        "sec_cik":             None,
        "sec_ticker":          None,
        "uspto_assignee":      "NORESCO",
        "adzuna_query":        "NORESCO",
        "lda_registrant_name": "NORESCO",
        "news_queries": [
            '"NORESCO" energy performance contract',
            '"NORESCO" school university healthcare',
        ],
    },
    {
        "name":            "EMCOR Group",
        "segments":        ["Healthcare", "University", "Municipal"],
        "offices":         [
            {"city": "Norwalk", "state": "CT"},
            {"city": "Dallas",  "state": "TX"},
            {"city": "Houston", "state": "TX"},
        ],
        "usaspending_names":   ["EMCOR GOVERNMENT SERVICES INC", "EMCOR FACILITIES SERVICES", "EMCOR"],
        "sec_cik":             "0000105634",
        "sec_ticker":          "EME",
        "uspto_assignee":      "EMCOR Group",
        "adzuna_query":        "EMCOR",
        "lda_registrant_name": "EMCOR Group",
        "news_queries": [
            '"EMCOR" federal facilities contract',
            '"EMCOR Group" hospital university mechanical',
        ],
    },
    {
        "name":            "Ideal Impact",
        "segments":        ["Schools", "University"],
        "offices":         [
            {"city": "Fort Worth", "state": "TX"},
        ],
        "usaspending_names":   ["IDEAL IMPACT INC", "IDEAL IMPACT"],
        "sec_cik":             None,
        "sec_ticker":          None,
        "uspto_assignee":      "Ideal Impact",
        "adzuna_query":        "Ideal Impact",
        "lda_registrant_name": "Ideal Impact",
        "news_queries": [
            '"Ideal Impact" school district energy',
            '"Ideal Impact" Texas ISD conservation',
        ],
    },
    {
        "name":            "ENGIE Services US",
        "segments":        ["University", "Healthcare", "Municipal", "Schools"],
        "offices":         [
            {"city": "Oakland", "state": "CA"},
            {"city": "Houston", "state": "TX"},
        ],
        "usaspending_names":   ["ENGIE SERVICES US INC", "ENGIE SERVICES", "ENGIE NORTH AMERICA"],
        "sec_cik":             None,
        "sec_ticker":          None,
        "uspto_assignee":      "ENGIE",
        "adzuna_query":        "ENGIE",
        "lda_registrant_name": "ENGIE North America",
        "news_queries": [
            '"ENGIE" university campus energy partnership',
            '"ENGIE Services" ESPC contract award',
        ],
    },
    {
        "name":            "Bernhard",
        "segments":        ["University", "Healthcare", "Municipal"],
        "offices":         [
            {"city": "Baton Rouge", "state": "LA"},
            {"city": "Houston",     "state": "TX"},
            {"city": "Dallas",      "state": "TX"},
        ],
        "usaspending_names":   ["BERNHARD LLC", "BERNHARD ENERGY", "BERNHARD MCC"],
        "sec_cik":             None,
        "sec_ticker":          None,
        "uspto_assignee":      "Bernhard",
        "adzuna_query":        "Bernhard",
        "lda_registrant_name": "Bernhard",
        "news_queries": [
            '"Bernhard" university energy partnership',
            '"Bernhard" hospital central utility plant',
        ],
    },
    {
        "name":            "CMTA",
        "segments":        ["Schools", "University", "Healthcare", "Municipal"],
        "offices":         [
            {"city": "Louisville", "state": "KY"},
            {"city": "Austin",     "state": "TX"},
        ],
        "usaspending_names":   ["CMTA INC", "CMTA"],
        "sec_cik":             None,
        "sec_ticker":          None,
        "uspto_assignee":      "CMTA",
        "adzuna_query":        "CMTA",
        "lda_registrant_name": "CMTA",
        "news_queries": [
            '"CMTA" school district net zero',
            '"CMTA" university healthcare engineering',
        ],
    },
    {
        "name":            "Southland Industries",
        "segments":        ["Healthcare", "University", "Municipal"],
        "offices":         [
            {"city": "Garden Grove", "state": "CA"},
            {"city": "Dallas",       "state": "TX"},
        ],
        "usaspending_names":   ["SOUTHLAND INDUSTRIES", "SOUTHLAND ENERGY"],
        "sec_cik":             None,
        "sec_ticker":          None,
        "uspto_assignee":      "Southland Industries",
        "adzuna_query":        "Southland Industries",
        "lda_registrant_name": "Southland Industries",
        "news_queries": [
            '"Southland Industries" hospital mechanical',
            '"Southland Industries" university energy',
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
