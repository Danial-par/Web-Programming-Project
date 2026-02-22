from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from common.role_helpers import user_can_auto_approve_scene_report
from investigations.models import CaseSuspect, Interrogation

from .models import (
    Case,
    Complaint,
    ComplaintComplainant,
    PaymentIntent,
    SceneReport,
    SceneWitness,
    Trial,
    TrialVerdict,
)
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

        # Chief bypass (permission or Chief/Admin role)
        if user_can_auto_approve_scene_report(user):
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


class TrialSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trial
        fields = [
            "id",
            "case",
            "suspect",
            "verdict",
            "punishment_title",
            "punishment_description",
            "created_at",
            "created_by",
            "verdict_at",
            "verdict_by",
            "updated_at",
        ]
        read_only_fields = fields


class TrialVerdictWriteSerializer(serializers.Serializer):
    verdict = serializers.ChoiceField(choices=TrialVerdict.choices)
    punishment_title = serializers.CharField(required=False, allow_blank=True)
    punishment_description = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        verdict = attrs.get("verdict")
        title = (attrs.get("punishment_title") or "").strip()
        desc = (attrs.get("punishment_description") or "").strip()

        if verdict == TrialVerdict.GUILTY:
            if not title:
                raise serializers.ValidationError({"punishment_title": "Required when verdict is guilty."})
            if not desc:
                raise serializers.ValidationError({"punishment_description": "Required when verdict is guilty."})
        else:
            # innocent => no punishment
            title = ""
            desc = ""

        attrs["punishment_title"] = title
        attrs["punishment_description"] = desc
        return attrs


class BasicUserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "roles"]
        read_only_fields = fields

    def get_roles(self, obj):
        return list(obj.groups.values_list("name", flat=True))


class InterrogationReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Interrogation
        fields = [
            "id",
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


class TrialReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trial
        fields = [
            "id",
            "verdict",
            "punishment_title",
            "punishment_description",
            "created_at",
            "created_by",
            "verdict_at",
            "verdict_by",
            "updated_at",
        ]
        read_only_fields = fields


class CaseSuspectReportSerializer(serializers.ModelSerializer):
    interrogation = InterrogationReportSerializer(read_only=True)
    trials = TrialReportSerializer(many=True, read_only=True)

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
            "proposed_by",
            "proposed_at",
            "status",
            "sergeant_message",
            "reviewed_by",
            "reviewed_at",
            "interrogation",
            "trials",
        ]
        read_only_fields = fields


class CaseReportSerializer(serializers.Serializer):
    """Nested payload for the general case report page."""

    def to_representation(self, instance: Case):
        # Avoid circular imports at module import time
        from evidence.serializers import EvidenceSerializer

        case_data = CaseDetailSerializer(instance, context=self.context).data

        complaint_obj = getattr(instance, "complaint", None)
        complaint_data = (
            ComplaintDetailSerializer(complaint_obj, context=self.context).data if complaint_obj else None
        )

        scene_report_obj = getattr(instance, "scene_report", None)
        scene_report_data = (
            SceneReportDetailSerializer(scene_report_obj, context=self.context).data if scene_report_obj else None
        )

        evidence_qs = instance.evidence_items.all().prefetch_related("attachments")
        evidence_data = EvidenceSerializer(evidence_qs, many=True, context=self.context).data

        suspects_qs = (
            instance.suspects.all()
            .select_related("proposed_by", "reviewed_by")
            .prefetch_related("trials")
        )
        suspects_data = CaseSuspectReportSerializer(suspects_qs, many=True, context=self.context).data

        police_involved = {
            "created_by": BasicUserSerializer(instance.created_by).data if instance.created_by else None,
            "assigned_to": BasicUserSerializer(instance.assigned_to).data if instance.assigned_to else None,
            "complaint_review": None,
            "scene_report": None,
        }

        if complaint_obj:
            police_involved["complaint_review"] = {
                "cadet_reviewed_by": BasicUserSerializer(complaint_obj.cadet_reviewed_by).data if complaint_obj.cadet_reviewed_by else None,
                "officer_reviewed_by": BasicUserSerializer(complaint_obj.officer_reviewed_by).data if complaint_obj.officer_reviewed_by else None,
                "cadet_message": complaint_obj.cadet_message,
                "officer_message": complaint_obj.officer_message,
                "current_status": complaint_obj.current_status,
            }

        if scene_report_obj:
            police_involved["scene_report"] = {
                "created_by": BasicUserSerializer(scene_report_obj.created_by).data if scene_report_obj.created_by else None,
                "approved_by": BasicUserSerializer(scene_report_obj.approved_by).data if scene_report_obj.approved_by else None,
                "status": scene_report_obj.status,
            }

        return {
            "case": case_data,
            "complaint": complaint_data,
            "scene_report": scene_report_data,
            "evidence": evidence_data,
            "suspects": suspects_data,
            "police_involved": police_involved,
        }


class PaymentIntentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentIntent
        fields = [
            "id",
            "user",
            "case",
            "suspect",
            "amount",
            "status",
            "gateway_reference",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PaymentStartSerializer(serializers.Serializer):
    amount = serializers.IntegerField(min_value=1)
    case_id = serializers.IntegerField(required=False)
    suspect_id = serializers.IntegerField(required=False)

    def validate(self, attrs):
        case_id = attrs.get("case_id")
        suspect_id = attrs.get("suspect_id")
        if not case_id and not suspect_id:
            raise serializers.ValidationError(
                {"non_field_errors": "Provide at least case_id or suspect_id for payment context."}
            )
        return attrs
