from __future__ import annotations

from django.utils import timezone
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema

from cases.models import Case
from cases.constants import CaseStatus
from cases.constants import CRIME_LEVEL_DEGREE

from .models import (
    BoardConnection,
    BoardItem,
    CaseSuspect,
    CaseSuspectStatus,
    DetectiveBoard,
    Interrogation,
    Notification,
    Reward,
    Tip,
    TipStatus,
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
    MostWantedSuspectSerializer,
    NotificationSerializer,
    RewardLookupSerializer,
    RewardSerializer,
    SergeantInterrogationSubmitSerializer,
    TipCreateSerializer,
    TipDetectiveReviewSerializer,
    TipOfficerReviewSerializer,
    TipSerializer,
)


def _get_case_or_404_for_user(user, case_id: int) -> Case:
    """Return the case if user can access it, otherwise 404 (avoid leaking)."""
    case = get_object_or_404(Case, id=case_id)

    if not user_can_access_case(user, case):
        # 404 by design, consistent with CaseViewSet queryset scoping
        raise NotFound()

    return case


def _require_assigned_detective(user, case: Case) -> bool:
    from common.role_helpers import user_can_view_all_cases
    return user_is_assigned_detective(user, case) or user_can_view_all_cases(user)


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
        from common.role_helpers import user_can_change_detective_board
        if not user_can_change_detective_board(request.user):
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
        from common.role_helpers import user_can_add_board_item
        if not user_can_add_board_item(request.user):
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
        from common.role_helpers import user_can_change_board_item
        if not user_can_change_board_item(request.user):
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
        from common.role_helpers import user_can_delete_board_item
        if not user_can_delete_board_item(request.user):
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
        from common.role_helpers import user_can_add_board_connection
        if not user_can_add_board_connection(request.user):
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
        from common.role_helpers import user_can_delete_board_connection
        if not user_can_delete_board_connection(request.user):
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
    

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

class TipViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only access to tips for review screens.
    Filtering:
      - ?status=submitted|forwarded_to_detective|approved|...
      - ?mine=1  (tips created by the current user)
    """
    serializer_class = TipSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Tip.objects.select_related("user", "case", "suspect").order_by("-created_at")

        status_param = self.request.query_params.get("status")
        mine = self.request.query_params.get("mine")

        if status_param:
            qs = qs.filter(status=status_param)

        if mine in ("1", "true", "yes"):
            qs = qs.filter(user=self.request.user)

        return qs


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
        from common.role_helpers import user_can_propose_case_suspect
        if not user_can_propose_case_suspect(request.user):
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
        from common.role_helpers import user_can_review_case_suspect, user_can_view_all_cases
        if user_can_review_case_suspect(request.user) or user_can_view_all_cases(request.user):
            case = get_object_or_404(Case, id=case_id)
        else:
            case = _get_case_or_404_for_user(request.user, case_id)

        if not user_can_review_case_suspect(request.user):
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

        # Send notification to the detective who proposed the suspect
        if decision == "approve" and suspect.proposed_by:
            from .models import Notification
            Notification.objects.create(
                user=suspect.proposed_by,
                case=case,
                message=f"Suspect {suspect.first_name} {suspect.last_name} has been approved by Sergeant for case #{case.id}",
            )
        elif decision == "reject" and suspect.proposed_by:
            from .models import Notification
            Notification.objects.create(
                user=suspect.proposed_by,
                case=case,
                message=f"Suspect {suspect.first_name} {suspect.last_name} has been rejected by Sergeant for case #{case.id}: {message}",
            )

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
        from common.role_helpers import user_can_submit_detective_interrogation
        if not user_can_submit_detective_interrogation(request.user):
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
        from common.role_helpers import user_can_submit_sergeant_interrogation, user_can_view_all_cases
        # sergeants can access case without being a participant (similar to suspect review)
        if user_can_submit_sergeant_interrogation(request.user) or user_can_view_all_cases(request.user):
            case = get_object_or_404(Case, id=case_id)
        else:
            case = _get_case_or_404_for_user(request.user, case_id)

        if not user_can_submit_sergeant_interrogation(request.user):
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
        from common.role_helpers import user_can_submit_captain_interrogation_decision, user_can_view_all_cases
        if user_can_submit_captain_interrogation_decision(request.user) or user_can_view_all_cases(request.user):
            case = get_object_or_404(Case, id=case_id)
        else:
            case = _get_case_or_404_for_user(request.user, case_id)

        if not user_can_submit_captain_interrogation_decision(request.user):
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
        from common.role_helpers import user_can_review_critical_interrogation, user_can_view_all_cases
        if user_can_review_critical_interrogation(request.user) or user_can_view_all_cases(request.user):
            case = get_object_or_404(Case, id=case_id)
        else:
            case = _get_case_or_404_for_user(request.user, case_id)

        if not user_can_review_critical_interrogation(request.user):
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


# -----------------------------------------------------------------------------
# Most wanted + tips / rewards
# -----------------------------------------------------------------------------


def _suspect_identity_key(s: CaseSuspect) -> str:
    """
    Group suspects by person identity.
    Prefer national_id; fallback to name+phone (best effort).
    """
    if getattr(s, "national_id", None):
        return f"nid:{s.national_id}"
    return f"np:{(s.first_name or '').strip().lower()}|{(s.last_name or '').strip().lower()}|{(s.phone or '').strip()}"


class MostWantedView(APIView):
    """List most wanted suspects with ranking and reward."""

    permission_classes = []  # public

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="limit",
                description="Maximum number of suspects to return (default 10).",
                required=False,
                type=int,
            )
        ],
        responses={200: MostWantedSuspectSerializer(many=True)},
        description=(
            "Return the most wanted suspects based on:\n"
            "ranking = max(days_wanted_in_open_cases) * max(crime_degree_ever)\n"
            "reward_amount = ranking * 20_000_000 (Rial)."
        ),
    )
    def get(self, request):
        limit = request.query_params.get("limit")
        try:
            limit = int(limit) if limit is not None else 10
        except ValueError:
            limit = 10

        suspects = (
            CaseSuspect.objects.select_related("case")
            .filter(
                status=CaseSuspectStatus.APPROVED,
            )
            .prefetch_related("interrogation")
        )

        groups = {}  # key -> aggregated metrics

        for s in suspects:
            # Check if captain has made final decision
            interrogation = getattr(s, "interrogation", None)
            if not interrogation or interrogation.captain_final_decision is not True:
                continue

            # For critical cases, also check chief approval
            if s.case.crime_level == "critical" and interrogation.chief_decision is not True:
                continue

            key = _suspect_identity_key(s)

            # Crime degree for THIS case contributes to "max_crime_degree_ever"
            degree = CRIME_LEVEL_DEGREE.get(s.case.crime_level, 0)

            # Days wanted only counts for OPEN cases
            if s.case.status != CaseStatus.CLOSED:
                days = (timezone.now().date() - s.proposed_at.date()).days or 1
            else:
                days = 0

            if key not in groups:
                # representative suspect (used for name/phone/photo output)
                groups[key] = {
                    "rep": s,
                    "max_days_wanted": days,
                    "max_crime_degree": degree,
                }
            else:
                g = groups[key]
                # keep a representative suspect (optional rule: prefer one with photo)
                if g["rep"].photo is None and s.photo is not None:
                    g["rep"] = s

                g["max_days_wanted"] = max(g["max_days_wanted"], days)
                g["max_crime_degree"] = max(g["max_crime_degree"], degree)

        # Build response items
        items = []
        for g in groups.values():
            rep = g["rep"]
            max_days = g["max_days_wanted"]
            max_degree = g["max_crime_degree"]

            ranking = max_days * max_degree
            if ranking <= 0:
                continue

            items.append(
                {
                    "suspect_id": rep.id,  # representative id
                    "first_name": rep.first_name,
                    "last_name": rep.last_name,
                    "national_id": rep.national_id,
                    "phone": rep.phone,
                    "photo": rep.photo,
                    "max_days_wanted": max_days,
                    "max_crime_degree": max_degree,
                    "ranking": ranking,
                    "reward_amount": ranking * 20_000_000,
                }
            )

        items.sort(key=lambda x: x["ranking"], reverse=True)
        items = items[: max(limit, 1)]

        serializer = MostWantedSuspectSerializer(items, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class TipCreateView(APIView):
    """Submit a new tip (authenticated normal user)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: TipSerializer(many=True)},
        description="List tips (review queue for officers/detectives) or list your own tips with ?mine=1.",
    )
    def get(self, request):
        from common.role_helpers import (
            user_can_officer_review_tip,
            user_can_detective_review_tip,
            user_can_view_all_cases,
        )

        status_param = request.query_params.get("status")
        mine = request.query_params.get("mine")

        qs = Tip.objects.select_related("user", "case", "suspect").order_by("-created_at")

        # Any user can view their own tips
        if mine in ("1", "true", "yes"):
            qs = qs.filter(user=request.user)
        else:
            # Otherwise only reviewers (officer/detective) or global viewers can list tips
            allowed = (
                user_can_officer_review_tip(request.user)
                or user_can_detective_review_tip(request.user)
                or user_can_view_all_cases(request.user)
            )
            if not allowed:
                return Response(
                    {"detail": "You do not have permission to list tips.", "code": "forbidden"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        if status_param:
            qs = qs.filter(status=status_param)

        return Response(
            TipSerializer(qs, many=True, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        request=TipCreateSerializer,
        responses={201: TipSerializer},
        description="Create a new tip about a case and/or suspect.",
    )
    def post(self, request):
        serializer = TipCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tip = Tip.objects.create(user=request.user, **serializer.validated_data)
        return Response(TipSerializer(tip, context={"request": request}).data, status=status.HTTP_201_CREATED)


class TipOfficerReviewView(APIView):
    """Officer performs initial review of a tip."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=TipOfficerReviewSerializer,
        responses={200: TipSerializer},
        description="Officer review: reject tip or forward to responsible detective.",
    )
    def post(self, request, tip_id: int):
        from common.role_helpers import user_can_officer_review_tip
        if not user_can_officer_review_tip(request.user):
            return Response(
                {"detail": "Missing permission: investigations.officer_review_tip", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        tip = get_object_or_404(Tip, id=tip_id)
        serializer = TipOfficerReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        decision = serializer.validated_data["decision"]
        message = serializer.validated_data.get("message", "")

        if tip.status != TipStatus.SUBMITTED:
            return Response(
                {"detail": "Tip already reviewed by officer.", "code": "invalid_state"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tip.officer_message = message
        tip.officer_reviewed_by = request.user
        tip.officer_reviewed_at = timezone.now()

        if decision == "reject":
            tip.status = TipStatus.OFFICER_REJECTED
        else:
            tip.status = TipStatus.FORWARDED_TO_DETECTIVE

        tip.save(
            update_fields=[
                "status",
                "officer_message",
                "officer_reviewed_by",
                "officer_reviewed_at",
                "updated_at",
            ]
        )

        return Response(TipSerializer(tip, context={"request": request}).data, status=status.HTTP_200_OK)


class TipDetectiveReviewView(APIView):
    """Detective approves or rejects a forwarded tip."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=TipDetectiveReviewSerializer,
        responses={200: TipSerializer},
        description="Detective review: approve (generate reward) or reject tip.",
    )
    def post(self, request, tip_id: int):
        from common.role_helpers import user_can_detective_review_tip, user_can_view_all_cases
        if not user_can_detective_review_tip(request.user):
            return Response(
                {"detail": "Missing permission: investigations.detective_review_tip", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        tip = get_object_or_404(Tip.objects.select_related("case", "suspect", "user"), id=tip_id)

        if tip.status != TipStatus.FORWARDED_TO_DETECTIVE:
            return Response(
                {"detail": "Tip is not in a state for detective review.", "code": "invalid_state"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # If case is set, ensure requesting user is assigned detective for that case (when applicable)
        if tip.case and tip.case.assigned_to_id and tip.case.assigned_to_id != request.user.id and not user_can_view_all_cases(request.user):
            return Response(
                {"detail": "Only assigned detective can review this tip.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = TipDetectiveReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        decision = serializer.validated_data["decision"]
        message = serializer.validated_data.get("message", "")

        tip.detective_message = message
        tip.detective_reviewed_by = request.user
        tip.detective_reviewed_at = timezone.now()

        if decision == "reject":
            tip.status = TipStatus.DETECTIVE_REJECTED
            tip.save(
                update_fields=[
                    "status",
                    "detective_message",
                    "detective_reviewed_by",
                    "detective_reviewed_at",
                    "updated_at",
                ]
            )
            return Response(TipSerializer(tip, context={"request": request}).data, status=status.HTTP_200_OK)

        # Approve => create reward if not exists
        tip.status = TipStatus.APPROVED
        tip.save(
            update_fields=[
                "status",
                "detective_message",
                "detective_reviewed_by",
                "detective_reviewed_at",
                "updated_at",
            ]
        )

        if not hasattr(tip, "reward"):
            # Derive reward amount from suspect / case severity when possible
            amount = 20_000_000
            if tip.suspect:
                _, _, ranking, reward_amount = _compute_most_wanted_metrics(tip.suspect)
                if reward_amount > 0:
                    amount = reward_amount
            elif tip.case:
                from cases.constants import CRIME_LEVEL_DEGREE

                degree = CRIME_LEVEL_DEGREE.get(tip.case.crime_level, 1)
                amount = degree * 20_000_000

            import uuid

            Reward.objects.create(
                tip=tip,
                reward_code=uuid.uuid4().hex[:16],
                reward_amount=amount,
            )

        return Response(TipSerializer(tip, context={"request": request}).data, status=status.HTTP_200_OK)


class RewardLookupView(APIView):
    """Police-only reward lookup endpoint."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=RewardLookupSerializer,
        responses={200: RewardSerializer},
        description="Lookup reward by national_id + reward_code (police-only).",
    )
    def post(self, request):
        from common.role_helpers import user_can_reward_lookup
        if not user_can_reward_lookup(request.user):
            return Response(
                {"detail": "Missing permission: investigations.reward_lookup", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RewardLookupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        national_id = serializer.validated_data["national_id"]
        reward_code = serializer.validated_data["reward_code"]

        reward = get_object_or_404(
            Reward.objects.select_related("tip", "tip__user"),
            reward_code=reward_code,
            tip__user__national_id=national_id,
            tip__status=TipStatus.APPROVED,
        )

        payload = RewardSerializer(reward).data
        payload["tip_user"] = {
            "id": reward.tip.user_id,
            "national_id": reward.tip.user.national_id,
            "username": reward.tip.user.username,
            "email": getattr(reward.tip.user, "email", ""),
            "phone": getattr(reward.tip.user, "phone", ""),
            "first_name": getattr(reward.tip.user, "first_name", ""),
            "last_name": getattr(reward.tip.user, "last_name", ""),
        }
        return Response(payload, status=status.HTTP_200_OK)
