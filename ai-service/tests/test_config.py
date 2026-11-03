from pathlib import Path

import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import Settings


def test_settings_use_safe_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "APP_NAME",
        "APP_VERSION",
        "APP_ENV",
        "DEBUG",
        "LOG_LEVEL",
        "KNOWLEDGE_BASE_MANIFEST",
        "KNOWLEDGE_DATABASE_URL",
        "KNOWLEDGE_DATABASE_SSL_CA",
        "EMBEDDING_API_URL",
        "EMBEDDING_API_KEY",
        "EMBEDDING_MODEL",
        "EMBEDDING_TIMEOUT_SECONDS",
        "AI_SERVICE_TOKEN",
    ):
        monkeypatch.delenv(name, raising=False)

    settings = Settings(_env_file=None)

    assert settings.app_name == "MediGuide AI Service"
    assert settings.app_version == "0.1.0"
    assert settings.app_env == "development"
    assert settings.debug is False
    assert settings.log_level == "INFO"


def test_settings_load_environment_variables(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_NAME", "MediGuide Test Service")
    monkeypatch.setenv("APP_VERSION", "1.2.3")
    monkeypatch.setenv("APP_ENV", "testing")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")

    settings = Settings(_env_file=None)

    assert settings.app_name == "MediGuide Test Service"
    assert settings.app_version == "1.2.3"
    assert settings.app_env == "testing"
    assert settings.debug is True
    assert settings.log_level == "DEBUG"


def test_settings_loads_optional_knowledge_base_manifest(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    manifest = tmp_path / "approved-sources.json"
    monkeypatch.setenv("KNOWLEDGE_BASE_MANIFEST", str(manifest))

    settings = Settings(_env_file=None)

    assert settings.knowledge_base_manifest == manifest


def test_settings_loads_internal_service_token_without_revealing_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_SERVICE_TOKEN", "test-internal-token")

    settings = Settings(_env_file=None)

    assert settings.ai_service_token is not None
    assert settings.ai_service_token.get_secret_value() == "test-internal-token"
    assert "test-internal-token" not in repr(settings)


def test_settings_load_optional_env_file(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("APP_NAME=File Configured Service\nAPP_ENV=testing\n")

    settings = Settings(_env_file=env_file)

    assert settings.app_name == "File Configured Service"
    assert settings.app_env == "testing"


def test_persistent_retrieval_requires_all_provider_and_database_settings() -> None:
    with pytest.raises(ValidationError, match="requires the database URL"):
        Settings(
            _env_file=None,
            knowledge_database_url=SecretStr(
                "postgresql://test:test@localhost:5432/mediguide"
            ),
        )


def test_persistent_retrieval_accepts_complete_loopback_configuration() -> None:
    settings = Settings(
        _env_file=None,
        knowledge_database_url=SecretStr(
            "postgresql://test:test@localhost:5432/mediguide"
        ),
        embedding_api_url="http://localhost:9000/v1/embeddings",
        embedding_api_key=SecretStr("test-embedding-key"),
        embedding_model="fixture-model",
    )

    assert settings.embedding_model == "fixture-model"


@pytest.mark.parametrize(
    "database_url",
    [
        "https://db.example.invalid",
        "postgresql://",
    ],
)
def test_persistent_retrieval_rejects_non_postgresql_database_urls(
    database_url: str,
) -> None:
    with pytest.raises(ValidationError, match="PostgreSQL connection URL"):
        Settings(
            _env_file=None,
            knowledge_database_url=SecretStr(database_url),
            embedding_api_url="https://embedding.example/v1/embeddings",
            embedding_api_key=SecretStr("fixture-key"),
            embedding_model="fixture-model",
        )


def test_persistent_retrieval_rejects_database_sslmode_overrides() -> None:
    with pytest.raises(ValidationError, match="service enforces TLS"):
        Settings(
            _env_file=None,
            knowledge_database_url=SecretStr(
                "postgresql://test:test@db.example.invalid/mediguide?sslmode=disable"
            ),
            embedding_api_url="https://embedding.example/v1/embeddings",
            embedding_api_key=SecretStr("fixture-key"),
            embedding_model="fixture-model",
        )


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("APP_ENV", "staging"),
        ("APP_VERSION", "not-a-version"),
        ("DEBUG", "sometimes"),
        ("LOG_LEVEL", "TRACE"),
    ],
)
def test_settings_reject_invalid_environment_values(
    monkeypatch: pytest.MonkeyPatch,
    name: str,
    value: str,
) -> None:
    monkeypatch.setenv(name, value)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
