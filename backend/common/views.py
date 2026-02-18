from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema

from django.contrib.auth import get_user_model

from cases.constants import CaseStatus
from cases.models import Case


class HealthCheckView(APIView):
    permission_classes = []

    @extend_schema(summary="System Health Check", responses={200: None})
    def get(self, request):
        return Response({"status": "ok", "service": "L.A. Noire API"})


class StatsOverviewView(APIView):
    """Aggregated overview stats for dashboard."""

    permission_classes = []

    @extend_schema(
        summary="Overview statistics",
        responses={200: None},
        description="Return high-level numbers: solved cases, employees, active cases.",
    )
    def get(self, request):
        User = get_user_model()

        solved_cases = Case.objects.filter(status=CaseStatus.CLOSED).count()
        active_cases = Case.objects.filter(status=CaseStatus.ACTIVE).count()
        employees = User.objects.count()

        return Response(
            {
                "solved_cases_count": solved_cases,
                "employees_count": employees,
                "active_cases_count": active_cases,
            },
            status=status.HTTP_200_OK,
        )
