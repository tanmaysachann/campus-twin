from __future__ import annotations

from dataclasses import dataclass

from fastapi import Header

from .config import settings


@dataclass(frozen=True, slots=True)
class RequestIdentity:
    token: str | None
    user_key: str
    source: str


def get_request_identity(
    x_forwarded_access_token: str | None = Header(default=None),
    x_forwarded_email: str | None = Header(default=None),
) -> RequestIdentity:
    """Resolve Databricks user authorization when hosted, or local auth in development.

    Databricks Apps forwards a short-lived user access token when user authorization is
    configured. Local development can use DATABRICKS_TOKEN as an explicit fallback.
    """
    token = x_forwarded_access_token or settings.databricks_token
    if x_forwarded_access_token:
        source = "databricks-user"
    elif settings.databricks_token:
        source = "local-token"
    else:
        source = "anonymous-demo"
    user_key = (x_forwarded_email or source).strip().lower()
    return RequestIdentity(token=token, user_key=user_key, source=source)
