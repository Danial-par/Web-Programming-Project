# backend/cases/tests.py

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .constants import CrimeLevel
from .models import Case, CaseParticipant


class CaseAPITests(APITestCase):
    def setUp(self):
        User = get_user_model()

        self.staff = User.objects.create_user(
            "staff",
            "staff@example.com",
            "pass12345",
            phone="09120000001",
            national_id="1111111111",
            first_name="Staff",
            last_name="User",
            is_staff=True,
        )
        self.user1 = User.objects.create_user(
            "user1",
            "user1@example.com",
            "pass12345",
            phone="09120000002",
            national_id="2222222222",
            first_name="User",
            last_name="One",
        )
        self.user2 = User.objects.create_user(
            "user2",
            "user2@example.com",
            "pass12345",
            phone="09120000003",
            national_id="3333333333",
            first_name="User",
            last_name="Two",
        )

        self.list_url = reverse("case-list")

    def test_list_requires_authentication(self):
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("detail", res.data)

    def test_non_staff_cannot_create_case(self):
        self.client.force_authenticate(user=self.user1)
        payload = {
            "title": "Case A",
            "description": "Desc",
            "crime_level": CrimeLevel.LEVEL_1,
        }
        res = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data.get("detail"), "Only staff can create cases.")

    def test_staff_can_create_case_and_created_by_is_set(self):
        self.client.force_authenticate(user=self.staff)
        payload = {
            "title": "Case B",
            "description": "Desc",
            "crime_level": CrimeLevel.LEVEL_2,
        }
        res = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        self.assertEqual(Case.objects.count(), 1)
        case = Case.objects.first()
        self.assertEqual(case.created_by_id, self.staff.id)
        self.assertEqual(case.title, payload["title"])
        self.assertEqual(case.crime_level, payload["crime_level"])

    def test_list_returns_only_visible_cases_created_assigned_or_participant(self):
        # Visible via created_by
        c1 = Case.objects.create(
            title="C1",
            description="D1",
            crime_level=CrimeLevel.LEVEL_1,
            created_by=self.user1,
        )
        # Visible via assigned_to
        c2 = Case.objects.create(
            title="C2",
            description="D2",
            crime_level=CrimeLevel.LEVEL_2,
            created_by=self.staff,
            assigned_to=self.user1,
        )
        # Visible via participant
        c3 = Case.objects.create(
            title="C3",
            description="D3",
            crime_level=CrimeLevel.LEVEL_3,
            created_by=self.staff,
        )
        CaseParticipant.objects.create(case=c3, user=self.user1, is_complainant=True)

        # Not visible
        c4 = Case.objects.create(
            title="C4",
            description="D4",
            crime_level=CrimeLevel.CRITICAL,
            created_by=self.user2,
        )

        self.client.force_authenticate(user=self.user1)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        returned_ids = {item["id"] for item in res.data}
        self.assertSetEqual(returned_ids, {c1.id, c2.id, c3.id})
        self.assertNotIn(c4.id, returned_ids)

    def test_list_is_distinct_when_user_matches_multiple_relations(self):
        c = Case.objects.create(
            title="Dup",
            description="D",
            crime_level=CrimeLevel.LEVEL_1,
            created_by=self.user1,
        )
        CaseParticipant.objects.create(case=c, user=self.user1, is_complainant=True)

        self.client.force_authenticate(user=self.user1)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["id"], c.id)

    def test_retrieve_invisible_case_returns_404(self):
        invisible = Case.objects.create(
            title="Hidden",
            description="D",
            crime_level=CrimeLevel.LEVEL_2,
            created_by=self.user2,
        )

        self.client.force_authenticate(user=self.user1)
        url = reverse("case-detail", args=[invisible.id])
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_view_all_cases_permission_allows_listing_and_retrieve(self):
        # Create some cases (none linked to user1)
        c1 = Case.objects.create(
            title="A",
            description="D",
            crime_level=CrimeLevel.LEVEL_1,
            created_by=self.staff,
        )
        c2 = Case.objects.create(
            title="B",
            description="D",
            crime_level=CrimeLevel.LEVEL_2,
            created_by=self.user2,
        )

        # Ensure permission exists (recommended to define in Case.Meta.permissions,
        # but this keeps the test independent of migrations)
        ct = ContentType.objects.get_for_model(Case)
        perm, _ = Permission.objects.get_or_create(
            content_type=ct,
            codename="view_all_cases",
            name="Can view all cases",
        )
        self.user1.user_permissions.add(perm)
        self.user1.refresh_from_db()

        self.client.force_authenticate(user=self.user1)

        # list should include all cases
        res_list = self.client.get(self.list_url)
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        returned_ids = {item["id"] for item in res_list.data}
        self.assertTrue({c1.id, c2.id}.issubset(returned_ids))

        # retrieve should also work for previously invisible case
        res_detail = self.client.get(reverse("case-detail", args=[c2.id]))
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)
        self.assertEqual(res_detail.data["id"], c2.id)

    def test_case_participant_unique_together(self):
        c = Case.objects.create(
            title="UQ",
            description="D",
            crime_level=CrimeLevel.LEVEL_3,
            created_by=self.staff,
        )
        CaseParticipant.objects.create(case=c, user=self.user1)

        with self.assertRaises(IntegrityError):
            CaseParticipant.objects.create(case=c, user=self.user1)
