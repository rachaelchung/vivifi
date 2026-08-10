"""class_meeting kind section is_mine

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-10 11:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Keep server defaults — SQLite cannot ALTER COLUMN DROP DEFAULT, and
    # Postgres is fine leaving them. Application code always sets these fields.
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"] for c in inspector.get_columns("class_meetings")}

    if "kind" not in cols:
        op.add_column(
            "class_meetings",
            sa.Column(
                "kind",
                sa.String(length=20),
                nullable=False,
                server_default="lecture",
            ),
        )
    if "section" not in cols:
        op.add_column(
            "class_meetings",
            sa.Column("section", sa.String(length=120), nullable=True),
        )
    if "is_mine" not in cols:
        op.add_column(
            "class_meetings",
            sa.Column(
                "is_mine",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0")
                if conn.dialect.name == "sqlite"
                else sa.text("false"),
            ),
        )

    # Existing rows were extracted without section alternatives — treat as the
    # student's schedule so the Week Schedule isn't empty after migrate.
    # Postgres rejects integer literals for boolean columns; SQLite accepts 1.
    op.execute(
        sa.text(
            "UPDATE class_meetings SET is_mine = 1"
            if conn.dialect.name == "sqlite"
            else "UPDATE class_meetings SET is_mine = true"
        )
    )


def downgrade() -> None:
    op.drop_column("class_meetings", "is_mine")
    op.drop_column("class_meetings", "section")
    op.drop_column("class_meetings", "kind")
