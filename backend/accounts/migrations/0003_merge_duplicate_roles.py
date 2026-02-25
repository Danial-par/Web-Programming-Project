from django.db import migrations


ROLE_MERGE_MAP = {
    "Administrator": "Admin",
    "Police Officer": "Officer",
    "Patrol Officer": "Officer",
    "Sergent": "Sergeant",
    "Corenary": "Coroner",
}


def merge_duplicate_roles(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    using = schema_editor.connection.alias

    for source_name, target_name in ROLE_MERGE_MAP.items():
        source_group = Group.objects.using(using).filter(name__iexact=source_name).first()
        if not source_group:
            continue

        target_group, _ = Group.objects.using(using).get_or_create(name=target_name)

        target_group.permissions.add(*source_group.permissions.all())
        target_group.user_set.add(*source_group.user_set.all())
        source_group.delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_seed_default_roles"),
    ]

    operations = [
        migrations.RunPython(merge_duplicate_roles, migrations.RunPython.noop),
    ]
