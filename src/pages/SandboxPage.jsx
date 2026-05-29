import { useState, useEffect } from 'react';
import { fetchPracticeTables, fetchTablePreview, runPracticeQuery } from '../services/api';
import Navbar from '../components/Navbar';
import SqlEditor from '../components/SqlEditor';
import OutputTable from '../components/OutputTable';
import Loader from '../components/Loader';

/**
 * SandboxPage — pick any dataset, see sample output, write and run SQL.
 */
function SandboxPage({ activePage, onPageChange }) {
  const [tables, setTables] = useState([]);
  const [tablesError, setTablesError] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [expandedTable, setExpandedTable] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sql, setSql] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [hasRun, setHasRun] = useState(false);

  const selectTable = (tableName) => {
    setSelectedTable(tableName);
    setExpandedTable(tableName);
    setSql(`SELECT * FROM ${tableName} LIMIT 10;`);
    setHasRun(false);
    setResult(null);
  };

  // Load table catalog
  useEffect(() => {
    fetchPracticeTables()
      .then((data) => {
        setTables(data);
        setTablesError(null);
        if (data.length > 0) {
          selectTable(data[0].tableName);
        }
      })
      .catch((err) => {
        setTables([]);
        setTablesError(err.message || 'Could not load tables from API.');
      });
  }, []);

  // Load sample data when selected table changes
  useEffect(() => {
    if (!selectedTable) return;

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    fetchTablePreview(selectedTable)
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
          setPreviewError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTable]);

  const handleTableClick = (tableName) => {
    selectTable(tableName);
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
    if (selectedTable) {
      setSql(`SELECT * FROM ${selectedTable} LIMIT 10;`);
    }
    setHasRun(false);
    setResult(null);
  };

  const byDay = tables.reduce((acc, t) => {
    const key = `Day ${t.day}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const selectedMeta = tables.find((t) => t.tableName === selectedTable);

  return (
    <div className="app-shell">
      <Navbar activePage={activePage} onPageChange={onPageChange} />
      <Loader visible={isRunning || previewLoading} />

      <div className="sandbox-layout">
        {/* Left: dataset picker */}
        <aside className="sandbox-sidebar">
          <div className="sandbox-sidebar__header">Choose a dataset</div>

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
            <div className="sandbox-hint__title">How it works</div>
            <div className="sandbox-hint__text">
              1. Pick a dataset on the left<br />
              2. Review sample rows below<br />
              3. Write your <code>SELECT</code> query and run it
            </div>
          </div>
        </aside>

        {/* Right: editor + outputs */}
        <div className="sandbox-main">
          {selectedMeta && (
            <div className="sandbox-dataset-banner">
              <strong>{selectedMeta.tableName}</strong>
              <span>{selectedMeta.description}</span>
            </div>
          )}

          <div className="sandbox-editor">
            <SqlEditor
              value={sql}
              onChange={setSql}
              onRun={handleRun}
              onReset={handleReset}
              isRunning={isRunning}
            />
          </div>

          <div className="sandbox-output-panels">
            {/* Sample / expected output for chosen dataset */}
            <section className="sandbox-panel">
              <h3 className="sandbox-panel__title">
                Expected output — {selectedTable || 'select a dataset'}
              </h3>
              <p className="sandbox-panel__subtitle">
                Sample rows from your uploaded dataset
                {preview?.fileName ? ` (${preview.fileName})` : ''}.
              </p>
              {previewError && (
                <div className="alert alert--error" role="alert">{previewError}</div>
              )}
              {!previewError && preview?.rows && (
                <OutputTable rows={preview.rows} />
              )}
              {!previewError && !preview?.rows?.length && !previewLoading && (
                <OutputTable rows={[]} />
              )}
            </section>

            {/* User query results */}
            <section className="sandbox-panel">
              <h3 className="sandbox-panel__title">Your query results</h3>
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
                <p className="sandbox-panel__subtitle">Click Run Query to see your results here.</p>
              )}
              <div className="sandbox-table-wrap">
                <OutputTable rows={hasRun && !result?.error ? (result?.rows ?? []) : []} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SandboxPage;
