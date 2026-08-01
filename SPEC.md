# App Specification

This app is called "Vivifi". It turns a static syllabus into a live view of your semester: grades, assignments, exams, instructors, office hours, and any course-specific notes worth surfacing. Upload each syllabus once at the start of the term, and Vivifi does the rest. The goal is to remove the friction that comes from professors not keeping Canvas updated, and to spare students the manual bookkeeping that eats the first two weeks of every term.

## Overview

**The pitch:** Your syllabus is a static document — sometimes still a piece of paper handed out in week one. But classes aren't static. Profs update dates, adjust weightings, add readings, cancel classes. The document doesn't move. In a digital age, that gap feels absurd. Introducing Vivifi: a syllabus visualizer that turns your syllabus into a live view of the course. Watch your grade in real time. See what's coming up. Know who your TAs are and when they hold office hours. Pick up on the notes your prof buried on page 4. Move an assignment when a deadline shifts. Text Viv when you get a grade back and let it update itself. Your syllabus, alive.

## Positioning

Vivifi isn't a Canvas replacement — it's a layer on top of the syllabus, the document that already contains most of what you need to succeed in a course if only it were interactive.

- **vs Canvas / Blackboard / other LMS.** Those are the *professor's* tools, updated on the professor's schedule (which is often "never"). Vivifi is the *student's* tool, updated on your schedule.
- **vs Google Calendar.** A calendar knows dates. It doesn't know that Oct 15 is a midterm worth 25% of your grade, or that a category dropped its lowest score.
- **vs generic grade calculators.** Those ask you to enter every weight and every assignment by hand. Vivifi asks for the PDF and does that setup for you in under a minute. Plus Vivifi remembers, so you don't have to redo it every time.
- **vs "I already track it in Notion".** Notion is a container, not a system. It won't do the grade math for you or notice a policy your prof buried in section 8.

The differentiator: **the syllabus is the primary interface.** Grades, calendar, office hours, notes — all live views of the document you already have.

## Core Features

- **Live Syllabus** — Upload a PDF syllabus once at the start of the term; Claude extracts course info, grade categories with weights, the grading scale, assignments and exams with due dates, instructors and their office hours, class meeting times, and any course-specific notes worth surfacing. You review, edit, and confirm before anything commits.
- **Live Gradebook** — Weighted grade math across categories (e.g. Homework 20%, Midterm 25%, Final 30%). Auto-populated from your syllabus assignments, plus room for manual entries (attendance, participation, extra credit). A dedicated query box answers "what do I need on the final to get an A?" with a number, not a chat.
- **Assignment + Exam Tracker** — A task-focused view separate from the gradebook: what's due, when, whether you've done it. Drag-and-drop on any calendar view reschedules an assignment; exams render distinctively and are non-draggable (profs set them). Marking an assignment "done" is fully independent of entering its grade.
- **Instructors & Office Hours** — Each prof, TA, and learning assistant is a first-class entity with their own hours, email, and Zoom link. Filter the weekly grid by host, one click to email a TA.
- **Text Viv** — Text Viv in natural language to update a grade, ask what you're sitting at, add an assignment, or mark one done. Ambiguous messages get a clarifying reply, never a silent write.

## Grade Calculator

After uploading your syllabus, the grade weightings are filled in as `GradeCategory` records, and the course's letter-grade cutoffs (e.g. "A = 90+, B = 80-89") are stored as `GradeScaleBand` records. Both are extracted from the syllabus and shown to you on the Course Detail screen.

Your gradebook is a list of `GradebookEntry` rows — one per graded item — that's initially auto-populated from the syllabus assignments but exists **independently** of the Assignments tab. You can add manual entries (attendance, participation, extra credit), hide entries from grade math, or delete gradebook rows without affecting your task/assignment list. Conversely, marking an assignment as completed does not touch its grade entry.

As you fill in grades, Vivifi computes your current weighted grade from the categories that have graded entries, resolves it to a letter using the course's scale, and treats the remaining categories as unknowns for prediction.

The prediction UI is a **query box**, not a chat. You type a question ("what do I need on the final to get an A?"), you get a number (or a small scenarios table if multiple items remain). There is no conversation history, no back-and-forth, no "great question!" — it feels like an exchange of information. See **Grade Math Semantics** for the formulas.

The AI never writes to your grades from the prediction flow. It only reads your inputs to compute hypotheticals.

## Assignment Tracker

Add your courses for the semester, upload each syllabus, and forget the rest. Every assignment stores where it came from (`source: syllabus | manual | sms`) and what kind it is (`kind: assignment | exam`). Manual add and override are always available. Drag-and-drop on any calendar view reschedules an assignment's due date; **exams are non-draggable by design** — students shouldn't casually reschedule a prof-set test, and if it truly needs to move (a prof announces a delay), the user can edit it via the form.

The Assignments tab and the Gradebook tab are **independent views** that share initial state but diverge freely. On syllabus commit, each syllabus assignment creates a paired `Assignment` (task/schedule) and `GradebookEntry` (grade contributor), linked by a `source_assignment_id`. From that point on:

