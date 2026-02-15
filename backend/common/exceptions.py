from rest_framework.views import exception_handler
from rest_framework.response import Response

def custom_exception_handler(exc, context):
    """
    Standardizes error responses to:
    { "detail": "...", "code": "...", "fields": {...} }
    """
    response = exception_handler(exc, context)

    if response is not None:
        data = response.data
        formatted_data = {
            "detail": "An error occurred.",
            "code": "error",
            "fields": {}
        }

        if isinstance(data, dict):
            if "detail" in data:
                formatted_data["detail"] = data["detail"]
                formatted_data["code"] = getattr(data.get("detail"), "code", "error")
                # Remaining data are fields
                rest = data.copy()
                del rest["detail"]
                if rest: formatted_data["fields"] = rest
            else:
                formatted_data["detail"] = "Validation Error"
                formatted_data["code"] = "validation_error"
                formatted_data["fields"] = data
        elif isinstance(data, list):
            formatted_data["detail"] = data[0]

        response.data = formatted_data

    return response
