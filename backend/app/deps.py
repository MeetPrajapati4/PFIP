from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def _resolve(token: str, db: Session) -> User:
    user_id = decode_access_token(token)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid or expired token")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise _UNAUTHENTICATED
    return _resolve(credentials.credentials, db)


def get_user_from_token(
    token: str | None = Query(None),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Auth for endpoints the browser can't send a header to.

    `EventSource` and plain download links have no way to attach an
    Authorization header, so those routes accept the same JWT as a query
    parameter. It's the same token with the same expiry — the only cost is
    that it can land in access logs, which is why every other route keeps
    using the header.
    """
    if credentials is not None:
        return _resolve(credentials.credentials, db)
    if token:
        return _resolve(token, db)
    raise _UNAUTHENTICATED
