from django.conf import settings
from django.db import models
from .constants import CrimeLevel, CaseStatus

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
