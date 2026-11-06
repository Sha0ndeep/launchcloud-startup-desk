import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_path: str = 'backend/data/launchcloud.sqlite3'
    demo_mode: bool = True
    operator_token: str = 'demo-operator'
    crustdata_api_key: str = ''
    groq_api_key: str = ''
    groq_model: str = 'openai/gpt-oss-120b'
    cors_origins: tuple[str, ...] = ('http://localhost:5173', 'http://127.0.0.1:5173')

    @classmethod
    def from_env(cls):
        from .environment import load_local_env
        load_local_env()
        return cls(
            database_path=os.getenv('DATABASE_PATH', cls.database_path),
            demo_mode=os.getenv('DEMO_MODE', 'true').lower() == 'true',
            operator_token=os.getenv('OPERATOR_TOKEN', 'demo-operator'),
            crustdata_api_key=os.getenv('CRUSTDATA_API_KEY', ''),
            groq_api_key=os.getenv('GROQ_API_KEY', ''),
            groq_model=os.getenv('GROQ_MODEL', cls.groq_model),
            cors_origins=tuple(os.getenv('CORS_ORIGINS', ','.join(cls.cors_origins)).split(',')),
        )


POLICY = {
    'founded_year_min': 2021,
    'headcount_max_exclusive': 50,
    'funding_max_usd_exclusive': 10_000_000,
    'accept_attestations': True,
    'description': 'Limited promotional grant. Named applicant declarations are accepted for founding year, '
                   'full-time headcount, funding and software-product classification. External observations '
                   'are corroboration. Material conflicts require clarification. Mailbox control and '
                   'authority declaration are mandatory. This is not independently verified payroll or funding.',
}
