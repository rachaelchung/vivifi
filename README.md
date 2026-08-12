# Vivifi

Stop guessing your grade. Animate your syllabus.

Vivifi is a live gradebook and syllabus interface, pulling out all the information from that one document you only read once: grades, assignments, exams, instructors, office hours, class meetings, materials, and any course-specific notes worth surfacing. 

Upload each syllabus once at the start of the term, and Vivifi does the rest.

The full product spec lives in [SPEC.md](./SPEC.md).

Visit the live project at: https://rachaelchung.github.io/vivifi/

**NOTE: This app is a demo project and was built with AI. Please regard it's multiple limitations:**
- The API Key for this app expires **September 28th, 2026**, thus rendering the live app largely unusable after this date.
- **API credits are limited.** Once they are gone, they will not be refilled.
- **Data may vanish** when the database is full or retired. Do not treat information like it is permanent.
- Render spins down after 15 minutes and **may take up to one minute to spin-up.** This project is being kept alive by an Uptime Robot until the competition window closes in late September.
- Syllabus text is sent to Anthropic. Things you send to AI **cannot be considered private.**
- Some SPEC items **were not built.**
- Auth is suitable for **demo-only**. Please use a throwaway password and consider that sessions can be leaked.
- **Built quickly and with AI for a challenge. Do not expect a highly polished product**

## Features

- **Live Syllabus** — Upload a PDF syllabus once at the start of the term; AI extracts course info, grade categories with weights, the grading scale, assignments and exams with due dates, instructors and their office hours, class meeting times, materials, and any course-specific notes worth surfacing. You review, edit, and confirm before anything commits.
- **Live Gradebook** — Weighted grade math from your syllabus. Auto-populated from your syllabus assignments, plus room for manual entries (attendance, participation, extra credit). A dedicated query box answers "what do I need on the final to get an A?" with a number, not a chat. 
- **Assignment + Exam Tracker** — A task-focused view separate from the gradebook: what's due, when, whether you've done it. Drag-and-drop on any calendar view reschedules an assignment; exams render distinctively and are non-draggable (profs set them). Marking an assignment "done" is fully independent of entering its grade.
- **Instructors & Office Hours** — Each prof, TA, and learning assistant is a first-class entity with their own hours, email, and Zoom link. Per-course grid on the Instructors tab; consolidated **Week Schedule** across all courses (your class meetings and/or office hours), colored by course and filterable by host and can be seen alongisde your semester schedule.
- **Materials & Notes** — Textbooks, readings, and supplies as structured rows, each marked required or recommended. Shown as scannable cards on a materials tab. A notes tab pulls all the last little details your professor puts in.

## AI Philosophy

Students don't need another AI chatbot. Vivifi is intentionally **not a chatbot**. AI is used in this app only in the places it’s absolutely necessary, and then gets out of the way. 

1. **Parsing Your Syllabus** After uploading, you are prompted to edit and review any information it's pulled out before committing any information to the database. Everything keeps track of whether it came from the syllabus pull or manual entry so there's never a question about it.

2. **Grade Prediciton** You can ask questions about your grade like "What do I need to get an A?" even if you have multiple assignments left. Vivifi doesn't respond with a chat-like answer and the AI never touches your numbers. Your questions are turned into formal queries, which then tells the codebase what to calculate, never putting you in danger of hallucination.

Language models are good at reading a messy PDF and understanding how a person phrases a question. They're not a substitute for verifiable arithmetic, or for a student's own judgment about their own coursework. So Vivifi never asks you to trust a black box for either.

## Deployment

- **Backend:** Deployed on Render and uses a Neon serverless Postgres. Visit the backend server on render: https://vivifi-api.onrender.com. Render spins down after 15 minutes without use. An Uptime Robot is keeping it alive every 5 minutes.
- **Frontend:** GitHub Pages via `.github/workflows/deploy-frontend.yml`. 



---
# Building Process Information

## AI Usage

This app was created for Stellic Pathfinder's Challenge 2026. The prompt I chose was Overcoming Obstacles:
Help students navigate cost, paperwork, scheduling, requirements, and the friction that gets in the way. As a part of the challenge, we were provided Claude credits and encouraged to build with AI-assistance.

