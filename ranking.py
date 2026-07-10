"""Deterministic ranking engine for roomfit.

Concept borrowed (not code) from the matching-engine project: hard filters
first, then a bounded, capped per-factor score, each factor emitting a plain
reason string. No LLM, no randomness -- same input always gives same output.

Scoring: 5 factors x 20 points = 0..100.
"""

from models import FactorScore, Preferences, RankedRoom, Room, Sleep

# --- config knobs (tweak behavior here, not in the logic) -------------------
# True  -> cheaper rooms score higher (more budget left over).
# False -> rooms closer to the budget ceiling score higher.
CHEAPER_IS_BETTER = True

FACTOR_MAX = 20  # every factor is scored out of this


# --- hard filters -----------------------------------------------------------
def passes_filters(room: Room, prefs: Preferences) -> tuple[bool, str]:
    if room.rent > prefs.budget_max:
        return False, "over budget"
    if prefs.needs_pets and not room.pets_allowed:
        return False, "pets not allowed"
    if not prefs.smoking_ok and room.smoking_allowed:
        return False, "smoking home"
    return True, ""


# --- individual factors -----------------------------------------------------
def _budget_factor(room: Room, prefs: Preferences) -> FactorScore:
    # room already passed the filter, so 0 <= headroom <= 1
    headroom = (prefs.budget_max - room.rent) / prefs.budget_max
    if CHEAPER_IS_BETTER:
        score = round(12 + 8 * headroom)      # 12 at ceiling -> 20 when very cheap
    else:
        score = round(20 - 8 * headroom)      # 20 at ceiling -> 12 when very cheap
    score = max(0, min(FACTOR_MAX, score))
    under = prefs.budget_max - room.rent
    reason = f"${room.rent} vs ${prefs.budget_max} max (${under} under)"
    return FactorScore(factor="Budget fit", score=score, max_score=FACTOR_MAX, reason=reason)


def _location_factor(room: Room, prefs: Preferences) -> FactorScore:
    if room.location.strip().lower() == prefs.location_pref.strip().lower():
        return FactorScore(factor="Location", score=20, max_score=FACTOR_MAX,
                           reason=f"Same area — {room.location}")
    return FactorScore(factor="Location", score=10, max_score=FACTOR_MAX,
                       reason=f"Different area — {room.location} (you wanted {prefs.location_pref})")


def _gap_factor(name: str, pref_val: int, room_val: int) -> FactorScore:
    gap = abs(pref_val - room_val)                # 0..4
    score = max(0, FACTOR_MAX - 5 * gap)
    if gap == 0:
        reason = f"{name} matches ({room_val}/5)"
    else:
        reason = f"{name} off by {gap} (room {room_val}/5 vs your {pref_val}/5)"
    return FactorScore(factor=name, score=score, max_score=FACTOR_MAX, reason=reason)


def _sleep_factor(room: Room, prefs: Preferences) -> FactorScore:
    r, p = room.sleep_schedule, prefs.sleep_pref
    if r == p:
        score, reason = 20, f"Same schedule ({p.value})"
    elif r == Sleep.flexible or p == Sleep.flexible:
        score, reason = 14, "Flexible schedule — compatible"
    else:
        score, reason = 6, f"Schedule clash ({r.value} vs your {p.value})"
    return FactorScore(factor="Sleep schedule", score=score, max_score=FACTOR_MAX, reason=reason)


# --- top-level ranking ------------------------------------------------------
def score_room(room: Room, prefs: Preferences) -> RankedRoom:
    factors = [
        _budget_factor(room, prefs),
        _location_factor(room, prefs),
        _gap_factor("Cleanliness", prefs.cleanliness_pref, room.cleanliness),
        _gap_factor("Social level", prefs.social_pref, room.social_level),
        _sleep_factor(room, prefs),
    ]
    total = sum(f.score for f in factors)
    return RankedRoom(room=room, total_score=total, factors=factors)


def rank(rooms: list[Room], prefs: Preferences) -> tuple[list[RankedRoom], int]:
    ranked: list[RankedRoom] = []
    filtered = 0
    for room in rooms:
        ok, _ = passes_filters(room, prefs)
        if not ok:
            filtered += 1
            continue
        ranked.append(score_room(room, prefs))
    # stable sort: highest score first, then cheaper rent as tie-breaker
    ranked.sort(key=lambda r: (-r.total_score, r.room.rent))
    return ranked, filtered
