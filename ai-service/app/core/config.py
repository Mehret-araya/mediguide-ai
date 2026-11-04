from pathlib import Path
from typing import Literal
from urllib.parse import parse_qs, urlparse

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_AI_SERVICE_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_AI_SERVICE_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = Field(default="MediGuide AI Service", min_length=1)
    app_version: str = Field(
        default="0.1.0",
        pattern=r"^\d+\.\d+\.\d+$",
    )
    app_env: Literal["development", "testing", "production"] = "development"
    debug: bool = False
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    knowledge_base_manifest: Path | None = None
    ai_service_token: SecretStr | None = None
    knowledge_database_url: SecretStr | None = None
    knowledge_database_ssl_ca: Path | None = None
    embedding_api_url: str | None = None
    embedding_api_key: SecretStr | None = None
    embedding_model: str | None = None
    embedding_timeout_seconds: float = Field(default=10.0, gt=0, le=60)

    @model_validator(mode="after")
    def validate_knowledge_store_configuration(self) -> "Settings":
        configured = (
            self.knowledge_database_url,
            self.embedding_api_url,
            self.embedding_api_key,
            self.embedding_model,
        )
        if any(value is not None for value in configured) and not all(
            value is not None for value in configured
        ):
            raise ValueError(
                "Persistent vector retrieval requires the database URL, "
                "embedding API URL, API key, and model."
            )
        if all(value is not None for value in configured):
            if (
                not self.embedding_api_url
                or not self.embedding_api_url.strip()
                or self.embedding_api_key is None
                or not self.embedding_api_key.get_secret_value().strip()
                or self.embedding_model is None
                or not self.embedding_model.strip()
            ):
                raise ValueError(
                    "Persistent vector retrieval requires non-empty embedding settings."
                )
        if self.knowledge_database_url is not None:
            database_url = urlparse(
                self.knowledge_database_url.get_secret_value()
            )
            if (
                database_url.scheme not in {"postgres", "postgresql"}
                or not database_url.hostname
            ):
                raise ValueError(
                    "Knowledge database URL must be a PostgreSQL connection URL."
                )
            if any(
                name.lower() == "sslmode"
                for name in parse_qs(database_url.query)
            ):
                raise ValueError(
                    "Omit sslmode from the database URL; the service enforces TLS."
                )
        elif self.knowledge_database_ssl_ca is not None:
            raise ValueError(
                "A database SSL CA may only be set with a knowledge database URL."
            )
        return self
