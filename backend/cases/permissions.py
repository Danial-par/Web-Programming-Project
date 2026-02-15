from rest_framework.permissions import BasePermission, SAFE_METHODS

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
            or obj.participants.filter(user=request.user).exists()
        )


class CanCreateCase(BasePermission):
    def has_permission(self, request, view):
        if request.method == "POST":
            return request.user.has_perm("cases.add_case")
        return True
