# backend/accounts/views.py
from rest_framework import generics, status, viewsets
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth.models import Group
from django.contrib.auth import get_user_model
from rest_framework.decorators import action
from drf_spectacular.utils import extend_schema, OpenApiParameter

from .serializers import (
    UserRegistrationSerializer, 
    CustomTokenObtainPairSerializer,
    UserSerializer,
    GroupSerializer
)

User = get_user_model()

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (AllowAny,)
    serializer_class = UserRegistrationSerializer

class CustomLoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

class UserMeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = (IsAuthenticated,)

    def get_object(self):
        return self.request.user

class RoleViewSet(viewsets.ModelViewSet):
    """
    CRUD for Roles (Django Groups).
    Only Admins can manage roles.
    """
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    permission_classes = [IsAdminUser]

class UserRoleManagementView(viewsets.ViewSet):
    """
    Admin endpoints to assign/remove roles to users.
    """
    permission_classes = [IsAdminUser]

    @extend_schema(
        request=GroupSerializer,
        responses={200: UserSerializer},
        description="Assign a role (Group) to a user."
    )
    @action(detail=True, methods=['post'], url_path='assign-role')
    def assign_role(self, request, pk=None):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        
        group_name = request.data.get('name')
        if not group_name:
            return Response({"detail": "Group name is required."}, status=status.HTTP_400_BAD_REQUEST)
            
        group, created = Group.objects.get_or_create(name=group_name)
        user.groups.add(group)
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)

    @extend_schema(
        request=GroupSerializer,
        responses={200: UserSerializer},
        description="Remove a role from a user."
    )
    @action(detail=True, methods=['post'], url_path='remove-role')
    def remove_role(self, request, pk=None):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        group_name = request.data.get('name')
        try:
            group = Group.objects.get(name=group_name)
            user.groups.remove(group)
        except Group.DoesNotExist:
            pass # Or return error
            
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)
