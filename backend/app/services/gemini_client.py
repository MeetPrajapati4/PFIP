"""Thin wrapper around the google-genai SDK.

Model routing policy:
  - MAIN  (gemini-3.5-flash)            -> reasoning-heavy tasks: chat assistant,
                                           insight narratives, report summaries.
  - LITE  (gemini-3.1-flash-lite-*)     -> small / high-volume tasks: transaction
                                           categorization, merchant normalization.

Every call degrades gracefully: if no API key is configured or the call fails,
callers receive None and fall back to deterministic local logic, so the whole
platform remains fully functional offline.
"""

import json
import logging
import re

from app.config import settings

logger = logging.getLogger("pfip.gemini")

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not settings.gemini_api_key:
        return None
    try:
        from google import genai

        _client = genai.Client(api_key=settings.gemini_api_key)
        return _client
    except Exception as exc:  # SDK missing or bad key
        logger.warning("Gemini client unavailable: %s", exc)
        return None


def is_available() -> bool:
    return _get_client() is not None


_MODEL_ALIASES: dict[str, str] = {
    "gemma-4-36b": "gemma-4-26b-a4b-it",
    "gemma-4-36b-it": "gemma-4-26b-a4b-it",
    "gemma-4-31b": "gemma-4-31b-it",
}

_FALLBACK_CANDIDATES: dict[str, list[str]] = {
    "gemini-3.6-flash": ["gemini-3.5-flash", "gemini-2.5-flash"],
    "gemma-4-26b-a4b-it": ["gemini-3.1-flash-lite-preview", "gemini-3.5-flash-lite"],
}


def _resolve_model(name: str) -> str:
    cleaned = (name or "").strip().lower().removeprefix("models/")
    return _MODEL_ALIASES.get(cleaned, cleaned)


def generate(prompt: str, *, lite: bool = False, system: str | None = None,
             json_mode: bool = False, temperature: float = 0.4) -> str | None:
    """Generate text. Returns None on any failure so callers can fall back."""
    client = _get_client()
    if client is None:
        return None
    model = _resolve_model(settings.gemini_model_lite if lite else settings.gemini_model_main)
    try:
        from google.genai import types

        config = types.GenerateContentConfig(
            temperature=temperature,
            system_instruction=system,
            response_mime_type="application/json" if json_mode else None,
        )
        response = client.models.generate_content(model=model, contents=prompt, config=config)
        return response.text
    except Exception as exc:
        logger.warning("Gemini generate failed (%s): %s", model, exc)
        for alt in _FALLBACK_CANDIDATES.get(model, []):
            try:
                logger.info("Attempting fallback model %s", alt)
                response = client.models.generate_content(model=alt, contents=prompt, config=config)
                return response.text
            except Exception:
                continue
        return None


def generate_stream(prompt: str, *, system: str | None = None, temperature: float = 0.4):
    """Yield response chunks as they arrive."""
    client = _get_client()
    if client is None:
        return
    model = _resolve_model(settings.gemini_model_main)
    try:
        from google.genai import types

        config = types.GenerateContentConfig(temperature=temperature, system_instruction=system)
        stream = client.models.generate_content_stream(model=model, contents=prompt, config=config)
        for chunk in stream:
            text = getattr(chunk, "text", None)
            if text:
                yield text
    except Exception as exc:
        logger.warning("Gemini stream failed (%s): %s", model, exc)
        for alt in _FALLBACK_CANDIDATES.get(model, []):
            try:
                logger.info("Attempting streaming fallback model %s", alt)
                alt_stream = client.models.generate_content_stream(model=alt, contents=prompt, config=config)
                for chunk in alt_stream:
                    text = getattr(chunk, "text", None)
                    if text:
                        yield text
                return
            except Exception:
                continue


def generate_json(prompt: str, *, lite: bool = False, system: str | None = None) -> dict | list | None:
    """Generate and parse a JSON response; None if generation or parsing fails."""
    text = generate(prompt, lite=lite, system=system, json_mode=True, temperature=0.1)
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"[\[{].*[\]}]", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    logger.warning("Gemini returned non-JSON payload")
    return None
