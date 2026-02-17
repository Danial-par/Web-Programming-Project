from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import serializers

from cases.models import Case
from .models import (
    Evidence,
    EvidenceAttachment,
    EvidenceAttachmentKind,
    EvidenceType,
)
from .permissions import user_can_access_case


User = get_user_model()


class EvidenceAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvidenceAttachment
        fields = ["id", "kind", "file", "uploaded_at", "uploaded_by"]
        read_only_fields = fields


class EvidenceSerializer(serializers.ModelSerializer):
    attachments = EvidenceAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Evidence
        fields = [
            "id",
            "case",
            "type",
            "title",
            "description",
            "created_at",
            "created_by",
            # Witness
            "witness_transcription",
            # Forensic
            "coroner_result",
            "identity_db_result",
            # Vehicle
            "vehicle_model",
            "color",
            "plate_number",
            "serial_number",
            # Identity document
            "owner_full_name",
            "extra_info",
            # Attachments
            "attachments",
        ]
        read_only_fields = fields


class EvidenceWriteSerializer(serializers.ModelSerializer):
    """Serializer used for create/update.

    - Accepts `files[]` and `kinds[]` arrays (multipart friendly).
    - Prevents updating forensic result fields through normal CRUD.
    """

    files = serializers.ListField(
        child=serializers.FileField(),
        required=False,
        allow_empty=True,
        write_only=True,
    )
    kinds = serializers.ListField(
        child=serializers.ChoiceField(choices=EvidenceAttachmentKind.choices),
        required=False,
        allow_empty=True,
        write_only=True,
    )

    class Meta:
        model = Evidence
        fields = [
            "id",
            "case",
            "type",
            "title",
            "description",
            # Witness
            "witness_transcription",
            # Forensic (write-protected)
            "coroner_result",
            "identity_db_result",
            # Vehicle
            "vehicle_model",
            "color",
            "plate_number",
            "serial_number",
            # Identity document
            "owner_full_name",
            "extra_info",
            # Attachments
            "files",
            "kinds",
        ]
        read_only_fields = [
            "id",
            "coroner_result",
            "identity_db_result",
        ]

    def validate_case(self, case: Case):
        user = self.context["request"].user
        if not user_can_access_case(user, case):
            raise serializers.ValidationError("You do not have access to this case.")
        return case

    def validate(self, attrs):
        evidence_type = attrs.get("type") or getattr(self.instance, "type", None)
        instance = self.instance

        # Normalize empty strings to None for the XOR constraint
        plate = (attrs.get("plate_number") or "").strip()
        serial = (attrs.get("serial_number") or "").strip()
        if "plate_number" in attrs and plate == "":
            attrs["plate_number"] = None
        if "serial_number" in attrs and serial == "":
            attrs["serial_number"] = None

        # Attachment inputs
        files = attrs.get("files", None)
        kinds = attrs.get("kinds", None)

        if files is not None or kinds is not None:
            files = files or []
            kinds = kinds or []
            if len(files) != len(kinds):
                raise serializers.ValidationError(
                    {"kinds": "kinds[] must have the same length as files[]."}
                )

        # Type-specific validation
        if evidence_type == EvidenceType.WITNESS_STATEMENT:
            transcription = (
                (attrs.get("witness_transcription") if "witness_transcription" in attrs else getattr(instance, "witness_transcription", ""))
                or ""
            ).strip()
            if not transcription:
                raise serializers.ValidationError(
                    {"witness_transcription": "This field is required for witness statements."}
                )

            # Witness can attach only media types (image/video/audio)
            if kinds is not None:
                allowed = {
                    EvidenceAttachmentKind.IMAGE,
                    EvidenceAttachmentKind.VIDEO,
                    EvidenceAttachmentKind.AUDIO,
                }
                bad = [k for k in kinds if k not in allowed]
                if bad:
                    raise serializers.ValidationError(
                        {"kinds": f"Witness statement supports only: {sorted(allowed)}."}
                    )

        elif evidence_type == EvidenceType.FORENSIC:
            # Forensic requires one-or-more images (enforced on create)
            if self.instance is None:
                if not files or not kinds:
                    raise serializers.ValidationError(
                        {"files": "Forensic evidence requires one or more image files."}
                    )
                if any(k != EvidenceAttachmentKind.IMAGE for k in kinds):
                    raise serializers.ValidationError(
                        {"kinds": "Forensic evidence attachments must all be kind=image."}
                    )

        elif evidence_type == EvidenceType.VEHICLE:
            vehicle_model = (
                (attrs.get("vehicle_model") if "vehicle_model" in attrs else getattr(instance, "vehicle_model", ""))
                or ""
            ).strip()
            color = (
                (attrs.get("color") if "color" in attrs else getattr(instance, "color", ""))
                or ""
            ).strip()

            if not vehicle_model:
                raise serializers.ValidationError({"vehicle_model": "This field is required for vehicle evidence."})
            if not color:
                raise serializers.ValidationError({"color": "This field is required for vehicle evidence."})

            plate_val = attrs.get("plate_number") if "plate_number" in attrs else getattr(instance, "plate_number", None)
            serial_val = attrs.get("serial_number") if "serial_number" in attrs else getattr(instance, "serial_number", None)
            if plate_val and serial_val:
                raise serializers.ValidationError(
                    {"non_field_errors": "Provide either plate_number or serial_number, not both."}
                )

        elif evidence_type == EvidenceType.IDENTITY_DOCUMENT:
            owner = (
                (attrs.get("owner_full_name") if "owner_full_name" in attrs else getattr(instance, "owner_full_name", ""))
                or ""
            ).strip()
            if not owner:
                raise serializers.ValidationError({"owner_full_name": "This field is required for identity documents."})

            extra_info = attrs.get("extra_info")
            if extra_info is not None and not isinstance(extra_info, dict):
                raise serializers.ValidationError({"extra_info": "Must be an object (JSON map)."})

        elif evidence_type == EvidenceType.OTHER:
            pass

        return attrs

    def _create_attachments(self, evidence: Evidence, files, kinds):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        for file_obj, kind in zip(files, kinds):
            EvidenceAttachment.objects.create(
                evidence=evidence,
                kind=kind,
                file=file_obj,
                uploaded_by=user if user and user.is_authenticated else None,
            )

    def create(self, validated_data):
        files = validated_data.pop("files", [])
        kinds = validated_data.pop("kinds", [])

        evidence = Evidence.objects.create(**validated_data)
        if files and kinds:
            self._create_attachments(evidence, files, kinds)
        return evidence

    def update(self, instance, validated_data):
        files = validated_data.pop("files", [])
        kinds = validated_data.pop("kinds", [])

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if files and kinds:
            self._create_attachments(instance, files, kinds)

        return instance


class ForensicResultUpdateSerializer(serializers.Serializer):
    coroner_result = serializers.CharField(required=False, allow_blank=False, allow_null=True)
    identity_db_result = serializers.CharField(required=False, allow_blank=False, allow_null=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide at least one field to update.")
        return attrs
