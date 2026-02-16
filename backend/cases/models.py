from django.conf import settings
from django.db import models
from django.utils import timezone
from .constants import CrimeLevel, CaseStatus, ComplaintStatus, ComplaintComplainantStatus, SceneReportStatus

User = settings.AUTH_USER_MODEL


class Case(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField()

    crime_level = models.CharField(
        max_length=20,
        choices=CrimeLevel.choices
    )

    status = models.CharField(
        max_length=20,
        choices=CaseStatus.choices,
        default=CaseStatus.DRAFT
    )

    created_at = models.DateTimeField(auto_now_add=True)
    formed_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_cases"
    )

    assigned_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_cases"
    )

    class Meta:
        permissions = [
            ("view_all_cases", "Can view all cases"),
        ]

    def __str__(self):
        return self.title


class CaseParticipant(models.Model):
    case = models.ForeignKey(
        Case,
        on_delete=models.CASCADE,
        related_name="participants"
    )

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="case_participations"
    )

    is_complainant = models.BooleanField(default=True)

    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("case", "user")


class Complaint(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField()

    crime_level = models.CharField(max_length=20, choices=CrimeLevel.choices)

    current_status = models.CharField(
        max_length=32,
        choices=ComplaintStatus.choices,
        default=ComplaintStatus.SUBMITTED
    )
    invalid_attempts = models.PositiveSmallIntegerField(default=0)

    cadet_message = models.TextField(
        blank=True,
        default=""
    )
    officer_message = models.TextField(
        blank=True,
        default=""
    )

    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="complaints_created"
    )

    submitted_at = models.DateTimeField(
        auto_now_add=True
    )
    updated_at = models.DateTimeField(
        auto_now=True
    )

    cadet_reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="complaints_cadet_reviewed"
    )
    cadet_reviewed_at = models.DateTimeField(
        null=True,
        blank=True
    )

    officer_reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="complaints_officer_reviewed"
    )
    officer_reviewed_at = models.DateTimeField(
        null=True,
        blank=True
    )

    # Link created upon officer approval
    case = models.OneToOneField(
        "cases.Case",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="complaint"
    )

    class Meta:
        permissions = [
            ("view_all_complaints", "Can view all complaints"),
            ("cadet_review_complaint", "Can cadet review complaints"),
            ("officer_review_complaint", "Can officer review complaints"),
        ]

    def mark_invalid(self):
        self.current_status = ComplaintStatus.INVALID
        self.save(update_fields=["current_status", "updated_at"])


class ComplaintComplainant(models.Model):
    complaint = models.ForeignKey(
        Complaint,
        on_delete=models.CASCADE,
        related_name="complainants"
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="complainant_entries"
    )

    status = models.CharField(
        max_length=16,
        choices=ComplaintComplainantStatus.choices,
        default=ComplaintComplainantStatus.PENDING
    )

    cadet_reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="complainant_entries_reviewed"
    )
    cadet_reviewed_at = models.DateTimeField(
        null=True,
        blank=True
    )

    class Meta:
        unique_together = ("complaint", "user")


class SceneReport(models.Model):
    case = models.OneToOneField(
        "cases.Case",
        on_delete=models.CASCADE,
        related_name="scene_report",
    )

    scene_datetime = models.DateTimeField()

    status = models.CharField(
        max_length=16,
        choices=SceneReportStatus.choices,
        default=SceneReportStatus.PENDING,
    )

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_scene_reports",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_scene_reports",
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        permissions = [
            ("view_all_scene_reports", "Can view all scene reports"),
            ("create_scene_report", "Can create scene reports"),
            ("approve_scene_report", "Can approve scene reports"),
            ("auto_approve_scene_report", "Can auto-approve scene reports (chief bypass)"),
        ]


class SceneWitness(models.Model):
    scene_report = models.ForeignKey(
        SceneReport,
        on_delete=models.CASCADE,
        related_name="witnesses",
    )
    phone = models.CharField(max_length=32)
    national_id = models.CharField(max_length=32)

    class Meta:
        unique_together = ("scene_report", "phone", "national_id")
