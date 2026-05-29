// ─────────────────────────────────────────────
// utils/practiceDatabase.js
//
// All CSV files in backend/datasets/ → ONE SQLite database.
// Built once at startup (cached on disk until CSVs change).
// Supports single-table queries, JOINs, subqueries, etc.
// ─────────────────────────────────────────────

const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const DATASETS_DIR = path.join(__dirname, "..", "datasets");
const FALLBACK_DIR = path.join(__dirname, "..", "db", "datasets");
const DB_DIR = path.join(__dirname, "..", "db");
const DB_PATH = path.join(DB_DIR, "practice.sqlite");
const MANIFEST_PATH = path.join(DB_DIR, "practice-manifest.json");

const MAX_ROWS_SMALL_FILE = 5000;
const MAX_ROWS_LARGE_FILE = 2000;
const LARGE_FILE_BYTES = 1_500_000;

let practiceDb = null;
let tableCatalog = [];

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
      mtime: fs.statSync(path.join(dir, name)).mtimeMs,
    }))
    .sort((a, b) => a.tableName.localeCompare(b.tableName));
}

function guessDay(tableName) {
  if (["book1", "book2"].includes(tableName)) return 8;
  if (tableName.includes("constituency") || tableName.includes("election")) return 9;
  return 10;
}

function getCsvFingerprint(files) {
  return files.map((f) => `${f.fileName}:${f.mtime}`).join("|");
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeManifest(files, catalog) {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  fs.writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(
      {
        fingerprint: getCsvFingerprint(files),
        builtAt: new Date().toISOString(),
        tables: catalog.map((t) => ({
          tableName: t.tableName,
          fileName: t.fileName,
          rowCount: t.rowCount,
        })),
      },
      null,
      2
    )
  );
}

function needsRebuild(files) {
  if (!fs.existsSync(DB_PATH)) return true;
  const manifest = readManifest();
  if (!manifest) return true;
  return manifest.fingerprint !== getCsvFingerprint(files);
}

async function buildPracticeDatabase(dbPath) {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new Database(dbPath);
  const catalog = [];
  const csvFiles = discoverCsvFiles();

  if (csvFiles.length === 0) {
    throw new Error("No CSV datasets found. Upload .csv files to backend/datasets/");
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

    const colDefs = headers.map((h, i) => `"${h}" ${columnTypes[i]}`).join(", ");

    db.exec(`CREATE TABLE "${tableName}" (${colDefs})`);

    const placeholders = headers.map(() => "?").join(", ");
    const ins = db.prepare(`INSERT INTO "${tableName}" VALUES (${placeholders})`);

    const insertMany = db.transaction((dataRows) => {
      for (const row of dataRows) {
        const padded = headers.map((_, i) => maybeNum(row[i] ?? ""));
        ins.run(...padded);
      }
    });

    insertMany(rows);

    catalog.push({
      tableName,
      fileName,
      day: guessDay(tableName),
      description: `${fileName} — ${rows.length} rows (JOINs enabled)`,
      rowCount: rows.length,
      columns: headers.map((name, i) => ({ name, type: columnTypes[i] })),
    });

    console.log(`  ✓ ${tableName} ← ${fileName} (${rows.length} rows)`);
  }

  return { db, catalog, csvFiles };
}

let buildPromise = null;

function getPracticeDb() {
  if (practiceDb) return practiceDb;
  throw new Error("Database not ready. Call initPracticeDb() at server startup.");
}

function getTableCatalog() {
  return tableCatalog;
}

function getPracticeStatus() {
  const db = getPracticeDb();
  const names = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    .all()
    .map((r) => r.name);

  return {
    ready: true,
    tableCount: names.length,
    tables: names,
    catalog: tableCatalog,
    message: "All datasets loaded in one database. JOINs and multi-table queries are supported.",
  };
}

async function initPracticeDb() {
  if (practiceDb) return practiceDb;

  if (!buildPromise) {
    buildPromise = (async () => {
      const csvFiles = discoverCsvFiles();

      if (needsRebuild(csvFiles)) {
        console.log("Building practice database from CSV files...");
        if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

        const { catalog } = await buildPracticeDatabase(DB_PATH);
        tableCatalog = catalog;
        writeManifest(csvFiles, catalog);
        console.log(`Practice DB built — ${catalog.length} tables in ${DB_PATH}`);
      } else {
        console.log("Using cached practice database:", DB_PATH);
        const manifest = readManifest();
        practiceDb = new Database(DB_PATH);
        tableCatalog = getTableCatalogFromDb(practiceDb, manifest);
        console.log(`Practice DB ready — ${tableCatalog.length} tables (cached)`);
        return practiceDb;
      }

      practiceDb = new Database(DB_PATH);
      return practiceDb;
    })().catch((err) => {
      buildPromise = null;
      throw err;
    });
  }

  return buildPromise;
}

function getTableCatalogFromDb(db, manifest) {
  const files = discoverCsvFiles();
  const catalog = [];

  for (const { fileName, tableName } of files) {
    const countRow = db
      .prepare(`SELECT COUNT(*) AS c FROM "${tableName}"`)
      .get();
    const cols = db.prepare(`PRAGMA table_info("${tableName}")`).all();

    catalog.push({
      tableName,
      fileName,
      day: guessDay(tableName),
      description: `${fileName} — ${countRow.c} rows (JOINs enabled)`,
      rowCount: countRow.c,
      columns: cols.map((c) => ({ name: c.name, type: c.type })),
    });
  }

  return catalog;
}

module.exports = {
  initPracticeDb,
  getPracticeDb,
  getTableCatalog,
  getPracticeStatus,
  get TABLE_CATALOG() {
    return tableCatalog;
  },
};
