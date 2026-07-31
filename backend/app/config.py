from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./vivifi.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    cors_origins: str = "http://localhost:5173"

    # Claude configuration. Empty ANTHROPIC_API_KEY disables live extraction —
    # the endpoint returns a helpful 503 so devs know why. Model is configurable
    # so we can upgrade without a code change.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5"

    # Syllabus PDF upload size cap (SPEC: 10 MB). Bytes.
    syllabus_max_bytes: int = 10 * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
