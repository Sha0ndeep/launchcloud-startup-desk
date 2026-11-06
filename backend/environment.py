"""Load only server settings from the git-ignored project .env.local file."""
import os
from pathlib import Path

ALLOWED = {'CRUSTDATA_API_KEY', 'GROQ_API_KEY', 'GROQ_MODEL', 'OPERATOR_TOKEN',
           'DATABASE_PATH', 'DEMO_MODE', 'CORS_ORIGINS'}


def load_local_env():
    path = Path(__file__).resolve().parents[1] / '.env.local'
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            key, separator, value = line.strip().partition('=')
            if separator and key in ALLOWED:
                os.environ.setdefault(key, value.strip().strip('\"').strip("'"))
