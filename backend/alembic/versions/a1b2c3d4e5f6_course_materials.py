"""course_materials

Revision ID: a1b2c3d4e5f6
Revises: 32b25850f207
Create Date: 2026-08-09 17:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "32b25850f207"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "course_materials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("authors", sa.String(length=500), nullable=True),
        sa.Column("edition", sa.String(length=120), nullable=True),
        sa.Column("isbn", sa.String(length=32), nullable=True),
        sa.Column("publisher", sa.String(length=200), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("url", sa.String(length=500), nullable=True),
        sa.Column("requirement", sa.String(length=16), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_course_materials_course_id"),
        "course_materials",
        ["course_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_course_materials_course_id"), table_name="course_materials")
    op.drop_table("course_materials")