- Toggling `completed` on an `Assignment` does not affect its `GradebookEntry`.
- Entering `points_earned` on a `GradebookEntry` does not affect `completed` on its `Assignment`.
- Deleting or hiding a `GradebookEntry` does not delete the `Assignment`, and vice versa.
- Manual entries can exist on either side alone (a manual gradebook row for "Attendance" doesn't need an assignment; a syllabus-listed practice quiz can be removed from the gradebook without vanishing from your task list).

## Screens & Navigation

| Screen | Purpose |
|--------|---------|
| Login | Email/password or Google OAuth. New users are routed into Semester Setup. |
| Semester Setup | First-run only, and reachable later via "+ New Semester" from the switcher. A single form asks for a semester name (e.g. `"Fall 2025"`, `"F25"`, `"Spring"`) and optional start/end dates. Dates are used only as extraction context (for expanding recurring assignments) and as a hint for the calendar — not enforced. Submit → land on an empty Semester Hub for that semester. |
| Semester Hub | Main screen. A **folder-style tab semester switcher** at the top (past semesters remain readable, the active one is marked) lets you move between semesters seamlessly. Below it: a dashboard of course cards for the active semester, plus a "+ Add course" tile. If no courses exist yet, that tile is the only card. Adding a new semester is a menu item on the switcher; nothing prompts you to make one — you make one when you need one. |
| Syllabus Review | After a PDF upload, an editable table of everything Claude extracted (course meta, grade categories, grading scale, assignments and exams, instructor roster, office hours, class meeting times, course notes). Nothing is persisted until the user confirms. If extraction looks incomplete (e.g. no assignments found, or the syllabus appears to be a scan), shows a banner suggesting the paste-text alternative flow. |
| Course Detail | Tabs: **Gradebook** (graded entries grouped by category, plus the prediction query box), **Assignments** (schedule/task list with `source` visible and `kind` badged; `completed` is per-row), **Instructors** (per-course host directory + weekly hours grid), **Notes** *(conditional — appears only when Claude extracted at least one course-specific note)*. |
| Calendar | All assignments and exams across courses. Toggle list / week / month. Exams render distinctively (bigger footprint, distinct shape/color) and are **not draggable**; assignments can be **rescheduled by drag-and-drop** on any view. Check off completed items inline. |
| Office Hour Week | Consolidated weekly grid across all courses; blocks colored by course, filterable by host; live line showing current day and time. |
| Settings | Phone number (for SMS), target grades, account, sign out. |

## Data Model

Hierarchy: `User -> Semester -> Course -> {GradeScaleBand, GradeCategory, Assignment, GradebookEntry, OfficeHourHost, OfficeHour, ClassMeeting, CourseNote}`. Everything is scoped to the authenticated user.

**Timestamp and timezone convention.** All timestamps (`created_at`, `updated_at`) and all timezone-aware datetimes are stored in **UTC**. Wall-clock date/time fields that belong to a course (`Assignment.due_date`, `OfficeHour.start_time`/`end_time`, `ClassMeeting.start_time`/`end_time`) are rendered in the **course's timezone** (see `Course.timezone`), suffixed with an abbreviated zone label (e.g. `"11:59 PM ET"`, `"2:00 PM PT"`). There is no user-level timezone preference in MVP — the course's timezone is the display truth, which matches how students think about class schedules ("class is at 2pm ET because the school is in Pittsburgh").

**ID scheme.** Primary keys are auto-incrementing integers internally, but every user-facing URL uses a short opaque token (nanoid) stored as a separate `slug` column on `User`, `Semester`, `Course`, `Assignment`, and `GradebookEntry`. This prevents URL enumeration of other users' data and keeps counts private without paying the UUID index-size cost.

### Entities

**User**
- `id`, `email`, `username`, `name`, `password_hash`, `google_sub` (nullable), `phone` (nullable, E.164 for SMS), `created_at`

**Semester** (acts like a folder for its courses; the switcher on the Semester Hub navigates between them)
- `id`, `user_id`, `name` (e.g. `"Fall 2025"`, `"F25"`), `start_date` (nullable), `end_date` (nullable), `is_active` (only one true per user)
- Dates are optional. Their only current uses are (a) recurring-assignment expansion during syllabus extraction, and (b) calendar hints. They are not enforced as a hard boundary — you can add a course to any semester regardless of dates.

**Course**
- `id`, `semester_id`, `name`, `code` (e.g. `"15-113"`, `"MAT 100"`), `instructor_name`, `instructor_email` (nullable), `color` (hex, for calendar/gradebook accents), `target_grade` (may be numeric like `90` or a letter like `"A"` — resolved against the course's grading scale), `timezone` (IANA name like `"America/New_York"`; used to render all wall-clock times owned by this course)
- Has many `GradeScaleBand`, `GradeCategory`, `Assignment`, `GradebookEntry`, `OfficeHourHost`, `OfficeHour`, `ClassMeeting`, `CourseNote`.
- `timezone` defaults to the browser's detected timezone at course-creation time; user can override in the course settings if the school is in a different zone than they are.

**GradeScaleBand** (per-course grading scale, e.g. "A = 90+, B = 80+")
- `id`, `course_id`, `letter` (e.g. `"A+"`, `"A"`, `"A-"`, `"B+"`, ...), `min_pct` (float, inclusive lower bound)
- The bands for a course together cover `0`–`100` without gaps. If a syllabus doesn't specify a scale, Vivifi falls back to a standard 10-point scale (`A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60`).
- A letter target like `"A-"` on the course resolves to that band's `min_pct` when used in prediction queries.
- **+/- scales are supported natively.** The `letter` field is a free string, so schools that use `A+`/`A`/`A-`/`B+`/... just have more bands. Nothing else in the data model or math changes.

**GradeCategory** (weight bucket, e.g. "Homework 20%")
- `id`, `course_id`, `name`, `weight_pct` (0–100), `drop_lowest_n` (int, default 0)
- Sum of `weight_pct` across a course's categories should equal 100; enforced at review time, warned about elsewhere.
- If a syllabus states no grade weightings at all, a single fallback category named `"Overall"` at `weight_pct = 100` is pre-filled on the review screen. The user can accept as-is or restructure before committing.

**Assignment** (a schedule/task item — appears on the Assignments tab and the Calendar)
- `id`, `course_id`, `name`, `kind` (`assignment | exam`, default `assignment`), `due_date` (nullable), `source` (`syllabus | manual | sms`)
- `completed` (bool, default false), `notes` (nullable free-text)
- `created_at`, `updated_at`
- **`Assignment` does not carry a grade.** Grades live on `GradebookEntry`. This is intentional: your task list and your gradebook are independent views. Marking `completed = true` does not affect the gradebook; entering a grade does not affect `completed`.
- `kind = "exam"` only affects presentation: distinctive calendar rendering, non-draggable in the calendar UI. Weighting, math, and gradebook entry (via the linked `GradebookEntry`) are identical to regular assignments.

**GradebookEntry** (a graded item that contributes to the course grade — appears on the Gradebook tab)
- `id`, `course_id`, `category_id` (references `GradeCategory`, nullable — user assigns during review or edit), `name`
- `points_earned` (nullable — null means not yet graded), `points_possible`
- `source` (`syllabus | manual | sms`), `source_assignment_id` (nullable — points to the `Assignment` this entry was created alongside, if any)
- `hidden` (bool, default false — hidden entries do not contribute to grade math but remain visible on the Gradebook tab in a collapsed "hidden" section, so the user can un-hide easily)
- `created_at`, `updated_at`
- **Extra credit and bonus points require no special flag.** `points_earned` may exceed `points_possible` (bonus scoring on a normal assignment), and `points_possible` may be `0` (pure extra-credit entry — contributes only when `points_earned > 0`). Grade math handles both cases; see **Grade Math Semantics**.
- **Attendance / participation are just manual `GradebookEntry` rows** with no linked `Assignment`. Typically one row per relevant category (e.g. an "Overall attendance" row in the Attendance category with `points_possible` matching the syllabus's stated maximum). Update `points_earned` manually as the semester progresses. If a user prefers finer granularity (one row per missed class), they can add multiple rows.

**Assignment ↔ GradebookEntry lifecycle rules** (defines exactly what does and does not propagate between the two paired rows — the split model only works if these are unambiguous):

- **Delete `Assignment`** → user is prompted: "Also remove the linked gradebook entry?" Choosing yes hard-deletes both in one transaction; choosing no nulls the entry's `source_assignment_id` (it becomes an orphaned manual entry).
- **Delete `GradebookEntry`** → no side effect on the `Assignment`. The task item stays on the schedule and the calendar.
- **Edit `Assignment.name`** → does **not** propagate to `GradebookEntry.name`. Divergence is intentional; two systems, two labels.
- **Edit `Assignment.due_date`** (form or calendar drag-and-drop) → does **not** touch the `GradebookEntry`. The gradebook is dateless by design.
- **Edit `GradebookEntry.points_earned` / `points_possible` / `category_id`** → does **not** touch the `Assignment`. The task list is grade-less.
- **Toggle `Assignment.completed`** → does **not** touch `GradebookEntry.points_earned`, and vice versa.
- **Paired creation is atomic.** Syllabus commit and the SMS `add_assignment` intent both create the paired rows inside a single DB transaction. If either insert fails, both roll back — no orphaned halves.
- **Hard delete for MVP.** No soft-delete/`deleted_at` column on any entity in v1. This is the simplest correct semantics and can be revisited if users start complaining about accidental deletes.

**OfficeHourHost** (a prof, TA, or learning assistant for the course)
- `id`, `course_id`, `name`, `role` (`Professor | TA | Learning Assistant`), `email` (nullable), `zoom_link` (nullable), `notes` (nullable)
- A course has one or more hosts. Every `OfficeHour` block is owned by exactly one host.

**OfficeHour** (a scheduled block, owned by one host)
- `id`, `course_id`, `host_id` (references `OfficeHourHost`), `day_of_week` (0–6, Monday = 0), `start_time`, `end_time`, `location`
- `location` is a free-form string that may be a physical location (`"GHC 5219"`), a Zoom URL (`"https://cmu.zoom.us/j/12345"`), a hybrid description (`"GHC 5219 + zoom.us/j/12345"`), or any other rendering the syllabus uses. The UI renders a URL-shaped value as a clickable link and a room-shaped value as plain text.
- If `location` is empty and the host has a `zoom_link` set on their `OfficeHourHost`, the UI falls back to that link. This handles the common "all my hours are on my personal Zoom" case without repeating the URL on every block.

**ClassMeeting** (a regular class meeting time — stored during syllabus ingestion for future use; no MVP UI beyond appearing in the Syllabus Review)
- `id`, `course_id`, `day_of_week` (0–6, Monday = 0), `start_time`, `end_time`, `location`
- Not required. If the syllabus lists a meeting schedule, Claude extracts it. Future features (blocking off class time on the calendar, contextualizing "office hours right after class") will read from these rows; MVP simply persists them.

**CourseNote** (course-specific policy or expectation worth surfacing to the student)
- `id`, `course_id`, `heading`, `body`, `source` (`syllabus | manual`), `created_at`, `updated_at`
- Populated during syllabus ingestion, but **only** when Claude identifies course-specific content. Generic university boilerplate (Title IX, general academic integrity, disability accommodations, drop deadlines, generic grading-appeal process) is filtered out at extraction time. See **Syllabus Ingestion Pipeline**. If no notes are kept, the Course Detail screen renders no Notes tab.

**SmsMessage** (audit trail; retention limited — see Privacy)
- `id`, `user_id`, `direction` (`in | out`), `body`, `parsed_intent` (nullable), `target_entity` (nullable, e.g. `assignment:123`, `gradebook_entry:456`), `created_at`

## Syllabus Ingestion Pipeline

The single most important flow. Four steps:

1. **Upload.** User uploads a PDF (or pastes text) from the "+ New Course" flow. Uploads are capped at **10 MB**; oversize uploads are rejected server-side with a clear message.
2. **Extract text.** Backend runs `pdfplumber` to pull raw text and tables. Raw text is held in memory only — never written to the DB.
3. **Structured extraction with Claude.** Backend calls Claude with the raw text, the current semester's `start_date` and `end_date` (if set), and a strict JSON schema. Claude returns:

   ```json
   {
     "course": {
       "name": "string",
       "code": "string",
       "instructor_name": "string",
       "instructor_email": "string | null"
     },
     "grade_categories": [
       { "name": "string", "weight_pct": 0, "drop_lowest_n": 0 }
     ],
     "grading_scale": [
       { "letter": "A", "min_pct": 90 }
     ],
     "assignments": [
       {
         "name": "string",
         "kind": "assignment | exam",
         "due_date": "YYYY-MM-DD | null",
         "category_name": "string | null",
         "points_possible": 100
       }
     ],
     "office_hour_hosts": [
       {
         "name": "string",
         "role": "Professor | TA | Learning Assistant",
         "email": "string | null"
       }
     ],
     "office_hours": [
       {
         "day_of_week": 0,
         "start_time": "HH:MM",
         "end_time": "HH:MM",
         "location": "string",
         "host_name": "string"
       }
     ],
     "class_meetings": [
       {
         "day_of_week": 0,
         "start_time": "HH:MM",
         "end_time": "HH:MM",
         "location": "string"
       }
     ],
     "notes": [
       { "heading": "string", "body": "string" }
     ]
   }
   ```

4. **Review & commit.** The Syllabus Review screen renders the extraction as editable tables. The user fixes anything wrong, then confirms. On commit:
   - Each `assignments` row creates **both** an `Assignment` (for the Assignments tab and Calendar) **and** a linked `GradebookEntry` (for the Gradebook tab, with `source_assignment_id` pointing back to the Assignment and `category_id` resolved from the `category_name`). Both rows are marked `source = "syllabus"`.
   - `host_name` in each `office_hours` entry resolves to a `host_id` by name-matching against the just-created `office_hour_hosts`.
   - Raw syllabus text is discarded after successful commit.

**Prompt rules Claude must follow:**

- For `assignments.kind`, use `"exam"` when the syllabus text uses words like *exam*, *midterm*, *final*, *test*, or *quiz*; otherwise `"assignment"`.
- **Expand recurring assignments.** If the syllabus specifies a recurring item ("weekly reading responses due every Sunday", "biweekly problem sets on Fridays") and the semester's `start_date` and `end_date` are provided, Claude expands the range into concrete-dated rows (e.g. 14 rows for a weekly item over 14 weeks, each with the same `points_possible` and `category_name`). If semester dates are missing, Claude returns a single row with `due_date: null` and a name that hints at the recurrence (e.g. `"Weekly reading response (recurring — set dates manually)"`), so the user knows to expand or backfill later.
- **Default category fallback.** If the syllabus states no grade weightings at all (some do — "based on effort, quizzes, and participation" without percentages), Claude returns `grade_categories: [{ "name": "Overall", "weight_pct": 100, "drop_lowest_n": 0 }]` and puts every assignment's `category_name` as `"Overall"`. The user can restructure on the review screen.
- For `office_hours.location`, preserve whatever the syllabus states verbatim: a room (`"GHC 5219"`), a Zoom URL (`"https://cmu.zoom.us/j/12345"`), or a hybrid (`"GHC 5219 + zoom.us/j/12345"`). Do not paraphrase or shorten URLs. If a host has a persistent personal Zoom room mentioned once alongside their name, put that URL on the `OfficeHourHost.zoom_link` (populated at commit time from the host roster context) rather than repeating it on every block.
- For `notes`, **skip generic university boilerplate**: Title IX statements, generic academic integrity language, disability accommodations sections, drop/withdraw deadlines, generic grading-appeal procedures, and other content that would appear identically across most syllabi at the school. **Only include course-specific content** the instructor is emphasizing: unusual late-work policy, particular attendance rules, laptop/phone rules, communication expectations, unique exam structure, required non-textbook materials, etc. If nothing course-specific is worth surfacing, return `"notes": []`.
- All output text is in **English**. If the syllabus is in another language, translate values to English while preserving proper nouns, room codes, URLs, and course codes verbatim.

**Validation and messaging at review:**

- If category weights don't sum to 100, the review screen flags it and blocks commit until resolved.
- If the syllabus doesn't state a grading scale (or Claude can't find one), the review screen pre-fills the standard 10-point scale, which the user can accept or edit before committing.
- **Incomplete-extraction banner.** If Claude returns very few rows (e.g. fewer than 3 assignments and empty office hours) — a strong signal the PDF may be a scan or the extraction went sideways — the review screen shows a prominent banner: *"This extraction looks incomplete. If this is a scanned PDF, try pasting the syllabus text instead."* with a link to the paste-text alternative flow.
- **No-assignments messaging.** If the extraction returned zero assignments (some courses issue everything week-by-week via Canvas), the review screen shows a milder note: *"No dated assignments found in this syllabus. You can add them as they're posted."* — commit is not blocked.

## Grade Math Semantics

Let `C` be the set of grade categories for a course. For each category `c`:

- `earned_c` = mean of `points_earned / points_possible` across graded, non-hidden `GradebookEntry` rows in `c`, after dropping the lowest `drop_lowest_n`.
- `has_grades_c` = true if `c` has at least one graded `GradebookEntry`.

**Extra credit is handled naturally by the math:**

- **Bonus points on a normal entry** — `points_earned > points_possible` is allowed. The row's ratio `points_earned / points_possible` is simply greater than `1.0`, and it pulls the category's `earned_c` up. No special case in the summation.
- **Pure extra-credit entries** — `points_possible = 0` with `points_earned > 0`. Since dividing by zero is undefined, these rows are excluded from the mean and instead added as a **flat bonus** to `earned_c` (scaled such that a `1`-point extra credit adds roughly `1 / typical_points_possible_in_category` to `earned_c`). Backend unit tests cover this case explicitly; the exact formula is documented alongside the tests.

The upshot for users: it works the way it works in your school's real gradebook. Enter `points_earned = 105, points_possible = 100` for bonus scoring, or `points_earned = 5, points_possible = 0` for pure extra credit. Both raise your grade.

**Current grade** (over completed categories only, so early-semester numbers aren't misleading):

```
current = Σ (earned_c × weight_pct_c)  for c in C where has_grades_c
        ─────────────────────────────────
          Σ weight_pct_c                for c in C where has_grades_c
```

**Target resolution.** A target `T` may be given as a number (e.g. `90`) or as a letter (e.g. `"A-"`). Letters resolve to the matching `GradeScaleBand.min_pct` by exact string match — so at a +/- school, `"A"` returns the `A` cutoff (typically 93), not the `A-` cutoff; a student who wants the lower bar types `"A-"` explicitly. Vivifi's current-grade output shows both the numeric grade and its letter, computed by walking the course's bands from highest `min_pct` down and returning the first band whose `min_pct ≤ current`.

**Prediction** ("what do I need on category `x` to hit target `T`?"), assuming all other categories finish at their current `earned_c` (or a user-specified assumption for ungraded categories):

```
needed_x = (T × 100 − Σ (earned_c × weight_pct_c for c ≠ x))
           ─────────────────────────────────────────────────
                            weight_pct_x
```

- If `needed_x > 100`: return "not reachable" and show what target *is* reachable.
- If `needed_x ≤ 0`: return "already locked in" plus the minimum needed to guarantee it.
- If the query involves multiple remaining items across categories, return a small scenarios table (e.g. "best case / likely / minimum needed") rather than a single answer.

Every formula in this section is covered by unit tests on the backend.

## SMS Interaction Model

Twilio webhook → FastAPI endpoint → Claude intent classifier → server executes → outbound confirmation. Users register a phone number in Settings; unregistered numbers are ignored.

**Whitelisted intents** (Claude must return exactly one, plus its parameters):

| Intent | Example message | Action |
|--------|-----------------|--------|
| `update_grade` | "got an 8/10 on the last CS homework" | Find the latest ungraded `GradebookEntry` in that course + category, set `points_earned`. |
| `query_grade` | "what's my grade in CS?" | Compute current grade, reply with number. |
| `query_upcoming` | "what's due this week?" | List `Assignment` rows due in next 7 days, reply with a compact list. |
| `add_assignment` | "add a quiz for CS due Friday" | Create paired `Assignment` + `GradebookEntry`, both with `source = "sms"`. Default `kind = "assignment"` unless the message names it as exam/quiz/test. |
| `mark_complete` | "finished the CS reading" | Set `completed = true` on the latest matching `Assignment`. Does not touch its `GradebookEntry`. |

**No silent writes.** If Claude's confidence is low, or multiple items match a "latest homework" reference, Viv replies with a numbered clarification ("Did you mean: 1) HW3, 2) HW4?") and only writes after the user responds. Every inbound and outbound message is stored as an `SmsMessage` for audit; bodies are purged after 30 days.

**Deployment notes.** US-based public SMS requires Twilio A2P 10DLC registration (business verification, roughly `$1/month` + campaign fees) — a real friction cost that's out of scope for the hackathon. For the demo, use a Twilio trial number with the demo phone verified on the account. Twilio webhooks time out at ~15 seconds; wrap Claude/DB work in FastAPI `BackgroundTasks` (or a lightweight task queue) so the webhook acknowledges immediately and the actual write happens async. SMS is intentionally near the bottom of the Stretch list for these reasons.

## API & Backend

Python FastAPI backend. Claude is called **only from the backend** so the Anthropic API key never touches the browser. Postgres via SQLAlchemy + Alembic migrations. Deployed on Render.

**User-scoping enforcement.** Every user-owned table has a `user_id` column and its SQLAlchemy model inherits a `UserOwned` mixin. All queries go through a session-scoped helper that automatically appends `WHERE user_id = current_user.id` (or `WHERE course.user_id = ...` via join for nested entities). Endpoints do not filter by user manually. This defense-in-depth pattern makes "forgot to add `WHERE user_id`" — the single most common data-leak class in multi-tenant apps — impossible to introduce by accident.

**Auth linking policy.** If a user signs in with Google and the Google-provided email already belongs to a password-based `User` row, Vivifi **auto-links** the Google identity (populates `google_sub` on the existing row) and signs them in. This is a small trust concession — it assumes the email address is a stable identifier of the same person, which is true if Google verified it. Users cannot un-link a Google account from a password account through the UI in v1; that's a Settings feature for later. Documenting this policy explicitly because "user has two accounts with the same email" is a common source of duplicate-account bugs.

**Key endpoints (indicative, not exhaustive):**

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `GET /auth/google/callback`
- `GET/POST /semesters`, `PATCH/DELETE /semesters/{id}`
- `GET/POST /courses`, `PATCH/DELETE /courses/{id}`
- `POST /courses/{id}/syllabus` — accepts a PDF upload (max 10 MB); returns the parsed JSON (not yet persisted)
- `POST /courses/{id}/syllabus/commit` — persists a user-confirmed extraction; creates paired `Assignment` + `GradebookEntry` rows for each syllabus assignment
- `GET/POST /courses/{id}/categories`, `PATCH/DELETE /categories/{id}`
- `GET/PUT /courses/{id}/grading-scale` — read or replace the full list of `GradeScaleBand` rows for a course
- `GET/POST /courses/{id}/assignments`, `PATCH/DELETE /assignments/{id}` — the `PATCH` endpoint is also the target of Calendar drag-and-drop reschedules (updates `due_date`). Rejects a `due_date` change on any row where `kind = "exam"`.
- `GET/POST /courses/{id}/gradebook-entries`, `PATCH/DELETE /gradebook-entries/{id}`
- `GET/POST /courses/{id}/office-hour-hosts`, `PATCH/DELETE /office-hour-hosts/{id}`
- `GET/POST /courses/{id}/office-hours`, `PATCH/DELETE /office-hours/{id}`
- `GET/POST /courses/{id}/class-meetings`, `PATCH/DELETE /class-meetings/{id}`
- `GET/POST /courses/{id}/notes`, `PATCH/DELETE /notes/{id}`
- `POST /courses/{id}/predict` — body: `{ query: string }`; returns `{ answer: number | scenarios[], explanation: string }`
- `POST /sms/webhook` — Twilio inbound (returns immediately; processing happens in a background task)

## Privacy Note

- **Transparency:** Syllabus text is sent to Vivifi's backend, which forwards it to Claude for extraction. Users are told this on the upload screen.
- **Data handling:** Raw syllabus text is never persisted. Only the structured extraction the user confirms is stored (course meta, categories, grading scale, assignments/exams, hosts, office hours, class meetings, and any course-specific notes).
- **SMS retention:** Inbound and outbound SMS bodies are stored for 30 days for debugging/audit, then purged. Users can request earlier deletion from Settings.
- **Secrets:** All API keys (Anthropic, Twilio, Google OAuth) live on the backend only.

## Design & Branding

- **Palette:** warm off-white background `#FAF7F2`, deep ink text `#1B1B1F`, single accent for actions `#D97757` (muted terracotta). Each course gets its own swatch for gradebook/calendar accents.
- **Colors are semantic tokens, not hex values in components.** All palette colors live as CSS custom properties at the document root (`--color-bg`, `--color-fg`, `--color-accent`, `--color-surface`, `--color-muted`) and are exposed to Tailwind as `bg-bg`, `text-fg`, `bg-accent`, etc. Components never hardcode hex codes.
- **Per-course accent.** Each Course Detail page overrides `--color-accent` at its wrapper element with the course's `color` field. Buttons, active tabs, calendar dots for that course's assignments, and the current-time line on Office Hour Week all inherit that value automatically — one CSS variable override, whole page re-themes.
- **Themeable by construction.** Because everything routes through CSS variables, adding an entire new theme (Midnight, Sage, Paperwhite, ...) is a ~10-line CSS class that redefines the variables — zero component changes. See the Stretch list; this pairs with the customization goal in **Vibe** below.
- **Typography:** Inter for UI copy; JetBrains Mono for grades and numbers (makes the gradebook feel precise and calculator-like).
- **Style direction:** calm, information-dense, *not* an AI chat app. Cards over drop shadows, generous whitespace around numbers, no chat bubbles anywhere in the UI. Every AI touchpoint (syllabus review, prediction query, SMS) uses structured input/output — never a conversational thread.
- **Vibe:** clean, so that the vibe is customizable. There should be some choice in choosing color theme for the whole page, or even uploading images as the vibe for each course so it can be chosen. Think customizable like a Canvas page, or Notion page.
- **Course dashboard, not a grid.** The Semester Hub uses a *dashboard* layout — visually rich course cards with hero color, name, code, current grade, and next upcoming item — not a boring uniform spreadsheet grid. Should feel warm and skimmable, not like a Canvas course-list.
- **Nickname convention.** The product name is **Vivifi**; use it everywhere formal (headings, docs, buttons, error copy). **Viv** is the casual/SMS short form: use it in the SMS metaphor ("Text Viv"), in the pitch, and nowhere else.

## Tech Stack

**Frontend**
- React 18 + Vite + TypeScript
- Tailwind CSS + shadcn/ui components, driven by CSS custom properties for palette (enables per-course accents and future user themes)
- React Router for navigation
- TanStack Query for server state
- FullCalendar (or React Big Calendar) for calendar views — drag-and-drop reschedule uses FullCalendar's built-in `eventDrop`
- Hosted on GitHub Pages (static build; API base URL points at Render backend)

**Backend**
- FastAPI (Python 3.11+)
- SQLAlchemy 2.x + Alembic migrations
- Postgres 15+ (Neon serverless — free tier, database branching for schema iteration)
- `pdfplumber` for PDF text extraction
- `anthropic` SDK for Claude
- `twilio` SDK for SMS (only when SMS reaches implementation)
- `authlib` for Google OAuth
- `python-jose` + `bcrypt` for JWT + password hashing
- Web service hosted on Render (free tier; Cloudflare/UptimeRobot keep-alive ping every 10 minutes to prevent cold starts)

**External services**
- Anthropic Claude (syllabus parsing, SMS intent classification, grade-prediction query interpretation)
- Twilio (SMS in/out — stretch)
- Google OAuth (login)

## Platform Targets

- **Web dashboard only.** Responsive down to mobile widths, but no native app.
- **Frontend:** GitHub Pages.
- **Backend:** Render (free web service).
- **Database:** Neon (free serverless Postgres, separate provider from the backend host).
- **SMS:** Twilio (Messaging Service with a single US long code or toll-free number). Deferred to stretch.

Login is unified across access surfaces (web + SMS-linked phone number, when SMS ships) via the Render-hosted backend.

## Milestones

- **1 — Foundations.** Repo layout (`frontend/`, `backend/`). FastAPI skeleton + Postgres + Alembic + email/password auth. Vite + Tailwind + routing scaffold. **Semester Setup screen and empty-state UX**, Semester and Course CRUD wired end-to-end. Both apps deployed (Render + GitHub Pages) even if empty — deployment friction should be paid down early.
- **2 — Live Syllabus.** PDF upload endpoint (10 MB cap), `pdfplumber` extraction, Claude structured-extraction prompt hardened against messy syllabi — including exam-vs-assignment classification, recurring-item expansion using semester dates, host roster extraction, class meeting extraction, course-specific note surfacing (with the boilerplate filter), and default-Overall-category fallback. Syllabus Review screen with editable tables and the incomplete-extraction banner. Commit flow creates paired `Assignment` + `GradebookEntry` rows. This is the flagship demo moment — polish it hardest.
- **3 — Grade Math + Views.** Gradebook UI with the split model: entries auto-populated from assignments, plus manual attendance/participation entries and hide/delete affordances independent from the Assignments tab. Grade math engine with unit tests including extra-credit cases (this is the one place a subtle bug destroys credibility). Query-box prediction flow (backend endpoint + minimal frontend UI). Calendar screen (month view first) with drag-and-drop rescheduling and distinct exam rendering. Course Detail Instructors tab. Conditional Notes tab.
- **4 — Polish.** Google OAuth. Empty states, error states, mobile responsive pass. Demo script + README + short walkthrough video. **SMS is deferred to stretch** — see the MVP vs Stretch section for reasoning.

## MVP vs Stretch

**MVP (must demo):**
- Email/password auth
- Semester Setup + Semester Hub with folder-style switcher and empty state
- Course CRUD
- Syllabus upload → Claude extraction → Syllabus Review → commit (course meta, categories, grading scale, assignments and exams, host roster + hours, class meetings, course notes)
- Paired `Assignment` + `GradebookEntry` creation on commit
- Independent **Assignments** tab (task/schedule) and **Gradebook** tab (grades) — no cross-effects when marking completed vs entering grades
- Weighted current-grade math (assignments and exams contribute identically; extra credit handled naturally)
- Prediction query box ("what do I need on X to get Y?")
- Manual `GradebookEntry` additions (attendance, participation, extra credit, etc.)
- Course Detail **Instructors** tab (host directory + weekly hours grid)
- Course Detail **Notes** tab (conditional — renders only when notes exist)
- Calendar month view with **drag-and-drop rescheduling** (assignments only; exams non-draggable)
- Fallback single `Overall` category when the syllabus states no weights
- Incomplete-extraction banner + no-assignments messaging on the review screen

**Stretch (in priority order):**
1. Consolidated Office Hour Week view (cross-course grid)
2. Google OAuth
3. Calendar week and list views (with drag-and-drop on both)
4. `drop_lowest_n` support in category math
5. Scenarios table for multi-item predictions
6. Notifications / reminders ("your midterm is tomorrow" — browser push, or email, or SMS if that's built)
7. Textbooks / required materials as a first-class entity (currently these live in `CourseNote`)
8. Past-semester read-only browsing
9. User-selectable themes via CSS-variable class swap
10. Per-host filter on the Office Hour Week view
11. Course-level image/cover upload for the Vibe customization goal
12. Class-meeting-aware calendar (block off class times, highlight OH right after class)
13. **SMS companion** (Twilio + intent classifier + audit table) — deliberately near the bottom: A2P 10DLC verification is real deployment friction, webhook timeout handling adds async complexity, and the feature is demo-only until compliance work is done. Consider it "aspirational" for the hackathon submission rather than promised.
14. **Additional class-hour types** (recitations, labs, seminars, "MATLAB reci" and other course-specific sub-sessions). MVP folds everything into a single `ClassMeeting` entity, which loses the distinction between a normal lecture and, say, a required Friday MATLAB recitation. A future revision could add a `kind` (`lecture | recitation | lab | seminar | other`) to `ClassMeeting` so the calendar and future "class-meeting-aware" features can differentiate them. Deferred because the long tail of naming conventions ("reci", "PSO", "SI session", ...) makes fully-modeled taxonomy unbounded, and lumping into `ClassMeeting` is the least wrong default.
15. **Drag-to-reorder semester tabs.** The folder-style switcher currently renders tabs in creation order (older on the left, newer on the right) and holds that order regardless of which semester is active. Drag-to-reorder would let students group tabs by their own logic (e.g. current semester on the far left even if it wasn't created first). Requires an `order_index` column on `Semester`, a `PUT /semesters/order` endpoint that accepts an ordered list of slugs, and HTML5 drag handlers on each tab with an optimistic-update mutation.
16. **Paired rename prompt.** Renaming an `Assignment` does **not** propagate to its linked `GradebookEntry` (and vice versa) — intentional split-model divergence. Stretch UX: when the user renames one half of a pair that still shares a `source_assignment_id` link, offer "Rename the linked gradebook entry / assignment too?" so they can keep labels in sync without losing the option to diverge. MVP keeps independent inline renames on each tab.

## Constraints & Non-Goals

- **No LMS integration** (Canvas / Blackboard / Moodle). The whole pitch is *"your prof doesn't update Canvas"* — pulling from Canvas would undercut it.
- **No re-upload of a syllabus to an existing course.** Mid-semester changes are handled via manual edit only. Profs rarely revise their whole syllabus mid-term (many still have the wrong semester at the top of the doc for months on end); when they do change something, the fix is a manual edit to the affected rows.
- **English only** for extraction output and the UI. Non-English syllabi are supported at extraction time (Claude translates values to English) but the UI is English-only for MVP.
- **No native mobile app.** Web only, responsive.
- **No collaborative / shared courses.** Strictly per-user.
- **No offline mode.**
- **No AI chat surface.** Every AI touchpoint is a structured input/output — no conversation threads, no message history UI.
- **Analytics & monitoring:** best-effort only. Render logs + optional Sentry free tier if time permits; not a committed feature.

## Acceptance Criteria

- A new user can go from landing page to a fully-populated first course in **under 3 minutes** using only a PDF syllabus: Login → Semester Setup → Add Course → Upload → Review → Commit.
- Gradebook math is verifiable by hand against the worked example in the Grade Math Semantics section, and is covered by backend unit tests. Assignments and exams contribute identically. Extra credit (`points_earned > points_possible` or `points_possible = 0`) is handled without special casing from the caller.
- The prediction query "what do I need on the final to get an A?" returns a **number** (or a scenarios table), never prose or a chat reply.
- The **Assignments** tab and the **Gradebook** tab are independent: toggling `completed` on an `Assignment` does not affect its linked `GradebookEntry`, and vice versa. Deleting a `GradebookEntry` does not delete its linked `Assignment`.
- The user can add a manual `GradebookEntry` (e.g. "Overall attendance") in any category without creating a paired `Assignment`.
- Drag-and-drop reschedule on any calendar view mutates the assignment's `due_date` server-side within a single `PATCH /assignments/{id}` request. Exams are rendered non-draggable and the backend rejects `due_date` changes on `kind = "exam"` rows.
- The Course Detail **Notes** tab renders only when the course has at least one `CourseNote`. If Claude extracted only generic university boilerplate (which is filtered out), no tab appears.
- Every `OfficeHour` row references an `OfficeHourHost`. The Instructors tab shows the host directory alongside the weekly hours grid.
- If the uploaded syllabus specifies no grade weights, the review screen pre-fills a single `Overall` category at 100% and does not block commit.
- If Claude expands a recurring assignment (given valid semester dates), the resulting individual rows are shown on the review screen for the user to accept or edit before commit.
- Uploads over 10 MB are rejected server-side with a clear error message.
- No SMS message writes to the DB without either (a) an unambiguous intent match or (b) an explicit confirming reply from the user.
- No raw syllabus text is persisted after a successful ingestion — only the user-confirmed structured extraction.
- All AI calls (Claude) originate from the backend; the Anthropic API key is never bundled into the frontend.
