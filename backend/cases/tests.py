# backend/cases/tests.py

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .constants import CrimeLevel, ComplaintStatus
from .models import Case, CaseParticipant, Complaint


# def extract_list_payload(res):
#     if isinstance(res.data, dict) and "results" in res.data:
#         return res.data["results"]
#     return res.data
#
#
# class CaseAPITests(APITestCase):
#     @classmethod
#     def setUpTestData(cls):
#         User = get_user_model()
#
#         cls.staff = User.objects.create_user(
#             username="staff",
#             email="staff@example.com",
#             password="pass12345",
#             phone="09120000001",
#             national_id="1111111111",
#             first_name="Staff",
#             last_name="User",
#             is_staff=True,  # not relied on, but fine to keep
#         )
#
#         cls.user1 = User.objects.create_user(
#             username="user1",
#             email="user1@example.com",
#             password="pass12345",
#             phone="09120000002",
#             national_id="2222222222",
#             first_name="User",
#             last_name="One",
#         )
#
#         cls.user2 = User.objects.create_user(
#             username="user2",
#             email="user2@example.com",
#             password="pass12345",
#             phone="09120000003",
#             national_id="3333333333",
#             first_name="User",
#             last_name="Two",
#         )
#
#         cls.list_url = reverse("case-list")
#
#         # ContentType for Case permissions
#         cls.case_ct = ContentType.objects.get_for_model(Case)
#
#         # Built-in add_case permission should exist after migrations
#         cls.perm_add_case = Permission.objects.get(
#             content_type=cls.case_ct, codename="add_case"
#         )
#
#         # Custom permission should exist after migrations because you defined it in Case.Meta
#         # If this raises DoesNotExist, it's a sign migrations weren't applied properly.
#         cls.perm_view_all = Permission.objects.get(
#             content_type=cls.case_ct, codename="view_all_cases"
#         )
#
#     def authenticate(self, user):
#         self.client.force_authenticate(user=user)
#
#     # ----------------------------
#     # Auth / basic access
#     # ----------------------------
#     def test_list_requires_authentication(self):
#         res = self.client.get(self.list_url)
#         self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
#         self.assertIn("detail", res.data)
#
#     # ----------------------------
#     # Create permissions (permission-driven)
#     # ----------------------------
#     def test_user_without_add_permission_cannot_create_case(self):
#         self.authenticate(self.user1)
#         payload = {
#             "title": "Case A",
#             "description": "Desc",
#             "crime_level": CrimeLevel.LEVEL_1,
#         }
#         res = self.client.post(self.list_url, payload, format="json")
#         self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
#
#     def test_user_with_add_permission_can_create_case_and_created_by_is_set(self):
#         self.user1.user_permissions.add(self.perm_add_case)
#
#         self.authenticate(self.user1)
#         payload = {
#             "title": "Case B",
#             "description": "Desc",
#             "crime_level": CrimeLevel.LEVEL_2,
#         }
#         res = self.client.post(self.list_url, payload, format="json")
#         self.assertEqual(res.status_code, status.HTTP_201_CREATED)
#
#         self.assertEqual(Case.objects.count(), 1)
#         case = Case.objects.first()
#         self.assertEqual(case.created_by_id, self.user1.id)
#         self.assertEqual(case.title, payload["title"])
#         self.assertEqual(case.crime_level, payload["crime_level"])
#
#     # ----------------------------
#     # Visibility in list (queryset scoping)
#     # ----------------------------
#     def test_list_returns_only_visible_cases_created_assigned_or_participant(self):
#         # Visible via created_by
#         c1 = Case.objects.create(
#             title="C1",
#             description="D1",
#             crime_level=CrimeLevel.LEVEL_1,
#             created_by=self.user1,
#         )
#         # Visible via assigned_to
#         c2 = Case.objects.create(
#             title="C2",
#             description="D2",
#             crime_level=CrimeLevel.LEVEL_2,
#             created_by=self.staff,
#             assigned_to=self.user1,
#         )
#         # Visible via participant
#         c3 = Case.objects.create(
#             title="C3",
#             description="D3",
#             crime_level=CrimeLevel.LEVEL_3,
#             created_by=self.staff,
#         )
#         CaseParticipant.objects.create(case=c3, user=self.user1, is_complainant=True)
#
#         # Not visible
#         c4 = Case.objects.create(
#             title="C4",
#             description="D4",
#             crime_level=CrimeLevel.CRITICAL,
#             created_by=self.user2,
#         )
#
#         self.authenticate(self.user1)
#         res = self.client.get(self.list_url)
#         self.assertEqual(res.status_code, status.HTTP_200_OK)
#
#         data = extract_list_payload(res)
#         returned_ids = {item["id"] for item in data}
#
#         self.assertSetEqual(returned_ids, {c1.id, c2.id, c3.id})
#         self.assertNotIn(c4.id, returned_ids)
#
#     def test_list_is_distinct_when_user_matches_multiple_relations(self):
#         c = Case.objects.create(
#             title="Dup",
#             description="D",
#             crime_level=CrimeLevel.LEVEL_1,
#             created_by=self.user1,
#         )
#         CaseParticipant.objects.create(case=c, user=self.user1, is_complainant=True)
#
#         self.authenticate(self.user1)
#         res = self.client.get(self.list_url)
#         self.assertEqual(res.status_code, status.HTTP_200_OK)
#
#         data = extract_list_payload(res)
#         self.assertEqual(len(data), 1)
#         self.assertEqual(data[0]["id"], c.id)
#
#     # ----------------------------
#     # Retrieve behavior (queryset + object permissions)
#     # ----------------------------
#     def test_retrieve_invisible_case_returns_404(self):
#         invisible = Case.objects.create(
#             title="Hidden",
#             description="D",
#             crime_level=CrimeLevel.LEVEL_2,
#             created_by=self.user2,
#         )
#
#         self.authenticate(self.user1)
#         url = reverse("case-detail", args=[invisible.id])
#         res = self.client.get(url)
#         self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
#
#     def test_assigned_user_can_retrieve_case(self):
#         case = Case.objects.create(
#             title="Assigned",
#             description="D",
#             crime_level=CrimeLevel.LEVEL_1,
#             created_by=self.staff,
#             assigned_to=self.user1,
#         )
#
#         self.authenticate(self.user1)
#         res = self.client.get(reverse("case-detail", args=[case.id]))
#
#         # If this fails with 403, your CanViewCase.has_object_permission
#         # is missing: `obj.assigned_to == request.user`
#         self.assertEqual(res.status_code, status.HTTP_200_OK)
#         self.assertEqual(res.data["id"], case.id)
#
#     # ----------------------------
#     # view_all_cases permission
#     # ----------------------------
#     def test_view_all_cases_permission_allows_listing_and_retrieve(self):
#         c1 = Case.objects.create(
#             title="A",
#             description="D",
#             crime_level=CrimeLevel.LEVEL_1,
#             created_by=self.staff,
#         )
#         c2 = Case.objects.create(
#             title="B",
#             description="D",
#             crime_level=CrimeLevel.LEVEL_2,
#             created_by=self.user2,
#         )
#
#         self.user1.user_permissions.add(self.perm_view_all)
#
#         self.authenticate(self.user1)
#
#         # list should include all cases
#         res_list = self.client.get(self.list_url)
#         self.assertEqual(res_list.status_code, status.HTTP_200_OK)
#
#         data = extract_list_payload(res_list)
#         returned_ids = {item["id"] for item in data}
#         self.assertTrue({c1.id, c2.id}.issubset(returned_ids))
#
#         # retrieve should work for previously invisible case
#         res_detail = self.client.get(reverse("case-detail", args=[c2.id]))
#         self.assertEqual(res_detail.status_code, status.HTTP_200_OK)
#         self.assertEqual(res_detail.data["id"], c2.id)
#
#     # ----------------------------
#     # Model constraints
#     # ----------------------------
#     def test_case_participant_unique_together(self):
#         c = Case.objects.create(
#             title="UQ",
#             description="D",
#             crime_level=CrimeLevel.LEVEL_3,
#             created_by=self.staff,
#         )
#         CaseParticipant.objects.create(case=c, user=self.user1)
#
#         with self.assertRaises(IntegrityError):
#             CaseParticipant.objects.create(case=c, user=self.user1)


