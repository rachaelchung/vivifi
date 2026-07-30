# Vivifi

Turn a static syllabus into a live view of your semester: grades, assignments, exams, instructors, office hours, and any course-specific notes worth surfacing. Upload each syllabus once at the start of the term, and Vivifi does the rest.

The full product spec lives in [SPEC.md](./SPEC.md).

## Repo layout

```
backend/    FastAPI + SQLAlchemy + Alembic + Postgres
frontend/   React 18 + Vite + TypeScript + Tailwind
```

## Milestone 1 status

Foundations are in place: repo layout, FastAPI skeleton with Postgres + Alembic and email/password auth, Vite + Tailwind + routing scaffold, Semester Setup screen, and Semester + Course CRUD wired end-to-end.

## Local development

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # then edit DATABASE_URL / JWT_SECRET
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

The API lives at http://localhost:8000. Interactive docs at http://localhost:8000/docs.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env    # points at http://localhost:8000 by default
npm run dev
```

The dev server runs at http://localhost:5173.

## Deployment

- **Backend:** Render (see `backend/render.yaml`). Uses a Neon serverless Postgres.
- **Frontend:** GitHub Pages via `.github/workflows/deploy-frontend.yml`. Set the `VITE_API_BASE_URL` secret to your Render URL.
