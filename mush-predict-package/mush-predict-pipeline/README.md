# MUSH Predict — Data Pipeline

Daily auto-refresh pipeline that powers the MUSH Predict dashboard's scoring engine.
All 6 data sources are **free**. Pipeline runs on GitHub Actions at 6 AM CT daily.

---

## Data sources

| Source | Cost | API key | What it provides |
|---|---|---|---|
| USASpending.gov     | Free | No  | Federal contract awards to competitors |
| SAM.gov             | Free | Yes — you have this | Open federal RFPs being bid on |
| SEC EDGAR           | Free | No  | 10-K / 10-Q filings, segment mentions |
| USPTO PatentsView   | Free | No  | Patent filings by competitor |
| Adzuna Jobs         | Free | Yes — get at developer.adzuna.com | Job postings by company + state |
| Socrata             | Free | No  | Building permits (Dallas, Austin, Seattle) |

---

## Setup

These files go in the **same repo as your dashboard** — they need to write to `public/data/competitors.json` for Vercel to pick up the refresh.

### 1. Add the files to your `mush-predict-v2` repo
Drop these into the root of your dashboard repo:
```
your-repo/
├── .github/workflows/refresh.yml     ← pipeline schedule
├── scrapers/
│   ├── config.py
│   ├── usaspending.py
│   ├── sam_gov.py
│   ├── sec_edgar.py
│   ├── uspto.py
│   ├── adzuna_jobs.py
│   ├── socrata_permits.py
│   ├── run_pipeline.py
│   └── requirements.txt
├── public/data/competitors.json     ← already there, pipeline overwrites
└── ... (your existing dashboard files)
```

### 2. Add the API keys to GitHub
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

- `SAM_GOV_API_KEY`  (you already have this)
- `ADZUNA_APP_ID`    (from developer.adzuna.com after sign-up)
- `ADZUNA_APP_KEY`   (also from Adzuna)

### 3. Enable the workflow
Repo → **Actions** tab → if you see "Enable workflows," click it.

### 4. Test manually
Actions → **MUSH Predict Daily Refresh** → **Run workflow** → green button.

Watch the log. You should see lines like:
```
→ Johnson Controls
  USASpending [Johnson Controls]: 12 contract awards
  SAM.gov [Johnson Controls]: 3 open bids
  SEC EDGAR [Johnson Controls]: 4 segment mentions
  USPTO [Johnson Controls]: 7 relevant patents
  Adzuna [Johnson Controls]: 18 job postings
  Permits [Johnson Controls]: 0 permit mentions
```

After completion the bot commits the updated `competitors.json` to your repo, Vercel auto-redeploys, and the dashboard shows live data.

---

## Get the Adzuna key

1. Go to https://developer.adzuna.com → **Sign up** (free)
2. After confirming your email, go to your dashboard
3. Copy your **App ID** and **App Key** — these are two separate values
4. Add both to GitHub Secrets

Free tier: 250 API calls per day. Pipeline uses ~6 calls per run (1 per competitor), so you're well within limits.

---

## Costs

| | |
|---|---|
| GitHub Actions  | Free (uses ~5 minutes per day) |
| Vercel hosting  | Free |
| All 6 data APIs | Free |
| **Total**       | **$0/month** |

---

## Troubleshooting

**Pipeline runs but Adzuna shows 0 results:**
Check that your Adzuna keys are in GitHub Secrets and the names match exactly: `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`.

**SEC EDGAR returns nothing:**
Foreign competitors (Schneider Electric, Siemens) don't file with the SEC. That's expected — their CIK is `None` in `config.py`.

**Pipeline fails to commit:**
Check that Actions has write permission: repo → **Settings → Actions → General → Workflow permissions** → "Read and write permissions" → Save.
