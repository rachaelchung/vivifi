# Vivifi

Turn a static syllabus into a live view of your semester: grades, assignments, exams, instructors, office hours, and any course-specific notes worth surfacing. Upload each syllabus once at the start of the term, and Vivifi does the rest.

The full product spec lives in [SPEC.md](./SPEC.md).

## Repo layout

```
vire/
├── backend/                              FastAPI + SQLAlchemy + Alembic + Postgres
│   ├── alembic/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   │       ├── 9b5b0c9e800e_initial_users_semesters_courses.py
│   │       ├── 279e0c32799f_syllabus_entities_grade_categories_.py
│   │       └── 32b25850f207_course_syllabus_committed_at.py
│   ├── alembic.ini
│   ├── app/
│   │   ├── config.py                     env-driven settings (DB URL, JWT, Anthropic)
│   │   ├── database.py                   SQLAlchemy engine + get_db dependency
│   │   ├── deps.py                       get_current_user (Bearer JWT)
│   │   ├── main.py                       FastAPI app + router wiring + CORS
│   │   ├── security.py                   bcrypt + python-jose helpers
│   │   ├── utils.py                      nanoid slug generator
│   │   ├── models/                       SQLAlchemy models (one entity per file)
│   │   │   ├── base.py                   Base + TimestampMixin
│   │   │   ├── user.py, semester.py, course.py
│   │   │   ├── grade.py                  GradeCategory, GradeScaleBand, GradebookEntry
│   │   │   ├── assignment.py             Assignment (task/schedule side)
│   │   │   ├── office_hours.py           OfficeHourHost, OfficeHour
│   │   │   ├── class_meeting.py          ClassMeeting
│   │   │   └── note.py                   CourseNote
│   │   ├── schemas/                      Pydantic request/response models
│   │   │   ├── user.py, semester.py, course.py
│   │   │   └── syllabus.py               SyllabusExtraction (used for both extract + commit)
│   │   ├── routers/
│   │   │   ├── auth.py                   /auth/register, /login, /me
│   │   │   ├── semesters.py              /semesters CRUD
│   │   │   ├── courses.py                /courses CRUD (+ GET /courses/{slug})
│   │   │   └── syllabus.py               /courses/{slug}/syllabus, /syllabus/text, /syllabus/commit
│   │   └── services/
│   │       └── syllabus.py               pdfplumber text extraction + Claude JSON extraction
│   ├── render.yaml                       Render blueprint
│   ├── requirements.txt
│   └── vivifi.db                         local SQLite (gitignored in production)
│
├── frontend/                             React 18 + Vite + TypeScript + Tailwind
│   ├── index.html
│   ├── package.json / tsconfig* / vite.config.ts / tailwind.config.js / postcss.config.js
│   └── src/
│       ├── App.tsx                       route table + auth gates
│       ├── main.tsx                      React bootstrap + QueryClient + BrowserRouter
│       ├── index.css                     CSS variables (--color-bg, --color-accent, ...) + shared classes
│       ├── vite-env.d.ts
│       ├── api/                          thin fetch layer + TanStack Query hooks
│       │   ├── client.ts                 apiRequest / apiUpload / ApiError
│       │   ├── types.ts                  shared TypeScript types (Course, Semester, SyllabusExtraction, ...)
│       │   ├── auth.ts, semesters.ts, courses.ts
│       │   └── syllabus.ts               useUploadSyllabusPdf / useUploadSyllabusText / useCommitSyllabus
│       ├── contexts/
│       │   └── AuthContext.tsx           token in localStorage + /auth/me hydration
│       ├── lib/
│       │   └── utils.ts                  cn() classname helper (clsx + tailwind-merge)
│       ├── components/
│       │   ├── AuthShell.tsx             centered card layout for login/register
│       │   ├── BrandMark.tsx             Vivifi wordmark + dot
│       │   ├── Modal.tsx                 backdrop-blur modal shell
│       │   ├── SemesterSwitcher.tsx      folder-tab switcher (stable order, outside-click menu)
│       │   ├── CourseCard.tsx            course card w/ hero color, upload-syllabus CTA
│       │   ├── AddCourseModal.tsx        quick-add course form + color picker
│       │   ├── AddCourseTile.tsx         dashed "+ Add course" tile
│       │   ├── SyllabusUpload.tsx        drag-drop PDF + paste-text tab
│       │   └── syllabusReview/
│       │       ├── SectionCard.tsx       section wrapper + AddRowButton
│       │       ├── RowCard.tsx           one editable row + trash button
│       │       ├── constants.ts          WEEKDAYS, DEFAULT_SCALE, empty-row factories
│       │       └── sections.tsx          all 8 editable sections composed here
│       └── pages/
│           ├── LoginPage.tsx, RegisterPage.tsx
│           ├── SemesterSetupPage.tsx     first-run + "+ New semester" form
│           ├── SemesterHubPage.tsx       main dashboard (switcher + course grid)
│           ├── CourseDetailPage.tsx      per-course landing (upload UI or committed shell)
│           └── SyllabusReviewPage.tsx    editable-tables review + commit
│
├── .github/workflows/
│   └── deploy-frontend.yml               GitHub Pages build + deploy
├── SPEC.md
├── README.md
└── .gitignore
```

