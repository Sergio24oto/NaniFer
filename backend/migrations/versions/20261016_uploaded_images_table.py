"""uploaded images table for container redeploy persistence

Revision ID: 20261016_uploaded_images_table
Revises: 20261016_tortas_in_desayunos
Create Date: 2026-10-16 17:00:00

"""
from pathlib import Path
from alembic import op
import sqlalchemy as sa

revision = '20261016_uploaded_images_table'
down_revision = '20261016_tortas_in_desayunos'
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    tables = sa.inspect(conn).get_table_names()
    if 'uploaded_images' not in tables:
        op.create_table(
            'uploaded_images',
            sa.Column('filename', sa.String(100), primary_key=True),
            sa.Column('data', sa.LargeBinary(length=16777215), nullable=False),
            sa.Column('mime_type', sa.String(50), nullable=False, server_default='image/webp'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    # Populate any existing local uploads on disk into database
    try:
        backend_dir = Path(__file__).resolve().parent.parent.parent
        upload_dir = backend_dir / 'uploads' / 'menu'
        if upload_dir.is_dir():
            for p in upload_dir.iterdir():
                if p.is_file() and p.suffix.lower() in ('.webp', '.jpg', '.jpeg', '.png'):
                    data = p.read_bytes()
                    mime = 'image/webp' if p.suffix.lower() == '.webp' else 'image/jpeg' if p.suffix.lower() in ('.jpg', '.jpeg') else 'image/png'
                    conn.execute(
                        sa.text("""
                            INSERT INTO uploaded_images (filename, data, mime_type, created_at)
                            VALUES (:filename, :data, :mime_type, NOW())
                            ON DUPLICATE KEY UPDATE data = :data, mime_type = :mime_type
                        """),
                        {"filename": p.name, "data": data, "mime_type": mime}
                    )
    except Exception:
        pass

def downgrade():
    op.drop_table('uploaded_images')
