from django.db import models, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from drf_spectacular.utils import extend_schema

from investigations.models import CaseSuspect, Interrogation

from .models import Case, CaseParticipant, Complaint, ComplaintComplainant, PaymentIntent, PaymentStatus, SceneReport, Trial
from .constants import CaseStatus, ComplaintStatus, ComplaintComplainantStatus, SceneReportStatus
from .serializers import (
    CaseListSerializer,
    CaseDetailSerializer,
    CaseCreateSerializer,
    ComplaintCreateSerializer,
    ComplaintListSerializer,
    ComplaintDetailSerializer,
    ComplaintResubmitSerializer,
    CadetReviewSerializer,
    OfficerReviewSerializer,
    SceneReportCreateSerializer,
    SceneReportListSerializer,
    SceneReportDetailSerializer,
    SceneReportApproveSerializer,
    CaseReportSerializer,
    PaymentIntentSerializer,
    PaymentStartSerializer,
    TrialSerializer,
    TrialVerdictWriteSerializer,
)
from .permissions import (
    CanViewCase,
    CanCreateCase,
    CanViewComplaint,
    CanCadetReviewComplaint,
    CanOfficerReviewComplaint,
    CanCreateSceneReport,
    CanApproveSceneReport,
    CanViewSceneReport,
    CanJudgeTrial,
    CanViewCaseReport,
)


class CaseViewSet(ModelViewSet):
    permission_classes = [
        IsAuthenticated,
        CanCreateCase,
        CanViewCase,
    ]

    def get_serializer_class(self):
        if self.action == "list":
            return CaseListSerializer
        if self.action == "retrieve":
            return CaseDetailSerializer
        if self.action == "create":
            return CaseCreateSerializer
        return CaseDetailSerializer

    def get_queryset(self):
        user = self.request.user

        if user.has_perm("cases.view_all_cases"):
            return Case.objects.all()

        return Case.objects.filter(
            models.Q(created_by=user)
            | models.Q(assigned_to=user)
            | models.Q(participants__user=user)
        ).distinct()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @extend_schema(
        responses={200: CaseReportSerializer},
        description="Return nested payload for the general case report page.",
    )
    @action(
        detail=True,
        methods=["get"],
        url_path="report",
        permission_classes=[IsAuthenticated, CanViewCaseReport],
    )
    def report(self, request, pk=None):
        # For privileged roles, do not rely on the default queryset scoping (avoid 404).
        if (
            request.user.has_perm("cases.view_all_cases")
            or request.user.has_perm("cases.judge_verdict_trial")
            or request.user.has_perm("investigations.submit_captain_interrogation_decision")
            or request.user.has_perm("investigations.review_critical_interrogation")
        ):
            case = get_object_or_404(Case.objects.all(), pk=pk)
        else:
            case = get_object_or_404(self.get_queryset(), pk=pk)

        # Object-level permission check (for the action's permission_classes)
        for perm in self.get_permissions():
            if hasattr(perm, "has_object_permission") and not perm.has_object_permission(request, self, case):
                self.permission_denied(request)

        # Prefetch heavy relations used by report serializer
        case = (
            Case.objects.filter(pk=case.pk)
            .select_related("created_by", "assigned_to")
            .prefetch_related(
                "participants__user",
                "evidence_items__attachments",
                "suspects__trials",
            )
            .first()
        )

        return Response(CaseReportSerializer(case, context={"request": request}).data, status=status.HTTP_200_OK)


