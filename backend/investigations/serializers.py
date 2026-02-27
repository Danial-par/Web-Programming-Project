from __future__ import annotations

from django.db import transaction
from rest_framework import serializers

from evidence.models import Evidence
from cases.constants import CRIME_LEVEL_DEGREE

from .models import (
    BoardConnection,
    BoardItem,
    BoardItemKind,
    DetectiveBoard,
    CaseSuspect,
    CaseSuspectStatus,
    Interrogation,
    Notification,
    Reward,
    Tip,
    TipStatus,
)


class PositionSerializer(serializers.Serializer):
    x = serializers.FloatField()
    y = serializers.FloatField()


class EvidenceBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Evidence
        fields = ["id", "type", "title"]
        read_only_fields = fields


class BoardItemSerializer(serializers.ModelSerializer):
    position = serializers.SerializerMethodField()
    evidence = EvidenceBriefSerializer(read_only=True)

    class Meta:
        model = BoardItem
        fields = [
            "id",
            "kind",
            "evidence",
            "note_text",
            "position",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_position(self, obj: BoardItem):
        return {"x": obj.position_x, "y": obj.position_y}


class BoardItemCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=BoardItemKind.choices)
    evidence_id = serializers.IntegerField(required=False, allow_null=True)
    note_text = serializers.CharField(required=False, allow_blank=True)
    position = PositionSerializer()

    def validate(self, attrs):
        kind = attrs.get("kind")
        evidence_id = attrs.get("evidence_id")
        note_text = (attrs.get("note_text") or "").strip()

        if kind == BoardItemKind.EVIDENCE:
            if not evidence_id:
                raise serializers.ValidationError({"evidence_id": "This field is required when kind=evidence."})
            if note_text:
                raise serializers.ValidationError({"note_text": "Must be empty when kind=evidence."})
        elif kind == BoardItemKind.NOTE:
            if evidence_id:
                raise serializers.ValidationError({"evidence_id": "Must be empty when kind=note."})
            if not note_text:
                raise serializers.ValidationError({"note_text": "This field is required when kind=note."})

        # If evidence is referenced, ensure it belongs to the same case.
        case = self.context.get("case")
        if kind == BoardItemKind.EVIDENCE and case is not None:
            if not Evidence.objects.filter(id=evidence_id, case_id=case.id).exists():
                raise serializers.ValidationError({"evidence_id": "Evidence does not belong to this case."})

        attrs["note_text"] = note_text
        return attrs


class BoardItemMoveSerializer(serializers.Serializer):
    position = PositionSerializer()


class BoardConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardConnection
        fields = ["id", "from_item", "to_item", "created_at"]
        read_only_fields = fields


class BoardConnectionCreateSerializer(serializers.Serializer):
    from_item = serializers.IntegerField()
    to_item = serializers.IntegerField()

    def validate(self, attrs):
        if attrs["from_item"] == attrs["to_item"]:
            raise serializers.ValidationError({"non_field_errors": "Cannot connect an item to itself."})

        case = self.context.get("case")
        if case is None:
            return attrs

        # Ensure both items exist and belong to the board of this case.
        qs = BoardItem.objects.filter(board__case_id=case.id)
        if not qs.filter(id=attrs["from_item"]).exists():
            raise serializers.ValidationError({"from_item": "Item not found in this case board."})
        if not qs.filter(id=attrs["to_item"]).exists():
            raise serializers.ValidationError({"to_item": "Item not found in this case board."})

        return attrs


class BoardStateSerializer(serializers.ModelSerializer):
    items = BoardItemSerializer(many=True, read_only=True)
    connections = BoardConnectionSerializer(many=True, read_only=True)

    class Meta:
        model = DetectiveBoard
        fields = ["id", "case", "items", "connections", "created_at", "updated_at"]
        read_only_fields = fields


