from django.db import models


class CrimeLevel(models.TextChoices):
    CRITICAL = "critical", "Critical"
    LEVEL_1 = "level_1", "Level 1"
    LEVEL_2 = "level_2", "Level 2"
    LEVEL_3 = "level_3", "Level 3"


CRIME_LEVEL_DEGREE = {
    CrimeLevel.LEVEL_3: 1,
    CrimeLevel.LEVEL_2: 2,
    CrimeLevel.LEVEL_1: 3,
    CrimeLevel.CRITICAL: 4,
}


class CaseStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    ACTIVE = "active", "Active"
    CLOSED = "closed", "Closed"


class ComplaintStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SUBMITTED = "submitted", "Submitted"
    CADET_REJECTED = "cadet_rejected", "Cadet Rejected"
    CADET_APPROVED = "cadet_approved", "Cadet Approved"
    OFFICER_REJECTED = "officer_rejected", "Officer Rejected"
    OFFICER_APPROVED = "officer_approved", "Officer Approved"
    INVALID = "invalid", "Invalid"


class ComplaintComplainantStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class SceneReportStatus(models.TextChoices):
    PENDING = "pending", "Pending Approval"
    APPROVED = "approved", "Approved"
