# PFIP Backend (FastAPI + Gemini)

AI-powered financial analytics API: statement parsing, Gemini categorization,
analytics engine, financial health score, smart insights, and a grounded AI
assistant.

## Quick start

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env       # then add your GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

- **Without a Gemini key** everything still works — categorization, insights and
  chat fall back to deterministic local engines.
- **Optional local ML**: `pip install -r requirements-ml.txt` enables the
  torch autoencoder anomaly detector (numpy z-score is used otherwise).

## Model routing

| Task | Model | Env var |
|---|---|---|
| Chat assistant, insight narratives | `gemini-3.6-flash` | `GEMINI_MODEL_MAIN` |
| Categorization, merchant cleanup | `gemma-4-26b-a4b-it` (or `gemini-3.1-flash-lite`) | `GEMINI_MODEL_LITE` |

## Layout

```
app/
├── main.py            FastAPI app, CORS, router registration
├── config.py          pydantic-settings (env / .env)
├── database.py        SQLAlchemy engine + session (SQLite for MVP)
├── models.py          User, Statement, Transaction, ChatMessage, Insight
├── schemas.py         Pydantic request/response contracts
├── security.py        PBKDF2 password hashing + JWT
├── deps.py            get_current_user dependency
├── routers/           auth, statements, transactions, analytics, insights, chat, reports
└── services/
    ├── parser.py           PDF/CSV statement parsing engine
    ├── categorizer.py      Gemini-lite + keyword-fallback categorization
    ├── gemini_client.py    Model routing + graceful degradation
    ├── import_service.py   Upload pipeline (parse→categorize→ML→persist)
    ├── analytics.py        Monthly/yearly/overview metrics
    ├── health_score.py     8-component financial health score
    ├── insights_service.py Rule-based detectors + AI narratives
    ├── chat_service.py     RAG-lite grounded assistant
    └── ml_local.py         Recurring + anomaly detection (numpy/torch)
```

See `../implementation/` for the full architecture plan, production roadmap
(Firestore, Firebase Auth, GCP) and per-component design docs.
