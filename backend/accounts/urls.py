# backend/accounts/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RegisterView, CustomLoginView, UserMeView, RoleViewSet, UserRoleManagementView

router = DefaultRouter()
router.register(r'roles', RoleViewSet, basename='roles')
router.register(r'users', UserRoleManagementView, basename='user-roles') 
# Note: user-roles is a ViewSet but we only use extra actions. 
# Better pattern for 'users/{id}/assign-role' might be needed, 
# but ViewSet with manual routing is fine for now.

urlpatterns = [
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/login/', CustomLoginView.as_view(), name='login'),
    path('auth/me/', UserMeView.as_view(), name='user-me'),
    path('', include(router.urls)),
]
