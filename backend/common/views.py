from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema

class HealthCheckView(APIView):
    permission_classes = []

    @extend_schema(summary="System Health Check", responses={200: None})
    def get(self, request):
        return Response({"status": "ok", "service": "L.A. Noire API"})
