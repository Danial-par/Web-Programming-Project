from __future__ import annotations

from django.db import models
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from drf_spectacular.utils import OpenApiExample, extend_schema

from .models import Evidence, EvidenceType
from .permissions import (
    CanCreateEvidence,
    CanDeleteEvidence,
    CanFillForensicResults,
    CanUpdateEvidence,
    CanViewEvidence,
)
from .serializers import EvidenceSerializer, EvidenceWriteSerializer, ForensicResultUpdateSerializer


class EvidenceViewSet(ModelViewSet):
    """CRUD Evidence.

    Access is always scoped by the linked Case access.
    """

    queryset = Evidence.objects.all()
    permission_classes = [
        IsAuthenticated,
        CanCreateEvidence,
        CanUpdateEvidence,
        CanDeleteEvidence,
        CanViewEvidence,
    ]

    def get_queryset(self):
        user = self.request.user

        qs = (
            Evidence.objects.select_related("case", "created_by")
            .prefetch_related("attachments")
            .all()
        )

        if not user.is_authenticated:
            return qs.none()

        if user.has_perm("cases.view_all_cases"):
            filtered = qs
        else:
            filtered = qs.filter(
                models.Q(case__created_by=user)
                | models.Q(case__assigned_to=user)
                | models.Q(case__participants__user=user)
            ).distinct()

        case_id = self.request.query_params.get("case")
        if case_id:
            filtered = filtered.filter(case_id=case_id)

        return filtered

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return EvidenceWriteSerializer
        if self.action == "forensic_results":
            return ForensicResultUpdateSerializer
        return EvidenceSerializer

    def get_permissions(self):
        if self.action == "forensic_results":
            return [IsAuthenticated(), CanFillForensicResults(), CanViewEvidence()]
        return super().get_permissions()

    @extend_schema(
        request=EvidenceWriteSerializer,
        responses={201: EvidenceSerializer},
        examples=[
            OpenApiExample(
                "Witness statement",
                value={
                    "case": 1,
                    "type": EvidenceType.WITNESS_STATEMENT,
                    "title": "Witness statement: John Doe",
                    "description": "Statement taken at the scene",
                    "witness_transcription": "I saw a red car leaving the area...",
                    "kinds": ["audio", "image"],
                    "files": ["<binary>", "<binary>"],
                },
                request_only=True,
            ),
            OpenApiExample(
                "Witness statement response",
                value={
                    "id": 10,
                    "case": 1,
                    "type": EvidenceType.WITNESS_STATEMENT,
                    "title": "Witness statement: John Doe",
                    "description": "Statement taken at the scene",
                    "created_at": "2026-02-17T12:00:00Z",
                    "created_by": 5,
                    "witness_transcription": "I saw a red car leaving the area...",
                    "coroner_result": None,
                    "identity_db_result": None,
                    "vehicle_model": "",
                    "color": "",
                    "plate_number": None,
                    "serial_number": None,
                    "owner_full_name": "",
                    "extra_info": {},
                    "attachments": [
                        {
                            "id": 1,
                            "kind": "audio",
                            "file": "/media/evidence/1/10/statement.mp3",
                            "uploaded_at": "2026-02-17T12:00:00Z",
                            "uploaded_by": 5,
                        }
                    ],
                },
                response_only=True,
            ),
            OpenApiExample(
                "Forensic",
                value={
                    "case": 1,
                    "type": EvidenceType.FORENSIC,
                    "title": "Forensic photos",
                    "description": "Coroner initial images",
                    "kinds": ["image"],
                    "files": ["<binary>"],
                },
                request_only=True,
            ),
            OpenApiExample(
                "Forensic response",
                value={
                    "id": 11,
                    "case": 1,
                    "type": EvidenceType.FORENSIC,
                    "title": "Forensic photos",
                    "description": "Coroner initial images",
                    "created_at": "2026-02-17T12:05:00Z",
                    "created_by": 5,
                    "witness_transcription": "",
                    "coroner_result": None,
                    "identity_db_result": None,
                    "vehicle_model": "",
                    "color": "",
                    "plate_number": None,
                    "serial_number": None,
                    "owner_full_name": "",
                    "extra_info": {},
                    "attachments": [
                        {
                            "id": 2,
                            "kind": "image",
                            "file": "/media/evidence/1/11/photo.jpg",
                            "uploaded_at": "2026-02-17T12:05:00Z",
                            "uploaded_by": 5,
                        }
                    ],
                },
                response_only=True,
            ),
            OpenApiExample(
                "Vehicle",
                value={
                    "case": 1,
                    "type": EvidenceType.VEHICLE,
                    "title": "Suspect vehicle",
                    "description": "Seen near the crime scene",
                    "vehicle_model": "Ford Coupe",
                    "color": "Red",
                    "plate_number": "ABC-123",
                },
                request_only=True,
            ),
            OpenApiExample(
                "Vehicle response",
                value={
                    "id": 12,
                    "case": 1,
                    "type": EvidenceType.VEHICLE,
                    "title": "Suspect vehicle",
                    "description": "Seen near the crime scene",
                    "created_at": "2026-02-17T12:10:00Z",
                    "created_by": 5,
                    "witness_transcription": "",
                    "coroner_result": None,
                    "identity_db_result": None,
                    "vehicle_model": "Ford Coupe",
                    "color": "Red",
                    "plate_number": "ABC-123",
                    "serial_number": None,
                    "owner_full_name": "",
                    "extra_info": {},
                    "attachments": [],
                },
                response_only=True,
            ),
            OpenApiExample(
                "Identity document",
                value={
                    "case": 1,
                    "type": EvidenceType.IDENTITY_DOCUMENT,
                    "title": "Passport scan",
                    "description": "Recovered at the scene",
                    "owner_full_name": "Jane Roe",
                    "extra_info": {"document_number": "P1234567", "country": "US"},
                },
                request_only=True,
            ),
            OpenApiExample(
                "Identity document response",
                value={
                    "id": 13,
                    "case": 1,
                    "type": EvidenceType.IDENTITY_DOCUMENT,
                    "title": "Passport scan",
                    "description": "Recovered at the scene",
                    "created_at": "2026-02-17T12:15:00Z",
                    "created_by": 5,
                    "witness_transcription": "",
                    "coroner_result": None,
                    "identity_db_result": None,
                    "vehicle_model": "",
                    "color": "",
                    "plate_number": None,
                    "serial_number": None,
                    "owner_full_name": "Jane Roe",
                    "extra_info": {"document_number": "P1234567", "country": "US"},
                    "attachments": [],
                },
                response_only=True,
            ),
            OpenApiExample(
                "Other",
                value={
                    "case": 1,
                    "type": EvidenceType.OTHER,
                    "title": "Misc note",
                    "description": "Found in the victim's pocket",
                },
                request_only=True,
            ),
            OpenApiExample(
                "Other response",
                value={
                    "id": 14,
                    "case": 1,
                    "type": EvidenceType.OTHER,
                    "title": "Misc note",
                    "description": "Found in the victim's pocket",
                    "created_at": "2026-02-17T12:20:00Z",
                    "created_by": 5,
                    "witness_transcription": "",
                    "coroner_result": None,
                    "identity_db_result": None,
                    "vehicle_model": "",
                    "color": "",
                    "plate_number": None,
                    "serial_number": None,
                    "owner_full_name": "",
                    "extra_info": {},
                    "attachments": [],
                },
                response_only=True,
            ),
        ],
        description=(
            "Create evidence (multipart recommended for file uploads).\n\n"
            "To upload attachments, submit `files[]` and `kinds[]` arrays with equal length."
        ),
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        evidence = serializer.save(created_by=request.user)

        # Step 7: notify assigned detective (if any)
        from investigations.services import notify_assigned_detective_on_new_evidence

        notify_assigned_detective_on_new_evidence(evidence)

        output = EvidenceSerializer(evidence, context={"request": request}).data
        return Response(output, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=EvidenceWriteSerializer,
        responses={200: EvidenceSerializer},
        description="Update evidence. (Forensic results cannot be updated here; use /forensic-results/ action.)",
    )
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        evidence = serializer.save()
        output = EvidenceSerializer(evidence, context={"request": request}).data
        return Response(output, status=status.HTTP_200_OK)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    @extend_schema(
        request=ForensicResultUpdateSerializer,
        responses={200: EvidenceSerializer},
        examples=[
            OpenApiExample(
                "Coroner update",
                value={
                    "coroner_result": "Cause of death: blunt force trauma",
                    "identity_db_result": "Match found in DB: John Smith (ID: 123)",
                },
                request_only=True,
            ),
            OpenApiExample(
                "Coroner update response",
                value={
                    "id": 11,
                    "case": 1,
                    "type": EvidenceType.FORENSIC,
                    "title": "Forensic photos",
                    "description": "Coroner initial images",
                    "created_at": "2026-02-17T12:05:00Z",
                    "created_by": 5,
                    "witness_transcription": "",
                    "coroner_result": "Cause of death: blunt force trauma",
                    "identity_db_result": "Match found in DB: John Smith (ID: 123)",
                    "vehicle_model": "",
                    "color": "",
                    "plate_number": None,
                    "serial_number": None,
                    "owner_full_name": "",
                    "extra_info": {},
                    "attachments": [],
                },
                response_only=True,
            ),
        ],
        description="Coroner-only endpoint to fill forensic results.",
    )
    @action(detail=True, methods=["post"], url_path="forensic-results")
    def forensic_results(self, request, pk=None):
        evidence = self.get_object()

        if evidence.type != EvidenceType.FORENSIC:
            return Response(
                {"detail": "Forensic results can only be updated for forensic evidence.", "code": "invalid_type"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        update_fields = []
        if "coroner_result" in data:
            evidence.coroner_result = data["coroner_result"]
            update_fields.append("coroner_result")
        if "identity_db_result" in data:
            evidence.identity_db_result = data["identity_db_result"]
            update_fields.append("identity_db_result")

        evidence.save(update_fields=update_fields)

        output = EvidenceSerializer(evidence, context={"request": request}).data
        return Response(output, status=status.HTTP_200_OK)
