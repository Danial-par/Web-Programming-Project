from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.constants import CrimeLevel
from cases.models import Case, CaseParticipant

from evidence.models import Evidence, EvidenceType

from .models import BoardItem, CaseSuspect, CaseSuspectStatus, Notification


User = get_user_model()


class InvestigationsBaseAPITest(APITestCase):
    @staticmethod
    def grant_perm(user, model, codename: str):
        ct = ContentType.objects.get_for_model(model)
        perm = Permission.objects.get(content_type=ct, codename=codename)
        user.user_permissions.add(perm)
        return perm


class DetectiveBoardItemTests(InvestigationsBaseAPITest):
    @classmethod
    def setUpTestData(cls):
        cls.detective = User.objects.create_user(
            username="detective",
            email="detective@example.com",
            password="pass12345",
            phone="09120001000",
            national_id="1000000000",
            first_name="Det",
            last_name="Ective",
        )
        cls.creator = User.objects.create_user(
            username="creator",
            email="creator@example.com",
            password="pass12345",
            phone="09120001001",
            national_id="1000000001",
            first_name="Case",
            last_name="Creator",
        )

        cls.case = Case.objects.create(
            title="Board Case",
            description="Desc",
            crime_level=CrimeLevel.LEVEL_1,
            created_by=cls.creator,
            formed_at=timezone.now(),
            assigned_to=cls.detective,
        )

        # permissions for detective to manage board items
        InvestigationsBaseAPITest.grant_perm(cls.detective, BoardItem, "add_boarditem")
        InvestigationsBaseAPITest.grant_perm(cls.detective, BoardItem, "change_boarditem")

        # a user who can view the case (participant) but is NOT assigned detective
        cls.participant = User.objects.create_user(
            username="participant",
            email="participant@example.com",
            password="pass12345",
            phone="09120001002",
            national_id="1000000002",
            first_name="Part",
            last_name="Icipant",
        )
        CaseParticipant.objects.create(case=cls.case, user=cls.participant, is_complainant=False)
        InvestigationsBaseAPITest.grant_perm(cls.participant, BoardItem, "add_boarditem")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_assigned_detective_can_create_and_move_note_item(self):
        self.authenticate(self.detective)

        create_url = reverse("case-board-item-create", kwargs={"case_id": self.case.id})
        payload = {
            "kind": "note",
            "note_text": "Check CCTV footage",
            "position": {"x": 10.0, "y": 20.0},
        }
        res = self.client.post(create_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["kind"], "note")
        self.assertEqual(res.data["note_text"], "Check CCTV footage")
        self.assertEqual(res.data["position"], {"x": 10.0, "y": 20.0})

        item_id = res.data["id"]

        move_url = reverse(
            "case-board-item-detail",
            kwargs={"case_id": self.case.id, "item_id": item_id},
        )
        move_payload = {"position": {"x": 99.5, "y": 101.25}}
        res2 = self.client.patch(move_url, move_payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data["position"], {"x": 99.5, "y": 101.25})

        item = BoardItem.objects.get(id=item_id)
        self.assertEqual(item.position_x, 99.5)
        self.assertEqual(item.position_y, 101.25)

    def test_non_assigned_user_cannot_create_item_even_with_add_permission(self):
        self.authenticate(self.participant)

        create_url = reverse("case-board-item-create", kwargs={"case_id": self.case.id})
        payload = {
            "kind": "note",
            "note_text": "Should fail",
            "position": {"x": 1, "y": 2},
        }
        res = self.client.post(create_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class EvidenceNotificationTests(InvestigationsBaseAPITest):
    @classmethod
    def setUpTestData(cls):
        cls.detective = User.objects.create_user(
            username="det2",
            email="det2@example.com",
            password="pass12345",
            phone="09120002000",
            national_id="2000000000",
            first_name="Det",
            last_name="Two",
        )
        cls.creator = User.objects.create_user(
            username="creator2",
            email="creator2@example.com",
            password="pass12345",
            phone="09120002001",
            national_id="2000000001",
            first_name="Creator",
            last_name="Two",
        )

        cls.case = Case.objects.create(
            title="Notif Case",
            description="Desc",
            crime_level=CrimeLevel.LEVEL_2,
            created_by=cls.creator,
            formed_at=timezone.now(),
            assigned_to=cls.detective,
        )

        InvestigationsBaseAPITest.grant_perm(cls.creator, Evidence, "add_evidence")

        cls.evidence_create_url = reverse("evidence-list")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_evidence_creation_triggers_notification_for_assigned_detective(self):
        self.authenticate(self.creator)

        payload = {
            "case": self.case.id,
            "type": EvidenceType.OTHER,
            "title": "New clue",
            "description": "Something interesting",
        }

        res = self.client.post(self.evidence_create_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        self.assertEqual(Notification.objects.filter(user=self.detective, case=self.case).count(), 1)
        notif = Notification.objects.get(user=self.detective, case=self.case)
        self.assertIn("New evidence", notif.message)
        self.assertIn("New clue", notif.message)


class CaseSuspectFlowTests(InvestigationsBaseAPITest):
    @classmethod
    def setUpTestData(cls):
        cls.detective = User.objects.create_user(
            username="det3",
            email="det3@example.com",
            password="pass12345",
            phone="09120003000",
            national_id="3000000000",
            first_name="Det",
            last_name="Three",
        )
        cls.creator = User.objects.create_user(
            username="creator3",
            email="creator3@example.com",
            password="pass12345",
            phone="09120003001",
            national_id="3000000001",
            first_name="Creator",
            last_name="Three",
        )
        cls.sergeant = User.objects.create_user(
            username="sergeant",
            email="sergeant@example.com",
            password="pass12345",
            phone="09120003002",
            national_id="3000000002",
            first_name="Ser",
            last_name="Geant",
        )

        cls.case = Case.objects.create(
            title="Suspect Case",
            description="Desc",
            crime_level=CrimeLevel.LEVEL_1,
            created_by=cls.creator,
            formed_at=timezone.now(),
            assigned_to=cls.detective,
        )

        # Detective can propose
        InvestigationsBaseAPITest.grant_perm(cls.detective, CaseSuspect, "propose_case_suspect")

        # Sergeant can review
        InvestigationsBaseAPITest.grant_perm(cls.sergeant, CaseSuspect, "review_case_suspect")

        cls.propose_url = reverse("case-suspect-propose", kwargs={"case_id": cls.case.id})

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_detective_can_propose_and_sergeant_can_approve(self):
        # Detective proposes
        self.authenticate(self.detective)
        payload = {
            "first_name": "John",
            "last_name": "Doe",
            "national_id": "1234567890",
            "phone": "09120009999",
            "notes": "Seen near the scene",
        }
        res = self.client.post(self.propose_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        suspect_id = res.data["id"]

        # Sergeant approves
        review_url = reverse(
            "case-suspect-review",
            kwargs={"case_id": self.case.id, "suspect_id": suspect_id},
        )

        self.authenticate(self.sergeant)
        res2 = self.client.post(review_url, {"decision": "approve", "message": "Ok"}, format="json")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data["status"], CaseSuspectStatus.APPROVED)
        self.assertEqual(res2.data["sergeant_message"], "Ok")

        suspect = CaseSuspect.objects.get(id=suspect_id)
        self.assertEqual(suspect.status, CaseSuspectStatus.APPROVED)
        self.assertEqual(suspect.reviewed_by_id, self.sergeant.id)

    def test_non_assigned_user_cannot_propose_even_with_permission(self):
        user = User.objects.create_user(
            username="not_assigned",
            email="not_assigned@example.com",
            password="pass12345",
            phone="09120003003",
            national_id="3000000003",
            first_name="Not",
            last_name="Assigned",
        )
        CaseParticipant.objects.create(case=self.case, user=user, is_complainant=False)
        InvestigationsBaseAPITest.grant_perm(user, CaseSuspect, "propose_case_suspect")

        self.authenticate(user)
        res = self.client.post(
            self.propose_url,
            {"first_name": "A", "last_name": "B", "national_id": "1"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_detective_cannot_review_without_sergeant_permission(self):
        # create a suspect first
        self.authenticate(self.detective)
        res = self.client.post(
            self.propose_url,
            {"first_name": "X", "last_name": "Y", "national_id": "2"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        suspect_id = res.data["id"]

        review_url = reverse(
            "case-suspect-review",
            kwargs={"case_id": self.case.id, "suspect_id": suspect_id},
        )
        res2 = self.client.post(review_url, {"decision": "approve"}, format="json")
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)