class ConnectionByIndexSerializer(serializers.Serializer):
    from_index = serializers.IntegerField(min_value=0)
    to_index = serializers.IntegerField(min_value=0)


class BoardStateWriteSerializer(serializers.Serializer):
    """Bulk replace board state.

    Notes:
    - This replaces ALL items + connections.
    - Connections reference items by their index in the `items` array.

    This keeps the endpoint simple and avoids relying on client-generated IDs.
    """

    items = BoardItemCreateSerializer(many=True)
    connections = ConnectionByIndexSerializer(many=True, required=False)

    def validate(self, attrs):
        items = attrs.get("items") or []
        conns = attrs.get("connections") or []
        max_index = len(items) - 1

        for c in conns:
            if c["from_index"] > max_index or c["to_index"] > max_index:
                raise serializers.ValidationError(
                    {"connections": "Connection indices must refer to existing items."}
                )
            if c["from_index"] == c["to_index"]:
                raise serializers.ValidationError(
                    {"connections": "Cannot connect an item to itself."}
                )

        return attrs

    @transaction.atomic
    def replace_board_state(self, board: DetectiveBoard):
        """Replace items+connections on the given board."""

        # Deleting items cascades connections.
        board.items.all().delete()

        created_items: list[BoardItem] = []

        case = self.context.get("case")

        for item_data in self.validated_data.get("items", []):
            kind = item_data["kind"]
            pos = item_data["position"]

            evidence = None
            note_text = item_data.get("note_text", "")
            if kind == BoardItemKind.EVIDENCE:
                evidence_id = item_data.get("evidence_id")
                evidence = Evidence.objects.get(id=evidence_id, case_id=case.id) if case else Evidence.objects.get(id=evidence_id)
                note_text = ""

            obj = BoardItem.objects.create(
                board=board,
                kind=kind,
                evidence=evidence,
                note_text=note_text,
                position_x=pos["x"],
                position_y=pos["y"],
            )
            created_items.append(obj)

        # Create connections
        for c in self.validated_data.get("connections", []):
            a = created_items[c["from_index"]]
            b = created_items[c["to_index"]]

            # Normalize edge ordering to avoid duplicates (A-B == B-A)
            from_item, to_item = (a, b) if a.id < b.id else (b, a)

            BoardConnection.objects.get_or_create(
                board=board,
                from_item=from_item,
                to_item=to_item,
            )

        return board


class NotificationSerializer(serializers.ModelSerializer):
    case_title = serializers.CharField(source="case.title", read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "case", "case_title", "message", "created_at", "read_at"]
        read_only_fields = fields


class CaseSuspectSerializer(serializers.ModelSerializer):
    proposed_by_username = serializers.CharField(source="proposed_by.username", read_only=True)
    reviewed_by_username = serializers.CharField(source="reviewed_by.username", read_only=True)

    class Meta:
        model = CaseSuspect
        fields = [
            "id",
            "case",
            "first_name",
            "last_name",
            "national_id",
            "phone",
            "notes",
            "photo",
            "proposed_by",
            "proposed_by_username",
            "proposed_at",
            "status",
            "sergeant_message",
            "reviewed_by",
            "reviewed_by_username",
            "reviewed_at",
        ]
        read_only_fields = fields


class CaseSuspectProposeSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    national_id = serializers.CharField(max_length=32, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        nid = (attrs.get("national_id") or "").strip()
        phone = (attrs.get("phone") or "").strip()

        if not nid and not phone:
            raise serializers.ValidationError(
                {"non_field_errors": "Provide at least one of national_id or phone."}
            )

        attrs["national_id"] = nid
        attrs["phone"] = phone
        attrs["notes"] = (attrs.get("notes") or "").strip()
        return attrs


class CaseSuspectReviewSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject"])
    message = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        decision = attrs["decision"]
        message = (attrs.get("message") or "").strip()

        if decision == "reject" and not message:
            raise serializers.ValidationError({"message": "Message is required when rejecting."})

        attrs["message"] = message
        return attrs


class InterrogationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Interrogation
        fields = [
            "id",
            "suspect",
            "detective_score",
            "detective_submitted_by",
            "detective_submitted_at",
            "sergeant_score",
            "sergeant_submitted_by",
            "sergeant_submitted_at",
            "captain_final_decision",
            "captain_reasoning",
            "captain_decided_by",
            "captain_decided_at",
            "chief_decision",
            "chief_message",
            "chief_reviewed_by",
            "chief_reviewed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class DetectiveInterrogationSubmitSerializer(serializers.Serializer):
    detective_score = serializers.IntegerField(min_value=1, max_value=10)


class SergeantInterrogationSubmitSerializer(serializers.Serializer):
    sergeant_score = serializers.IntegerField(min_value=1, max_value=10)


class CaptainDecisionSubmitSerializer(serializers.Serializer):
    captain_final_decision = serializers.BooleanField()
    captain_reasoning = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        reasoning = (attrs.get("captain_reasoning") or "").strip()
        attrs["captain_reasoning"] = reasoning
        return attrs


class ChiefReviewSubmitSerializer(serializers.Serializer):
    chief_decision = serializers.BooleanField()
    chief_message = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        decision = attrs.get("chief_decision")
        msg = (attrs.get("chief_message") or "").strip()
        if decision is False and not msg:
            raise serializers.ValidationError({"chief_message": "Message is required when rejecting."})
        attrs["chief_message"] = msg
        return attrs


class MostWantedSuspectSerializer(serializers.Serializer):
    suspect_id = serializers.IntegerField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    national_id = serializers.CharField(allow_blank=True)
    phone = serializers.CharField(allow_blank=True)
    photo = serializers.ImageField(allow_null=True)
    max_days_wanted = serializers.IntegerField()
    max_crime_degree = serializers.IntegerField()
    ranking = serializers.IntegerField()
    reward_amount = serializers.IntegerField()


class TipRewardSerializer(serializers.ModelSerializer):
    """Minimal reward info returned to the tip submitter after approval."""
    class Meta:
        model = Reward
        fields = ["reward_code", "reward_amount", "created_at"]
        read_only_fields = fields


class TipSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tip
        fields = [
            "id",
            "user",
            "case",
            "suspect",
            "details",
            "status",
            "reward",
            "officer_message",
            "officer_reviewed_by",
            "officer_reviewed_at",
            "detective_message",
            "detective_reviewed_by",
            "detective_reviewed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class TipCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tip
        fields = ["case", "suspect", "details"]

    def validate(self, attrs):
        case = attrs.get("case")
        suspect = attrs.get("suspect")
        if not case and not suspect:
            raise serializers.ValidationError(
                {"non_field_errors": "Tip must reference at least a case or a suspect."}
            )
        if suspect and case and suspect.case_id != case.id:
            raise serializers.ValidationError(
                {"non_field_errors": "Suspect does not belong to the given case."}
            )
        attrs["details"] = (attrs.get("details") or "").strip()
        return attrs


class TipOfficerReviewSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["reject", "forward"])
    message = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        decision = attrs["decision"]
        message = (attrs.get("message") or "").strip()
        if decision == "reject" and not message:
            raise serializers.ValidationError({"message": "Message is required when rejecting."})
        attrs["message"] = message
        return attrs


class TipDetectiveReviewSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject"])
    message = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        decision = attrs["decision"]
        message = (attrs.get("message") or "").strip()
        if decision == "reject" and not message:
            raise serializers.ValidationError({"message": "Message is required when rejecting."})
        attrs["message"] = message
        return attrs


class RewardLookupSerializer(serializers.Serializer):
    national_id = serializers.CharField(max_length=32)
    reward_code = serializers.CharField(max_length=64)


class RewardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reward
        fields = ["reward_code", "reward_amount", "created_at"]
        read_only_fields = fields
