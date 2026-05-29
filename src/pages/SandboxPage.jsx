import { useState, useEffect } from 'react';
import { fetchPracticeTables, runPracticeQuery } from '../services/api';
import Navbar from '../components/Navbar';
import SqlEditor from '../components/SqlEditor';
import OutputTable from '../components/OutputTable';
import Loader from '../components/Loader';

const STARTER_SQL = `-- All datasets are loaded in one database.
-- Single table:
SELECT * FROM book1 LIMIT 10;

-- JOIN across tables:
-- SELECT b1.Party_Name, b2.Campaign_Spending
-- FROM book1 b1
-- JOIN book2 b2 ON b1.Party_Name = b2.Party_Name
-- LIMIT 10;
`;

/**
 * Sandbox — all tables stay loaded; write any SELECT (JOINs, etc.).
 */
function SandboxPage({ activePage, onPageChange }) {
  const [tables, setTables] = useState([]);
  const [dbMessage, setDbMessage] = useState('');
  const [tablesError, setTablesError] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [expandedTable, setExpandedTable] = useState(null);
  const [sql, setSql] = useState(STARTER_SQL);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [hasRun, setHasRun] = useState(false);

  // Load table list once — database already has all tables on the server
  useEffect(() => {
    fetchPracticeTables()
      .then((data) => {
        setTables(data.tables || data);
        setDbMessage(data.message || '');
        setTablesError(null);
        if ((data.tables || data).length > 0) {
          setSelectedTable((data.tables || data)[0].tableName);
        }
      })
      .catch((err) => {
        setTables([]);
        setTablesError(err.message || 'Could not load tables from API.');
      });
  }, []);

  // Click table = show schema only (do not overwrite user's query)
  const handleTableClick = (tableName) => {
    setSelectedTable(tableName);
    setExpandedTable((prev) => (prev === tableName ? null : tableName));
  };

  const handleRun = async () => {
    setIsRunning(true);
    setHasRun(false);
    setResult(null);
    try {
      const data = await runPracticeQuery(sql);
      setResult(data);
    } catch (err) {
      setResult({
        rows: [],
        rowCount: 0,
        executionTime: '0ms',
        error: err.response?.data?.error || err.message || 'Network error',
      });
    } finally {
      setIsRunning(false);
      setHasRun(true);
    }
  };

  const handleReset = () => {
    setSql(STARTER_SQL);
    setHasRun(false);
    setResult(null);
  };

  const byDay = tables.reduce((acc, t) => {
    const key = `Day ${t.day}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div className="app-shell">
      <Navbar activePage={activePage} onPageChange={onPageChange} />
      <Loader visible={isRunning} />

      <div className="sandbox-layout">
        <aside className="sandbox-sidebar">
          <div className="sandbox-sidebar__header">
            Datasets ({tables.length})
          </div>

          {dbMessage && (
            <p className="sandbox-db-note">{dbMessage}</p>
          )}

          {tablesError && (
            <div className="alert alert--error" style={{ margin: '0.75rem' }} role="alert">
              {tablesError}
            </div>
          )}

          {Object.entries(byDay).map(([day, dayTables]) => (
            <div key={day} className="sandbox-day-group">
              <div className="sandbox-day-label">{day}</div>
              {dayTables.map((table) => {
                const isSelected = selectedTable === table.tableName;
                const isOpen = expandedTable === table.tableName;
                return (
                  <div key={table.tableName} className="sandbox-table-entry">
                    <button
                      type="button"
                      className={`sandbox-table-btn ${isSelected ? 'sandbox-table-btn--active' : ''}`}
                      onClick={() => handleTableClick(table.tableName)}
                      title={table.description}
                    >
                      <span className="sandbox-table-icon">⊞</span>
                      <span className="sandbox-table-name">{table.tableName}</span>
                      <span className="sandbox-table-chevron">{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && (
                      <ul className="sandbox-columns">
                        {table.columns.map((col) => (
                          <li key={col.name} className="sandbox-column">
                            <span className="sandbox-column__name">{col.name}</span>
                            <span className="sandbox-column__type">{col.type}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <div className="sandbox-hint">
            <div className="sandbox-hint__title">Multi-table SQL</div>
            <div className="sandbox-hint__text">
              All tables are loaded together. Use <code>JOIN</code>, subqueries, or multiple tables in one query.
            </div>
          </div>
        </aside>

        <div className="sandbox-main">
          <div className="sandbox-editor">
            <SqlEditor
              value={sql}
              onChange={setSql}
              onRun={handleRun}
              onReset={handleReset}
              isRunning={isRunning}
            />
          </div>

          <div className="sandbox-output">
            {hasRun && (
              <div className="sandbox-statusbar">
                {result?.error ? (
                  <span className="sandbox-statusbar__error">✗ {result.error}</span>
                ) : (
                  <>
                    <span className="sandbox-statusbar__ok">
                      ✓ {result?.rowCount ?? 0} row{result?.rowCount !== 1 ? 's' : ''} returned
                    </span>
                    <span className="sandbox-statusbar__time">{result?.executionTime}</span>
                  </>
                )}
              </div>
            )}

            {!hasRun && (
              <div className="sandbox-statusbar">
                <span className="sandbox-statusbar__idle">
                  Run any <code>SELECT</code> query — single table or JOIN.
                </span>
              </div>
            )}

            <div className="sandbox-table-wrap">
              <OutputTable rows={hasRun && !result?.error ? (result?.rows ?? []) : []} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SandboxPage;
