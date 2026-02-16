from rest_framework.routers import DefaultRouter
from .views import CaseViewSet, ComplaintViewSet

router = DefaultRouter()
router.register(r"cases", CaseViewSet, basename="case")
router.register(r"complaints", ComplaintViewSet, basename="complaint")

urlpatterns = router.urls
