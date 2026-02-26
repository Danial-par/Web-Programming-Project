# backend/accounts/views.py
from rest_framework import generics, status, viewsets
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth.models import Group
from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework.decorators import action
from drf_spectacular.utils import extend_schema, OpenApiParameter

from .serializers import (
    UserRegistrationSerializer,
    CustomTokenObtainPairSerializer,
    UserSerializer,
    GroupSerializer,
)
from .role_bootstrap import normalize_role_name

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
    queryset = Group.objects.all().order_by("name")
    serializer_class = GroupSerializer
    permission_classes = [IsAdminUser]

    def create(self, request, *args, **kwargs):
        raw_name = request.data.get("name")
        role_name = normalize_role_name(raw_name)
        if not role_name:
            return Response({"detail": "Group name is required."}, status=status.HTTP_400_BAD_REQUEST)

        group, created = Group.objects.get_or_create(name=role_name)
        serializer = self.get_serializer(group)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

class UserRoleManagementView(viewsets.ViewSet):
    """
    Admin-only: list/retrieve users, assign/remove roles.
    """
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = User.objects.all().order_by("id")
        q = self.request.query_params.get("q") or self.request.query_params.get("search")
        if q and q.strip():
            term = q.strip()
            qs = qs.filter(
                Q(username__icontains=term)
                | Q(email__icontains=term)
                | Q(first_name__icontains=term)
                | Q(last_name__icontains=term)
            )
        return qs

    @extend_schema(
        parameters=[OpenApiParameter(name="q", description="Search by username, email, first/last name", required=False)],
        responses={200: UserSerializer(many=True)},
    )
    def list(self, request):
        users = self.get_queryset()
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)

    @extend_schema(responses={200: UserSerializer})
    def retrieve(self, request, pk=None):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserSerializer(user).data)

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
        
        role_name = normalize_role_name(request.data.get('name'))
        if not role_name:
            return Response({"detail": "Group name is required."}, status=status.HTTP_400_BAD_REQUEST)

        group, _ = Group.objects.get_or_create(name=role_name)
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

        role_name = normalize_role_name(request.data.get('name'))
        if not role_name:
            return Response({"detail": "Group name is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            group = Group.objects.get(name=role_name)
            user.groups.remove(group)
        except Group.DoesNotExist:
            pass # Or return error
            
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)
