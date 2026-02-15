from rest_framework.permissions import BasePermission


class CanViewCase(BasePermission):
    """
    User can view a case if:
    - they created it
    - OR they are assigned to it
    - OR they are a participant
    - OR they have global permission
    """

    def has_object_permission(self, request, view, obj):
        user = request.user

        if not user.is_authenticated:
            return False

        if user.has_perm("cases.view_all_cases"):
            return True

        if obj.created_by_id == user.id:
            return True

        if obj.assigned_to_id == user.id:
            return True

        return obj.participants.filter(user=user).exists()
