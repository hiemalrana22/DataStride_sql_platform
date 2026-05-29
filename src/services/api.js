import axios from 'axios';

// Production API on Render — override with VITE_API_URL on Vercel
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'https://datastride-sql-platform.onrender.com';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

function formatApiError(err, fallback) {
  if (err.response) {
    const status = err.response.status;
    const msg =
      err.response.data?.error ||
      err.response.data?.message ||
      `Request failed (${status})`;
    return `${msg} — ${API_BASE_URL}`;
  }
  if (err.code === 'ECONNABORTED') {
    return `Request timed out. The server may be waking up — try again in 30 seconds. (${API_BASE_URL})`;
  }
  return fallback || `Network error — could not reach ${API_BASE_URL}`;
}

/**
 * Fetch all questions for the sidebar.
 */
export async function fetchQuestions() {
  try {
    const { data } = await api.get('/api/questions');
    if (!data?.questions?.length) {
      throw new Error('No questions returned from API');
    }
    return data.questions.map((q) => ({
      ...q,
      difficulty: q.difficulty || 'Easy',
      starterSql: q.starterQuery,
    }));
  } catch (err) {
    throw new Error(formatApiError(err, 'Could not load questions'));
  }
}

/**
 * Fetch one question with schema and sample data for the problem panel.
 */
export async function fetchQuestion(questionId) {
  try {
    const { data } = await api.get(`/api/questions/${questionId}`);
    const q = data.question;
    return {
      ...q,
      starterSql: q.starterSql || q.starterQuery,
    };
  } catch (err) {
    throw new Error(formatApiError(err, `Could not load question ${questionId}`));
  }
}

/**
 * Run user SQL against the backend test cases.
 */
export async function runQuery(questionId, sql) {
  const { data } = await api.post('/api/run-query', {
    questionId,
    query: sql,
  });
  return data;
}

/**
 * Fetch all available tables for the practice sandbox.
 */
export async function fetchPracticeTables() {
  try {
    const { data } = await api.get('/api/practice/tables');
    return data;
  } catch (err) {
    throw new Error(formatApiError(err, 'Could not load practice tables'));
  }
}

/**
 * Run a free-form SELECT query against the practice database.
 */
export async function runPracticeQuery(sql) {
  const { data } = await api.post('/api/practice/run', { query: sql });
  return data;
}

export default api;
