from django.apps import apps as django_apps
from django.contrib.auth.management import create_permissions
from django.contrib.contenttypes.management import create_contenttypes
from django.db import migrations


def seed_default_roles(apps, schema_editor):
    """
    Seed project default roles once during migrations.

    We explicitly ensure content types and permissions exist before seeding
    groups, so permission assignment works on a fresh database.
    """

    app_labels = ("accounts", "cases", "evidence", "investigations")
    using = schema_editor.connection.alias

    for app_label in app_labels:
        app_config = django_apps.get_app_config(app_label)
        create_contenttypes(app_config, verbosity=0, interactive=False, using=using, apps=django_apps)
        create_permissions(app_config, verbosity=0, interactive=False, using=using, apps=django_apps)

    from accounts.role_bootstrap import ensure_default_roles

    ensure_default_roles()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
        ("cases", "0006_payment_intent"),
        ("evidence", "0001_initial"),
        ("investigations", "0005_suspect_photo_tip_reward"),
        ("contenttypes", "0002_remove_content_type_name"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunPython(seed_default_roles, migrations.RunPython.noop),
    ]
