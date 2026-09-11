"""Small, pure helpers for settings.py's "fail closed in production" checks.

Pulled out of settings.py so they can be unit-tested directly — settings.py
itself is evaluated once at process import time (before Django's test runner
even starts), so exercising its behavior for different env vars would
otherwise mean reloading the whole settings module in a subprocess. These
functions take their inputs as plain arguments instead of reading os.environ
themselves, so a test can just call them with whatever combination it wants.
"""

import dj_database_url
from django.core.exceptions import ImproperlyConfigured


def resolve_secret_key(env_value: str | None, debug: bool, dev_fallback: str) -> str:
    """Pick the Django SECRET_KEY.

    - An explicit DJANGO_SECRET_KEY env var always wins.
    - Without one, DEBUG (local dev) falls back to a hardcoded dev-only key.
    - Without one, production (DEBUG=False) fails loudly instead of quietly
      running with that same hardcoded key, which sits in this public repo.
    """
    if env_value:
        return env_value
    if debug:
        return dev_fallback
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is not True.")


def resolve_database_config(database_url: str | None, debug: bool, sqlite_path) -> dict:
    """Pick the DATABASES["default"] config.

    - An explicit DATABASE_URL always wins (Postgres via dj_database_url).
    - Without one, DEBUG (local dev) falls back to a local SQLite file.
    - Without one, production (DEBUG=False) fails loudly instead of silently
      falling back to SQLite on a disk most hosts wipe on every redeploy.
    """
    if database_url:
        return dj_database_url.parse(database_url, conn_max_age=600)
    if debug:
        return {"ENGINE": "django.db.backends.sqlite3", "NAME": sqlite_path}
    raise ImproperlyConfigured(
        "DATABASE_URL must be set when DJANGO_DEBUG is not True — without it, "
        "trip history would live on an ephemeral disk that most hosts (Render "
        "included) wipe on every redeploy."
    )
