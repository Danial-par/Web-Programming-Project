from rest_framework.permissions import BasePermission, SAFE_METHODS

from common.role_helpers import (
    user_can_add_case,
    user_can_approve_scene_report,
    user_can_cadet_review_complaint,
    user_can_judge_verdict_trial,
    user_can_officer_review_complaint,
    user_can_see_all_complaints,
    user_can_view_all_cases,
    user_can_view_all_scene_reports,
    user_can_view_case_report,
)
from .models import Complaint, ComplaintComplainant, SceneReport

class CanViewCase(BasePermission):
    """
    - Users with view_all_cases (or Chief/Captain/Admin role) can see everything
    - Others can only see cases they are related to
    """

    def has_object_permission(self, request, view, obj):
        if user_can_view_all_cases(request.user):
            return True

        return (
            obj.created_by == request.user
            or obj.assigned_to == request.user
            or obj.participants.filter(user=request.user).exists()
        )


class CanCreateCase(BasePermission):
    def has_permission(self, request, view):
        if request.method == "POST":
            return user_can_add_case(request.user)
        return True


class CanViewComplaint(BasePermission):
    def has_object_permission(self, request, view, obj: Complaint):
        if request.user.is_anonymous:
            return False

        if user_can_see_all_complaints(request.user):
            return True

        # creator can view
        if obj.created_by_id == request.user.id:
            return True

        # any complainant listed can view
        return ComplaintComplainant.objects.filter(complaint=obj, user=request.user).exists()


class CanCadetReviewComplaint(BasePermission):
    def has_permission(self, request, view):
        return user_can_cadet_review_complaint(request.user)


class CanOfficerReviewComplaint(BasePermission):
    def has_permission(self, request, view):
        return user_can_officer_review_complaint(request.user)


class CanCreateSceneReport(BasePermission):
    def has_permission(self, request, view):
        from common.role_helpers import user_can_create_scene_report
        return request.user.is_authenticated and user_can_create_scene_report(request.user)  # noqa: E501


class CanApproveSceneReport(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and user_can_approve_scene_report(request.user)


class CanViewSceneReport(BasePermission):
    def has_object_permission(self, request, view, obj: SceneReport):
        if not request.user.is_authenticated:
            return False

        if user_can_view_all_scene_reports(request.user):
            return True

        if user_can_approve_scene_report(request.user):
            return True

        return obj.created_by_id == request.user.id


class CanJudgeTrial(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and user_can_judge_verdict_trial(request.user)


class CanViewCaseReport(BasePermission):
    """Access rule for /cases/{id}/report/.

    - Judge/Captain/Chief/Admin (or permission) can view
    - others can view only if involved in case AND explicitly permitted (cases.view_case_report)
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user.is_authenticated:
            return False

        if user_can_view_case_report(user):
            return True

        # Otherwise: must be involved AND have explicit permission to view reports
        if not user.has_perm("cases.view_case_report"):
            return False

        return (
            obj.created_by_id == user.id
            or obj.assigned_to_id == user.id
            or obj.participants.filter(user=user).exists()
        )
