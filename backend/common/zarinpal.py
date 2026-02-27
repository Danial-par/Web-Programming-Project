import json
from typing import Any, Dict, Tuple
from urllib import request


class ZarinpalError(RuntimeError):
    pass


def _post_json(url: str, payload: Dict[str, Any], timeout: int = 15) -> Dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
    except Exception as exc:
        raise ZarinpalError("Gateway request failed.") from exc
    return json.loads(body or "{}")


def _parse_authority(resp: Dict[str, Any]) -> Tuple[int, str]:
    # Zarinpal v4 returns: {"data":{"code":100,"authority":"..."}, "errors":...}
    # Legacy REST returns: {"Status":100,"Authority":"..."}
    if "data" in resp:
        data = resp.get("data") or {}
        code = int(data.get("code", 0) or 0)
        authority = str(data.get("authority") or "")
        return code, authority
    return int(resp.get("Status", 0) or 0), str(resp.get("Authority") or "")


def _parse_verification(resp: Dict[str, Any]) -> Tuple[int, str]:
    # v4: {"data":{"code":100,"ref_id":"..."}, ...}
    if "data" in resp:
        data = resp.get("data") or {}
        code = int(data.get("code", 0) or 0)
        ref_id = str(data.get("ref_id") or "")
        return code, ref_id
    return int(resp.get("Status", 0) or 0), str(resp.get("RefID") or "")


def request_payment(
    *,
    merchant_id: str,
    amount: int,
    description: str,
    callback_url: str,
    sandbox: bool,
) -> Tuple[str, str]:
    if sandbox:
        request_url = "https://sandbox.zarinpal.com/pg/rest/WebGate/PaymentRequest.json"
        start_pay_base = "https://sandbox.zarinpal.com/pg/StartPay/"
    else:
        request_url = "https://payment.zarinpal.com/pg/rest/WebGate/PaymentRequest.json"
        start_pay_base = "https://payment.zarinpal.com/pg/StartPay/"

    payload = {
        "MerchantID": merchant_id,
        "Amount": amount,
        "Description": description,
        "CallbackURL": callback_url,
    }

    resp = _post_json(request_url, payload)
    code, authority = _parse_authority(resp)

    if code != 100 or not authority:
        raise ZarinpalError(f"Payment request failed (code={code}).")

    return authority, f"{start_pay_base}{authority}"


def verify_payment(
    *,
    merchant_id: str,
    amount: int,
    authority: str,
    sandbox: bool,
) -> Tuple[int, str]:
    if sandbox:
        verify_url = "https://sandbox.zarinpal.com/pg/rest/WebGate/PaymentVerification.json"
    else:
        verify_url = "https://payment.zarinpal.com/pg/rest/WebGate/PaymentVerification.json"

    payload = {
        "MerchantID": merchant_id,
        "Amount": amount,
        "Authority": authority,
    }

    resp = _post_json(verify_url, payload)
    return _parse_verification(resp)
