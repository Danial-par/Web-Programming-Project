from django.db import models, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from drf_spectacular.utils import extend_schema

from .models import Case, CaseParticipant, Complaint, ComplaintComplainant
from .constants import CaseStatus, ComplaintStatus, ComplaintComplainantStatus
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
)
from .permissions import CanViewCase, CanCreateCase, CanViewComplaint, CanCadetReviewComplaint, CanOfficerReviewComplaint


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
