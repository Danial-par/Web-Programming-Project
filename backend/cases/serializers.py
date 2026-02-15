from rest_framework import serializers
from .models import Case


class CaseListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Case
        fields = [
            "id",
            "title",
            "crime_level",
            "status",
            "created_at",
        ]


class CaseDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Case
        fields = "__all__"


class CaseCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Case
        fields = [
            "title",
            "description",
            "crime_level",
        ]

    def create(self, validated_data):
        user = self.context["request"].user
        return Case.objects.create(
            created_by=user,
            **validated_data
        )
