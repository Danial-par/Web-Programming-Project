from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from cases.constants import CaseStatus, CrimeLevel
from cases.models import Case


class StatsOverviewTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="u_stats",
            email="u_stats@example.com",
            password="pass12345",
        )

        Case.objects.create(
            title="Closed",
            description="",
            crime_level=CrimeLevel.LEVEL_1,
            status=CaseStatus.CLOSED,
            created_by=self.user,
        )
        Case.objects.create(
            title="Active",
            description="",
            crime_level=CrimeLevel.LEVEL_2,
            status=CaseStatus.ACTIVE,
            created_by=self.user,
        )

    def test_stats_overview_returns_expected_keys(self):
        url = reverse("stats-overview")
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        for key in ["solved_cases_count", "employees_count", "active_cases_count"]:
            self.assertIn(key, res.data)

