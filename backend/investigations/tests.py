from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.constants import CrimeLevel
from cases.models import Case, CaseParticipant

from .models import BoardItem


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