class TrialVerdictView(APIView):
    """Judge creates/updates verdict for a suspect trial in a case."""

    permission_classes = [IsAuthenticated, CanJudgeTrial]

    @extend_schema(
        request=TrialVerdictWriteSerializer,
        responses={200: TrialSerializer},
        description=(
            "Create/update the judge verdict for a (case, suspect) trial.\n\n"
            "Guards:\n"
            "- Captain decision must be present and True.\n"
            "- For CRITICAL cases, chief_decision must be True.\n"
        ),
    )
    def post(self, request, case_id: int, suspect_id: int):
        case = get_object_or_404(Case, id=case_id)
        suspect = get_object_or_404(CaseSuspect, id=suspect_id, case=case)

        interrogation = getattr(suspect, "interrogation", None)
        if interrogation is None:
            return Response(
                {"detail": "Interrogation record is required before trial.", "code": "missing_interrogation"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if interrogation.captain_final_decision is not True:
            return Response(
                {"detail": "Captain approval is required before trial.", "code": "captain_approval_required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if case.crime_level == "critical" and interrogation.chief_decision is not True:
            return Response(
                {"detail": "Chief approval is required for critical cases before trial.", "code": "chief_approval_required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TrialVerdictWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        trial, created = Trial.objects.get_or_create(
            case=case,
            suspect=suspect,
            defaults={"created_by": request.user},
        )

        trial.verdict = serializer.validated_data["verdict"]
        trial.punishment_title = serializer.validated_data.get("punishment_title", "")
        trial.punishment_description = serializer.validated_data.get("punishment_description", "")
        trial.verdict_by = request.user
        trial.verdict_at = timezone.now()
        trial.save(
            update_fields=[
                "verdict",
                "punishment_title",
                "punishment_description",
                "verdict_by",
                "verdict_at",
                "updated_at",
            ]
        )

        return Response(TrialSerializer(trial).data, status=status.HTTP_200_OK)


class PaymentStartView(APIView):
    """Start a mock payment and return a simulation URL."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=PaymentStartSerializer,
        responses={200: PaymentIntentSerializer},
        description=(
            "Create a PaymentIntent and return a URL to simulate payment in development.\n\n"
            "The returned `payment_url` can be opened in a browser to mark the payment as succeeded or failed."
        ),
    )
    def post(self, request):
        serializer = PaymentStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        case = None
        suspect = None
        case_id = serializer.validated_data.get("case_id")
        suspect_id = serializer.validated_data.get("suspect_id")

        if case_id:
            case = get_object_or_404(Case, id=case_id)
        if suspect_id:
            suspect = get_object_or_404(CaseSuspect, id=suspect_id)

        intent = PaymentIntent.objects.create(
            user=request.user,
            case=case,
            suspect=suspect,
            amount=serializer.validated_data["amount"],
            status=PaymentStatus.PENDING,
        )

        payment_url = request.build_absolute_uri(f"/payments/simulate/{intent.id}/")
        data = PaymentIntentSerializer(intent, context={"request": request}).data
        data["payment_url"] = payment_url
        return Response(data, status=status.HTTP_200_OK)


def payment_simulate_view(request, payment_id: int):
    """Minimal HTML view to simulate payment success/failure in dev.

    Usage:
    - Open the URL from `payment_url` (defaults to success).
    - Optional query param `?success=0` to mark as failed.
    """

    intent = get_object_or_404(PaymentIntent, id=payment_id)

    success_param = request.GET.get("success", "1")
    success = success_param not in {"0", "false", "False"}

    intent.status = PaymentStatus.SUCCEEDED if success else PaymentStatus.FAILED
    intent.save(update_fields=["status", "updated_at"])

    context = {
        "payment": intent,
        "success": success,
    }
    return render(request, "payments/result.html", context)


class ComplaintViewSet(viewsets.ModelViewSet):
    queryset = Complaint.objects.all().order_by("-submitted_at")
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()

        if (
                user.has_perm("cases.view_all_complaints")
                or user.has_perm("cases.cadet_review_complaint")
                or user.has_perm("cases.officer_review_complaint")
        ):
            return qs

        return qs.filter(
            Q(created_by=user) | Q(complainants__user=user)
        ).distinct()

    def get_serializer_class(self):
        if self.action == "create":
            return ComplaintCreateSerializer
        if self.action in ["list"]:
            return ComplaintListSerializer
        if self.action in ["retrieve"]:
            return ComplaintDetailSerializer
        if self.action == "resubmit":
            return ComplaintResubmitSerializer
        if self.action == "cadet_review":
            return CadetReviewSerializer
        if self.action == "officer_review":
            return OfficerReviewSerializer
        return ComplaintDetailSerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve", "create", "resubmit"]:
            return [IsAuthenticated()]
        if self.action == "cadet_review":
            return [IsAuthenticated(), CanCadetReviewComplaint()]
        if self.action == "officer_review":
            return [IsAuthenticated(), CanOfficerReviewComplaint()]
        return [IsAuthenticated()]

    def retrieve(self, request, *args, **kwargs):
        obj = self.get_object()
        self.check_object_permissions(request, obj)  # will be enforced by CanViewComplaint if set as object permission
        return super().retrieve(request, *args, **kwargs)

    def get_object(self):
        obj = super().get_object()
        # Object-level check
        if self.action in ["retrieve", "resubmit", "cadet_review", "officer_review"]:
            CanViewComplaint().has_object_permission(self.request, self, obj) or self.permission_denied(self.request)
        return obj

    @extend_schema(request=ComplaintResubmitSerializer, responses={200: ComplaintDetailSerializer})
    @action(detail=True, methods=["patch"], url_path="resubmit")
    def resubmit(self, request, pk=None):
        complaint = self.get_object()

        if complaint.current_status != ComplaintStatus.CADET_REJECTED:
            return Response(
                {"detail": "Resubmit is only allowed after cadet rejection.", "code": "invalid_state"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if complaint.current_status == ComplaintStatus.INVALID or complaint.invalid_attempts >= 3:
            return Response(
                {"detail": "This complaint is invalid and cannot be resubmitted.", "code": "complaint_invalid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Update fields (optional)
        for field in ["title", "description", "crime_level"]:
            if field in serializer.validated_data:
                setattr(complaint, field, serializer.validated_data[field])

        complaint.invalid_attempts += 1

        if complaint.invalid_attempts >= 3:
            complaint.current_status = ComplaintStatus.INVALID
        else:
            complaint.current_status = ComplaintStatus.SUBMITTED
            complaint.cadet_message = ""  # clear old rejection message

        complaint.updated_at = timezone.now()
        complaint.save()

        return Response(ComplaintDetailSerializer(complaint).data, status=status.HTTP_200_OK)

    @extend_schema(request=CadetReviewSerializer, responses={200: ComplaintDetailSerializer})
    @action(detail=True, methods=["post"], url_path="cadet-review")
    def cadet_review(self, request, pk=None):
        complaint = self.get_object()

        if complaint.current_status not in [ComplaintStatus.SUBMITTED, ComplaintStatus.OFFICER_REJECTED]:
            return Response(
                {"detail": "Cadet review is only allowed for submitted or officer-rejected complaints.", "code": "invalid_state"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if complaint.current_status == ComplaintStatus.INVALID:
            return Response(
                {"detail": "This complaint is invalid.", "code": "complaint_invalid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        decision = serializer.validated_data["decision"]
        message = serializer.validated_data.get("message", "").strip()

        with transaction.atomic():
            complaint.cadet_reviewed_by = request.user
            complaint.cadet_reviewed_at = timezone.now()

            # Optional complainant approvals/rejections
            approve_ids = set(serializer.validated_data.get("approve_complainant_ids", []))
            reject_ids = set(serializer.validated_data.get("reject_complainant_ids", []))

            if approve_ids or reject_ids:
                for cc in ComplaintComplainant.objects.select_for_update().filter(complaint=complaint):
                    if cc.user_id in approve_ids:
                        cc.status = ComplaintComplainantStatus.APPROVED
                        cc.cadet_reviewed_by = request.user
                        cc.cadet_reviewed_at = timezone.now()
                        cc.save()
                    if cc.user_id in reject_ids:
                        cc.status = ComplaintComplainantStatus.REJECTED
                        cc.cadet_reviewed_by = request.user
                        cc.cadet_reviewed_at = timezone.now()
                        cc.save()

            if decision == "reject":
                complaint.current_status = ComplaintStatus.CADET_REJECTED
                complaint.cadet_message = message
            else:
                complaint.current_status = ComplaintStatus.CADET_APPROVED
                complaint.cadet_message = ""

            complaint.updated_at = timezone.now()
            complaint.save()

        return Response(ComplaintDetailSerializer(complaint).data, status=status.HTTP_200_OK)

    @extend_schema(request=OfficerReviewSerializer, responses={200: ComplaintDetailSerializer})
    @action(detail=True, methods=["post"], url_path="officer-review")
    def officer_review(self, request, pk=None):
        complaint = self.get_object()

        if complaint.current_status != ComplaintStatus.CADET_APPROVED:
            return Response(
                {"detail": "Officer review is only allowed after cadet approval.", "code": "invalid_state"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if complaint.current_status == ComplaintStatus.INVALID:
            return Response(
                {"detail": "This complaint is invalid.", "code": "complaint_invalid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        decision = serializer.validated_data["decision"]
        message = serializer.validated_data.get("message", "").strip()

        with transaction.atomic():
            complaint.officer_reviewed_by = request.user
            complaint.officer_reviewed_at = timezone.now()

            if decision == "reject":
                complaint.current_status = ComplaintStatus.OFFICER_REJECTED
                complaint.officer_message = message
                complaint.updated_at = timezone.now()
                complaint.save()
                return Response(ComplaintDetailSerializer(complaint).data, status=status.HTTP_200_OK)

            # Approve => create/activate case
            complaint.current_status = ComplaintStatus.OFFICER_APPROVED
            complaint.officer_message = ""
            complaint.updated_at = timezone.now()

            # Create Case if not exists
            if complaint.case_id is None:
                case = Case.objects.create(
                    title=complaint.title,
                    description=complaint.description,
                    crime_level=complaint.crime_level,
                    status=CaseStatus.ACTIVE,
                    formed_at=timezone.now(),
                    created_by=complaint.created_by,
                )
                complaint.case = case

                # Create participants for APPROVED complainants
                approved = ComplaintComplainant.objects.filter(
                    complaint=complaint, status=ComplaintComplainantStatus.APPROVED
                )
                for cc in approved:
                    CaseParticipant.objects.get_or_create(case=case, user=cc.user)

            complaint.save()

        return Response(ComplaintDetailSerializer(complaint).data, status=status.HTTP_200_OK)


class SceneReportViewSet(ModelViewSet):
    queryset = SceneReport.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=SceneReportCreateSerializer,
        responses={201: SceneReportDetailSerializer},
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)  # this is SceneReportCreateSerializer
        serializer.is_valid(raise_exception=True)
        scene_report = serializer.save()

        # Return a representation serializer, not the input serializer
        output = SceneReportDetailSerializer(scene_report, context={"request": request}).data
        return Response(output, status=status.HTTP_201_CREATED)

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()

        if user.has_perm("cases.view_all_scene_reports") or user.has_perm("cases.approve_scene_report"):
            return qs

        return qs.filter(created_by=user)

    def get_permissions(self):
        if self.action == "create":
            return [IsAuthenticated(), CanCreateSceneReport()]
        if self.action == "approve":
            return [IsAuthenticated(), CanApproveSceneReport()]
        if self.action in ["retrieve"]:
            return [IsAuthenticated(), CanViewSceneReport()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == "create":
            return SceneReportCreateSerializer
        if self.action == "list":
            return SceneReportListSerializer
        if self.action == "retrieve":
            return SceneReportDetailSerializer
        if self.action == "approve":
            return SceneReportApproveSerializer
        return SceneReportDetailSerializer

    @extend_schema(
        request=SceneReportApproveSerializer,
        responses={200: SceneReportDetailSerializer},
        description="Approve a pending scene report (superior approval).",
    )
    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        scene_report = self.get_object()

        if scene_report.status == SceneReportStatus.APPROVED:
            return Response(
                {"detail": "Scene report is already approved.", "code": "already_approved"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # approve
        scene_report.status = SceneReportStatus.APPROVED
        scene_report.approved_by = request.user
        scene_report.approved_at = timezone.now()
        scene_report.save(update_fields=["status", "approved_by", "approved_at"])

        # activate case
        case = scene_report.case
        case.status = CaseStatus.ACTIVE
        case.formed_at = timezone.now()
        case.save(update_fields=["status", "formed_at"])

        return Response(SceneReportDetailSerializer(scene_report).data, status=status.HTTP_200_OK)
