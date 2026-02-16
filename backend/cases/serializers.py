from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Case, Complaint, ComplaintComplainant
from .constants import ComplaintStatus, ComplaintComplainantStatus

User = get_user_model()


class CaseListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Case
        fields = [
            "id",
            "title",
            "crime_level",
            "status",
            "created_at",
        ]


class CaseDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Case
        fields = "__all__"


class CaseCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Case
        fields = [
            "title",
            "description",
            "crime_level",
        ]


class ComplaintComplainantSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)

    class Meta:
        model = ComplaintComplainant
        fields = ["user_id", "status"]


class ComplaintCreateSerializer(serializers.ModelSerializer):
    additional_complainant_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True
    )

    class Meta:
        model = Complaint
        fields = ["id", "title", "description", "crime_level", "additional_complainant_ids"]

    def create(self, validated_data):
        additional_ids = validated_data.pop("additional_complainant_ids", [])
        user = self.context["request"].user

        complaint = Complaint.objects.create(
            created_by=user,
            current_status=ComplaintStatus.SUBMITTED,
            **validated_data
        )

        # Creator is automatically approved complainant
        ComplaintComplainant.objects.create(
            complaint=complaint,
            user=user,
            status=ComplaintComplainantStatus.APPROVED
        )

        # Additional complainants start pending
        for uid in set(additional_ids):
            if uid == user.id:
                continue
            try:
                u = User.objects.get(id=uid)
            except User.DoesNotExist:
                continue
            ComplaintComplainant.objects.get_or_create(
                complaint=complaint,
                user=u,
                defaults={"status": ComplaintComplainantStatus.PENDING},
            )

        return complaint


class ComplaintListSerializer(serializers.ModelSerializer):
    complainants = ComplaintComplainantSerializer(many=True, read_only=True)

    class Meta:
        model = Complaint
        fields = [
            "id",
            "title",
            "crime_level",
            "current_status",
            "invalid_attempts",
            "created_by",
            "submitted_at",
            "updated_at",
            "complainants",
        ]


class ComplaintDetailSerializer(serializers.ModelSerializer):
    complainants = ComplaintComplainantSerializer(many=True, read_only=True)
    case_id = serializers.IntegerField(source="case.id", read_only=True)

    class Meta:
        model = Complaint
        fields = [
            "id",
            "title",
            "description",
            "crime_level",
            "current_status",
            "invalid_attempts",
            "cadet_message",
            "officer_message",
            "created_by",
            "submitted_at",
            "updated_at",
            "cadet_reviewed_by",
            "cadet_reviewed_at",
            "officer_reviewed_by",
            "officer_reviewed_at",
            "case_id",
            "complainants",
        ]


class ComplaintResubmitSerializer(serializers.Serializer):
    # allow user to update content before resubmit (optional)
    title = serializers.CharField(required=False)
    description = serializers.CharField(required=False)
    crime_level = serializers.CharField(required=False)


class CadetReviewSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject"])
    message = serializers.CharField(required=False, allow_blank=True)
    approve_complainant_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True
    )
    reject_complainant_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True
    )

    def validate(self, attrs):
        if attrs["decision"] == "reject" and not attrs.get("message", "").strip():
            raise serializers.ValidationError({"message": "Cadet message is required on rejection."})
        return attrs


class OfficerReviewSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject"])
    message = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["decision"] == "reject" and not attrs.get("message", "").strip():
            raise serializers.ValidationError({"message": "Officer message is required on rejection."})
        return attrs