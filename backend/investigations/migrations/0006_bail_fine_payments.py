from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("investigations", "0005_suspect_photo_tip_reward"),
    ]

    operations = [
        migrations.AddField(
            model_name="casesuspect",
            name="custody_status",
            field=models.CharField(choices=[("detained", "Detained"), ("released", "Released")], default="detained", max_length=16),
        ),
        migrations.AddField(
            model_name="casesuspect",
            name="bail_amount",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="casesuspect",
            name="bail_set_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="suspects_bail_set", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="casesuspect",
            name="bail_set_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="casesuspect",
            name="fine_amount",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="casesuspect",
            name="fine_set_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="suspects_fine_set", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="casesuspect",
            name="fine_set_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="casesuspect",
            name="released_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="casesuspect",
            name="released_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="suspects_released", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterModelOptions(
            name="casesuspect",
            options={
                "ordering": ["-proposed_at"],
                "permissions": [
                    ("propose_case_suspect", "Can propose a suspect for a case"),
                    ("review_case_suspect", "Can review a proposed suspect for a case"),
                    ("set_bail_fine", "Can set bail/fine amounts for a suspect"),
                ],
            },
        ),
        migrations.CreateModel(
            name="ReleasePayment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("payment_type", models.CharField(choices=[("bail", "Bail"), ("fine", "Fine")], max_length=16)),
                ("amount", models.BigIntegerField()),
                ("status", models.CharField(choices=[("pending", "Pending"), ("paid", "Paid"), ("failed", "Failed")], default="pending", max_length=16)),
                ("authority", models.CharField(blank=True, default="", max_length=64)),
                ("ref_id", models.CharField(blank=True, default="", max_length=64)),
                ("gateway", models.CharField(blank=True, default="zarinpal", max_length=32)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("case", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="release_payments", to="cases.case")),
                ("payer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="release_payments", to=settings.AUTH_USER_MODEL)),
                ("suspect", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="release_payments", to="investigations.casesuspect")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
