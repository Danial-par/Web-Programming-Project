from django.db import migrations


ALIAS_TO_CANONICAL = {
    "administrator": "Admin",
    "police officer": "Officer",
    "patrol officer": "Officer",
    "sergent": "Sergeant",
    "corenary": "Coroner",
    "worksop": "Coroner",
    "workshop": "Coroner",
}

CANONICAL_ROLES = [
    "Admin",
    "Chief",
    "Captain",
    "Sergeant",
    "Detective",
    "Officer",
    "Cadet",
    "Judge",
    "Coroner",
    "Complainant",
    "Witness",
    "Suspect",
    "Criminal",
]


def _merge_group_into(source_group, target_group):
    if source_group.pk == target_group.pk:
        return
    target_group.permissions.add(*source_group.permissions.all())
    target_group.user_set.add(*source_group.user_set.all())
    source_group.delete()


def normalize_role_names(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    using = schema_editor.connection.alias

    # 1) Explicit alias normalization.
    for alias_name, canonical_name in ALIAS_TO_CANONICAL.items():
        alias_groups = list(Group.objects.using(using).filter(name__iexact=alias_name))
        if not alias_groups:
            continue

        target_group, _ = Group.objects.using(using).get_or_create(name=canonical_name)
        for alias_group in alias_groups:
            _merge_group_into(alias_group, target_group)

    # 2) Case-only duplicate normalization (e.g. cadet -> Cadet).
    for canonical_name in CANONICAL_ROLES:
        target_group, _ = Group.objects.using(using).get_or_create(name=canonical_name)
        duplicates = list(
            Group.objects.using(using).filter(name__iexact=canonical_name).exclude(pk=target_group.pk)
        )
        for duplicate in duplicates:
            _merge_group_into(duplicate, target_group)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_merge_duplicate_roles"),
    ]

    operations = [
        migrations.RunPython(normalize_role_names, migrations.RunPython.noop),
    ]
