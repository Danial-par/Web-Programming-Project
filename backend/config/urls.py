from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from common.views import HealthCheckView, StatsOverviewView

from django.conf import settings
from django.conf.urls.static import static

from cases.views import payment_simulate_view

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # Core
    path('api/health/', HealthCheckView.as_view(), name='health'),
    path('api/stats/overview/', StatsOverviewView.as_view(), name='stats-overview'),
    
    # Docs
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),

    # API modules
    path('api/', include('accounts.urls')),
    path("api/", include("cases.urls")),
    path("api/", include("evidence.urls")),
    path("api/", include("investigations.urls")),

    # Payment simulation (HTML)
    path("payments/simulate/<int:payment_id>/", payment_simulate_view, name="payment-simulate"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
