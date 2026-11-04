import os
import pytest

if os.environ.get("DEBUG") not in {"true", "false", "1", "0", "True", "False", None}:
    os.environ.pop("DEBUG", None)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
