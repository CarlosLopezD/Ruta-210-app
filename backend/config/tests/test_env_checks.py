from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from config.env_checks import resolve_database_config, resolve_secret_key

DEV_FALLBACK_KEY = "dev-only-fallback-key"


class ResolveSecretKeyTests(SimpleTestCase):
    def test_explicit_env_value_wins_even_in_debug(self):
        key = resolve_secret_key(env_value="from-env", debug=True, dev_fallback=DEV_FALLBACK_KEY)
        self.assertEqual(key, "from-env")

    def test_explicit_env_value_wins_in_production(self):
        key = resolve_secret_key(env_value="from-env", debug=False, dev_fallback=DEV_FALLBACK_KEY)
        self.assertEqual(key, "from-env")

    def test_falls_back_to_dev_key_when_debug_and_no_env_value(self):
        key = resolve_secret_key(env_value=None, debug=True, dev_fallback=DEV_FALLBACK_KEY)
        self.assertEqual(key, DEV_FALLBACK_KEY)

    def test_falls_back_to_dev_key_when_debug_and_blank_env_value(self):
        # An empty string (unset env var read via os.environ.get(..., "")) is falsy too.
        key = resolve_secret_key(env_value="", debug=True, dev_fallback=DEV_FALLBACK_KEY)
        self.assertEqual(key, DEV_FALLBACK_KEY)

    def test_raises_in_production_without_env_value(self):
        with self.assertRaises(ImproperlyConfigured):
            resolve_secret_key(env_value=None, debug=False, dev_fallback=DEV_FALLBACK_KEY)


class ResolveDatabaseConfigTests(SimpleTestCase):
    def test_explicit_database_url_wins_even_in_debug(self):
        config = resolve_database_config(
            database_url="postgres://user:pass@localhost:5432/mydb",
            debug=True,
            sqlite_path="/tmp/unused.sqlite3",
        )
        self.assertEqual(config["ENGINE"], "django.db.backends.postgresql")
        self.assertEqual(config["NAME"], "mydb")

    def test_explicit_database_url_wins_in_production(self):
        config = resolve_database_config(
            database_url="postgres://user:pass@localhost:5432/mydb",
            debug=False,
            sqlite_path="/tmp/unused.sqlite3",
        )
        self.assertEqual(config["ENGINE"], "django.db.backends.postgresql")

    def test_falls_back_to_sqlite_when_debug_and_no_url(self):
        config = resolve_database_config(database_url=None, debug=True, sqlite_path="/tmp/db.sqlite3")
        self.assertEqual(
            config,
            {"ENGINE": "django.db.backends.sqlite3", "NAME": "/tmp/db.sqlite3"},
        )

    def test_raises_in_production_without_database_url(self):
        with self.assertRaises(ImproperlyConfigured):
            resolve_database_config(database_url=None, debug=False, sqlite_path="/tmp/db.sqlite3")
