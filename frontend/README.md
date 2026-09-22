# PFIP Frontend (React + TypeScript + Tailwind)

Production-style UI for the Personal Finance Intelligence Platform: animated
landing page, auth, and a full dashboard app (overview, transactions,
analytics, insights, AI assistant, reports, upload).

## Quick start

```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The dev server proxies `/api` to the backend at `http://localhost:8000`
(see `vite.config.ts`), so start the backend first.

## Stack

- **Vite + React 18 + TypeScript** (strict)
- **Tailwind CSS** — custom deep-space fintech theme (`tailwind.config.js`)
- **framer-motion** — page/card entrance animations, micro-interactions
- **Recharts** — cashflow area chart, category donut, savings bars, SVG health gauge
- **TanStack Query** — server state, caching, invalidation after uploads
- **React Router v6** — landing / auth / protected app shell
- **lucide-react** — icon system

## Layout

```
src/
├── main.tsx / App.tsx      Providers, routes, protected-route guard
├── index.css               Theme layer: glass cards, buttons, inputs, grid bg
├── lib/                    api.ts (axios + endpoints), types.ts, utils.ts
├── context/AuthContext.tsx JWT session management
├── layouts/AppLayout.tsx   Sidebar shell (desktop) + mobile nav
├── components/             Logo, ui primitives, StatCard, charts, TxnRow
└── pages/                  Landing, Login, Register, Dashboard, Transactions,
                            Upload, Analytics, Insights, Assistant, Reports
```

Build for production with `npm run build` (type-checks with `tsc`, outputs `dist/`).
