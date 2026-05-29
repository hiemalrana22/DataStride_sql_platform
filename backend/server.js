// ─────────────────────────────────────────────
// server.js  –  Entry point for the backend
// ─────────────────────────────────────────────

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { initPracticeDb } = require("./utils/practiceDatabase");

const runQueryRoute = require("./routes/runQuery");

const app = express();
const PORT = process.env.PORT || 5000;

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    callback(null, true);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "SQL Learning Platform API is running ✅" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "datastride-sql-api" });
});

app.use("/api", runQueryRoute);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// Load uploaded CSV datasets before accepting traffic
initPracticeDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is running on port ${PORT}`);
      console.log("Datasets loaded from backend/datasets/");
    });
  })
  .catch((err) => {
    console.error("Failed to load practice datasets:", err.message);
    process.exit(1);
  });
