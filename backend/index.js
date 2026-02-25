const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const cors = require('cors')
const axios = require('axios')

const PORT = Number(process.env.PORT || 5001)
const DB_PATH = process.env.DB_PATH || './tickets.db'
const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || "https://ai-ticket-categorization-system-2.onrender.com").replace(/\/+$/, "")
const app = express()
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'ai-ticket-backend' })
})

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function callMlPredict(payload) {
  const retryDelaysMs = [4000, 10000, 20000, 30000]
  let lastError
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await axios.post(`${ML_SERVICE_URL}/predict`, payload, { timeout: 45000 })
    } catch (err) {
      lastError = err
      const status = err?.response?.status
      const isTransient = !status || status === 429 || status === 502 || status === 503 || status === 504
      if (!isTransient || attempt >= retryDelaysMs.length) {
        break
      }
      const retryAfterRaw = err?.response?.headers?.['retry-after']
      const retryAfterSeconds = Number.parseInt(String(retryAfterRaw || ""), 10)
      const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0
      // Respect upstream Retry-After when available; otherwise use exponential backoff.
      await sleep(Math.max(retryDelaysMs[attempt], retryAfterMs))
    }
  }
  throw lastError
}

function parsePercent(value) {
  const n = Number.parseFloat(String(value || "").replace("%", "").trim())
  return Number.isFinite(n) ? n : NaN
}

// Create database
const db = new sqlite3.Database(DB_PATH)

