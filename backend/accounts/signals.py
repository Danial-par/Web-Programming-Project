from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models.signals import post_save
from django.dispatch import receiver


ADMIN_ROLE_NAME = "Admin"


@receiver(post_save, sender=get_user_model())
def attach_admin_role_to_superuser(sender, instance, **kwargs):
    """
    Keep Django superusers mapped to the project-level Admin role.
    """
    if not instance.is_superuser:
        return

    admin_group, _ = Group.objects.get_or_create(name=ADMIN_ROLE_NAME)
    if not instance.groups.filter(pk=admin_group.pk).exists():
        instance.groups.add(admin_group)

