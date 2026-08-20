import express from "express";
import OpenAI from "openai";
import webpush from "web-push";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:you@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const DB_FILE = path.join(__dirname, "data.json");
let db = { subscriptions: [], reminders: [] };
async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      time TEXT NOT NULL,
      days INTEGER[] NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      endpoint TEXT UNIQUE NOT NULL,
      subscription JSONB NOT NULL
    );
  `);

  console.log("PostgreSQL database ready");
}

if (fs.existsSync(DB_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch {}
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
app.post("/api/parse-reminder", (req, res) => {
  try {
    const message = String(req.body.message || "").trim();

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const lower = message.toLowerCase();

    // -------------------------
    // DAYS
    // -------------------------
    let days = [0, 1, 2, 3, 4, 5, 6];

    if (lower.includes("weekday")) {
      days = [1, 2, 3, 4, 5];
    } else if (lower.includes("weekend")) {
      days = [0, 6];
    } else {
      const dayMap = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6
      };

      const foundDays = Object.entries(dayMap)
        .filter(([name]) => lower.includes(name))
        .map(([, number]) => number);

      if (foundDays.length) {
        days = foundDays;
      }
    }

    // -------------------------
    // TIME
    // -------------------------
    let time = null;

    const timeMatch = lower.match(
      /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/
    );

    if (timeMatch) {
      let hour = Number(timeMatch[1]);
      const minute = Number(timeMatch[2] || "00");
      const period = timeMatch[3];

      if (period === "pm" && hour < 12) hour += 12;
      if (period === "am" && hour === 12) hour = 0;

      if (!period && hour <= 6) {
        hour += 12;
      }

      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        time =
          String(hour).padStart(2, "0") +
          ":" +
          String(minute).padStart(2, "0");
      }
    }

    // Natural-language times
    if (!time && lower.includes("morning")) {
      time = "08:00";
    }

    if (!time && lower.includes("afternoon")) {
      time = "15:00";
    }

    if (!time && lower.includes("evening")) {
      time = "18:00";
    }

    if (!time && lower.includes("night")) {
      time = "20:00";
    }

    if (!time) {
      return res.status(400).json({
        error: "I couldn't find a time. Try something like 'at 8am'."
      });
    }

    // -------------------------
    // REMINDER TEXT
    // -------------------------
    let text = message;

    text = text.replace(
      /^remind me\s+(?:every\s+)?/i,
      ""
    );

    text = text.replace(
      /\b(?:weekday|weekdays|weekend|weekends|every day|daily)\b/gi,
      ""
    );

    text = text.replace(
      /\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
      ""
    );

    text = text.replace(
      /\b(?:at\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi,
      ""
    );

    text = text.replace(
      /\b(?:morning|afternoon|evening|night)\b/gi,
      ""
    );

    text = text.replace(/^\s*(?:to|about)\s+/i, "");
    text = text.replace(/\s+/g, " ").trim();

    if (!text) {
      return res.status(400).json({
        error: "Tell me what you want to be reminded about."
      });
    }

    res.json({
      text,
      time,
      days
    });

  } catch (error) {
    console.error("Free reminder parser error:", error);
    res.status(500).json({
      error: "Could not understand that reminder."
    });
  }
});

app.get("/api/config", (_, res) => {
  res.json({ vapidPublicKey: VAPID_PUBLIC_KEY });
});

app.post("/api/subscribe", (req, res) => {
  const subscription = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: "Invalid subscription" });
  db.subscriptions = db.subscriptions.filter(s => s.endpoint !== subscription.endpoint);
  db.subscriptions.push(subscription);
  save();
  res.json({ ok: true });
});

app.post("/api/reminders", (req, res) => {
  const { text, time, days } = req.body;
  if (!text || !time) return res.status(400).json({ error: "Text and time are required" });
  const reminder = {
    id: crypto.randomUUID(),
    text: String(text).trim(),
    time,
    days: Array.isArray(days) && days.length ? days : [0,1,2,3,4,5,6],
    enabled: true
  };
  db.reminders.push(reminder);
  save();
  res.json(reminder);
});

app.get("/api/reminders", (_, res) => res.json(db.reminders));

app.patch("/api/reminders/:id", (req, res) => {
  const r = db.reminders.find(x => x.id === req.params.id);
  if (!r) return res.sendStatus(404);
  Object.assign(r, req.body);
  save();
  res.json(r);
});

app.delete("/api/reminders/:id", (req, res) => {
  db.reminders = db.reminders.filter(x => x.id !== req.params.id);
  save();
  res.sendStatus(204);
});

async function sendDueReminders() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !db.subscriptions.length) return;

const now = new Date();
const timeZone = "Africa/Johannesburg";
const dayName = new Intl.DateTimeFormat("en-US", {
  timeZone,
  weekday: "short"
}).format(now);
const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayName);
const hhmm = now.toLocaleTimeString("en-ZA", {
  timeZone,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

  for (const r of db.reminders.filter(x => x.enabled && x.days.includes(day) && x.time === hhmm)) {
    const payload = JSON.stringify({
      title: "🔔 My Reminder",
      body: r.text,
      url: "/"
    });

    const remaining = [];
    for (const sub of db.subscriptions) {
      try {
        await webpush.sendNotification(sub, payload);
        remaining.push(sub);
      } catch (err) {
        if (err.statusCode !== 404 && err.statusCode !== 410) remaining.push(sub);
      }
    }
    db.subscriptions = remaining;
    save();
  }
}

// Check every 30 seconds. For reliable all-day operation, deploy this server
// on a host that stays running.
setupDatabase()
  .then(() => {
    setInterval(sendDueReminders, 30_000);

    app.listen(PORT, () => {
      console.log(`Reminder app running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database setup failed:", err);
    process.exit(1);
  });
