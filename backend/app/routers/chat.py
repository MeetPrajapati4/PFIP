import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.deps import get_current_user, get_user_from_token
from app.models import ChatMessage, User
from app.schemas import ChatMessageOut, ChatRequest
from app.services import chat_service, gemini_client

logger = logging.getLogger("pfip.chat")

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatMessageOut)
def send_message(payload: ChatRequest, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    return chat_service.answer(db, user.id, payload.message.strip())


@router.get("/stream")
def stream_message(message: str = Query(..., min_length=1, max_length=2000),
                   user: User = Depends(get_user_from_token)):
    """Server-sent events, so answers appear as they're written.

    EventSource can't set an Authorization header, so this route takes the JWT
    as a query parameter and resolves it the same way the header path does.
    The stream owns its own session because it outlives the request scope a
    `Depends(get_db)` session is tied to.
    """
    def event_stream():
        db = SessionLocal()
        try:
            for event, payload in chat_service.stream_answer(db, user.id, message.strip()):
                yield f"event: {event}\ndata: {json.dumps(payload)}\n\n"
        except Exception as exc:
            logger.exception("Chat stream failed")
            yield f"event: error\ndata: {json.dumps({'detail': str(exc)})}\n\n"
        finally:
            db.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Without this, nginx buffers the whole stream and the point is lost.
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history", response_model=list[ChatMessageOut])
def history(limit: int = Query(200, ge=1, le=500),
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (db.query(ChatMessage).filter(ChatMessage.user_id == user.id)
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(limit).all())
    return list(reversed(rows))


@router.delete("/history", status_code=204)
def clear_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(ChatMessage).filter(ChatMessage.user_id == user.id).delete()
    db.commit()


@router.delete("/history/{message_id}", status_code=204)
def delete_message(message_id: int, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    row = (db.query(ChatMessage)
           .filter(ChatMessage.id == message_id, ChatMessage.user_id == user.id).first())
    if row is None:
        raise HTTPException(status_code=404, detail="Message not found")
    db.delete(row)
    db.commit()


@router.get("/meta")
def meta():
    return {
        "ai_online": gemini_client.is_available(),
        "suggestions": chat_service.SUGGESTIONS,
        "streaming": True,
    }
