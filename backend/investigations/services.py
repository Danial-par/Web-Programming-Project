from __future__ import annotations

from typing import Optional

from cases.constants import CaseStatus
from evidence.models import Evidence

from .models import Notification


def notify_assigned_detective_on_new_evidence(evidence: Evidence) -> Optional[Notification]:
    """Create a notification for the case's assigned detective when new evidence is added.

    Returns the created Notification or None if:
    - the case has no assigned detective

    Kept as a small service function so it can be unit-tested without signals.
    """

    case = evidence.case

    # Only notify for active/investigating cases
    if getattr(case, "status", None) != CaseStatus.ACTIVE:
        return None

    detective_id = getattr(case, "assigned_to_id", None)
    if not detective_id:
        return None

    message = f"New evidence added to case #{case.id}: {evidence.title}"

    return Notification.objects.create(
        user_id=detective_id,
        case=case,
        message=message,
    )
