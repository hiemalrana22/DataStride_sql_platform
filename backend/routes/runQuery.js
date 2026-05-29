// ─────────────────────────────────────────────
// routes/runQuery.js
// All query-related routes — mounted under /api
// ─────────────────────────────────────────────

const express      = require("express");
const router       = express.Router();
const { runQuery, listQuestions, getQuestion } = require("../controllers/queryController");
const { getTables, runPracticeQuery } = require("../controllers/practiceController");

/**
 * GET /api/questions
 * Returns metadata for all questions (id, day, title, topic, description, starterQuery)
 * Used by the frontend to render the question list.
 */
router.get("/questions", listQuestions);

/**
 * GET /api/questions/:id
 * Full question details for the problem panel.
 */
router.get("/questions/:id", getQuestion);

/**
 * POST /api/run-query
 * Body: { questionId: number, query: string }
 * Validates and runs the user's SQL against all test cases.
 */
router.post("/run-query", runQuery);

/**
 * GET /api/practice/tables
 * Returns catalog of all available tables for the sandbox.
 */
router.get("/practice/tables", getTables);

/**
 * POST /api/practice/run
 * Body: { query: string }
 * Runs any SELECT query against the shared practice database.
 */
router.post("/practice/run", runPracticeQuery);

module.exports = router;
