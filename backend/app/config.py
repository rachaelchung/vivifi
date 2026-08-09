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

    # Google OAuth (optional). When either client id or secret is empty, the
    # /auth/google routes return 503 and the login UI hides the button.
    google_client_id: str = ""
    google_client_secret: str = ""
    # Public URL of this API (no trailing slash), e.g.
    # http://localhost:8000 or https://vivifi-api.onrender.com
    # Used as the OAuth redirect_uri base: {backend_public_url}/auth/google/callback
    backend_public_url: str = "http://localhost:8000"
    # Where to send the browser after a successful Google sign-in
    # (no trailing slash), e.g. http://localhost:5173 or
    # https://username.github.io/vire
    frontend_url: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def google_oauth_enabled(self) -> bool:
        return bool(self.google_client_id.strip() and self.google_client_secret.strip())

    @property
    def google_redirect_uri(self) -> str:
        return f"{self.backend_public_url.rstrip('/')}/auth/google/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()