## What's built

### Milestone 1 — Foundations
Repo layout, FastAPI skeleton with Postgres + Alembic, email/password auth (bcrypt + JWT), Vite/Tailwind/routing scaffold, semantic-token CSS variables for palette + per-course accents, Semester Setup screen (first-run + "+ New semester"), folder-tab Semester Switcher, and Semester + Course CRUD wired end-to-end.

### Milestone 2 — Live Syllabus
**Data model.** Every SPEC entity is now modeled: `GradeCategory`, `GradeScaleBand`, `GradebookEntry`, `Assignment`, `OfficeHourHost`, `OfficeHour`, `ClassMeeting`, `CourseNote`, plus a `syllabus_committed_at` marker on `Course` that gates re-uploads. Everything cascades from `Course` and inherits user-scoping via the `Semester → Course` join.

**Ingestion pipeline.** Three routes under `/courses/{slug}/syllabus`:

- `POST /` — multipart PDF upload (10 MB cap, PDF-only, empty-body guard).
- `POST /text` — JSON `{text}` paste-text alternative for scanned PDFs.
- `POST /commit` — validates weights sum to 100, resolves categories + hosts by name, applies the standard 10-point scale if the payload's grading_scale is empty, creates paired `Assignment` + `GradebookEntry` rows in a single transaction, and stamps `syllabus_committed_at`. Re-commit returns 409.

`app/services/syllabus.py` holds the pipeline: `pdfplumber` extracts raw text into memory only (never persisted), then Claude structures it via a strict-JSON prompt that encodes every SPEC rule (exam-vs-assignment classification, recurring-item expansion using semester dates, verbatim office-hour locations, boilerplate filter with concise-notes caps, default-Overall category fallback, English translation).

**Frontend flow.**

1. Semester Hub → click a course card → **CourseDetailPage** at `/courses/:slug`.
2. If the course hasn't been committed yet, the page renders **SyllabusUpload** (drag-drop PDF or paste-text tab, with 10 MB client-side check and transparency copy about sending to Claude).
3. Upload response routes to **SyllabusReviewPage** at `/courses/:slug/review` with the extraction in navigation state.
4. Review page renders eight editable sections (course meta, grade categories, grading scale, assignments+exams, hosts, office hours, class meetings, notes) with a live weight-sum readout, the SPEC-mandated incomplete-extraction danger banner, the softer no-assignments note, a "use standard 10-point scale" shortcut, and a sticky commit bar that blocks commit until weights hit 100.
5. Commit success routes back to the CourseDetailPage, which now shows a minimal "syllabus committed" shell (the live Gradebook / Assignments / Instructors views are M3).

Two small polish fixes were folded in during M2 testing: the SemesterSwitcher popover now closes on outside click / Escape, and the switcher renders in stable creation order (older on the left, newer on the right) so switching the active semester no longer rearranges the tabs.

## What you have right now

- ✅ **A working auth-gated web app.** Register, log in, sign out. Token in localStorage; `/auth/me` hydrates on refresh.
- ✅ **Semester management.** Create, switch, delete semesters; folder-tab UI with a persistent "+ New semester" affordance and creation-order stability.
- ✅ **Course CRUD.** Add courses to the active semester, pick an accent color, delete when done. Course cards link to their detail page.
- ✅ **The full syllabus ingestion pipeline.** PDF upload or paste-text → Claude extraction → editable review → atomic commit that creates paired `Assignment` + `GradebookEntry` rows.
- ✅ **Guardrails.** 10 MB upload cap, PDF-only, empty-body guard; commit validates weights sum to 100 and rejects unknown host references; re-commit returns 409; default 10-point grading scale filled when the payload has none.
- ⏳ **Stubbed for M3.** After commit, CourseDetailPage renders a placeholder. The Gradebook, Assignments, Instructors, and Calendar tabs land in Milestone 3.

## Local development

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # then edit DATABASE_URL / JWT_SECRET / ANTHROPIC_API_KEY
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

API at http://localhost:8000, interactive docs at http://localhost:8000/docs.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env    # points at http://localhost:8000 by default
npm run dev
```

Dev server at http://localhost:5173.

## Deployment

- **Backend:** Render (see `backend/render.yaml`). Uses a Neon serverless Postgres. Set `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, and `CORS_ORIGINS` as Render secrets.
- **Frontend:** GitHub Pages via `.github/workflows/deploy-frontend.yml`. Set the `VITE_API_BASE_URL` repo variable to your Render URL.
