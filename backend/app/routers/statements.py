from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import Statement, User
from app.schemas import StatementOut
from app.services import import_service

router = APIRouter(prefix="/api/statements", tags=["statements"])

ALLOWED_SUFFIXES = (".pdf", ".csv")


@router.post("/upload", response_model=StatementOut, status_code=202)
async def upload(file: UploadFile = File(...), user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    """Accept a statement and start processing it on a worker thread.

    Returns 202 with the statement row immediately; the client polls
    `GET /api/statements/{id}` for real stage-by-stage progress.
    """
    if not file.filename or not file.filename.lower().endswith(ALLOWED_SUFFIXES):
        raise HTTPException(status_code=400,
                            detail="Only PDF and CSV bank statements are supported.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="That file is empty.")
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {settings.max_upload_mb} MB limit.")

    duplicate = import_service.find_duplicate_upload(db, user.id, content)
    if duplicate is not None:
        raise HTTPException(
            status_code=409,
            detail=(f"You already imported this exact file on "
                    f"{duplicate.uploaded_at:%d %b %Y} as '{duplicate.filename}'."))

    statement = import_service.create_pending(db, user.id, file.filename, content)
    import_service.process_async(statement.id, user.id, file.filename, content)
    return statement


@router.get("", response_model=list[StatementOut])
def list_statements(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (db.query(Statement).filter(Statement.user_id == user.id)
            .order_by(Statement.uploaded_at.desc()).all())


@router.get("/{statement_id}", response_model=StatementOut)
def get_statement(statement_id: int, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    """Polled during import to drive the progress UI."""
    statement = (db.query(Statement)
                 .filter(Statement.id == statement_id, Statement.user_id == user.id).first())
    if statement is None:
        raise HTTPException(status_code=404, detail="Statement not found")
    # The worker thread writes on its own session; refresh to read fresh state.
    db.refresh(statement)
    return statement


@router.delete("/{statement_id}", status_code=204)
def delete_statement(statement_id: int, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    statement = (db.query(Statement)
                 .filter(Statement.id == statement_id, Statement.user_id == user.id).first())
    if statement is None:
        raise HTTPException(status_code=404, detail="Statement not found")
    db.delete(statement)
    db.commit()
