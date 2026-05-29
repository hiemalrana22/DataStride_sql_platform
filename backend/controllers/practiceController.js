// ─────────────────────────────────────────────
// controllers/practiceController.js
//
// Handles the free-form SQL sandbox:
//
//   GET  /api/practice/tables  — list all available tables + schema
//   POST /api/practice/run     — run any SELECT query against all datasets
// ─────────────────────────────────────────────

const { getPracticeDb, getTableCatalog, getTablePreview } = require("../utils/practiceDatabase");
const { validateQuery } = require("../utils/validateQuery");

// ─────────────────────────────────────────────
// GET /api/practice/tables
// Returns the full table catalog so the frontend
// can render the "Available Tables" panel.
// ─────────────────────────────────────────────
function getTables(req, res) {
  return res.status(200).json({ tables: getTableCatalog() });
}

// ─────────────────────────────────────────────
// GET /api/practice/tables/:tableName/preview
// Returns sample rows for the selected dataset.
// ─────────────────────────────────────────────
function previewTable(req, res) {
  const { tableName } = req.params;
  try {
    const preview = getTablePreview(tableName, 10);
    return res.status(200).json(preview);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────
// POST /api/practice/run
// Body: { query: string }
// Runs the user's SQL on the shared practice DB
// and returns up to 200 result rows.
// ─────────────────────────────────────────────
function runPracticeQuery(req, res) {
  const startTime = Date.now();
  const { query } = req.body;

  // ── 1. Require a query ───────────────────
  if (!query || query.trim() === "") {
    return res.status(400).json({
      rows:          [],
      executionTime: "0ms",
      error:         "Query cannot be empty.",
    });
  }

  // ── 2. Validate — only SELECT / WITH ─────
  const validation = validateQuery(query);
  if (!validation.valid) {
    return res.status(400).json({
      rows:          [],
      executionTime: `${Date.now() - startTime}ms`,
      error:         validation.error,
    });
  }

  // ── 3. Execute against the practice DB ───
  let rows;
  try {
    const db = getPracticeDb();
    rows = db.prepare(query.trim()).all().slice(0, 200);
  } catch (err) {
    return res.status(200).json({
      rows:          [],
      executionTime: `${Date.now() - startTime}ms`,
      error:         `SQL error: ${err.message}`,
    });
  }

  return res.status(200).json({
    rows,
    rowCount:      rows.length,
    executionTime: `${Date.now() - startTime}ms`,
    error:         null,
  });
}

module.exports = { getTables, previewTable, runPracticeQuery };
