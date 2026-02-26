from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from evidence.models import Evidence, EvidenceType
from investigations.models import CaseSuspect, CaseSuspectStatus, Interrogation

from .constants import CaseStatus, CrimeLevel, ComplaintStatus, SceneReportStatus
from .models import Case, CaseParticipant, Complaint, SceneReport, Trial


def extract_list_payload(res):
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

    def test_sergeant_role_can_retrieve_case_detail_without_participation(self):
        case = Case.objects.create(
            title="Sergeant View",
            description="D",
            crime_level=CrimeLevel.LEVEL_2,
            created_by=self.user2,
        )

        sergeant = User.objects.create_user(
            username="sergeant_detail",
            email="sergeant.detail@example.com",
            password="pass12345",
            phone="09120009991",
            national_id="9090000001",
            first_name="Ser",
            last_name="Geant",
        )
        sergeant_group, _ = Group.objects.get_or_create(name="Sergeant")
        sergeant.groups.add(sergeant_group)

        self.authenticate(sergeant)
        res = self.client.get(reverse("case-detail", args=[case.id]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], case.id)

    def test_detective_role_sees_only_assigned_case(self):
        detective = User.objects.create_user(
            username="detective_scope",
            email="detective.scope@example.com",
            password="pass12345",
            phone="09120009992",
            national_id="9090000002",
            first_name="Det",
            last_name="Scope",
        )
        detective_group, _ = Group.objects.get_or_create(name="Detective")
        detective.groups.add(detective_group)

        assigned_case = Case.objects.create(
            title="Assigned Case",
            description="D",
            crime_level=CrimeLevel.LEVEL_1,
            created_by=self.user2,
            assigned_to=detective,
        )
        participant_only_case = Case.objects.create(
            title="Participant Case",
            description="D",
            crime_level=CrimeLevel.LEVEL_2,
            created_by=self.user2,
        )
        created_by_detective_case = Case.objects.create(
            title="Created By Detective",
            description="D",
            crime_level=CrimeLevel.LEVEL_3,
            created_by=detective,
        )
        CaseParticipant.objects.create(case=participant_only_case, user=detective, is_complainant=False)

        self.authenticate(detective)

        res_list = self.client.get(self.list_url)
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        returned_ids = {item["id"] for item in extract_list_payload(res_list)}
        self.assertSetEqual(returned_ids, {assigned_case.id})

        res_assigned = self.client.get(reverse("case-detail", args=[assigned_case.id]))
        self.assertEqual(res_assigned.status_code, status.HTTP_200_OK)

        res_participant = self.client.get(reverse("case-detail", args=[participant_only_case.id]))
        self.assertEqual(res_participant.status_code, status.HTTP_404_NOT_FOUND)

        res_created = self.client.get(reverse("case-detail", args=[created_by_detective_case.id]))
        self.assertEqual(res_created.status_code, status.HTTP_404_NOT_FOUND)

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


