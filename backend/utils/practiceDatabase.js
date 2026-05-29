// ─────────────────────────────────────────────
// utils/practiceDatabase.js
//
// Loads ALL CSV files from backend/datasets/ (uploaded by owner).
// Each file becomes one SQLite table. Schema and sample rows
// are read automatically from the CSV header.
// ─────────────────────────────────────────────

const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Primary folder: owner-uploaded datasets
const DATASETS_DIR = path.join(__dirname, "..", "datasets");
const FALLBACK_DIR = path.join(__dirname, "..", "db", "datasets");

const MAX_ROWS_SMALL_FILE = 2000;
const MAX_ROWS_LARGE_FILE = 500;
const LARGE_FILE_BYTES = 1_500_000;

let practiceDb = null;
let tableCatalog = [];

// ── Sanitize names for SQL ───────────────────
function toTableName(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  return base
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "t_$1");
}

function toColumnName(name) {
  return name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/^(\d)/, "c_$1");
}

function maybeNum(val) {
  if (val === "" || val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isNaN(n) ? val : n;
}

function inferSqlType(values) {
  let ints = 0;
  let reals = 0;
  let nonNumeric = 0;
  const sample = values.filter((v) => v !== "" && v != null).slice(0, 50);

  for (const v of sample) {
    const n = Number(v);
    if (Number.isNaN(n)) {
      nonNumeric++;
    } else if (Number.isInteger(n) && !String(v).includes(".")) {
      ints++;
    } else {
      reals++;
    }
  }

  if (nonNumeric > 0) return "TEXT";
  if (reals > 0) return "REAL";
  if (ints > 0) return "INTEGER";
  return "TEXT";
}

// Parse one CSV line (handles quoted commas)
function parseCsvLine(line) {
  const row = [];
  let field = "";
  let inQuote = false;

  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      row.push(field.trim());
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  return row;
}

// Read small CSV files entirely
function parseSmallCsv(filePath, maxDataRows) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map(toColumnName);
  const rows = [];

  for (let i = 1; i < lines.length && rows.length < maxDataRows; i++) {
    rows.push(parseCsvLine(lines[i]));
  }

  return { headers, rows };
}

// Stream large CSV — only load header + limited rows (saves memory on Render)
function parseLargeCsv(filePath, maxDataRows) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let headers = null;
    let lineIndex = 0;

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      if (!line.trim()) return;

      if (lineIndex === 0) {
        headers = parseCsvLine(line).map(toColumnName);
      } else if (rows.length < maxDataRows) {
        rows.push(parseCsvLine(line));
      } else {
        rl.close();
      }
      lineIndex++;
    });

    rl.on("close", () => resolve({ headers: headers || [], rows }));
    rl.on("error", reject);
  });
}

async function loadCsvFile(filePath) {
  const size = fs.statSync(filePath).size;
  const maxRows = size > LARGE_FILE_BYTES ? MAX_ROWS_LARGE_FILE : MAX_ROWS_SMALL_FILE;

  if (size > LARGE_FILE_BYTES) {
    return parseLargeCsv(filePath, maxRows);
  }
  return parseSmallCsv(filePath, maxRows);
}

function discoverCsvFiles() {
  // Use owner uploads in backend/datasets/ when present
  let dir = DATASETS_DIR;
  if (!fs.existsSync(dir) || !fs.readdirSync(dir).some((f) => f.toLowerCase().endsWith(".csv"))) {
    dir = FALLBACK_DIR;
  }

  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((name) => ({
      filePath: path.join(dir, name),
      fileName: name,
      tableName: toTableName(name),
    }))
    .sort((a, b) => a.tableName.localeCompare(b.tableName));
}

function guessDay(tableName) {
  if (["book1", "book2"].includes(tableName)) return 8;
  if (tableName.includes("constituency") || tableName.includes("election")) return 9;
  return 10;
}

async function buildPracticeDatabase() {
  const db = new Database(":memory:");
  const catalog = [];
  const csvFiles = discoverCsvFiles();

  if (csvFiles.length === 0) {
    throw new Error(
      "No CSV datasets found. Upload .csv files to backend/datasets/"
    );
  }

  for (const { filePath, fileName, tableName } of csvFiles) {
    const { headers, rows } = await loadCsvFile(filePath);

    if (headers.length === 0) {
      console.warn(`Skipping empty file: ${fileName}`);
      continue;
    }

    const columnTypes = headers.map((_, colIdx) => {
      const colValues = rows.map((r) => r[colIdx]);
      return inferSqlType(colValues);
    });

    const colDefs = headers
      .map((h, i) => `"${h}" ${columnTypes[i]}`)
      .join(", ");

    db.exec(`CREATE TABLE "${tableName}" (${colDefs})`);

    const placeholders = headers.map(() => "?").join(", ");
    const ins = db.prepare(
      `INSERT INTO "${tableName}" VALUES (${placeholders})`
    );

    for (const row of rows) {
      const padded = headers.map((_, i) => maybeNum(row[i] ?? ""));
      ins.run(...padded);
    }

    catalog.push({
      tableName,
      fileName,
      day: guessDay(tableName),
      description: `Dataset from ${fileName} (${rows.length} rows loaded)`,
      rowCount: rows.length,
      columns: headers.map((name, i) => ({
        name,
        type: columnTypes[i],
      })),
    });

    console.log(`Loaded ${tableName} ← ${fileName} (${rows.length} rows)`);
  }

  return { db, catalog };
}

// Sync wrapper — build once on first use
let buildPromise = null;

function getPracticeDb() {
  if (practiceDb) return practiceDb;
  throw new Error(
    "Database not ready. Call initPracticeDb() at server startup."
  );
}

function getTableCatalog() {
  return tableCatalog;
}

function getTableMeta(tableName) {
  return tableCatalog.find((t) => t.tableName === tableName) || null;
}

function getTablePreview(tableName, limit = 10) {
  const meta = getTableMeta(tableName);
  if (!meta) {
    throw new Error(`Unknown dataset: ${tableName}`);
  }
  const db = getPracticeDb();
  const rows = db.prepare(`SELECT * FROM "${tableName}" LIMIT ${limit}`).all();
  return { tableName, columns: meta.columns, rows, fileName: meta.fileName };
}

async function initPracticeDb() {
  if (practiceDb) return practiceDb;
  if (!buildPromise) {
    buildPromise = buildPracticeDatabase()
      .then(({ db, catalog }) => {
        practiceDb = db;
        tableCatalog = catalog;
        console.log(`Practice DB ready — ${catalog.length} datasets`);
        return db;
      })
      .catch((err) => {
        buildPromise = null;
        throw err;
      });
  }
  return buildPromise;
}

module.exports = {
  initPracticeDb,
  getPracticeDb,
  getTableCatalog,
  getTableMeta,
  getTablePreview,
  // Legacy export name used by controller
  get TABLE_CATALOG() {
    return tableCatalog;
  },
};
