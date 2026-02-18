from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import CaseViewSet, ComplaintViewSet, SceneReportViewSet, TrialVerdictView, PaymentStartView

router = DefaultRouter()
router.register(r"cases", CaseViewSet, basename="case")
router.register(r"complaints", ComplaintViewSet, basename="complaint")
router.register(r"scene-reports", SceneReportViewSet, basename="scene-report")

urlpatterns = [
    path(
        "cases/<int:case_id>/suspects/<int:suspect_id>/trial/",
        TrialVerdictView.as_view(),
        name="case-suspect-trial",
    ),
    path(
        "payments/start/",
        PaymentStartView.as_view(),
        name="payment-start",
    ),
] + router.urls