class ComplaintExtraSafetyTests(APITestCase):
    def setUp(self):
        self.u1 = User.objects.create_user(
            username="u1x", email="u1x@example.com", password="pass12345",
            phone="09120002001", national_id="9000000001", first_name="U", last_name="1"
        )
        self.u2 = User.objects.create_user(
            username="u2x", email="u2x@example.com", password="pass12345",
            phone="09120002002", national_id="9000000002", first_name="U", last_name="2"
        )
        self.cadet = User.objects.create_user(
            username="cadetx", email="cadetx@example.com", password="pass12345",
            phone="09120002003", national_id="9000000003", first_name="C", last_name="A"
        )
        self.officer = User.objects.create_user(
            username="officerx", email="officerx@example.com", password="pass12345",
            phone="09120002004", national_id="9000000004", first_name="O", last_name="F"
        )

        ct = ContentType.objects.get_for_model(Complaint)
        self.cadet.user_permissions.add(Permission.objects.get(content_type=ct, codename="cadet_review_complaint"))
        self.officer.user_permissions.add(Permission.objects.get(content_type=ct, codename="officer_review_complaint"))

    def _create_complaint_as_u1(self):
        self.client.force_authenticate(self.u1)
        res = self.client.post(
            reverse("complaint-list"),
            {"title": "T", "description": "D", "crime_level": "level_1"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        return res.data["id"]

    def test_non_cadet_cannot_cadet_review(self):
        cid = self._create_complaint_as_u1()
        self.client.force_authenticate(self.u1)
        res = self.client.post(reverse("complaint-cadet-review", kwargs={"pk": cid}), {"decision": "approve"}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_non_officer_cannot_officer_review(self):
        cid = self._create_complaint_as_u1()
        self.client.force_authenticate(self.cadet)
        self.client.post(reverse("complaint-cadet-review", kwargs={"pk": cid}), {"decision": "approve"}, format="json")

        self.client.force_authenticate(self.cadet)
        res = self.client.post(reverse("complaint-officer-review", kwargs={"pk": cid}), {"decision": "approve"}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_complaint_scoping_user_cannot_see_others(self):
        cid = self._create_complaint_as_u1()

        self.client.force_authenticate(self.u2)
        res_list = self.client.get(reverse("complaint-list"))
        self.assertEqual(res_list.status_code, 200)
        ids = [c["id"] for c in res_list.data]
        self.assertNotIn(cid, ids)

        res_detail = self.client.get(reverse("complaint-detail", kwargs={"pk": cid}))
        self.assertIn(res_detail.status_code, [403, 404])

    def test_cannot_resubmit_unless_cadet_rejected(self):
        cid = self._create_complaint_as_u1()
        self.client.force_authenticate(self.u1)
        res = self.client.patch(reverse("complaint-resubmit", kwargs={"pk": cid}), {"description": "D1"}, format="json")
        self.assertEqual(res.status_code, 400)


class SceneReportWorkflowTests(APITestCase):
    def setUp(self):
        self.user_police = User.objects.create_user(
            username="police",
            email="police@example.com",
            password="pass12345",
            phone="09120001001",
            national_id="5555555555",
            first_name="P",
            last_name="L",
        )

        self.superior = User.objects.create_user(
            username="superior",
            email="superior@example.com",
            password="pass12345",
            phone="09120001002",
            national_id="6666666666",
            first_name="S",
            last_name="U",
        )

        self.chief = User.objects.create_user(
            username="chief",
            email="chief@example.com",
            password="pass12345",
            phone="09120001003",
            national_id="7777777777",
            first_name="C",
            last_name="H",
        )

        ct = ContentType.objects.get_for_model(SceneReport)

        perm_create = Permission.objects.get(content_type=ct, codename="create_scene_report")
        perm_approve = Permission.objects.get(content_type=ct, codename="approve_scene_report")
        perm_auto = Permission.objects.get(content_type=ct, codename="auto_approve_scene_report")

        self.user_police.user_permissions.add(perm_create)
        self.superior.user_permissions.add(perm_approve)
        self.chief.user_permissions.add(perm_create, perm_auto)

    def test_police_creates_pending_scene_report_and_draft_case(self):
        self.client.force_authenticate(self.user_police)
        url = reverse("scene-report-list")
        payload = {
            "title": "Scene Case",
            "description": "Saw something",
            "crime_level": "level_1",
            "scene_datetime": timezone.now().isoformat(),
            "witnesses": [{"phone": "09120000000", "national_id": "1234567890"}],
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, 201)

        sr = SceneReport.objects.get(id=res.data["id"])
        self.assertEqual(sr.status, SceneReportStatus.PENDING)
        self.assertEqual(sr.case.status, CaseStatus.DRAFT)

    def test_superior_can_approve_scene_report(self):
        self.client.force_authenticate(self.user_police)
        sr_id = self.client.post(
            reverse("scene-report-list"),
            {
                "title": "Scene Case",
                "description": "Saw something",
                "crime_level": "level_1",
                "scene_datetime": timezone.now().isoformat(),
            },
            format="json",
        ).data["id"]

        self.client.force_authenticate(self.superior)
        res = self.client.post(reverse("scene-report-approve", kwargs={"pk": sr_id}), {}, format="json")
        self.assertEqual(res.status_code, 200)

        sr = SceneReport.objects.get(id=sr_id)
        self.assertEqual(sr.status, SceneReportStatus.APPROVED)
        self.assertEqual(sr.case.status, CaseStatus.ACTIVE)
        self.assertIsNotNone(sr.case.formed_at)

    def test_chief_bypass_auto_approves_on_create(self):
        self.client.force_authenticate(self.chief)
        res = self.client.post(
            reverse("scene-report-list"),
            {
                "title": "Chief Case",
                "description": "Immediate approval",
                "crime_level": "level_2",
                "scene_datetime": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)

        sr = SceneReport.objects.get(id=res.data["id"])
        self.assertEqual(sr.status, SceneReportStatus.APPROVED)
        self.assertEqual(sr.case.status, CaseStatus.ACTIVE)


class SceneReportExtraSafetyTests(APITestCase):
    def setUp(self):
        self.police = User.objects.create_user(
            username="police2", email="police2@example.com", password="pass12345",
            phone="09120003001", national_id="8000000001", first_name="P", last_name="2"
        )
        self.other = User.objects.create_user(
            username="other2", email="other2@example.com", password="pass12345",
            phone="09120003002", national_id="8000000002", first_name="O", last_name="2"
        )
        self.superior = User.objects.create_user(
            username="sup2", email="sup2@example.com", password="pass12345",
            phone="09120003003", national_id="8000000003", first_name="S", last_name="2"
        )

        ct = ContentType.objects.get_for_model(SceneReport)
        self.police.user_permissions.add(Permission.objects.get(content_type=ct, codename="create_scene_report"))
        self.superior.user_permissions.add(Permission.objects.get(content_type=ct, codename="approve_scene_report"))

    def test_scene_report_witnesses_persist(self):
        self.client.force_authenticate(self.police)
        res = self.client.post(
            reverse("scene-report-list"),
            {
                "title": "SR",
                "description": "Desc",
                "crime_level": "level_1",
                "scene_datetime": timezone.now().isoformat(),
                "witnesses": [
                    {"phone": "09121111111", "national_id": "1231231231"},
                    {"phone": "09122222222", "national_id": "3213213213"},
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        sr_id = res.data["id"]

        res_detail = self.client.get(reverse("scene-report-detail", kwargs={"pk": sr_id}))
        self.assertEqual(res_detail.status_code, 200)
        self.assertEqual(len(res_detail.data["witnesses"]), 2)

    def test_scene_approve_is_idempotent(self):
        self.client.force_authenticate(self.police)
        sr_id = self.client.post(
            reverse("scene-report-list"),
            {
                "title": "SR2",
                "description": "Desc2",
                "crime_level": "level_1",
                "scene_datetime": timezone.now().isoformat(),
            },
            format="json",
        ).data["id"]

        self.client.force_authenticate(self.superior)
        first = self.client.post(reverse("scene-report-approve", kwargs={"pk": sr_id}), {}, format="json")
        self.assertEqual(first.status_code, 200)

        second = self.client.post(reverse("scene-report-approve", kwargs={"pk": sr_id}), {}, format="json")
        self.assertEqual(second.status_code, 400)

    def test_scene_report_scoping_other_user_cannot_view(self):
        self.client.force_authenticate(self.police)
        sr_id = self.client.post(
            reverse("scene-report-list"),
            {
                "title": "SR3",
                "description": "Desc3",
                "crime_level": "level_1",
                "scene_datetime": timezone.now().isoformat(),
            },
            format="json",
        ).data["id"]

        self.client.force_authenticate(self.other)
        res = self.client.get(reverse("scene-report-detail", kwargs={"pk": sr_id}))
        self.assertIn(res.status_code, [403, 404])


class TrialAndReportTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()

        cls.creator = User.objects.create_user(
            username="creator_r",
            email="creator_r@example.com",
            password="pass12345",
            phone="09120005000",
            national_id="5000000000",
            first_name="Creator",
            last_name="R",
        )
        cls.detective = User.objects.create_user(
            username="detective_r",
            email="detective_r@example.com",
            password="pass12345",
            phone="09120005001",
            national_id="5000000001",
            first_name="Det",
            last_name="R",
        )
        cls.sergeant = User.objects.create_user(
            username="sergeant_r",
            email="sergeant_r@example.com",
            password="pass12345",
            phone="09120005002",
            national_id="5000000002",
            first_name="Ser",
            last_name="R",
        )
        cls.captain = User.objects.create_user(
            username="captain_r",
            email="captain_r@example.com",
            password="pass12345",
            phone="09120005003",
            national_id="5000000003",
            first_name="Cap",
            last_name="R",
        )
        cls.chief = User.objects.create_user(
            username="chief_r",
            email="chief_r@example.com",
            password="pass12345",
            phone="09120005004",
            national_id="5000000004",
            first_name="Chief",
            last_name="R",
        )
        cls.judge = User.objects.create_user(
            username="judge_r",
            email="judge_r@example.com",
            password="pass12345",
            phone="09120005005",
            national_id="5000000005",
            first_name="Judge",
            last_name="R",
        )

        cls.case = Case.objects.create(
            title="Critical Case",
            description="Desc",
            crime_level=CrimeLevel.CRITICAL,
            status=CaseStatus.ACTIVE,
            created_by=cls.creator,
            formed_at=timezone.now(),
            assigned_to=cls.detective,
        )

        cls.suspect = CaseSuspect.objects.create(
            case=cls.case,
            first_name="John",
            last_name="Doe",
            national_id="1234567890",
            phone="09120000000",
            notes="",
            proposed_by=cls.detective,
            status=CaseSuspectStatus.APPROVED,
            reviewed_by=cls.sergeant,
            reviewed_at=timezone.now(),
        )

        Evidence.objects.create(
            case=cls.case,
            type=EvidenceType.OTHER,
            title="Basic clue",
            description="Something",
            created_by=cls.detective,
        )

        def grant(user, model, codename: str):
            ct = ContentType.objects.get_for_model(model)
            user.user_permissions.add(Permission.objects.get(content_type=ct, codename=codename))

        # Interrogation permissions
        grant(cls.detective, Interrogation, "submit_detective_interrogation")
        grant(cls.sergeant, Interrogation, "submit_sergeant_interrogation")
        grant(cls.captain, Interrogation, "submit_captain_interrogation_decision")
        grant(cls.chief, Interrogation, "review_critical_interrogation")

        # Judge permission
        grant(cls.judge, Trial, "judge_verdict_trial")

        cls.detective_url = reverse(
            "suspect-interrogation-detective",
            kwargs={"case_id": cls.case.id, "suspect_id": cls.suspect.id},
        )
        cls.sergeant_url = reverse(
            "suspect-interrogation-sergeant",
            kwargs={"case_id": cls.case.id, "suspect_id": cls.suspect.id},
        )
        cls.captain_url = reverse(
            "suspect-interrogation-captain",
            kwargs={"case_id": cls.case.id, "suspect_id": cls.suspect.id},
        )
        cls.chief_url = reverse(
            "suspect-interrogation-chief",
            kwargs={"case_id": cls.case.id, "suspect_id": cls.suspect.id},
        )
        cls.trial_url = reverse(
            "case-suspect-trial",
            kwargs={"case_id": cls.case.id, "suspect_id": cls.suspect.id},
        )
        cls.report_url = reverse("case-report", args=[cls.case.id])

    def test_critical_case_requires_chief_approval_step_before_trial_verdict(self):
        # detective submits
        self.client.force_authenticate(self.detective)
        r1 = self.client.post(self.detective_url, {"detective_score": 7}, format="json")
        self.assertEqual(r1.status_code, 200)

        # sergeant submits
        self.client.force_authenticate(self.sergeant)
        r2 = self.client.post(self.sergeant_url, {"sergeant_score": 6}, format="json")
        self.assertEqual(r2.status_code, 200)

        # captain approves (critical case still needs chief)
        self.client.force_authenticate(self.captain)
        r3 = self.client.post(
            self.captain_url,
            {"captain_final_decision": True, "captain_reasoning": "Proceed"},
            format="json",
        )
        self.assertEqual(r3.status_code, 200)

        # judge tries verdict without chief approval
        self.client.force_authenticate(self.judge)
        res = self.client.post(
            self.trial_url,
            {"verdict": "guilty", "punishment_title": "Jail", "punishment_description": "5 years"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data.get("code"), "chief_approval_required")

        # chief approves
        self.client.force_authenticate(self.chief)
        res2 = self.client.post(self.chief_url, {"chief_decision": True, "chief_message": ""}, format="json")
        self.assertEqual(res2.status_code, 200)

        # judge can now set verdict
        self.client.force_authenticate(self.judge)
        res3 = self.client.post(
            self.trial_url,
            {"verdict": "guilty", "punishment_title": "Jail", "punishment_description": "5 years"},
            format="json",
        )
        self.assertEqual(res3.status_code, 200)
        self.assertEqual(res3.data.get("verdict"), "guilty")

    def test_report_endpoint_returns_nested_structure_with_interrogation_and_trial(self):
        # Ensure a complete chain exists so report includes trial outcome.
        if not Trial.objects.filter(case=self.case, suspect=self.suspect).exists():
            self.client.force_authenticate(self.detective)
            self.client.post(self.detective_url, {"detective_score": 7}, format="json")

            self.client.force_authenticate(self.sergeant)
            self.client.post(self.sergeant_url, {"sergeant_score": 6}, format="json")

            self.client.force_authenticate(self.captain)
            self.client.post(
                self.captain_url,
                {"captain_final_decision": True, "captain_reasoning": "Proceed"},
                format="json",
            )

            self.client.force_authenticate(self.chief)
            self.client.post(self.chief_url, {"chief_decision": True, "chief_message": ""}, format="json")

            self.client.force_authenticate(self.judge)
            self.client.post(
                self.trial_url,
                {"verdict": "guilty", "punishment_title": "Jail", "punishment_description": "5 years"},
                format="json",
            )

        self.client.force_authenticate(self.judge)
        res = self.client.get(self.report_url)
        self.assertEqual(res.status_code, 200)

        for key in ["case", "complaint", "scene_report", "evidence", "suspects", "police_involved"]:
            self.assertIn(key, res.data)

        self.assertIsInstance(res.data["evidence"], list)
        self.assertGreaterEqual(len(res.data["evidence"]), 1)

        self.assertIsInstance(res.data["suspects"], list)
        self.assertEqual(len(res.data["suspects"]), 1)

        suspect = res.data["suspects"][0]
        self.assertIn("interrogation", suspect)
        self.assertIn("trials", suspect)

        self.assertGreaterEqual(len(suspect["trials"]), 1)
        self.assertIn(suspect["trials"][0]["verdict"], ["guilty", "innocent"])

    def test_trial_verdict_cannot_be_resubmitted_for_same_suspect(self):
        self.client.force_authenticate(self.detective)
        self.client.post(self.detective_url, {"detective_score": 7}, format="json")

        self.client.force_authenticate(self.sergeant)
        self.client.post(self.sergeant_url, {"sergeant_score": 6}, format="json")

        self.client.force_authenticate(self.captain)
        self.client.post(
            self.captain_url,
            {"captain_final_decision": True, "captain_reasoning": "Proceed"},
            format="json",
        )

        self.client.force_authenticate(self.chief)
        self.client.post(self.chief_url, {"chief_decision": True, "chief_message": ""}, format="json")

        self.client.force_authenticate(self.judge)
        first = self.client.post(
            self.trial_url,
            {"verdict": "guilty", "punishment_title": "Jail", "punishment_description": "5 years"},
            format="json",
        )
        self.assertEqual(first.status_code, 200)

        second = self.client.post(
            self.trial_url,
            {"verdict": "innocent"},
            format="json",
        )
        self.assertEqual(second.status_code, 400)
        self.assertEqual(second.data.get("code"), "trial_verdict_already_submitted")
