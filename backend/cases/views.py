from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated

from .models import Case
from .serializers import (
    CaseListSerializer,
    CaseDetailSerializer,
    CaseCreateSerializer,
)
from .permissions import CanViewCase


class CaseViewSet(ModelViewSet):
    queryset = Case.objects.all()
    permission_classes = [IsAuthenticated, CanViewCase]

    def get_serializer_class(self):
        if self.action == "list":
            return CaseListSerializer
        if self.action == "create":
            return CaseCreateSerializer
        return CaseDetailSerializer

    def get_queryset(self):
        user = self.request.user

        if user.has_perm("cases.view_all_cases"):
            return Case.objects.all()

        return Case.objects.filter(
            models.Q(created_by=user)
            | models.Q(assigned_to=user)
            | models.Q(participants__user=user)
        ).distinct()

    def perform_create(self, serializer):
        # Only staff can create cases directly (complaints come later)
        if not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only staff can create cases.")

        serializer.save()
