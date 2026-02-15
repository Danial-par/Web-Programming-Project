from django.db import models
from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated

from .models import Case
from .serializers import (
    CaseListSerializer,
    CaseDetailSerializer,
    CaseCreateSerializer,
)
from .permissions import CanViewCase, CanCreateCase


class CaseViewSet(ModelViewSet):
    permission_classes = [
        IsAuthenticated,
        CanCreateCase,
        CanViewCase,
    ]

    def get_serializer_class(self):
        if self.action == "list":
            return CaseListSerializer
        if self.action == "retrieve":
            return CaseDetailSerializer
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
        serializer.save(created_by=self.request.user)
