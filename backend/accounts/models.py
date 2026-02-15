# backend/accounts/models.py
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils.translation import gettext_lazy as _

class User(AbstractUser):
    email = models.EmailField(_('email address'), unique=True)
    phone = models.CharField(_('phone number'), max_length=15, unique=True)
    national_id = models.CharField(_('national ID'), max_length=10, unique=True)
    
    # Required fields ensuring they are not blank
    REQUIRED_FIELDS = ['email', 'phone', 'national_id', 'first_name', 'last_name']

    def __str__(self):
        return self.username
