from __future__ import annotations

from django.db import models
from django.db.models import Q


from django.conf import settings


class DetectiveBoard(models.Model):
    """Detective board for a Case.

    One board per case (OneToOne).
    """

    case = models.OneToOneField(
        "cases.Case",
        on_delete=models.CASCADE,
        related_name="detective_board",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"DetectiveBoard(case_id={self.case_id})"


class BoardItemKind(models.TextChoices):
    EVIDENCE = "evidence", "Evidence"
    NOTE = "note", "Note"


class BoardItem(models.Model):
    """An item pinned on a DetectiveBoard.

    Each item references either:
    - an Evidence record
    - OR a free-text note

    (mutually exclusive)
    """

    board = models.ForeignKey(
        DetectiveBoard,
        on_delete=models.CASCADE,
        related_name="items",
    )

    kind = models.CharField(max_length=16, choices=BoardItemKind.choices)

    evidence = models.ForeignKey(
        "evidence.Evidence",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="board_items",
    )

    note_text = models.TextField(blank=True, default="")

    position_x = models.FloatField(default=0.0)
    position_y = models.FloatField(default=0.0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            # Enforce: either evidence OR non-empty note_text (but not both)
            models.CheckConstraint(
                name="boarditem_evidence_xor_note",
                check=(
                    (Q(evidence__isnull=False) & Q(note_text=""))
                    | (Q(evidence__isnull=True) & ~Q(note_text=""))
                ),
            )
        ]

    def __str__(self) -> str:
        if self.kind == BoardItemKind.EVIDENCE:
            return f"BoardItem(evidence_id={self.evidence_id})"
        return f"BoardItem(note_id={self.id})"


class BoardConnection(models.Model):
    """A visual connection between two BoardItems (edge)."""

    board = models.ForeignKey(
        DetectiveBoard,
        on_delete=models.CASCADE,
        related_name="connections",
    )

    from_item = models.ForeignKey(
        BoardItem,
        on_delete=models.CASCADE,
        related_name="connections_from",
    )
    to_item = models.ForeignKey(
        BoardItem,
        on_delete=models.CASCADE,
        related_name="connections_to",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                name="boardconnection_not_self",
                check=~Q(from_item=models.F("to_item")),
            ),
            models.UniqueConstraint(
                fields=["board", "from_item", "to_item"],
                name="uniq_boardconnection_board_from_to",
            ),
        ]

    def __str__(self) -> str:
        return f"BoardConnection({self.from_item_id}->{self.to_item_id})"


class Notification(models.Model):
    """A per-user notification (scoped to a Case)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )

    case = models.ForeignKey(
        "cases.Case",
        on_delete=models.CASCADE,
        related_name="notifications",
    )

    message = models.TextField()

    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Notification(user_id={self.user_id}, case_id={self.case_id})"


class CaseSuspectStatus(models.TextChoices):
    PROPOSED = "proposed", "Proposed"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class CaseSuspect(models.Model):
    """A suspect proposed by a detective and reviewed by a sergeant."""

    case = models.ForeignKey(
        "cases.Case",
        on_delete=models.CASCADE,
        related_name="suspects",
    )

    # suspect identity fields
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    national_id = models.CharField(max_length=32, blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    proposed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="suspects_proposed",
    )
    proposed_at = models.DateTimeField(auto_now_add=True)

    status = models.CharField(
        max_length=16,
        choices=CaseSuspectStatus.choices,
        default=CaseSuspectStatus.PROPOSED,
    )

    sergeant_message = models.TextField(blank=True, default="")

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="suspects_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-proposed_at"]
        permissions = [
            ("propose_case_suspect", "Can propose a suspect for a case"),
            ("review_case_suspect", "Can review a proposed suspect for a case"),
        ]

    def __str__(self) -> str:
        return f"CaseSuspect(case_id={self.case_id}, name={self.first_name} {self.last_name})"
