"""Syllabus ingestion endpoints.

Three routes, all scoped under the owning course:

- `POST /courses/{slug}/syllabus`        — multipart PDF upload
- `POST /courses/{slug}/syllabus/text`   — JSON paste-text alternative
- `POST /courses/{slug}/syllabus/commit` — user-confirmed extraction

Extraction endpoints hold raw text in memory only (SPEC privacy note). Commit
runs inside a single SQLAlchemy transaction — if any row insert fails, none
of the paired Assignment + GradebookEntry rows land in the DB.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models import (
    Assignment,
    ClassMeeting,
    Course,
    CourseNote,
    GradebookEntry,
    GradeCategory,
    GradeScaleBand,
    OfficeHour,
    OfficeHourHost,
    Semester,
    User,
)
from app.schemas.syllabus import (
    SyllabusExtractRequest,
    SyllabusExtractResponse,
    SyllabusExtraction,
)
from app.services.syllabus import (
    SyllabusIngestError,
    extract_pdf_text,
    extract_syllabus,
    looks_incomplete,
)

router = APIRouter(prefix="/courses/{slug}/syllabus", tags=["syllabus"])


def _get_owned_course(db: Session, slug: str, user: User) -> Course:
    course = db.execute(
        select(Course)
        .join(Semester, Course.semester_id == Semester.id)
        .where(Course.slug == slug, Semester.user_id == user.id)
    ).scalar_one_or_none()
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found."
        )
    return course


def _ingest_error(exc: SyllabusIngestError) -> HTTPException:
    # These errors are safe to surface — they're written for the user.
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
    )


def _build_response(course: Course, extraction: SyllabusExtraction) -> SyllabusExtractResponse:
    return SyllabusExtractResponse(
        extraction=extraction,
        looks_incomplete=looks_incomplete(extraction),
        has_no_assignments=len(extraction.assignments) == 0,
    )


@router.post("", response_model=SyllabusExtractResponse)
async def upload_syllabus_pdf(
    slug: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SyllabusExtractResponse:
    course = _get_owned_course(db, slug, current_user)
    if course.syllabus_committed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This course already has a committed syllabus. Edit the "
                "individual rows to make changes."
            ),
        )

    settings = get_settings()
    max_bytes = settings.syllabus_max_bytes

    pdf_bytes = await file.read()
    if len(pdf_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )
    if len(pdf_bytes) > max_bytes:
        mib = max_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Syllabus is too large. Max size is {mib} MB.",
        )

    content_type = (file.content_type or "").lower()
    filename = (file.filename or "").lower()
    if not (content_type == "application/pdf" or filename.endswith(".pdf")):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF uploads are supported. Try the paste-text option.",
        )

    try:
        raw_text = extract_pdf_text(pdf_bytes)
        extraction = extract_syllabus(
            raw_text,
            semester_start=course.semester.start_date,
            semester_end=course.semester.end_date,
            course_name_hint=course.name,
        )
    except SyllabusIngestError as exc:
        raise _ingest_error(exc) from exc

    return _build_response(course, extraction)


@router.post("/text", response_model=SyllabusExtractResponse)
def upload_syllabus_text(
    slug: str,
    payload: SyllabusExtractRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SyllabusExtractResponse:
    course = _get_owned_course(db, slug, current_user)
    if course.syllabus_committed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This course already has a committed syllabus. Edit the "
                "individual rows to make changes."
            ),
        )

    settings = get_settings()
    max_chars = settings.syllabus_max_bytes  # generous: 10 MB of text is huge
    if len(payload.text) > max_chars:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Pasted text is too large.",
        )

    try:
        extraction = extract_syllabus(
            payload.text,
            semester_start=course.semester.start_date,
            semester_end=course.semester.end_date,
            course_name_hint=course.name,
        )
    except SyllabusIngestError as exc:
        raise _ingest_error(exc) from exc

    return _build_response(course, extraction)


# --- commit ---


# Fallback grading scale when a syllabus doesn't state one and the user
# doesn't provide one either. SPEC §GradeScaleBand.
_DEFAULT_SCALE: list[tuple[str, float]] = [
    ("A", 90.0),
    ("B", 80.0),
    ("C", 70.0),
    ("D", 60.0),
    ("F", 0.0),
]

# Tolerate a bit of float slop when checking that weights sum to 100.
_WEIGHT_TOLERANCE = 0.5


def _validate_extraction_for_commit(extraction: SyllabusExtraction) -> None:
    if not extraction.course.name.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Course name is required.",
        )

    if len(extraction.grade_categories) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Add at least one grade category. If you don't know the "
                "weights, a single 'Overall' at 100% works."
            ),
        )

    total_weight = sum(c.weight_pct for c in extraction.grade_categories)
    if abs(total_weight - 100.0) > _WEIGHT_TOLERANCE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Grade category weights must sum to 100 (got {total_weight:g})."
            ),
        )

    host_names = {h.name for h in extraction.office_hour_hosts}
    for oh in extraction.office_hours:
        if oh.host_name not in host_names:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Office-hour block references unknown host "
                    f"'{oh.host_name}'."
                ),
            )


@router.post("/commit", status_code=status.HTTP_201_CREATED)
def commit_syllabus(
    slug: str,
    extraction: SyllabusExtraction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    course = _get_owned_course(db, slug, current_user)
    if course.syllabus_committed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This course already has a committed syllabus. Edit the "
                "individual rows to make changes."
            ),
        )

    _validate_extraction_for_commit(extraction)

    # Apply extracted course meta on top of whatever the user set at Add Course
    # time. Only overwrite fields the extraction actually filled in.
    if extraction.course.name.strip():
        course.name = extraction.course.name.strip()
    if extraction.course.code:
        course.code = extraction.course.code
    if extraction.course.instructor_name:
        course.instructor_name = extraction.course.instructor_name
    if extraction.course.instructor_email:
        course.instructor_email = str(extraction.course.instructor_email)

    try:
        # 1. Grade categories — remember name → id for assignment linking.
        category_by_name: dict[str, GradeCategory] = {}
        for cat in extraction.grade_categories:
            row = GradeCategory(
                course_id=course.id,
                name=cat.name.strip(),
                weight_pct=cat.weight_pct,
                drop_lowest_n=cat.drop_lowest_n,
            )
            db.add(row)
            category_by_name[row.name] = row
        db.flush()  # allocate ids for use as FKs below

        # 2. Grading scale — apply default fallback if the payload was empty.
        scale_bands = extraction.grading_scale
        if not scale_bands:
            for letter, min_pct in _DEFAULT_SCALE:
                db.add(
                    GradeScaleBand(course_id=course.id, letter=letter, min_pct=min_pct)
                )
        else:
            for band in scale_bands:
                db.add(
                    GradeScaleBand(
                        course_id=course.id,
                        letter=band.letter.strip(),
                        min_pct=band.min_pct,
                    )
                )

        # 3. Office-hour hosts (by name → id map, used by OH blocks below).
        host_by_name: dict[str, OfficeHourHost] = {}
        for host in extraction.office_hour_hosts:
            row = OfficeHourHost(
                course_id=course.id,
                name=host.name.strip(),
                role=host.role,
                email=str(host.email) if host.email else None,
                zoom_link=host.zoom_link,
            )
            db.add(row)
            host_by_name[row.name] = row
        db.flush()

        # 4. Office-hour blocks.
        for oh in extraction.office_hours:
            host = host_by_name[oh.host_name]
            db.add(
                OfficeHour(
                    course_id=course.id,
                    host_id=host.id,
                    day_of_week=oh.day_of_week,
                    start_time=oh.start_time,
                    end_time=oh.end_time,
                    location=oh.location,
                )
            )

        # 5. Class meetings.
        for cm in extraction.class_meetings:
            db.add(
                ClassMeeting(
                    course_id=course.id,
                    day_of_week=cm.day_of_week,
                    start_time=cm.start_time,
                    end_time=cm.end_time,
                    location=cm.location,
                )
            )

        # 6. Course notes.
        for note in extraction.notes:
            db.add(
                CourseNote(
                    course_id=course.id,
                    heading=note.heading.strip(),
                    body=note.body,
                    source="syllabus",
                )
            )

        # 7. Assignments — each paired with a GradebookEntry (SPEC lifecycle).
        for a in extraction.assignments:
            category = (
                category_by_name.get(a.category_name.strip())
                if a.category_name
                else None
            )
            assignment = Assignment(
                course_id=course.id,
                name=a.name.strip(),
                kind=a.kind,
                due_date=a.due_date,
                source="syllabus",
                completed=False,
            )
            db.add(assignment)
            db.flush()  # allocate the assignment's id

            entry = GradebookEntry(
                course_id=course.id,
                category_id=category.id if category else None,
                source_assignment_id=assignment.id,
                name=a.name.strip(),
                points_earned=None,
                points_possible=a.points_possible,
                source="syllabus",
                hidden=False,
            )
            db.add(entry)

        # 8. Mark the course committed.
        course.syllabus_committed_at = datetime.now(timezone.utc)

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    return {"slug": course.slug, "status": "committed"}
