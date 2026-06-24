// ==============================
// Persistent Signal Builder
// Drop into your repo and run: node buildSignals.js
// ==============================

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

// === CONFIG ===
const INPUT_FILE = path.join(
  __dirname,
  "../mush-predict-package/public/data/competitors.json"
)
const OUTPUT_FILE = path.join(__dirname, "signals.json")

// ==============================
// Generate unique ID (dedupe key)
// ==============================
function generateId(signal) {
  const base = `${signal.company}-${signal.type}-${signal.title}-${signal.timestamp}-${signal.url || ""}`
  return crypto.createHash("md5").update(base).digest("hex")
}

// ==============================
// Convert your structured data → flat signals
// ==============================
function extractSignals(data) {
  const signals = []

  data.competitors.forEach(company => {
    const name = company.name

    // --- JOBS ---
    if (company.jobPostings) {
      company.jobPostings.forEach(job => {
        signals.push({
          company: name,
          type: "job",
          title: job.title,
          timestamp: job.postedDate || null,
          source: "Adzuna",
          url: "",
        })
      })
    }

    // --- NEWS ---
    if (company.newsArticles) {
      company.newsArticles.forEach(article => {
        signals.push({
          company: name,
          type: "news",
          title: article.title,
          timestamp: article.published || null,
          source: article.source || "news",
          url: article.url || "",
        })
      })
    }

    // --- BIDS ---
    if (company.activeBids) {
      company.activeBids.forEach(bid => {
        signals.push({
          company: name,
          type: "bid",
          title: bid.title,
          timestamp: bid.deadline || null,
          source: "SAM.gov",
          url: "",
        })
      })
    }

    // --- CONTRACTS ---
    if (company.contractAwards) {
      company.contractAwards.forEach(contract => {
        signals.push({
          company: name,
          type: "contract",
          title: contract.description || "Contract Award",
          timestamp: contract.date || null,
          source: contract.agency || "USASpending",
          url: "",
        })
      })
    }

    // --- EARNINGS ---
    if (company.earningsCallMentions) {
      company.earningsCallMentions.forEach(call => {
        signals.push({
          company: name,
          type: "earnings",
          title: call.snippet || "Earnings Mention",
          timestamp: call.quarter || null,
          source: "SEC EDGAR",
          url: "",
        })
      })
    }
  })

  // Attach IDs
  return signals.map(s => ({
    ...s,
    id: generateId(s)
  }))
}

// ==============================
// Merge with existing signals.json
// ==============================
function mergeSignals(newSignals) {
  let existing = []

  if (fs.existsSync(OUTPUT_FILE)) {
    existing = JSON.parse(fs.readFileSync(OUTPUT_FILE))
  }

  const existingIds = new Set(existing.map(s => s.id))

  const uniqueNew = newSignals.filter(s => !existingIds.has(s.id))

  const merged = [...existing, ...uniqueNew]

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2))

  console.log("✅ New signals added:", uniqueNew.length)
  console.log("📈 Total signals stored:", merged.length)
}

// ==============================
// MAIN EXECUTION
// ==============================
function run() {
  if (!fs.existsSync(INPUT_FILE)) {
  console.error("❌ Input file not found:", INPUT_FILE)

  // ✅ Create empty signals file so workflow doesn't crash
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify([], null, 2))
  return
}

  const rawData = JSON.parse(fs.readFileSync(INPUT_FILE))

  const newSignals = extractSignals(rawData)

  console.log("🔍 Extracted signals:", newSignals.length)

  mergeSignals(newSignals)
}

run()
