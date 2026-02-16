from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import Complaint, ComplaintComplainant

class CanViewCase(BasePermission):
    """
    - Users with cases.view_all_cases can see everything
    - Others can only see cases they are related to
    """

    def has_object_permission(self, request, view, obj):
        if request.user.has_perm("cases.view_all_cases"):
            return True

        return (
            obj.created_by == request.user
            or obj.assigned_to == request.user
            or obj.participants.filter(user=request.user).exists()
        )


class CanCreateCase(BasePermission):
    def has_permission(self, request, view):
        if request.method == "POST":
            return request.user.has_perm("cases.add_case")
        return True


class CanViewComplaint(BasePermission):
    def has_object_permission(self, request, view, obj: Complaint):
        if request.user.is_anonymous:
            return False

        if request.user.has_perm("cases.view_all_complaints"):
            return True

        # reviewers can view
        if request.user.has_perm("cases.cadet_review_complaint") or request.user.has_perm("cases.officer_review_complaint"):
            return True

        # creator can view
        if obj.created_by_id == request.user.id:
            return True

        # any complainant listed can view
        return ComplaintComplainant.objects.filter(complaint=obj, user=request.user).exists()


class CanCadetReviewComplaint(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.has_perm("cases.cadet_review_complaint")


class CanOfficerReviewComplaint(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.has_perm("cases.officer_review_complaint")