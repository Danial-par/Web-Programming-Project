from __future__ import annotations

from cases.models import Case


def user_can_access_case(user, case: Case) -> bool:
    """Shared access rule used across case-nested Investigation endpoints.

    Mirrors `cases.permissions.CanViewCase` and `evidence.permissions.user_can_access_case`.
    """
    if not user.is_authenticated:
        return False

    if user.has_perm("cases.view_all_cases"):
        return True

    return (
        case.created_by_id == user.id
        or case.assigned_to_id == user.id
        or case.participants.filter(user=user).exists()
    )


def user_is_assigned_detective(user, case: Case) -> bool:
    if not user.is_authenticated:
        return False
    return case.assigned_to_id == user.id
