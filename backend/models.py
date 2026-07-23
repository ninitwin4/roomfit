"""Data models for roomfit.

Shared Room schema is used by seed data now and user listings later
(owner_id stays null for seed rooms). Preferences is the seeker input.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Sleep(str, Enum):
    early = "early"
    late = "late"
    flexible = "flexible"


class Room(BaseModel):
    id: int
    title: str
    rent: int                          # monthly, USD
    location: str                      # neighborhood
    cleanliness: int = Field(ge=1, le=5)
    social_level: int = Field(ge=1, le=5)
    sleep_schedule: Sleep
    pets_allowed: bool
    smoking_allowed: bool
    owner_id: Optional[str] = None     # null for seed rooms


class Preferences(BaseModel):
    budget_max: int                    # hard filter
    location_pref: str
    cleanliness_pref: int = Field(ge=1, le=5)
    social_pref: int = Field(ge=1, le=5)
    sleep_pref: Sleep
    needs_pets: bool = False           # hard filter: I have/need a pet
    smoking_ok: bool = False           # hard filter: I'm fine with a smoking home


class RankRequest(BaseModel):
    """What the frontend POSTs to /rank.

    The frontend reads rooms from Supabase (so the backend needs no DB
    credentials and stays stateless). If `rooms` is omitted, the API falls
    back to the local seed file — handy for curl and for local dev.
    """

    preferences: Preferences
    rooms: Optional[list["Room"]] = None


class FactorScore(BaseModel):
    factor: str
    score: int
    max_score: int
    reason: str


class RankedRoom(BaseModel):
    room: Room
    total_score: int                   # 0..100
    factors: list[FactorScore]


class RankResponse(BaseModel):
    results: list[RankedRoom]
    filtered_out: int                  # how many rooms hard filters dropped
