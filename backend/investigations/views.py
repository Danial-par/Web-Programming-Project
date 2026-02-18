from __future__ import annotations

from django.utils import timezone
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from drf_spectacular.utils import OpenApiExample, extend_schema

from cases.models import Case

from .models import (
    BoardConnection,
    BoardItem,
    CaseSuspect,
    CaseSuspectStatus,
    DetectiveBoard,
    Interrogation,
    Notification,
)
from .permissions import user_can_access_case, user_is_assigned_detective
from .serializers import (
    BoardConnectionCreateSerializer,
    BoardConnectionSerializer,
    BoardItemCreateSerializer,
    BoardItemMoveSerializer,
    BoardItemSerializer,
    BoardStateSerializer,
    BoardStateWriteSerializer,
    CaseSuspectProposeSerializer,
    CaseSuspectReviewSerializer,
    CaseSuspectSerializer,
    CaptainDecisionSubmitSerializer,
    ChiefReviewSubmitSerializer,
    DetectiveInterrogationSubmitSerializer,
    InterrogationSerializer,
    NotificationSerializer,
    SergeantInterrogationSubmitSerializer,
)


def _get_case_or_404_for_user(user, case_id: int) -> Case:
    """Return the case if user can access it, otherwise 404 (avoid leaking)."""
    case = get_object_or_404(Case, id=case_id)

    if not user_can_access_case(user, case):
        # 404 by design, consistent with CaseViewSet queryset scoping
        raise NotFound()

    return case


def _require_assigned_detective(user, case: Case) -> bool:
    return user_is_assigned_detective(user, case) or user.has_perm("cases.view_all_cases")


def _get_suspect_or_404(case: Case, suspect_id: int) -> CaseSuspect:
    return get_object_or_404(CaseSuspect, id=suspect_id, case=case)


def _get_or_create_interrogation(suspect: CaseSuspect) -> Interrogation:
    obj, _ = Interrogation.objects.get_or_create(suspect=suspect)
    return obj


