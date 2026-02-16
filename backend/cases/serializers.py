from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from .models import Case, Complaint, ComplaintComplainant, SceneReport, SceneWitness
from .constants import CaseStatus, CrimeLevel, ComplaintStatus, ComplaintComplainantStatus, SceneReportStatus

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


class SceneWitnessSerializer(serializers.ModelSerializer):
    class Meta:
        model = SceneWitness
        fields = ["phone", "national_id"]


class SceneReportCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    description = serializers.CharField()
    crime_level = serializers.ChoiceField(choices=CrimeLevel.choices)

    scene_datetime = serializers.DateTimeField()

    witnesses = SceneWitnessSerializer(many=True, required=False)

    def create(self, validated_data):
        request = self.context["request"]
        user = request.user

        witnesses_data = validated_data.pop("witnesses", [])

        # Create draft case
        case = Case.objects.create(
            title=validated_data["title"],
            description=validated_data["description"],
            crime_level=validated_data["crime_level"],
            status=CaseStatus.DRAFT,
            created_by=user,
        )

        scene_report = SceneReport.objects.create(
            case=case,
            scene_datetime=validated_data["scene_datetime"],
            created_by=user,
            status=SceneReportStatus.PENDING,
        )

        for w in witnesses_data:
            SceneWitness.objects.create(scene_report=scene_report, **w)

        # Chief bypass (permission)
        if user.has_perm("cases.auto_approve_scene_report"):
            scene_report.status = SceneReportStatus.APPROVED
            scene_report.approved_by = user
            scene_report.approved_at = timezone.now()
            scene_report.save(update_fields=["status", "approved_by", "approved_at"])

            case.status = CaseStatus.ACTIVE
            case.formed_at = timezone.now()
            case.save(update_fields=["status", "formed_at"])

        return scene_report


class SceneReportListSerializer(serializers.ModelSerializer):
    case_id = serializers.IntegerField(source="case.id", read_only=True)

    class Meta:
        model = SceneReport
        fields = ["id", "case_id", "scene_datetime", "status", "created_by", "created_at", "approved_by", "approved_at"]


class SceneReportDetailSerializer(serializers.ModelSerializer):
    case = CaseDetailSerializer(read_only=True)
    witnesses = SceneWitnessSerializer(many=True, read_only=True)

    class Meta:
        model = SceneReport
        fields = [
            "id",
            "case",
            "scene_datetime",
            "status",
            "created_by",
            "created_at",
            "approved_by",
            "approved_at",
            "witnesses",
        ]


class SceneReportApproveSerializer(serializers.Serializer):
    """
    Approve endpoint does not require a body.
    Kept for swagger consistency.
    """
    pass
