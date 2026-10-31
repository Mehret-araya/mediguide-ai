from fastapi import FastAPI

app = FastAPI(
    title="MediGuide AI Service",
    description=(
        "Internal AI-service foundation. "
        "Health education generation is not implemented."
    ),
    version="0.1.0",
)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    """Report that the AI-service process is responding."""
    return {"status": "ok", "service": "MediGuide AI service"}
