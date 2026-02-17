import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cases.constants import CrimeLevel
from cases.models import Case, CaseParticipant
from .models import Evidence, EvidenceAttachment, EvidenceType


User = get_user_model()


class EvidenceBaseAPITest(APITestCase):
    def setUp(self):
        super().setUp()
        self._media_root = tempfile.mkdtemp(prefix="test_media_")
        self._override = override_settings(MEDIA_ROOT=self._media_root)
        self._override.enable()

    def tearDown(self):
        self._override.disable()
        shutil.rmtree(self._media_root, ignore_errors=True)
        super().tearDown()

    @staticmethod
    def grant_perm(user, model, codename: str):
        ct = ContentType.objects.get_for_model(model)
        perm = Permission.objects.get(content_type=ct, codename=codename)
        user.user_permissions.add(perm)
        return perm


class VehicleEvidenceConstraintTests(EvidenceBaseAPITest):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="creator",
            email="creator@example.com",
            password="pass12345",
            phone="09120000111",
            national_id="1111111111",
            first_name="Creator",
            last_name="User",
        )
        cls.case = Case.objects.create(
            title="Case",
            description="Desc",
            crime_level=CrimeLevel.LEVEL_1,
            created_by=cls.user,
            formed_at=timezone.now(),
        )

        cls.url = reverse("evidence-list")

        # allow creation
        EvidenceBaseAPITest.grant_perm(cls.user, Evidence, "add_evidence")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_vehicle_evidence_rejects_plate_and_serial_together(self):
        self.authenticate(self.user)

        payload = {
            "case": self.case.id,
            "type": EvidenceType.VEHICLE,
            "title": "Vehicle",
            "description": "Both provided",
            "vehicle_model": "Ford Coupe",
            "color": "Red",
            "plate_number": "ABC123",
            "serial_number": "SN-001",
        }
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get("code"), "validation_error")
        # Validation errors are normalized by common.exceptions.custom_exception_handler
        fields = res.data.get("fields", {})
        self.assertIn("non_field_errors", fields)
        self.assertIn("either plate_number or serial_number", str(fields["non_field_errors"]))


class CoronerForensicUpdateTests(EvidenceBaseAPITest):
    @classmethod
    def setUpTestData(cls):
        cls.creator = User.objects.create_user(
            username="creator2",
            email="creator2@example.com",
            password="pass12345",
            phone="09120000222",
            national_id="2222222222",
            first_name="Creator",
            last_name="Two",
        )

        cls.coroner = User.objects.create_user(
            username="coroner",
            email="coroner@example.com",
            password="pass12345",
            phone="09120000333",
            national_id="3333333333",
            first_name="Coroner",
            last_name="User",
        )

        cls.case = Case.objects.create(
            title="Forensic Case",
            description="Desc",
            crime_level=CrimeLevel.LEVEL_2,
            created_by=cls.creator,
            formed_at=timezone.now(),
        )

        # Give coroner case access via participant entry
        CaseParticipant.objects.create(case=cls.case, user=cls.coroner, is_complainant=False)

        # Permissions
        EvidenceBaseAPITest.grant_perm(cls.creator, Evidence, "add_evidence")
        EvidenceBaseAPITest.grant_perm(cls.coroner, Evidence, "fill_forensic_results")

        cls.create_url = reverse("evidence-list")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def _create_forensic_evidence(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.authenticate(self.creator)
        payload = {
            "case": self.case.id,
            "type": EvidenceType.FORENSIC,
            "title": "Forensic Photos",
            "description": "Initial",
            "kinds": ["image"],
            "files": [
                SimpleUploadedFile("photo.jpg", b"fake-image-bytes", content_type="image/jpeg")
            ],
        }
        res = self.client.post(self.create_url, payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        return res.data["id"]

    def test_only_coroner_can_update_forensic_results(self):
        evidence_id = self._create_forensic_evidence()
        url = reverse("evidence-forensic-results", args=[evidence_id])

        # Creator (no coroner permission) => forbidden
        self.authenticate(self.creator)
        res = self.client.post(
            url,
            {"coroner_result": "Cause of death: ..."},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Coroner => ok
        self.authenticate(self.coroner)
        res = self.client.post(
            url,
            {
                "coroner_result": "Cause of death: blunt force trauma",
                "identity_db_result": "No match",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        ev = Evidence.objects.get(id=evidence_id)
        self.assertEqual(ev.coroner_result, "Cause of death: blunt force trauma")
        self.assertEqual(ev.identity_db_result, "No match")


class EvidenceAttachmentCreationTests(EvidenceBaseAPITest):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="creator3",
            email="creator3@example.com",
            password="pass12345",
            phone="09120000444",
            national_id="4444444444",
            first_name="Creator",
            last_name="Three",
        )
        cls.case = Case.objects.create(
            title="Attachment Case",
            description="Desc",
            crime_level=CrimeLevel.LEVEL_3,
            created_by=cls.user,
            formed_at=timezone.now(),
        )

        EvidenceBaseAPITest.grant_perm(cls.user, Evidence, "add_evidence")
        cls.url = reverse("evidence-list")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_evidence_creation_creates_attachments_with_correct_kinds(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.authenticate(self.user)

        payload = {
            "case": self.case.id,
            "type": EvidenceType.WITNESS_STATEMENT,
            "title": "Witness statement",
            "description": "Audio + photo",
            "witness_transcription": "I saw a red car...",
            "kinds": ["image", "audio"],
            "files": [
                SimpleUploadedFile("photo.png", b"fake-png", content_type="image/png"),
                SimpleUploadedFile("audio.mp3", b"fake-mp3", content_type="audio/mpeg"),
            ],
        }

        res = self.client.post(self.url, payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        evidence_id = res.data["id"]

        attachments = EvidenceAttachment.objects.filter(evidence_id=evidence_id).order_by("id")
        self.assertEqual(attachments.count(), 2)
        self.assertEqual([a.kind for a in attachments], ["image", "audio"])
