"""Cross-cutting HTTP concerns: request identity, logging, limits, headers.

Everything here is process-local by design. That's correct for a single-node
deployment and honest about its ceiling: the moment this runs behind more than
one worker, the rate limiter needs to move to Redis. The interface won't
change when it does.
"""

import logging
import time
import uuid
from collections import defaultdict, deque
from threading import Lock

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

logger = logging.getLogger("pfip.http")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Tag every request with an id and log its outcome and duration.

    The id goes out on the response so a user reporting "it failed" can hand
    over something that finds the exact line in the logs.
    """

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
        request.state.request_id = request_id
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            elapsed = (time.perf_counter() - started) * 1000
            logger.exception("%s %s -> 500 in %.0fms [%s]",
                             request.method, request.url.path, elapsed, request_id)
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "request_id": request_id},
                headers={"X-Request-ID": request_id},
            )

        elapsed = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["Server-Timing"] = f"app;dur={elapsed:.1f}"
        level = logging.WARNING if response.status_code >= 500 else logging.INFO
        # Health checks would otherwise drown out everything worth reading.
        if request.url.path != "/api/health":
            logger.log(level, "%s %s -> %s in %.0fms [%s]", request.method,
                       request.url.path, response.status_code, elapsed, request_id)
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Baseline hardening headers.

    The CSP is deliberately not set here: the API serves JSON, and the SPA is
    served by its own host (Vite in dev, a CDN in production) which owns its
    own policy. Setting a CSP on JSON responses would be theatre.
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter, keyed by client IP and route class.

    Three budgets, because the routes cost wildly different amounts:
      auth  — cheap to call, expensive to brute-force
      ai    — every request costs a model call
      other — ordinary reads
    """

    def __init__(self, app):
        super().__init__(app)
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _budget(self, path: str) -> tuple[str, int]:
        if path.startswith("/api/auth/login") or path.startswith("/api/auth/register"):
            return "auth", settings.auth_rate_limit_per_minute
        if path.startswith("/api/chat") or path.startswith("/api/insights/generate"):
            return "ai", settings.ai_rate_limit_per_minute
        return "general", settings.rate_limit_per_minute

    def _client(self, request: Request) -> str:
        # Behind a proxy the first XFF hop is the real client.
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS" or request.url.path == "/api/health":
            return await call_next(request)

        bucket, limit = self._budget(request.url.path)
        key = f"{bucket}:{self._client(request)}"
        now = time.monotonic()

        with self._lock:
            if len(self._hits) > 1000:
                stale = [k for k, win in self._hits.items() if not win or (now - win[-1] > 120)]
                for k in stale:
                    del self._hits[k]

            window = self._hits[key]
            while window and now - window[0] > 60:
                window.popleft()
            if len(window) >= limit:
                retry_after = int(60 - (now - window[0])) + 1
                logger.warning("Rate limit hit for %s on %s", key, request.url.path)
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Too many requests — please slow down.",
                             "retry_after": retry_after},
                    headers={"Retry-After": str(retry_after)},
                )
            window.append(now)
            remaining = limit - len(window)

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(remaining, 0))
        return response
