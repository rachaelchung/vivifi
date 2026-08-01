"""Assignment CRUD.

Two subtle behaviors codified here:

- **PATCH rejects `due_date` changes on exams** (SPEC acceptance criteria).
  Exams are prof-set; students shouldn't casually reschedule them via
  drag-and-drop.
- **DELETE optionally cascades to the linked GradebookEntry** via
  `?cascade_gradebook=true`. The default is to null out `source_assignment_id`
  on the paired entry, matching the SPEC lifecycle rules.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Assignment, GradebookEntry, User
from app.routers._common import get_owned_course
from app.schemas.assignment import AssignmentCreate, AssignmentRead, AssignmentUpdate

router = APIRouter(prefix="/courses/{course_slug}/assignments", tags=["assignments"])


@router.get("", response_model=list[AssignmentRead])
def list_assignments(
    course_slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AssignmentRead]:
    course = get_owned_course(db, course_slug, current_user)
    rows = db.execute(
        select(Assignment)
        .where(Assignment.course_id == course.id)
        # NULL due dates sink to the bottom so dated items are the first thing
        # the user sees. Within the same date, keep creation order stable.
        .order_by(Assignment.due_date.asc().nulls_last(), Assignment.id.asc())
    ).scalars().all()
    return [AssignmentRead.model_validate(row) for row in rows]


@router.post(
    "", response_model=AssignmentRead, status_code=status.HTTP_201_CREATED
)
def create_assignment(
    course_slug: str,
    payload: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssignmentRead:
    course = get_owned_course(db, course_slug, current_user)
    row = Assignment(
        course_id=course.id,
        name=payload.name.strip(),
        kind=payload.kind,
        due_date=payload.due_date,
        source="manual",
        notes=payload.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return AssignmentRead.model_validate(row)


def _get_owned_assignment(
    db: Session, course_slug: str, assignment_slug: str, user: User
) -> Assignment:
    course = get_owned_course(db, course_slug, user)
    row = db.execute(
        select(Assignment).where(
            Assignment.slug == assignment_slug,
            Assignment.course_id == course.id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found."
        )
    return row


@router.patch("/{assignment_slug}", response_model=AssignmentRead)
def update_assignment(
    course_slug: str,
    assignment_slug: str,
    payload: AssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssignmentRead:
    row = _get_owned_assignment(db, course_slug, assignment_slug, current_user)
    data = payload.model_dump(exclude_unset=True)

    # SPEC: reject due_date changes on exams. The frontend renders them as
    # non-draggable, but this is the actual enforcement — a student who
    # crafts a raw request still can't move an exam via drag-and-drop.
    if "due_date" in data and row.kind == "exam":
        # We do allow the *value* to be re-sent if it matches (idempotent),
        # so that a UI that PATCHes-all-fields doesn't fail spuriously.
        if data["due_date"] != row.due_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Exams can't be rescheduled by dragging — edit the "
                    "assignment kind to move the date."
                ),
            )

    if "name" in data and data["name"] is not None:
        row.name = data["name"].strip()
    if "kind" in data and data["kind"] is not None:
        row.kind = data["kind"]
    if "due_date" in data:
        row.due_date = data["due_date"]
    if "completed" in data and data["completed"] is not None:
        row.completed = data["completed"]
    if "notes" in data:
        row.notes = data["notes"]

    db.commit()
    db.refresh(row)
    return AssignmentRead.model_validate(row)


@router.delete(
    "/{assignment_slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_assignment(
    course_slug: str,
    assignment_slug: str,
    cascade_gradebook: bool = Query(
        default=False,
        description=(
            "If true, also delete the paired GradebookEntry. Default (false) "
            "detaches the entry — it becomes an orphaned manual row."
        ),
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _get_owned_assignment(db, course_slug, assignment_slug, current_user)

    if cascade_gradebook:
        linked = db.execute(
            select(GradebookEntry).where(
                GradebookEntry.source_assignment_id == row.id
            )
        ).scalars().all()
        for entry in linked:
            db.delete(entry)
        # `db.delete(row)` after we've deleted the linked entries — the FK is
        # ON DELETE SET NULL, but since the entries are already gone, this
        # is a clean two-step drop.

    db.delete(row)
    db.commit()
