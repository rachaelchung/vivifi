from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.routers import (
    assignments,
    auth,
    categories,
    courses,
    grade,
    gradebook,
    grading_scale,
    notes,
    office_hours,
    semesters,
    syllabus,
)

settings = get_settings()

app = FastAPI(title="Vivifi API", version="0.1.0")

# Session cookie holds OAuth `state` between /auth/google and the Google
# callback. Must wrap the app (added last = outermost in Starlette).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.jwt_secret,
    same_site="lax",
    https_only=settings.backend_public_url.startswith("https"),
)

app.include_router(auth.router)
app.include_router(semesters.router)
app.include_router(courses.router)
app.include_router(syllabus.router)

# Milestone 3: grade math + live views.
app.include_router(categories.router)
app.include_router(grading_scale.router)
app.include_router(assignments.router)
app.include_router(gradebook.router)
app.include_router(office_hours.hosts_router)
app.include_router(office_hours.hours_router)
app.include_router(notes.router)
app.include_router(grade.router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
