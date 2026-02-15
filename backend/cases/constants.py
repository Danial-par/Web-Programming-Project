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
