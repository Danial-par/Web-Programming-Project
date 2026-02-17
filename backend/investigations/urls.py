from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CaseBoardConnectionCreateView,
    CaseBoardConnectionDetailView,
    CaseBoardItemCreateView,
    CaseBoardItemDetailView,
    CaseBoardView,
    NotificationViewSet,
)


router = DefaultRouter()
router.register(r"notifications", NotificationViewSet, basename="notification")

urlpatterns = [
    # Detective board
    path("cases/<int:case_id>/board/", CaseBoardView.as_view(), name="case-board"),
    path(
        "cases/<int:case_id>/board/items/",
        CaseBoardItemCreateView.as_view(),
        name="case-board-item-create",
    ),
    path(
        "cases/<int:case_id>/board/items/<int:item_id>/",
        CaseBoardItemDetailView.as_view(),
        name="case-board-item-detail",
    ),
    path(
        "cases/<int:case_id>/board/connections/",
        CaseBoardConnectionCreateView.as_view(),
        name="case-board-connection-create",
    ),
    path(
        "cases/<int:case_id>/board/connections/<int:connection_id>/",
        CaseBoardConnectionDetailView.as_view(),
        name="case-board-connection-detail",
    ),
] + router.urls