User = get_user_model()


class ComplaintWorkflowTests(APITestCase):
    def setUp(self):
        self.complainant = User.objects.create_user(
            username="u1",
            email="u1@example.com",
            password="pass12345",
            phone="09120000001",
            national_id="1111111111",
            first_name="A",
            last_name="B",
        )
        self.cadet = User.objects.create_user(
            username="cadet",
            email="cadet@example.com",
            password="pass12345",
            phone="09120000002",
            national_id="2222222222",
            first_name="C",
            last_name="D",
        )
        self.officer = User.objects.create_user(
            username="officer",
            email="officer@example.com",
            password="pass12345",
            phone="09120000003",
            national_id="3333333333",
            first_name="E",
            last_name="F",
        )

        ct = ContentType.objects.get_for_model(Complaint)
        cadet_perm = Permission.objects.get(content_type=ct, codename="cadet_review_complaint")
        officer_perm = Permission.objects.get(content_type=ct, codename="officer_review_complaint")

        self.cadet.user_permissions.add(cadet_perm)
        self.officer.user_permissions.add(officer_perm)

    def test_complainant_can_create_complaint(self):
        self.client.force_authenticate(self.complainant)
        url = reverse("complaint-list")
        res = self.client.post(
            url,
            {"title": "Test", "description": "Desc", "crime_level": CrimeLevel.LEVEL_1},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["title"], "Test")

    def test_cadet_reject_requires_message(self):
        self.client.force_authenticate(self.complainant)
        c = self.client.post(
            reverse("complaint-list"),
            {"title": "T", "description": "D", "crime_level": CrimeLevel.LEVEL_1},
            format="json",
        ).data
        cid = c["id"]

        self.client.force_authenticate(self.cadet)
        url = reverse("complaint-cadet-review", kwargs={"pk": cid})
        res = self.client.post(url, {"decision": "reject"}, format="json")
        self.assertEqual(res.status_code, 400)

        res2 = self.client.post(url, {"decision": "reject", "message": "Missing info"}, format="json")
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.data["current_status"], ComplaintStatus.CADET_REJECTED)

    def test_invalid_after_three_resubmits(self):
        self.client.force_authenticate(self.complainant)
        cid = self.client.post(
            reverse("complaint-list"),
            {"title": "T", "description": "D", "crime_level": CrimeLevel.LEVEL_1},
            format="json",
        ).data["id"]

        # cadet reject first time
        self.client.force_authenticate(self.cadet)
        self.client.post(
            reverse("complaint-cadet-review", kwargs={"pk": cid}),
            {"decision": "reject", "message": "Bad"},
            format="json",
        )

        # resubmit 1
        self.client.force_authenticate(self.complainant)
        self.client.patch(reverse("complaint-resubmit", kwargs={"pk": cid}), {"description": "D1"}, format="json")

        # reject again
        self.client.force_authenticate(self.cadet)
        self.client.post(
            reverse("complaint-cadet-review", kwargs={"pk": cid}),
            {"decision": "reject", "message": "Bad2"},
            format="json",
        )

        # resubmit 2
        self.client.force_authenticate(self.complainant)
        self.client.patch(reverse("complaint-resubmit", kwargs={"pk": cid}), {"description": "D2"}, format="json")

        # reject again
        self.client.force_authenticate(self.cadet)
        self.client.post(
            reverse("complaint-cadet-review", kwargs={"pk": cid}),
            {"decision": "reject", "message": "Bad3"},
            format="json",
        )

        # resubmit 3 => INVALID
        self.client.force_authenticate(self.complainant)
        res = self.client.patch(reverse("complaint-resubmit", kwargs={"pk": cid}), {"description": "D3"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["current_status"], ComplaintStatus.INVALID)

        # further resubmit blocked
        res2 = self.client.patch(reverse("complaint-resubmit", kwargs={"pk": cid}), {"description": "D4"}, format="json")
        self.assertIn(res2.status_code, [400, 403])

    def test_officer_approve_creates_case_link(self):
        self.client.force_authenticate(self.complainant)
        cid = self.client.post(
            reverse("complaint-list"),
            {"title": "T", "description": "D", "crime_level": CrimeLevel.LEVEL_1},
            format="json",
        ).data["id"]

        self.client.force_authenticate(self.cadet)
        self.client.post(reverse("complaint-cadet-review", kwargs={"pk": cid}), {"decision": "approve"}, format="json")

        self.client.force_authenticate(self.officer)
        res = self.client.post(reverse("complaint-officer-review", kwargs={"pk": cid}), {"decision": "approve"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(res.data.get("case_id"))

    def test_officer_reject_goes_back_to_cadet(self):
        self.client.force_authenticate(self.complainant)
        cid = self.client.post(
            reverse("complaint-list"),
            {"title": "T", "description": "D", "crime_level": CrimeLevel.LEVEL_1},
            format="json",
        ).data["id"]

        self.client.force_authenticate(self.cadet)
        self.client.post(reverse("complaint-cadet-review", kwargs={"pk": cid}), {"decision": "approve"}, format="json")

        self.client.force_authenticate(self.officer)
        res = self.client.post(
            reverse("complaint-officer-review", kwargs={"pk": cid}),
            {"decision": "reject", "message": "Not enough"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["current_status"], ComplaintStatus.OFFICER_REJECTED)

        # cadet can review again after officer rejection
        self.client.force_authenticate(self.cadet)
        res2 = self.client.post(reverse("complaint-cadet-review", kwargs={"pk": cid}), {"decision": "approve"}, format="json")
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.data["current_status"], ComplaintStatus.CADET_APPROVED)