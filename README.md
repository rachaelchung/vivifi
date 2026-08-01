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
│   │   │   ├── syllabus.py               SyllabusExtraction (used for both extract + commit)
│   │   │   ├── grade.py                  GradeCategory, GradeScaleBand, GradebookEntry
│   │   │   ├── assignment.py             Assignment request/response models
│   │   │   ├── office_hours.py           OfficeHourHost, OfficeHour (HH:MM coercion)
│   │   │   ├── note.py                   CourseNote
│   │   │   └── predict.py                CurrentGrade + PredictRequest/Response
│   │   ├── routers/
│   │   │   ├── auth.py                   /auth/register, /login, /me
│   │   │   ├── semesters.py              /semesters CRUD
│   │   │   ├── courses.py                /courses CRUD (+ GET /courses/{slug})
│   │   │   ├── syllabus.py               /courses/{slug}/syllabus, /syllabus/text, /syllabus/commit
│   │   │   ├── categories.py             /courses/{slug}/categories CRUD
│   │   │   ├── grading_scale.py          /courses/{slug}/grading-scale (GET + PUT replace-all)
│   │   │   ├── assignments.py            /courses/{slug}/assignments CRUD (exam-reschedule guard, ?cascade_gradebook)
│   │   │   ├── gradebook.py              /courses/{slug}/gradebook-entries CRUD (manual + hidden)
│   │   │   ├── office_hours.py           /office-hour-hosts + /office-hours CRUD
│   │   │   ├── notes.py                  /courses/{slug}/notes CRUD
│   │   │   ├── grade.py                  GET /courses/{slug}/grade + POST /predict
│   │   │   └── _common.py                get_owned_course helper (user-scope enforcement)
│   │   └── services/
│   │       ├── syllabus.py               pdfplumber text extraction + Claude JSON extraction
│   │       ├── grade_math.py             pure grade math (current grade, prediction, extra-credit)
│   │       └── predict.py                query planner (heuristic + Claude compute-plan)
│   ├── tests/
│   │   └── test_grade_math.py            unit coverage for grade math semantics
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
│       │   ├── types.ts                  shared TypeScript types (Course, Semester, GradeCategory, Assignment, ...)
│       │   ├── auth.ts, semesters.ts, courses.ts
│       │   ├── syllabus.ts               useUploadSyllabusPdf / useUploadSyllabusText / useCommitSyllabus
│       │   └── liveViews.ts              hooks for categories, grading scale, assignments, gradebook entries,
│       │                                 office hours, notes, /grade + /predict (with cache invalidation)
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
│       │   ├── syllabusReview/
│       │   │   ├── SectionCard.tsx       section wrapper + AddRowButton
│       │   │   ├── RowCard.tsx           one editable row + trash button
│       │   │   ├── constants.ts          WEEKDAYS, DEFAULT_SCALE, empty-row factories
│       │   │   └── sections.tsx          all 8 editable sections composed here
│       │   └── courseDetail/
│       │       ├── TabNav.tsx            pill-style tab bar
│       │       ├── GradebookTab.tsx      current grade header + category breakdown + entries + PredictionBox
│       │       ├── PredictionBox.tsx     natural-language query input + rendered result
│       │       ├── AssignmentsTab.tsx    list, completed toggle, source badge, manual add
│       │       ├── InstructorsTab.tsx    host directory + weekly office-hours grid
│       │       └── NotesTab.tsx          conditional notes list + manual add
│       └── pages/
│           ├── LoginPage.tsx, RegisterPage.tsx
│           ├── SemesterSetupPage.tsx     first-run + "+ New semester" form
│           ├── SemesterHubPage.tsx       main dashboard (switcher + course grid + Calendar link)
│           ├── CourseDetailPage.tsx      per-course landing (upload UI or tabbed live view)
│           ├── SyllabusReviewPage.tsx    editable-tables review + commit
│           └── CalendarPage.tsx          FullCalendar month view (drag-drop reschedule, exam styling)
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

**API surface.** Nine new routers, all user-scoped via `_common.get_owned_course`:

