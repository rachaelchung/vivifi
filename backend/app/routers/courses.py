from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Course, Semester, User
from app.schemas.course import CourseCreate, CourseRead, CourseUpdate

router = APIRouter(prefix="/courses", tags=["courses"])


def _serialize(course: Course) -> CourseRead:
    return CourseRead.model_validate(
        {
            "slug": course.slug,
            "semester_slug": course.semester.slug,
            "name": course.name,
            "code": course.code,
            "instructor_name": course.instructor_name,
            "instructor_email": course.instructor_email,
            "color": course.color,
            "target_grade": course.target_grade,
            "timezone": course.timezone,
            "syllabus_committed_at": course.syllabus_committed_at,
            "created_at": course.created_at,
            "updated_at": course.updated_at,
        }
    )


def _get_owned_semester(db: Session, semester_slug: str, user: User) -> Semester:
    semester = db.execute(
        select(Semester).where(Semester.slug == semester_slug, Semester.user_id == user.id)
    ).scalar_one_or_none()
    if semester is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester not found.")
    return semester


def _get_owned_course(db: Session, course_slug: str, user: User) -> Course:
    course = db.execute(
        select(Course)
        .join(Semester, Course.semester_id == Semester.id)
        .where(Course.slug == course_slug, Semester.user_id == user.id)
    ).scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found.")
    return course


@router.get("/{slug}", response_model=CourseRead)
def get_course(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CourseRead:
    course = _get_owned_course(db, slug, current_user)
    return _serialize(course)


@router.get("", response_model=list[CourseRead])
def list_courses(
    semester_slug: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CourseRead]:
    stmt = (
        select(Course)
        .join(Semester, Course.semester_id == Semester.id)
        .where(Semester.user_id == current_user.id)
        .order_by(Course.created_at.asc())
    )
    if semester_slug is not None:
        stmt = stmt.where(Semester.slug == semester_slug)

    rows = db.execute(stmt).scalars().all()
    return [_serialize(row) for row in rows]


@router.post("", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CourseRead:
    semester = _get_owned_semester(db, payload.semester_slug, current_user)

    course = Course(
        semester_id=semester.id,
        name=payload.name.strip(),
        code=payload.code,
        instructor_name=payload.instructor_name,
        instructor_email=payload.instructor_email,
        color=payload.color,
        target_grade=payload.target_grade,
        timezone=payload.timezone,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return _serialize(course)


# Fields whose value must always be non-null; sending an explicit null is ignored.
_REQUIRED_FIELDS = {"name", "color", "timezone"}
# Fields where an explicit null (or empty string) clears the stored value.
_NULLABLE_FIELDS = {"code", "instructor_name", "instructor_email", "target_grade"}


@router.patch("/{slug}", response_model=CourseRead)
def update_course(
    slug: str,
    payload: CourseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CourseRead:
    course = _get_owned_course(db, slug, current_user)
    data = payload.model_dump(exclude_unset=True)

    for field, value in data.items():
        if isinstance(value, str):
            value = value.strip() or None
        if field in _REQUIRED_FIELDS:
            if value is not None:
                setattr(course, field, value)
        elif field in _NULLABLE_FIELDS:
            setattr(course, field, value)

    db.commit()
    db.refresh(course)
    return _serialize(course)


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    course = _get_owned_course(db, slug, current_user)
    db.delete(course)
    db.commit()
