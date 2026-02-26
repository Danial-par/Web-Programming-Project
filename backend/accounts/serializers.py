# backend/accounts/serializers.py
from rest_framework import serializers
from django.contrib.auth.models import Group
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})
    
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'phone', 'national_id', 'first_name', 'last_name', 'password')

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom serializer to accept 'identifier' instead of 'username'
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Rename 'username' field to 'identifier' in Swagger schema matches logic
        self.fields['identifier'] = serializers.CharField()
        del self.fields[self.username_field]

    def validate(self, attrs):
        # Map 'identifier' back to username_field for the parent class logic
        # But since we use a custom Backend, we just need to pass the value
        # The parent validate() calls authenticate() which calls our MultiFieldModelBackend
        attrs[self.username_field] = attrs.get('identifier')
        return super().validate(attrs)

class UserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'phone', 'national_id', 'first_name', 'last_name', 'roles')

    def get_roles(self, obj):
        roles = list(obj.groups.values_list("name", flat=True))
        # Backward-compatible: existing superusers should be treated as Admin
        # even before they are saved again and signal-sync runs.
        if obj.is_superuser and "Admin" not in roles:
            roles.append("Admin")
        return roles

class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ('id', 'name')
