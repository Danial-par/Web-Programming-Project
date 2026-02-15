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


def extract_list_payload(res):
    """
    Works with both paginated and non-paginated DRF responses.
    - Non-paginated: res.data is a list
    - Paginated: res.data is a dict with 'results'
    """
    if isinstance(res.data, dict) and "results" in res.data:
        return res.data["results"]
    return res.data


class CaseAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()

        cls.staff = User.objects.create_user(
            username="staff",
            email="staff@example.com",
            password="pass12345",
            phone="09120000001",
            national_id="1111111111",
            first_name="Staff",
            last_name="User",
            is_staff=True,  # not relied on, but fine to keep
        )

        cls.user1 = User.objects.create_user(
            username="user1",
            email="user1@example.com",
            password="pass12345",
            phone="09120000002",
            national_id="2222222222",
            first_name="User",
            last_name="One",
        )

        cls.user2 = User.objects.create_user(
            username="user2",
            email="user2@example.com",
            password="pass12345",
            phone="09120000003",
            national_id="3333333333",
            first_name="User",
            last_name="Two",
        )

        cls.list_url = reverse("case-list")

        # ContentType for Case permissions
        cls.case_ct = ContentType.objects.get_for_model(Case)

        # Built-in add_case permission should exist after migrations
        cls.perm_add_case = Permission.objects.get(
            content_type=cls.case_ct, codename="add_case"
        )

        # Custom permission should exist after migrations because you defined it in Case.Meta
        # If this raises DoesNotExist, it's a sign migrations weren't applied properly.
        cls.perm_view_all = Permission.objects.get(
            content_type=cls.case_ct, codename="view_all_cases"
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    # ----------------------------
    # Auth / basic access
    # ----------------------------
    def test_list_requires_authentication(self):
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("detail", res.data)

    # ----------------------------
    # Create permissions (permission-driven)
    # ----------------------------
    def test_user_without_add_permission_cannot_create_case(self):
        self.authenticate(self.user1)
        payload = {
            "title": "Case A",
            "description": "Desc",
            "crime_level": CrimeLevel.LEVEL_1,
        }
        res = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_with_add_permission_can_create_case_and_created_by_is_set(self):
        self.user1.user_permissions.add(self.perm_add_case)

        self.authenticate(self.user1)
        payload = {
            "title": "Case B",
            "description": "Desc",
            "crime_level": CrimeLevel.LEVEL_2,
        }
        res = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        self.assertEqual(Case.objects.count(), 1)
        case = Case.objects.first()
        self.assertEqual(case.created_by_id, self.user1.id)
        self.assertEqual(case.title, payload["title"])
        self.assertEqual(case.crime_level, payload["crime_level"])

    # ----------------------------
    # Visibility in list (queryset scoping)
    # ----------------------------
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

        self.authenticate(self.user1)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = extract_list_payload(res)
        returned_ids = {item["id"] for item in data}

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

        self.authenticate(self.user1)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = extract_list_payload(res)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], c.id)

    # ----------------------------
    # Retrieve behavior (queryset + object permissions)
    # ----------------------------
    def test_retrieve_invisible_case_returns_404(self):
        invisible = Case.objects.create(
            title="Hidden",
            description="D",
            crime_level=CrimeLevel.LEVEL_2,
            created_by=self.user2,
        )

        self.authenticate(self.user1)
        url = reverse("case-detail", args=[invisible.id])
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_assigned_user_can_retrieve_case(self):
        case = Case.objects.create(
            title="Assigned",
            description="D",
            crime_level=CrimeLevel.LEVEL_1,
            created_by=self.staff,
            assigned_to=self.user1,
        )

        self.authenticate(self.user1)
        res = self.client.get(reverse("case-detail", args=[case.id]))

        # If this fails with 403, your CanViewCase.has_object_permission
        # is missing: `obj.assigned_to == request.user`
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], case.id)

    # ----------------------------
    # view_all_cases permission
    # ----------------------------
    def test_view_all_cases_permission_allows_listing_and_retrieve(self):
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

        self.user1.user_permissions.add(self.perm_view_all)

        self.authenticate(self.user1)

        # list should include all cases
        res_list = self.client.get(self.list_url)
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)

        data = extract_list_payload(res_list)
        returned_ids = {item["id"] for item in data}
        self.assertTrue({c1.id, c2.id}.issubset(returned_ids))

        # retrieve should work for previously invisible case
        res_detail = self.client.get(reverse("case-detail", args=[c2.id]))
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)
        self.assertEqual(res_detail.data["id"], c2.id)

    # ----------------------------
    # Model constraints
    # ----------------------------
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
