from __future__ import annotations

from rest_framework.permissions import BasePermission

from cases.models import Case


def user_can_access_case(user, case: Case) -> bool:
    """Shared access rule used across Evidence endpoints.

    Mirrors cases.permissions.CanViewCase behavior.
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


class CanViewEvidence(BasePermission):
    def has_object_permission(self, request, view, obj):
        return user_can_access_case(request.user, obj.case)


class CanCreateEvidence(BasePermission):
    def has_permission(self, request, view):
        if request.method == "POST" and view.action == "create":
            return request.user.is_authenticated and request.user.has_perm("evidence.add_evidence")
        return True


class CanUpdateEvidence(BasePermission):
    def has_permission(self, request, view):
        if request.method in ["PUT", "PATCH"] and view.action in ["update", "partial_update"]:
            return request.user.is_authenticated and request.user.has_perm("evidence.change_evidence")
        return True


class CanDeleteEvidence(BasePermission):
    def has_permission(self, request, view):
        if request.method == "DELETE" and view.action == "destroy":
            return request.user.is_authenticated and request.user.has_perm("evidence.delete_evidence")
        return True


class CanFillForensicResults(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.has_perm("evidence.fill_forensic_results")
