from __future__ import annotations

from rest_framework.permissions import BasePermission

from common.role_helpers import (
    ROLE_DETECTIVE,
    user_can_add_evidence,
    user_can_change_evidence,
    user_can_delete_evidence,
    user_can_fill_forensic_results,
    user_can_view_all_cases,
)
from cases.models import Case


def user_can_access_case(user, case: Case) -> bool:
    """Shared access rule used across Evidence endpoints.

    Mirrors cases.permissions.CanViewCase behavior.
    """
    if not user.is_authenticated:
        return False

    if user_can_view_all_cases(user):
        return True

    # Detectives can only access their assigned case.
    if user.groups.filter(name=ROLE_DETECTIVE).exists():
        return case.assigned_to_id == user.id

    return (
        case.created_by_id == user.id
        or case.assigned_to_id == user.id
        or case.participants.filter(user=user).exists()
    )


class CanViewEvidence(BasePermission):
    def has_object_permission(self, request, view, obj):
        return user_can_access_case(request.user, obj.case)


class CanCreateEvidence(BasePermission):
    def has_permission(self, request, view):
        if request.method == "POST" and getattr(view, "action", None) == "create":
            # Standard: police roles / permissions
            if request.user.is_authenticated and user_can_add_evidence(request.user):
                return True

            # Allow a normal user registered as a witness on the case to add evidence
            # for that same case.
            if not request.user.is_authenticated:
                return False

            case_id = request.data.get("case")
            if not case_id:
                return False

            try:
                case = Case.objects.get(id=case_id)
            except Case.DoesNotExist:
                return False

            return case.participants.filter(user=request.user, is_complainant=False).exists()

        return True


class CanUpdateEvidence(BasePermission):
    def has_permission(self, request, view):
        if request.method in ["PUT", "PATCH"] and view.action in ["update", "partial_update"]:
            return request.user.is_authenticated and user_can_change_evidence(request.user)
        return True


class CanDeleteEvidence(BasePermission):
    def has_permission(self, request, view):
        if request.method == "DELETE" and view.action == "destroy":
            return request.user.is_authenticated and user_can_delete_evidence(request.user)
        return True


class CanFillForensicResults(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and user_can_fill_forensic_results(request.user)