// ==============================
// CREATE USERS TABLE
// ==============================
db.run(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT UNIQUE,
  password TEXT
)
`)

// Add avatar column for existing DBs that were created earlier
db.all(`PRAGMA table_info(users)`, (err, rows) => {
  if (err) return console.error("Failed to inspect users table:", err)
  const hasAvatar = rows.some(col => col.name === "avatar")
  if (!hasAvatar) {
    db.run(`ALTER TABLE users ADD COLUMN avatar TEXT`, alterErr => {
      if (alterErr) console.error("Failed to add avatar column:", alterErr)
    })
  }
})

// ==============================
// CREATE TICKETS TABLE (Linked to User)
// ==============================
db.run(`
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT,
  description TEXT,
  category TEXT,
  priority TEXT,
  confidence TEXT,
  category_confidence TEXT,
  priority_confidence TEXT,
  priority_reason TEXT,
  status TEXT DEFAULT 'Open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
)
`)

// Add explainability columns for existing DBs
db.all(`PRAGMA table_info(tickets)`, (err, rows) => {
  if (err) return console.error("Failed to inspect tickets table:", err)

  const hasCategoryConfidence = rows.some(col => col.name === "category_confidence")
  const hasPriorityConfidence = rows.some(col => col.name === "priority_confidence")
  const hasPriorityReason = rows.some(col => col.name === "priority_reason")

  if (!hasCategoryConfidence) {
    db.run(`ALTER TABLE tickets ADD COLUMN category_confidence TEXT`, alterErr => {
      if (alterErr) console.error("Failed to add category_confidence column:", alterErr)
    })
  }
  if (!hasPriorityConfidence) {
    db.run(`ALTER TABLE tickets ADD COLUMN priority_confidence TEXT`, alterErr => {
      if (alterErr) console.error("Failed to add priority_confidence column:", alterErr)
    })
  }
  if (!hasPriorityReason) {
    db.run(`ALTER TABLE tickets ADD COLUMN priority_reason TEXT`, alterErr => {
      if (alterErr) console.error("Failed to add priority_reason column:", alterErr)
    })
  }
})

// ==============================
// SIGNUP
// ==============================
app.post('/signup', (req, res) => {

  const name = req.body.name.trim()
  const email = req.body.email.trim().toLowerCase()
  const password = req.body.password.trim()

  if (!name || !email || !password) {
    return res.status(400).json({ error: "All fields required" })
  }

  db.run(
    `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`,
    [name, email, password],
    function (err) {
      if (err) {
        return res.status(400).json({ error: "User already exists" })
      }
      res.json({ message: "Signup successful" })
    }
  )
})


// ==============================
// LOGIN
// ==============================
app.post('/login', (req, res) => {

  const email = req.body.email.trim().toLowerCase()
  const password = req.body.password.trim()

  db.get(
    `SELECT * FROM users WHERE email = ? AND password = ?`,
    [email, password],
    (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: "Invalid credentials" })
      }

      res.json({
        message: "Login successful",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar || ""
        }
      })
    }
  )
})

// ==============================
// FETCH USER PROFILE
// ==============================
app.get('/users/:id', (req, res) => {
  const id = req.params.id
  db.get(
    `SELECT id, name, email, avatar FROM users WHERE id = ?`,
    [id],
    (err, user) => {
      if (err) return res.status(500).json({ error: "Server error" })
      if (!user) return res.status(404).json({ error: "User not found" })
      res.json({ user })
    }
  )
})

// ==============================
// UPDATE USER PROFILE
// ==============================
app.put('/users/:id/profile', (req, res) => {
  const id = req.params.id
  const name = String(req.body.name || "").trim()
  const avatar = String(req.body.avatar || "").trim()

  if (!name) {
    return res.status(400).json({ error: "Name is required" })
  }

  db.run(
    `UPDATE users SET name = ?, avatar = ? WHERE id = ?`,
    [name, avatar, id],
    function (err) {
      if (err) return res.status(500).json({ error: "Failed to update profile" })
      if (!this.changes) return res.status(404).json({ error: "User not found" })

      db.get(
        `SELECT id, name, email, avatar FROM users WHERE id = ?`,
        [id],
        (fetchErr, user) => {
          if (fetchErr) return res.status(500).json({ error: "Profile updated but fetch failed" })
          res.json({ message: "Profile updated", user })
        }
      )
    }
  )
})

// ==============================
// UPDATE USER PASSWORD
// ==============================
app.put('/users/:id/password', (req, res) => {
  const id = req.params.id
  const currentPassword = String(req.body.currentPassword || "").trim()
  const newPassword = String(req.body.newPassword || "").trim()

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" })
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: "New password must be at least 4 characters" })
  }

  db.get(
    `SELECT id, password FROM users WHERE id = ?`,
    [id],
    (err, user) => {
      if (err) return res.status(500).json({ error: "Server error" })
      if (!user) return res.status(404).json({ error: "User not found" })
      if (user.password !== currentPassword) {
        return res.status(401).json({ error: "Current password is incorrect" })
      }

      db.run(
        `UPDATE users SET password = ? WHERE id = ?`,
        [newPassword, id],
        function (updateErr) {
          if (updateErr) return res.status(500).json({ error: "Failed to update password" })
          res.json({ message: "Password updated" })
        }
      )
    }
  )
})


// ==============================
// INSERT TICKET (PROTECTED)
// ==============================
app.post('/tickets', async (req, res) => {
  const { title, description, user_id } = req.body

  if (!user_id) {
    return res.status(401).json({ error: "Unauthorized. Please login." })
  }

  const modelInput = [title, description]
    .map(v => String(v || "").trim())
    .filter(Boolean)
    .join(". ")

  try {
    const ai = await callMlPredict({
      description: modelInput || String(description || "")
    })

    const {
      category,
      priority,
      category_confidence,
      priority_confidence,
      priority_overridden,
      priority_reason
    } = ai.data

    const catN = parsePercent(category_confidence)
    const priN = parsePercent(priority_confidence)
    const combinedConfidence = Number.isFinite(catN) && Number.isFinite(priN)
      ? `${((catN + priN) / 2).toFixed(2)}%`
      : (category_confidence || priority_confidence || "--")
    const effectivePriorityReason = String(priority_reason || (priority_overridden ? "Rule-based override" : "Model prediction"))

    db.run(
      `INSERT INTO tickets (user_id, title, description, category, priority, confidence, category_confidence, priority_confidence, priority_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, title, description, category, priority, combinedConfidence, category_confidence, priority_confidence, effectivePriorityReason],
      function (err) {
        if (err) return res.status(500).json(err)

        res.json({
          id: this.lastID,
          category,
          priority,
          confidence: combinedConfidence,
          category_confidence,
          priority_confidence,
          priority_reason: effectivePriorityReason
        })
      }
    )
  } catch (err) {
    const upstreamStatus = err?.response?.status
    const upstreamData = err?.response?.data
    const details = upstreamData?.error || err?.message || "Unknown ML failure"
    console.error("ML request failed:", { upstreamStatus, details })
    // Fallback mode: keep ticket workflow running when ML service is temporarily unavailable.
    const fallbackCategory = "General"
    const fallbackPriority = "Medium"
    const fallbackConfidence = "50.00%"
    const fallbackReason = "Fallback used: ML service unavailable"

    db.run(
      `INSERT INTO tickets (user_id, title, description, category, priority, confidence, category_confidence, priority_confidence, priority_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, title, description, fallbackCategory, fallbackPriority, fallbackConfidence, fallbackConfidence, fallbackConfidence, fallbackReason],
      function (dbErr) {
        if (dbErr) return res.status(500).json({ error: "Ticket save failed in fallback mode" })
        res.status(201).json({
          id: this.lastID,
          category: fallbackCategory,
          priority: fallbackPriority,
          confidence: fallbackConfidence,
          category_confidence: fallbackConfidence,
          priority_confidence: fallbackConfidence,
          priority_reason: fallbackReason,
          warning: `ML service unavailable: ${details}`
        })
      }
    )
  }
})

// ==============================
// FETCH USER TICKETS ONLY
// ==============================
app.get('/tickets/:user_id', (req, res) => {
  const user_id = req.params.user_id

  db.all(
    `SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC`,
    [user_id],
    (err, rows) => {
      if (err) return res.status(500).json(err)
      res.json(rows)
    }
  )
})

// ==============================
// UPDATE STATUS
// ==============================
app.put('/tickets/:id', (req, res) => {
  const id = req.params.id

  db.run(
    `UPDATE tickets SET status='Resolved' WHERE id=?`,
    [id],
    function (err) {
      if (err) return res.status(500).json(err)
      res.json({ success: true })
    }
  )
})

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`)
})
