from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app import migrations
from app.config import settings
from app.database import engine
from app.middleware import (
    RateLimitMiddleware, RequestContextMiddleware, SecurityHeadersMiddleware,
)
from app.routers import (
    analytics, auth, budgets, chat, goals, insights, reports, rules, statements, transactions,
)
from app.services import gemini_client, pdf_report

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("pfip")

migrations.run(engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("PFIP API %s starting in %s mode", app.version, settings.environment)
    logger.info("AI categorization/chat: %s",
                "Gemini online" if gemini_client.is_available() else "offline (local engines)")
    logger.info("PDF export: %s", "available" if pdf_report.AVAILABLE else "reportlab not installed")
    if settings.is_production and settings.secret_key == "dev-secret-change-in-production":
        logger.error("PFIP_SECRET_KEY is still the development default — set a real secret.")
    yield


app = FastAPI(
    title="PFIP API",
    description=(
        "Personal Finance Intelligence Platform — statement parsing, AI categorization, "
        "analytics, budgets, goals, cash-flow forecasting and a grounded AI assistant."
    ),
    version="1.0.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    lifespan=lifespan,
)

# Order matters: middleware added last runs first, so request context (and the
# request id it attaches) wraps everything, including rate-limit rejections.
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-RateLimit-Remaining", "Content-Disposition"],
)

for router in (auth.router, statements.router, transactions.router, analytics.router,
               budgets.router, goals.router, rules.router, insights.router,
               chat.router, reports.router):
    app.include_router(router)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    """Turn pydantic's nested error objects into one readable sentence.

    The default shape is accurate and unreadable; the UI shows `detail`
    verbatim, so it needs to be something a person can act on.
    """
    problems = []
    for error in exc.errors():
        field = ".".join(str(p) for p in error["loc"] if p not in ("body", "query"))
        problems.append(f"{field}: {error['msg']}" if field else error["msg"])
    return JSONResponse(status_code=422, content={"detail": "; ".join(problems[:5])})


@app.get("/api/health", tags=["meta"])
def healthcheck():
    return {
        "status": "ok",
        "service": "pfip-api",
        "version": app.version,
        "environment": settings.environment,
        "ai_online": gemini_client.is_available(),
        "pdf_export": pdf_report.AVAILABLE,
        "models": {"main": settings.gemini_model_main, "lite": settings.gemini_model_lite},
    }



