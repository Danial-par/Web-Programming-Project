from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CaseBoardConnectionCreateView,
    CaseBoardConnectionDetailView,
    CaseBoardItemCreateView,
    CaseBoardItemDetailView,
    CaseBoardView,
    CaseSuspectProposeView,
    CaseSuspectReviewView,
    NotificationViewSet,
    SuspectInterrogationCaptainDecisionView,
    SuspectInterrogationChiefReviewView,
    SuspectInterrogationDetectiveView,
    SuspectInterrogationSergeantView,
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

    # Suspects
    path(
        "cases/<int:case_id>/suspects/propose/",
        CaseSuspectProposeView.as_view(),
        name="case-suspect-propose",
    ),
    path(
        "cases/<int:case_id>/suspects/<int:suspect_id>/review/",
        CaseSuspectReviewView.as_view(),
        name="case-suspect-review",
    ),

    # Interrogation + approvals
    path(
        "cases/<int:case_id>/suspects/<int:suspect_id>/interrogation/detective/",
        SuspectInterrogationDetectiveView.as_view(),
        name="suspect-interrogation-detective",
    ),
    path(
        "cases/<int:case_id>/suspects/<int:suspect_id>/interrogation/sergeant/",
        SuspectInterrogationSergeantView.as_view(),
        name="suspect-interrogation-sergeant",
    ),
    path(
        "cases/<int:case_id>/suspects/<int:suspect_id>/interrogation/captain/",
        SuspectInterrogationCaptainDecisionView.as_view(),
        name="suspect-interrogation-captain",
    ),
    path(
        "cases/<int:case_id>/suspects/<int:suspect_id>/interrogation/chief/",
        SuspectInterrogationChiefReviewView.as_view(),
        name="suspect-interrogation-chief",
    ),
] + router.urls
