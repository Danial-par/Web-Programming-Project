from rest_framework.routers import DefaultRouter
from .views import CaseViewSet, ComplaintViewSet, SceneReportViewSet

router = DefaultRouter()
router.register(r"cases", CaseViewSet, basename="case")
router.register(r"complaints", ComplaintViewSet, basename="complaint")
router.register(r"scene-reports", SceneReportViewSet, basename="scene-report")

urlpatterns = router.urls
