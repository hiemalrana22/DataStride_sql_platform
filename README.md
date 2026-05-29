# DataStride SQL Platform

A LeetCode-style SQL learning frontend built with React + Vite. Users solve predefined SQL problems in a Monaco editor with mock query execution (backend integration ready).

## Tech stack

- React (functional components)
- Vite
- Monaco Editor
- Axios
- Plain CSS (VSCode-inspired dark theme)

## Local development

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |

## Deploy on Vercel

1. Import this repository on [Vercel](https://vercel.com).
2. Framework preset: **Vite**
3. Build command: `npm run build`
4. Output directory: `dist`
5. Install command: `npm install`

No environment variables required for the current mock API.

## Deploy on Render (backend)

1. **New Web Service** → connect this repo
2. **Root Directory:** `backend`
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. **Environment:** `NODE_VERSION` = `20.19.0` (Render defaults to Node 24, which breaks native SQLite builds)

Or deploy via `render.yaml` at the repo root.

### Connect frontend (Vercel)

The app calls `https://oranjestride-sql-platform.onrender.com` by default.

On Vercel → **Settings** → **Environment Variables**, optionally set:

| Key | Value |
|-----|--------|
| `VITE_API_URL` | `https://oranjestride-sql-platform.onrender.com` |

Redeploy after adding the variable.

## Project structure

```
src/
├── components/   UI components
├── pages/        PracticePage
├── services/     api.js (mock + axios)
├── data/         mockQuestions.js
└── styles/       CSS
```

## License

Private — DataStride platform.