class CaseBoardView(APIView):
    """GET/PUT detective board state for a case."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: BoardStateSerializer},
        description="Get the detective board state for a case (items + connections).",
    )
    def get(self, request, case_id: int):
        case = _get_case_or_404_for_user(request.user, case_id)
        board, _ = DetectiveBoard.objects.get_or_create(case=case)
        return Response(BoardStateSerializer(board).data, status=status.HTTP_200_OK)

    @extend_schema(
        request=BoardStateWriteSerializer,
        responses={200: BoardStateSerializer},
        description=(
            "Replace the full detective board state for a case. "
            "Connections reference items by index in the `items[]` array."
        ),
        examples=[
            OpenApiExample(
                "Replace board",
                value={
                    "items": [
                        {
                            "kind": "note",
                            "note_text": "Check alibi timeline",
                            "position": {"x": 120, "y": 80},
                        },
                        {
                            "kind": "evidence",
                            "evidence_id": 10,
                            "note_text": "",
                            "position": {"x": 320, "y": 140},
                        },
                    ],
                    "connections": [
                        {"from_index": 0, "to_index": 1}
                    ],
                },
                request_only=True,
            )
        ],
    )
    def put(self, request, case_id: int):
        case = _get_case_or_404_for_user(request.user, case_id)

        if not _require_assigned_detective(request.user, case):
            return Response(
                {"detail": "Only the assigned detective can update the board.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not request.user.has_perm("investigations.change_detectiveboard"):
            return Response(
                {"detail": "Missing permission: investigations.change_detectiveboard", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        board, _ = DetectiveBoard.objects.get_or_create(case=case)

        serializer = BoardStateWriteSerializer(data=request.data, context={"case": case})
        serializer.is_valid(raise_exception=True)

        serializer.replace_board_state(board)

        board.refresh_from_db()
        return Response(BoardStateSerializer(board).data, status=status.HTTP_200_OK)


class CaseBoardItemCreateView(APIView):
    """POST a new board item (note or evidence)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=BoardItemCreateSerializer,
        responses={201: BoardItemSerializer},
        description="Create a new board item for the given case.",
        examples=[
            OpenApiExample(
                "Create note",
                value={
                    "kind": "note",
                    "note_text": "Need to interview the bartender",
                    "position": {"x": 100, "y": 200},
                },
                request_only=True,
            ),
            OpenApiExample(
                "Create evidence item",
                value={
                    "kind": "evidence",
                    "evidence_id": 12,
                    "note_text": "",
                    "position": {"x": 400, "y": 300},
                },
                request_only=True,
            ),
        ],
    )
    def post(self, request, case_id: int):
        case = _get_case_or_404_for_user(request.user, case_id)

        if not _require_assigned_detective(request.user, case):
            return Response(
                {"detail": "Only the assigned detective can manage board items.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not request.user.has_perm("investigations.add_boarditem"):
            return Response(
                {"detail": "Missing permission: investigations.add_boarditem", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        board, _ = DetectiveBoard.objects.get_or_create(case=case)

        serializer = BoardItemCreateSerializer(data=request.data, context={"case": case})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        kind = data["kind"]
        pos = data["position"]

        evidence = None
        note_text = data.get("note_text", "")
        if kind == "evidence":
            from evidence.models import Evidence

            evidence = Evidence.objects.get(id=data["evidence_id"], case_id=case.id)
            note_text = ""

        item = BoardItem.objects.create(
            board=board,
            kind=kind,
            evidence=evidence,
            note_text=note_text,
            position_x=pos["x"],
            position_y=pos["y"],
        )

        return Response(BoardItemSerializer(item).data, status=status.HTTP_201_CREATED)


class CaseBoardItemDetailView(APIView):
    """PATCH move board item / DELETE board item."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=BoardItemMoveSerializer,
        responses={200: BoardItemSerializer},
        description="Move a board item by updating its position.",
    )
    def patch(self, request, case_id: int, item_id: int):
        case = _get_case_or_404_for_user(request.user, case_id)

        if not _require_assigned_detective(request.user, case):
            return Response(
                {"detail": "Only the assigned detective can manage board items.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not request.user.has_perm("investigations.change_boarditem"):
            return Response(
                {"detail": "Missing permission: investigations.change_boarditem", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        item = get_object_or_404(BoardItem, id=item_id, board__case_id=case.id)

        serializer = BoardItemMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        pos = serializer.validated_data["position"]
        item.position_x = pos["x"]
        item.position_y = pos["y"]
        item.save(update_fields=["position_x", "position_y", "updated_at"])

        return Response(BoardItemSerializer(item).data, status=status.HTTP_200_OK)

    @extend_schema(
        responses={204: None},
        description="Delete a board item (connections are deleted automatically).",
    )
    def delete(self, request, case_id: int, item_id: int):
        case = _get_case_or_404_for_user(request.user, case_id)

        if not _require_assigned_detective(request.user, case):
            return Response(
                {"detail": "Only the assigned detective can manage board items.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not request.user.has_perm("investigations.delete_boarditem"):
            return Response(
                {"detail": "Missing permission: investigations.delete_boarditem", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        item = get_object_or_404(BoardItem, id=item_id, board__case_id=case.id)
        item.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class CaseBoardConnectionCreateView(APIView):
    """POST a new connection between two items."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=BoardConnectionCreateSerializer,
        responses={201: BoardConnectionSerializer},
        description="Create a connection between two items in the same board.",
    )
    def post(self, request, case_id: int):
        case = _get_case_or_404_for_user(request.user, case_id)

        if not _require_assigned_detective(request.user, case):
            return Response(
                {"detail": "Only the assigned detective can manage board connections.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not request.user.has_perm("investigations.add_boardconnection"):
            return Response(
                {"detail": "Missing permission: investigations.add_boardconnection", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        board, _ = DetectiveBoard.objects.get_or_create(case=case)

        serializer = BoardConnectionCreateSerializer(data=request.data, context={"case": case})
        serializer.is_valid(raise_exception=True)

        from_id = serializer.validated_data["from_item"]
        to_id = serializer.validated_data["to_item"]

        a = get_object_or_404(BoardItem, id=from_id, board=board)
        b = get_object_or_404(BoardItem, id=to_id, board=board)

        # Normalize ordering to avoid duplicate A-B vs B-A edges
        from_item, to_item = (a, b) if a.id < b.id else (b, a)

        conn, created = BoardConnection.objects.get_or_create(
            board=board,
            from_item=from_item,
            to_item=to_item,
        )

        return Response(
            BoardConnectionSerializer(conn).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class CaseBoardConnectionDetailView(APIView):
    """DELETE a connection."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={204: None},
        description="Delete a connection by its id.",
    )
    def delete(self, request, case_id: int, connection_id: int):
        case = _get_case_or_404_for_user(request.user, case_id)

        if not _require_assigned_detective(request.user, case):
            return Response(
                {"detail": "Only the assigned detective can manage board connections.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not request.user.has_perm("investigations.delete_boardconnection"):
            return Response(
                {"detail": "Missing permission: investigations.delete_boardconnection", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        conn = get_object_or_404(BoardConnection, id=connection_id, board__case_id=case.id)
        conn.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


# -----------------------------------------------------------------------------
# Notifications (added in follow-up commits)
# -----------------------------------------------------------------------------


class NotificationViewSet(viewsets.ViewSet):
    """List notifications for the current user."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: NotificationSerializer(many=True)},
        description="List notifications for the current user. Use ?unread=1 to filter unread notifications.",
    )
    def list(self, request):
        qs = Notification.objects.filter(user=request.user).select_related("case")

        unread = request.query_params.get("unread")
        if unread in {"1", "true", "True"}:
            qs = qs.filter(read_at__isnull=True)

        data = NotificationSerializer(qs.order_by("-created_at"), many=True).data
        return Response(data, status=status.HTTP_200_OK)


class CaseSuspectProposeView(APIView):
    """Detective proposes a suspect for a case."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=CaseSuspectProposeSerializer,
        responses={201: CaseSuspectSerializer},
        description="Propose a new suspect for the given case (detective-only).",
        examples=[
            OpenApiExample(
                "Propose suspect",
                value={
                    "first_name": "John",
                    "last_name": "Doe",
                    "national_id": "1234567890",
                    "phone": "09120000000",
                    "notes": "Seen near the scene",
                },
                request_only=True,
            )
        ],
    )
    def post(self, request, case_id: int):
        case = _get_case_or_404_for_user(request.user, case_id)

        if not _require_assigned_detective(request.user, case):
            return Response(
                {"detail": "Only the assigned detective can propose suspects.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not request.user.has_perm("investigations.propose_case_suspect"):
            return Response(
                {"detail": "Missing permission: investigations.propose_case_suspect", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CaseSuspectProposeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        suspect = CaseSuspect.objects.create(
            case=case,
            proposed_by=request.user,
            **serializer.validated_data,
        )

        return Response(CaseSuspectSerializer(suspect).data, status=status.HTTP_201_CREATED)


class CaseSuspectReviewView(APIView):
    """Sergeant reviews (approve/reject) a proposed suspect."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=CaseSuspectReviewSerializer,
        responses={200: CaseSuspectSerializer},
        description="Review a proposed suspect for a case (sergeant-only).",
        examples=[
            OpenApiExample(
                "Approve",
                value={"decision": "approve", "message": "Looks solid. Proceed."},
                request_only=True,
            ),
            OpenApiExample(
                "Reject",
                value={"decision": "reject", "message": "Insufficient evidence."},
                request_only=True,
            ),
        ],
    )
    def post(self, request, case_id: int, suspect_id: int):
        # Allow sergeants to reach this endpoint without being a participant.
        if request.user.has_perm("investigations.review_case_suspect") or request.user.has_perm("cases.view_all_cases"):
            case = get_object_or_404(Case, id=case_id)
        else:
            case = _get_case_or_404_for_user(request.user, case_id)

        if not request.user.has_perm("investigations.review_case_suspect"):
            return Response(
                {"detail": "Missing permission: investigations.review_case_suspect", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        suspect = get_object_or_404(CaseSuspect, id=suspect_id, case=case)

        if suspect.status != CaseSuspectStatus.PROPOSED:
            return Response(
                {"detail": "Suspect already reviewed.", "code": "already_reviewed"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = CaseSuspectReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        decision = serializer.validated_data["decision"]
        message = serializer.validated_data.get("message", "")

        suspect.status = (
            CaseSuspectStatus.APPROVED if decision == "approve" else CaseSuspectStatus.REJECTED
        )
        suspect.sergeant_message = message
        suspect.reviewed_by = request.user
        suspect.reviewed_at = timezone.now()
        suspect.save(update_fields=["status", "sergeant_message", "reviewed_by", "reviewed_at"])

        return Response(CaseSuspectSerializer(suspect).data, status=status.HTTP_200_OK)


# -----------------------------------------------------------------------------
# Interrogation + approval chain
# -----------------------------------------------------------------------------


class SuspectInterrogationDetectiveView(APIView):
    """Detective submits/updates their score for a suspect interrogation."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=DetectiveInterrogationSubmitSerializer,
        responses={200: InterrogationSerializer},
        description="Assigned detective submits interrogation score (1..10).",
    )
    def post(self, request, case_id: int, suspect_id: int):
        case = _get_case_or_404_for_user(request.user, case_id)

        if not _require_assigned_detective(request.user, case):
            return Response(
                {"detail": "Only the assigned detective can submit interrogation score.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not request.user.has_perm("investigations.submit_detective_interrogation"):
            return Response(
                {"detail": "Missing permission: investigations.submit_detective_interrogation", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        suspect = _get_suspect_or_404(case, suspect_id)
        if suspect.status != CaseSuspectStatus.APPROVED:
            return Response(
                {"detail": "Interrogation is only allowed for approved suspects.", "code": "invalid_state"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = DetectiveInterrogationSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        obj = _get_or_create_interrogation(suspect)
        obj.detective_score = serializer.validated_data["detective_score"]
        obj.detective_submitted_by = request.user
        obj.detective_submitted_at = timezone.now()
        obj.save(update_fields=["detective_score", "detective_submitted_by", "detective_submitted_at", "updated_at"])

        return Response(InterrogationSerializer(obj).data, status=status.HTTP_200_OK)


class SuspectInterrogationSergeantView(APIView):
    """Sergeant submits/updates their score for a suspect interrogation."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=SergeantInterrogationSubmitSerializer,
        responses={200: InterrogationSerializer},
        description="Sergeant submits interrogation score (1..10).",
    )
    def post(self, request, case_id: int, suspect_id: int):
        # sergeants can access case without being a participant (similar to suspect review)
        if request.user.has_perm("investigations.submit_sergeant_interrogation") or request.user.has_perm("cases.view_all_cases"):
            case = get_object_or_404(Case, id=case_id)
        else:
            case = _get_case_or_404_for_user(request.user, case_id)

        if not request.user.has_perm("investigations.submit_sergeant_interrogation"):
            return Response(
                {"detail": "Missing permission: investigations.submit_sergeant_interrogation", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        suspect = _get_suspect_or_404(case, suspect_id)
        if suspect.status != CaseSuspectStatus.APPROVED:
            return Response(
                {"detail": "Interrogation is only allowed for approved suspects.", "code": "invalid_state"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SergeantInterrogationSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        obj = _get_or_create_interrogation(suspect)
        obj.sergeant_score = serializer.validated_data["sergeant_score"]
        obj.sergeant_submitted_by = request.user
        obj.sergeant_submitted_at = timezone.now()
        obj.save(update_fields=["sergeant_score", "sergeant_submitted_by", "sergeant_submitted_at", "updated_at"])

        return Response(InterrogationSerializer(obj).data, status=status.HTTP_200_OK)


class SuspectInterrogationCaptainDecisionView(APIView):
    """Captain submits final decision (approve/reject) + reasoning."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=CaptainDecisionSubmitSerializer,
        responses={200: InterrogationSerializer},
        description="Captain submits final decision for interrogation. Requires detective+sergeant scores to exist.",
    )
    def post(self, request, case_id: int, suspect_id: int):
        if request.user.has_perm("investigations.submit_captain_interrogation_decision") or request.user.has_perm("cases.view_all_cases"):
            case = get_object_or_404(Case, id=case_id)
        else:
            case = _get_case_or_404_for_user(request.user, case_id)

        if not request.user.has_perm("investigations.submit_captain_interrogation_decision"):
            return Response(
                {"detail": "Missing permission: investigations.submit_captain_interrogation_decision", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        suspect = _get_suspect_or_404(case, suspect_id)
        if suspect.status != CaseSuspectStatus.APPROVED:
            return Response(
                {"detail": "Interrogation decision is only allowed for approved suspects.", "code": "invalid_state"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = CaptainDecisionSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        obj = _get_or_create_interrogation(suspect)
        if obj.detective_score is None or obj.sergeant_score is None:
            return Response(
                {"detail": "Detective and sergeant scores are required before captain decision.", "code": "missing_scores"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        obj.captain_final_decision = serializer.validated_data["captain_final_decision"]
        obj.captain_reasoning = serializer.validated_data.get("captain_reasoning", "")
        obj.captain_decided_by = request.user
        obj.captain_decided_at = timezone.now()
        obj.save(
            update_fields=[
                "captain_final_decision",
                "captain_reasoning",
                "captain_decided_by",
                "captain_decided_at",
                "updated_at",
            ]
        )

        return Response(InterrogationSerializer(obj).data, status=status.HTTP_200_OK)


class SuspectInterrogationChiefReviewView(APIView):
    """Chief review for CRITICAL cases."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=ChiefReviewSubmitSerializer,
        responses={200: InterrogationSerializer},
        description="Chief approves/rejects captain decision for CRITICAL cases. Reject requires a message.",
    )
    def post(self, request, case_id: int, suspect_id: int):
        if request.user.has_perm("investigations.review_critical_interrogation") or request.user.has_perm("cases.view_all_cases"):
            case = get_object_or_404(Case, id=case_id)
        else:
            case = _get_case_or_404_for_user(request.user, case_id)

        if not request.user.has_perm("investigations.review_critical_interrogation"):
            return Response(
                {"detail": "Missing permission: investigations.review_critical_interrogation", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if getattr(case, "crime_level", None) != "critical":
            return Response(
                {"detail": "Chief review is only required/allowed for critical cases.", "code": "not_critical"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        suspect = _get_suspect_or_404(case, suspect_id)
        if suspect.status != CaseSuspectStatus.APPROVED:
            return Response(
                {"detail": "Chief review is only allowed for approved suspects.", "code": "invalid_state"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        obj = _get_or_create_interrogation(suspect)
        if obj.captain_final_decision is None:
            return Response(
                {"detail": "Captain decision is required before chief review.", "code": "missing_captain_decision"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ChiefReviewSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        obj.chief_decision = serializer.validated_data["chief_decision"]
        obj.chief_message = serializer.validated_data.get("chief_message", "")
        obj.chief_reviewed_by = request.user
        obj.chief_reviewed_at = timezone.now()
        obj.save(update_fields=["chief_decision", "chief_message", "chief_reviewed_by", "chief_reviewed_at", "updated_at"])

        return Response(InterrogationSerializer(obj).data, status=status.HTTP_200_OK)
