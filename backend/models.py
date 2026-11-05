import ipaddress
import re
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Literal


def normalize_domain(value: str) -> str:
    parsed = urlparse(value.strip() if '://' in value else 'https://' + value.strip())
    if parsed.username or parsed.password or parsed.port or parsed.query or parsed.fragment:
        raise ValueError('Provide a public company domain without credentials, ports, query or fragment.')
    host = (parsed.hostname or '').lower().removeprefix('www.').rstrip('.')
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError('Use a company domain, not an IP address.')
    if not re.fullmatch(r'(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}', host):
        raise ValueError('Invalid company domain.')
    if host.endswith(('.localhost', '.local', '.internal', '.test', '.invalid')):
        raise ValueError('Use a public domain. Demo declarations can still use example.com.')
    if host in {'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'bit.ly', 'bitly.com', 'linkedin.com'}:
        raise ValueError('Use the company domain rather than a mailbox provider, social site or URL shortener.')
    return host


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class ApplicationInput(StrictModel):
    company_name: str = Field(min_length=2, max_length=200)
    domain: str
    applicant_name: str = Field(min_length=1, max_length=150)
    work_email: str = Field(max_length=254)
    applicant_role: str = Field(min_length=1, max_length=150)
    product_description: str = Field(min_length=10, max_length=5000)
    product_kind: Literal['software', 'other', 'unknown'] = 'unknown'
    profile_url: str | None = None
    founding_year: int | None = Field(default=None, ge=1800, le=2100)
    headcount: int | None = Field(default=None, ge=0, le=10_000_000)
    funding_usd: float | None = Field(default=None, ge=0, le=1e15)
    authority_declared: bool = False
    attestation_accepted: bool = False

    @field_validator('founding_year', 'headcount', 'funding_usd', mode='before')
    @classmethod
    def no_boolean_numbers(cls, value):
        if isinstance(value, bool):
            raise ValueError('Use a numeric value, not a boolean.')
        return value

    @field_validator('domain')
    @classmethod
    def domain_valid(cls, value):
        return normalize_domain(value)

    @field_validator('work_email')
    @classmethod
    def email_valid(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('Invalid work email.')
        return value

    @field_validator('profile_url')
    @classmethod
    def profile_valid(cls, value):
        if not value:
            return None
        p = urlparse(value)
        if p.scheme != 'https' or p.hostname not in {'linkedin.com', 'www.linkedin.com'} or not p.path.startswith('/in/') or p.query or p.fragment:
            raise ValueError('Use a public LinkedIn /in/ profile URL without query parameters.')
        return value


class FactCorrections(StrictModel):
    founding_year: int | None = Field(default=None, ge=1800, le=2100)
    headcount: int | None = Field(default=None, ge=0, le=10_000_000)
    funding_usd: float | None = Field(default=None, ge=0, le=1e15)
    product_kind: Literal['software', 'other', 'unknown'] | None = None
    authority_declared: bool | None = None

    @field_validator('founding_year', 'headcount', 'funding_usd', mode='before')
    @classmethod
    def no_boolean_numbers(cls, value):
        if isinstance(value, bool):
            raise ValueError('Use a numeric value, not a boolean.')
        return value


class ResponseInput(StrictModel):
    text: str = Field(default='', max_length=10000)
    facts: FactCorrections = Field(default_factory=FactCorrections)
    source_urls: list[str] = Field(default_factory=list, max_length=10)
    attestation_accepted: bool = False

    @field_validator('source_urls')
    @classmethod
    def urls_valid(cls, values):
        for value in values:
            p = urlparse(value)
            if p.scheme != 'https' or p.username or p.password or p.port or len(value) > 2000:
                raise ValueError('Supporting links must be public HTTPS URLs without credentials or ports.')
            normalize_domain(p.hostname or '')
        return values


class VerificationInput(StrictModel):
    code: str = Field(min_length=6, max_length=6, pattern=r'^\d{6}$')


class ResolutionInput(StrictModel):
    action: Literal['request_information', 'waive_conflict', 'decline']
    reason: str = Field(min_length=15, max_length=4000)


class UsageInput(StrictModel):
    amount_cents: int = Field(gt=0, le=50000)
    description: str = Field(min_length=1, max_length=500)

    @field_validator('amount_cents', mode='before')
    @classmethod
    def no_boolean_amount(cls, value):
        if isinstance(value, bool):
            raise ValueError('Use integer cents, not a boolean.')
        return value