- `/courses/{slug}/categories` — GradeCategory CRUD.
- `/courses/{slug}/grading-scale` — GET list, PUT replace-all.
- `/courses/{slug}/assignments` — CRUD. PATCH rejects `due_date` changes on `kind="exam"` (422 with the SPEC message). DELETE takes `?cascade_gradebook=1` to also drop the paired `GradebookEntry`.
- `/courses/{slug}/gradebook-entries` — CRUD for manual entries + hidden toggle.
- `/courses/{slug}/office-hour-hosts` and `/courses/{slug}/office-hours` — CRUD.
- `/courses/{slug}/notes` — CRUD.
- `GET /courses/{slug}/grade` — current grade + per-category breakdown + resolved target.
- `POST /courses/{slug}/predict` — natural-language query → `{ answer | scenarios[], explanation, reweight_applied? }`. Multi-remaining-item questions upgrade to a scenarios table automatically; ad-hoc reweight questions return the single answer plus the assumed reweight payload. See "Context-aware prediction" above.

**Frontend live views.** `CourseDetailPage` is now a tabbed shell (**Gradebook** / **Assignments** / **Instructors**, plus **Notes** when a course has any). Every tab pulls from TanStack Query hooks in `api/liveViews.ts` and calls `invalidateGradeGraph` after any mutation so the grade header, breakdown, and prediction box stay in sync.

- **Gradebook** — big grade + letter header, per-category breakdown table (weight, earned %, missing badge), entries grouped by category with editable points-earned/possible, hidden toggle, delete, "+ add entry", and the PredictionBox at the bottom.
- **Assignments** — full list (sorted by due date, undated at the bottom), completed checkbox, `syllabus` / `manual` source badges, "+ add assignment" form with kind selector.
- **Instructors** — hosts on the left (name, role, email, location), weekly office-hours grid on the right (Mon–Sun columns, HH:MM–HH:MM chips with location).
- **Notes** — conditional tab; only shown when the course has committed notes or the user manually adds one.
- **Calendar** — icon tab on the far right of the semester switcher row (not a header link). Month view with FullCalendar; assignments show course name under the title, a completion checkbox (Assignments tab only — split model), and strike/fade when done. Legend uses course names. Drag to reschedule (exams locked).

`CourseCard` on the Semester Hub now shows the real current grade + letter for committed courses via `useCurrentGrade`.

## What you have right now

- ✅ **A working auth-gated web app.** Register, log in, sign out. Token in localStorage; `/auth/me` hydrates on refresh.
- ✅ **Semester management.** Create, switch, delete semesters; folder-tab UI with a persistent "+ New semester" affordance and creation-order stability.
- ✅ **Course CRUD.** Add courses to the active semester, pick an accent color, delete when done. Course cards link to their detail page and show a live grade badge once committed.
- ✅ **The full syllabus ingestion pipeline.** PDF upload or paste-text → Claude extraction → editable review → atomic commit that creates paired `Assignment` + `GradebookEntry` rows.
- ✅ **Guardrails.** 10 MB upload cap, PDF-only, empty-body guard; commit validates weights sum to 100 and rejects unknown host references; re-commit returns 409; default 10-point grading scale filled when the payload has none.
- ✅ **Grade math + live views.** Per-category grade math with proper extra-credit and hidden-entry handling; Gradebook / Assignments / Instructors / (conditional) Notes tabs; natural-language prediction; drag-drop Calendar month view.
- ✅ **Inline edit agency.** Hover/focus pencil on assignment and gradebook names; gradebook also edits points earned and points possible in place (no modal).

## Stretch goals

- **Paired rename prompt.** Renaming an `Assignment` currently does **not** rename its linked `GradebookEntry` (and vice versa) — that's intentional split-model divergence per SPEC. Stretch: when the user renames one half of a paired pair, offer "Rename the linked gradebook entry / assignment too?" so they can keep labels in sync without losing the option to diverge.
- **Paired points hint.** Syllabus-created pairs start with the same `points_possible`; editing it only on the gradebook side is correct (assignments don't store points), but a future UX could surface "this used to match the syllabus weight" when it drifts.

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

Run the grade-math unit tests with:

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

- **Backend:** Render (see `backend/render.yaml`). Uses a Neon serverless Postgres. Set `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, and `CORS_ORIGINS` as Render secrets.
- **Frontend:** GitHub Pages via `.github/workflows/deploy-frontend.yml`. Set the `VITE_API_BASE_URL` repo variable to your Render URL.
