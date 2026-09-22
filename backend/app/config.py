from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "PFIP API"
    environment: str = "development"  # development | production
    secret_key: str = "dev-secret-change-in-production"
    database_url: str = "sqlite:///./pfip.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    access_token_expire_minutes: int = 60 * 24 * 7

    # Uploads
    max_upload_mb: int = 15
    max_transactions_per_statement: int = 20_000

    # Abuse protection (in-process token bucket; swap for Redis when horizontal)
    rate_limit_per_minute: int = 240
    auth_rate_limit_per_minute: int = 20
    ai_rate_limit_per_minute: int = 30

    gemini_api_key: str = ""
    gemini_model_main: str = "gemini-3.6-flash"
    gemini_model_lite: str = "gemma-4-26b-a4b-it"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower().startswith("prod")

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


class _PrefixedSettings(Settings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PFIP_", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    base = Settings()
    prefixed = _PrefixedSettings()
    # PFIP_-prefixed values win when explicitly set (differ from defaults).
    merged = base.model_copy()
    for field in Settings.model_fields:
        default = Settings.model_fields[field].default
        pref_val = getattr(prefixed, field)
        if pref_val != default:
            setattr(merged, field, pref_val)
    return merged


settings = get_settings()