This app was built within Cursor using the Opus 4.5 Model and the Auto model (which uses multiple different models within Cursor). The landing page was built with Claude Sonnet 5.

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
│   │       ├── 32b25850f207_course_syllabus_committed_at.py
│   │       ├── a1b2c3d4e5f6_course_materials.py
│   │       └── b2c3d4e5f6a7_class_meeting_kind_section_mine.py
│   ├── alembic.ini
│   ├── app/
│   │   ├── config.py                     env-driven settings (DB URL, JWT, Anthropic, Google OAuth)
│   │   ├── database.py                   SQLAlchemy engine + get_db dependency
│   │   ├── deps.py                       get_current_user (Bearer JWT)
│   │   ├── main.py                       FastAPI app + router wiring + CORS + OAuth session
│   │   ├── security.py                   bcrypt + python-jose helpers
│   │   ├── utils.py                      nanoid slug generator
│   │   ├── models/                       SQLAlchemy models (one entity per file)
│   │   │   ├── base.py                   Base + TimestampMixin
│   │   │   ├── user.py, semester.py, course.py
│   │   │   ├── grade.py                  GradeCategory, GradeScaleBand, GradebookEntry
│   │   │   ├── assignment.py             Assignment (task/schedule side)
│   │   │   ├── office_hours.py           OfficeHourHost, OfficeHour
│   │   │   ├── class_meeting.py          ClassMeeting (kind, section, is_mine)
│   │   │   ├── material.py               CourseMaterial (textbook / book / other)
│   │   │   └── note.py                   CourseNote
│   │   ├── schemas/                      Pydantic request/response models
│   │   │   ├── user.py, semester.py, course.py
│   │   │   ├── syllabus.py               SyllabusExtraction (used for both extract + commit)
│   │   │   ├── grade.py                  GradeCategory, GradeScaleBand, GradebookEntry
│   │   │   ├── assignment.py             Assignment request/response models
│   │   │   ├── office_hours.py           OfficeHourHost, OfficeHour (HH:MM coercion)
│   │   │   ├── class_meeting.py          ClassMeeting (kind / section / is_mine)
│   │   │   ├── material.py               CourseMaterial
│   │   │   ├── note.py                   CourseNote
│   │   │   └── predict.py                CurrentGrade + PredictRequest/Response
│   │   ├── routers/
│   │   │   ├── auth.py                   /auth/register, /login, /me, Google OAuth
│   │   │   ├── semesters.py              /semesters CRUD
│   │   │   ├── courses.py                /courses CRUD (+ GET /courses/{slug})
│   │   │   ├── syllabus.py               /courses/{slug}/syllabus, /syllabus/text, /syllabus/commit
│   │   │   ├── categories.py             /courses/{slug}/categories CRUD
│   │   │   ├── grading_scale.py          /courses/{slug}/grading-scale (GET + PUT replace-all)
│   │   │   ├── assignments.py            /courses/{slug}/assignments CRUD (exam-reschedule guard, ?cascade_gradebook)
│   │   │   ├── gradebook.py              /courses/{slug}/gradebook-entries CRUD (manual + hidden)
│   │   │   ├── office_hours.py           /office-hour-hosts + /office-hours CRUD
│   │   │   ├── class_meetings.py         /courses/{slug}/class-meetings CRUD
│   │   │   ├── materials.py              /courses/{slug}/materials CRUD
│   │   │   ├── notes.py                  /courses/{slug}/notes CRUD
│   │   │   ├── grade.py                  GET /courses/{slug}/grade + POST /predict
│   │   │   └── _common.py                get_owned_course helper (user-scope enforcement)
│   │   └── services/
│   │       ├── syllabus.py               pdfplumber text extraction + Claude JSON extraction
│   │       ├── grade_math.py             pure grade math (current grade, prediction, extra-credit)
│   │       └── predict.py                query planner (heuristic + Claude compute-plan)
│   ├── tests/
│   │   ├── test_grade_math.py            unit coverage for grade math semantics
│   │   ├── test_predict_parser.py        heuristic + plan parser coverage
│   │   └── test_syllabus_sanitize.py     extraction sanitization helpers
│   ├── render.yaml                       Render blueprint
│   ├── requirements.txt
│   └── vivifi.db                         local SQLite (gitignored)
│
├── frontend/                             React 18 + Vite + TypeScript + Tailwind
│   ├── index.html                        SPA shell
│   ├── vivifi.html                       marketing landing (deployed as Pages index)
│   ├── package.json / tsconfig* / vite.config.ts / tailwind.config.js / postcss.config.js
│   ├── public/                           logos + landing screenshots
│   └── src/
│       ├── App.tsx                       route table + auth gates
│       ├── main.tsx                      React bootstrap + QueryClient + BrowserRouter
│       ├── index.css                     CSS variables (--color-bg, --color-accent, ...) + shared classes
│       ├── vite-env.d.ts
│       ├── api/                          thin fetch layer + TanStack Query hooks
│       │   ├── client.ts                 apiRequest / apiUpload / ApiError
│       │   ├── types.ts                  shared TypeScript types (Course, Semester, GradeCategory, Assignment, ...)
│       │   ├── auth.ts, semesters.ts, courses.ts
│       │   ├── syllabus.ts               useUploadSyllabusPdf / useUploadSyllabusText / useCommitSyllabus
│       │   └── liveViews.ts              hooks for categories, grading scale, assignments, gradebook entries,
│       │                                 office hours, class meetings, materials, notes, /grade + /predict
│       ├── contexts/
│       │   └── AuthContext.tsx           token in localStorage + /auth/me hydration
│       ├── lib/
│       │   ├── utils.ts                  cn() classname helper (clsx + tailwind-merge)
│       │   ├── courseColors.ts           course accent palette
│       │   └── timeFormat.ts             12h/24h preference for Week Schedule
│       ├── components/
│       │   ├── AuthShell.tsx             centered card layout for login/register
│       │   ├── AuthDivider.tsx           "or" divider between password + Google
│       │   ├── BrandMark.tsx             Vivifi wordmark + dot
│       │   ├── GoogleSignInButton.tsx    Continue with Google (hidden when unconfigured)
│       │   ├── Modal.tsx                 backdrop-blur modal shell
│       │   ├── EmptyState.tsx            shared empty-state copy + CTA
│       │   ├── InlineEditableText.tsx    hover/focus pencil inline rename
│       │   ├── SemesterSwitcher.tsx      folder-tab switcher + Calendar / Week Schedule icons
│       │   ├── CourseCard.tsx            course card w/ hero color, live grade, upload CTA
│       │   ├── AddCourseModal.tsx        quick-add course form + color picker
│       │   ├── EditCourseModal.tsx       rename / recolor / delete course
│       │   ├── EditSemesterModal.tsx     rename / date-edit semester
│       │   ├── AddCourseTile.tsx         dashed "+ Add course" tile
│       │   ├── SyllabusUpload.tsx        drag-drop PDF + paste-text + setup-manually
│       │   ├── syllabusReview/
│       │   │   ├── SectionCard.tsx       section wrapper + AddRowButton
│       │   │   ├── RowCard.tsx           one editable row + trash button
│       │   │   ├── constants.ts          WEEKDAYS, DEFAULT_SCALE, empty-row factories
│       │   │   └── sections.tsx          all 9 editable sections composed here
│       │   └── courseDetail/
│       │       ├── TabNav.tsx            course tab bar
│       │       ├── GradebookTab.tsx      current grade header + category breakdown + entries + PredictionBox
│       │       ├── PredictionBox.tsx     natural-language query input + rendered result
│       │       ├── AssignmentsTab.tsx    list, completed toggle, source badge, manual add
│       │       ├── InstructorsTab.tsx    host directory + weekly office-hours grid
│       │       ├── MeetingsTab.tsx       class meetings by kind + Mine toggle + CRUD
│       │       ├── MaterialsTab.tsx      textbooks / books / other (always visible)
│       │       └── NotesTab.tsx          conditional notes list + manual add
│       └── pages/
│           ├── LoginPage.tsx, RegisterPage.tsx
│           ├── AuthCallbackPage.tsx      Google OAuth token handoff
│           ├── SemesterSetupPage.tsx     first-run + "+ New semester" form
│           ├── SemesterHubPage.tsx       main dashboard (switcher + course grid)
│           ├── CourseDetailPage.tsx      per-course landing (upload UI or tabbed live view)
│           ├── SyllabusReviewPage.tsx    editable-tables review + commit
│           ├── CalendarPage.tsx          FullCalendar month view (drag-drop reschedule, exam styling)
│           └── OfficeHoursPage.tsx       cross-course Week Schedule (/office-hours)
│
├── .github/workflows/
│   └── deploy-frontend.yml               GitHub Pages build + deploy (SPA + landing)
├── SPEC.md
├── README.md
└── .gitignore
```

## What was built

### Milestone 1 — Foundations
Repo layout, FastAPI skeleton with Postgres + Alembic, email/password auth (bcrypt + JWT), Vite/Tailwind/routing scaffold, semantic-token CSS variables for palette + per-course accents, Semester Setup screen (first-run + "+ New semester"), folder-tab Semester Switcher, and Semester + Course CRUD wired end-to-end.

### Milestone 2 — Live Syllabus
**Data model.** Every SPEC entity is modeled: `GradeCategory`, `GradeScaleBand`, `GradebookEntry`, `Assignment`, `OfficeHourHost`, `OfficeHour`, `ClassMeeting` (with `kind` / `section` / `is_mine`), `CourseMaterial`, `CourseNote`, plus a `syllabus_committed_at` marker on `Course` that gates re-uploads. Everything cascades from `Course` and inherits user-scoping via the `Semester → Course` join.

**Ingestion pipeline.** Three routes under `/courses/{slug}/syllabus`:

- `POST /` — multipart PDF upload (10 MB cap, PDF-only, empty-body guard).
- `POST /text` — JSON `{text}` paste-text alternative for scanned PDFs.
- `POST /commit` — validates weights sum to 100, requires a Mine pick when alternate sections exist for a meeting kind, resolves categories + hosts by name, applies the standard 10-point scale if the payload's grading_scale is empty, creates paired `Assignment` + `GradebookEntry` rows (plus meetings, materials, notes, hosts, hours) in a single transaction, and stamps `syllabus_committed_at`. Re-commit returns 409.

`app/services/syllabus.py` holds the pipeline: `pdfplumber` extracts raw text into memory only (never persisted), then Claude structures it via a strict-JSON prompt that encodes every SPEC rule (exam-vs-assignment classification, recurring-item expansion using semester dates, verbatim office-hour locations, structured materials vs notes, class-meeting kind/section/`is_mine` heuristics, boilerplate filter with concise-notes caps, default-Overall category fallback, English translation).

**Frontend flow.**

1. Semester Hub → click a course card → **CourseDetailPage** at `/courses/:slug`.
2. If the course hasn't been committed yet, the page renders **SyllabusUpload** (drag-drop PDF, paste-text tab, or setup-manually with an empty extraction).
3. Upload / manual response routes to **SyllabusReviewPage** at `/courses/:slug/review` with the extraction in navigation state.
4. Review page renders nine editable sections (course meta, grade categories, grading scale, assignments+exams, hosts, office hours, class meetings, materials, notes) with a live weight-sum readout, the SPEC-mandated incomplete-extraction danger banner, the softer no-assignments note, a "use standard 10-point scale" shortcut, Mine-pick enforcement when sectioned meetings exist, and a sticky commit bar that blocks commit until weights hit 100 (and section picks are satisfied).
5. Commit success routes back to the CourseDetailPage — see M3 below for the tabbed live views that render there.

Two small polish fixes were folded in during M2 testing: the SemesterSwitcher popover now closes on outside click / Escape, and the switcher renders in stable creation order (older on the left, newer on the right) so switching the active semester no longer rearranges the tabs.

### Milestone 3 — Grade Math + Views

**Grade math engine.** `app/services/grade_math.py` is a pure, ORM-decoupled module that owns every number the app displays. Each `GradebookEntry` contributes `min(points_earned, points_possible) / points_possible` (regular), `points_earned / points_possible` (bonus, when earned > possible), or `points_earned / 100` (pure extra credit, where `points_possible = 0`). Category fractions get clamped to `[0, 1.2]`. Categories with no unhidden entries are dropped and remaining weights are proportionally renormalized. `resolve_target` interprets prediction targets against the course's own `GradeScaleBand` list (falls back to the standard 10-point scale). Prediction distinguishes reachable / already-locked-in / unreachable — pure-extra-credit categories always report reachable=true. Every branch is covered by `backend/tests/test_grade_math.py`.

**Context-aware prediction (SPEC §Grade Math Semantics scenarios).** When multiple ungraded items remain, a single-number answer is misleading ("what do I need on the final for an A" depends on how you do on the midterm you also haven't taken yet). `grade_math.anchor_scenarios` splits the remaining items into an **anchor** (the item you named, or the chronologically-nearest unnamed one) and a **solve** set (everything else remaining), then generates three scenarios by fixing the anchor at three canonical scores and solving linearly for the uniform score needed on the rest:

- **Ace** — anchor at 100%. What can you coast on later?
- **Steady** — same score across every remaining item. What's the uniform bar?
- **Recover** — anchor at 60%. What score on later items pulls you back to target? (Often flagged unreachable, which is the honest answer.)

Each scenario reports `resulting_grade_pct`, `reachable`, `already_locked_in`, and a `legs` list of per-item assumed scores so the UI can render an unambiguous plan. The Gradebook router upgrades a plain `needed_on_entry` / `needed_on_category` question to a scenarios response automatically whenever other ungraded items would materially change the answer.

**Ad-hoc reweighting.** When a course's syllabus never listed a final ("my final is worth 20%, what do I need to get an A?"), `grade_math.apply_reweight` proportionally scales existing category weights down to `100 − new_weight_pct`, appends a synthetic category + single entry at negative ids (so they can't collide with real ORM ids), and hands the modified state to the standard predictor. The response carries a `reweight_applied` payload — the assumed weight + the before/after scaled weights — so the UI can render an "assuming X @ Y%, other categories scaled…" notice and the user knows nothing was saved.

**Query planner.** `app/services/predict.py` produces a `PredictionPlan` (`action` + `target` + `focus` + optional `reweight` + short `narrative_prefix`) that the router hands to the deterministic engine. Two stages:

1. **Heuristic regex** — matches only the two shapes that are unambiguous to a regex: `"what's my (current) grade"` and reweight declarations (`"my final is worth 20%, what do I need for an A"`). These work without an `ANTHROPIC_API_KEY` and are what most demo taps hit.
2. **Claude fallback** — everything else. Claude receives the *entire* course state (categories with weights, entries with scores, grading scale, current grade) plus the raw student question, and returns a plan. Claude never adds or divides — even the "passing" bar is a symbolic `TargetSpec(kind="passing")` that the router resolves against the course's own bands. The math engine turns the plan into numbers.

That's what fixes the earlier problems where "am I on track for an A?" returned the current grade back and "can I still pass?" failed with "cannot find that category." Claude now has the full context and a small, structured vocabulary; the arithmetic is still 100% deterministic.

**API surface.** Live-view routers, all user-scoped via `_common.get_owned_course`:

- `/courses/{slug}/categories` — GradeCategory CRUD.
- `/courses/{slug}/grading-scale` — GET list, PUT replace-all.
- `/courses/{slug}/assignments` — CRUD. PATCH rejects `due_date` changes on `kind="exam"` (422 with the SPEC message). DELETE takes `?cascade_gradebook=1` to also drop the paired `GradebookEntry`.
- `/courses/{slug}/gradebook-entries` — CRUD for manual entries + hidden toggle.
- `/courses/{slug}/office-hour-hosts` and `/courses/{slug}/office-hours` — CRUD.
- `/courses/{slug}/class-meetings` — CRUD (kind, section, `is_mine`, day/time/location).
- `/courses/{slug}/materials` — CRUD (textbook / book / other; required / recommended).
- `/courses/{slug}/notes` — CRUD.
- `GET /courses/{slug}/grade` — current grade + per-category breakdown + resolved target.
- `POST /courses/{slug}/predict` — natural-language query → `{ answer | scenarios[], explanation, reweight_applied? }`. Multi-remaining-item questions upgrade to a scenarios table automatically; ad-hoc reweight questions return the single answer plus the assumed reweight payload. See "Context-aware prediction" above.

**Frontend live views.** `CourseDetailPage` is a tabbed shell (**Gradebook** / **Assignments** / **Instructors** / **Meetings** / **Materials**, plus **Notes** when a course has any). Every tab pulls from TanStack Query hooks in `api/liveViews.ts` and calls `invalidateGradeGraph` after grade-affecting mutations so the grade header, breakdown, and prediction box stay in sync.

- **Gradebook** — big grade + letter header, per-category breakdown table (weight, earned %, missing badge), entries grouped by category with editable points-earned/possible, hidden toggle, delete, "+ add entry", and the PredictionBox at the bottom.
- **Assignments** — full list (sorted by due date, undated at the bottom), completed checkbox, `syllabus` / `manual` source badges, "+ add assignment" form with kind selector.
- **Instructors** — hosts on the left (name, role, email, location), weekly office-hours grid on the right (Mon–Sun columns, HH:MM–HH:MM chips with location).
- **Meetings** — class meetings grouped by kind; Mine rows pinned/highlighted; toggle Mine and full CRUD after commit.
- **Materials** — always visible; empty state reads "No materials required" with manual add; structured cards for textbooks / books / other.
- **Notes** — conditional tab; only shown when the course has committed notes or the user manually adds one.
- **Calendar** — icon on the semester switcher row. Month view with FullCalendar; assignments show course name under the title, a completion checkbox, and strike/fade when done. Legend uses course names. Drag to reschedule (exams locked).
- **Week Schedule** — icon on the semester switcher row → `/office-hours`. Cross-course weekly grid with independent **My schedule** (`is_mine` meetings) and **Office hours** layer toggles, host filter on OH, course-colored blocks, and a live now-line. 12h/24h time preference is remembered locally.

`CourseCard` on the Semester Hub shows the real current grade + letter for committed courses via `useCurrentGrade`. Courses and semesters can be edited in place via `EditCourseModal` / `EditSemesterModal`.

### Milestone 4 — Polish

**Google OAuth.** `GET /auth/google` + `/auth/google/callback` via Authlib. Unconfigured servers return 503 and hide the button (`GET /auth/providers`). Existing password accounts with the same verified Google email are auto-linked (`google_sub`). The SPA lands on `/auth/callback?token=…`, stores the JWT, and hydrates `/auth/me`.

**Empty / error / mobile.** Shared `EmptyState` on the hub, assignments, and calendar; clearer offline/`ApiError` copy; headers collapse email on small screens; course tabs scroll horizontally; calendar densifies under 640px.

**Marketing landing.** `frontend/vivifi.html` ships as the GitHub Pages `index.html`; the SPA is served from `404.html` so client routes keep working under `/<repo>/`.


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

Run backend unit tests with:

```bash
cd backend
pytest tests/
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env    # points at http://localhost:8000 by default
npm run dev
```

Dev server at http://localhost:5173.

## Deployment

- **Backend:** Render (see `backend/render.yaml`). Uses a Neon serverless Postgres. Set `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, and `CORS_ORIGINS` as Render secrets. For Google sign-in also set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BACKEND_PUBLIC_URL`, and `FRONTEND_URL` (redirect URI must be `{BACKEND_PUBLIC_URL}/auth/google/callback`). Visit the backend server on render: https://vivifi-api.onrender.com
- **Frontend:** GitHub Pages via `.github/workflows/deploy-frontend.yml`. Set the `VITE_API_BASE_URL` repo variable to your Render URL (no Google secrets on the frontend). The workflow builds the SPA, copies it to `404.html` for client-route fallback, then deploys `vivifi.html` as the marketing `index.html` with a `<base href="/<repo>/">` so relative assets resolve.