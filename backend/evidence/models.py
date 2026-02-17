from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q


class EvidenceType(models.TextChoices):
    WITNESS_STATEMENT = "witness_statement", "Witness statement"
    FORENSIC = "forensic", "Forensic"
    VEHICLE = "vehicle", "Vehicle"
    IDENTITY_DOCUMENT = "identity_document", "Identity document"
    OTHER = "other", "Other"


class Evidence(models.Model):
    case = models.ForeignKey(
        "cases.Case",
        on_delete=models.CASCADE,
        related_name="evidence_items",
    )

    type = models.CharField(max_length=32, choices=EvidenceType.choices)

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_evidence",
    )

    # 1) Witness statement
    witness_transcription = models.TextField(blank=True, default="")

    # 2) Forensic
    coroner_result = models.TextField(null=True, blank=True)
    identity_db_result = models.TextField(null=True, blank=True)

    # 3) Vehicle
    vehicle_model = models.CharField(max_length=255, blank=True, default="")
    color = models.CharField(max_length=64, blank=True, default="")
    plate_number = models.CharField(max_length=64, null=True, blank=True)
    serial_number = models.CharField(max_length=64, null=True, blank=True)

    # 4) Identity document
    owner_full_name = models.CharField(max_length=255, blank=True, default="")
    extra_info = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        permissions = [
            ("fill_forensic_results", "Can fill forensic results (coroner)"),
        ]
        constraints = [
            # Enforce: NOT (plate_number AND serial_number)
            # Treat empty-string as "not set".
            models.CheckConstraint(
                name="vehicle_plate_xor_serial",
                check=~(
                    Q(plate_number__isnull=False)
                    & ~Q(plate_number="")
                    & Q(serial_number__isnull=False)
                    & ~Q(serial_number="")
                ),
            )
        ]

    def __str__(self) -> str:
        return f"{self.get_type_display()}: {self.title}"


def evidence_attachment_upload_to(instance: "EvidenceAttachment", filename: str) -> str:
    return f"evidence/{instance.evidence.case_id}/{instance.evidence_id}/{filename}"


class EvidenceAttachmentKind(models.TextChoices):
    IMAGE = "image", "Image"
    VIDEO = "video", "Video"
    AUDIO = "audio", "Audio"
    DOCUMENT = "document", "Document"


class EvidenceAttachment(models.Model):
    evidence = models.ForeignKey(
        Evidence,
        on_delete=models.CASCADE,
        related_name="attachments",
    )

    kind = models.CharField(max_length=16, choices=EvidenceAttachmentKind.choices)
    file = models.FileField(upload_to=evidence_attachment_upload_to)

    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_evidence_attachments",
    )

    def __str__(self) -> str:
        return f"{self.kind} attachment for evidence={self.evidence_id}"
