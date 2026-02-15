# backend/accounts/backends.py
from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model
from django.db.models import Q

User = get_user_model()

class MultiFieldModelBackend(ModelBackend):
    """
    Authenticates against settings.AUTH_USER_MODEL.
    Recognizes username, email, phone, or national_id.
    """
    def authenticate(self, request, username=None, password=None, **kwargs):
        # 'username' here is the value passed to the 'identifier' field in login
        identifier = username 
        if identifier is None:
            identifier = kwargs.get('identifier')
            
        if identifier is None:
            return None

        try:
            user = User.objects.get(
                Q(username=identifier) |
                Q(email=identifier) |
                Q(phone=identifier) |
                Q(national_id=identifier)
            )
        except User.DoesNotExist:
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
