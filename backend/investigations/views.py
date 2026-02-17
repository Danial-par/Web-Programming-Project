from __future__ import annotations

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from drf_spectacular.utils import OpenApiExample, extend_schema

from cases.models import Case

from .models import BoardConnection, BoardItem, DetectiveBoard
from .permissions import user_can_access_case, user_is_assigned_detective
from .serializers import (
    BoardConnectionCreateSerializer,
    BoardConnectionSerializer,
    BoardItemCreateSerializer,
    BoardItemMoveSerializer,
    BoardItemSerializer,
    BoardStateSerializer,
    BoardStateWriteSerializer,
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
    pass
