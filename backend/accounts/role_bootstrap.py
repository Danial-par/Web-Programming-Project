from __future__ import annotations

from django.contrib.auth.models import Group, Permission


ROLE_MERGE_MAP: dict[str, str] = {
    # Legacy / duplicate names -> canonical role names
    "administrator": "Admin",
    "police officer": "Officer",
    "patrol officer": "Officer",
    "sergent": "Sergeant",
    "corenary": "Coroner",
}


DEFAULT_ROLE_PERMISSIONS: dict[str, set[str]] = {
    # Project/system roles
    "Admin": {
        "cases.add_case",
        "cases.view_all_cases",
        "cases.view_case_report",
        "cases.view_all_complaints",
        "cases.cadet_review_complaint",
        "cases.officer_review_complaint",
        "cases.view_all_scene_reports",
        "cases.create_scene_report",
        "cases.approve_scene_report",
        "cases.auto_approve_scene_report",
        "cases.judge_verdict_trial",
        "investigations.change_detectiveboard",
        "investigations.add_boarditem",
        "investigations.change_boarditem",
        "investigations.delete_boarditem",
        "investigations.add_boardconnection",
        "investigations.delete_boardconnection",
        "investigations.propose_case_suspect",
        "investigations.review_case_suspect",
        "investigations.submit_detective_interrogation",
        "investigations.submit_sergeant_interrogation",
        "investigations.submit_captain_interrogation_decision",
        "investigations.review_critical_interrogation",
        "investigations.officer_review_tip",
        "investigations.detective_review_tip",
        "investigations.reward_lookup",
        "evidence.add_evidence",
        "evidence.change_evidence",
        "evidence.delete_evidence",
        "evidence.fill_forensic_results",
    },
    "Chief": {
        "cases.add_case",
        "cases.view_all_cases",
        "cases.view_case_report",
        "cases.view_all_scene_reports",
        "cases.create_scene_report",
        "cases.approve_scene_report",
        "cases.auto_approve_scene_report",
        "investigations.submit_captain_interrogation_decision",
        "investigations.review_critical_interrogation",
        "investigations.officer_review_tip",
        "investigations.reward_lookup",
        "evidence.add_evidence",
        "evidence.change_evidence",
        "evidence.delete_evidence",
    },
    "Captain": {
        "cases.add_case",
        "cases.view_all_cases",
        "cases.view_case_report",
        "cases.view_all_scene_reports",
        "cases.create_scene_report",
        "cases.approve_scene_report",
        "investigations.submit_captain_interrogation_decision",
        "investigations.officer_review_tip",
        "investigations.reward_lookup",
        "evidence.add_evidence",
        "evidence.change_evidence",
        "evidence.delete_evidence",
    },
    "Sergeant": {
        "cases.view_case_report",
        "investigations.review_case_suspect",
        "investigations.submit_sergeant_interrogation",
    },
    "Detective": {
        "cases.view_case_report",
        "investigations.change_detectiveboard",
        "investigations.add_boarditem",
        "investigations.change_boarditem",
        "investigations.delete_boarditem",
        "investigations.add_boardconnection",
        "investigations.delete_boardconnection",
        "investigations.propose_case_suspect",
        "investigations.review_case_suspect",
        "investigations.submit_detective_interrogation",
        "investigations.detective_review_tip",
        "investigations.reward_lookup",
        "evidence.add_evidence",
        "evidence.change_evidence",
        "evidence.delete_evidence",
    },
    "Officer": {
        "cases.add_case",
        "cases.officer_review_complaint",
        "cases.view_all_scene_reports",
        "cases.create_scene_report",
        "cases.approve_scene_report",
        "investigations.officer_review_tip",
        "investigations.reward_lookup",
        "evidence.add_evidence",
        "evidence.change_evidence",
        "evidence.delete_evidence",
    },
    "Cadet": {
        "cases.view_all_complaints",
        "cases.cadet_review_complaint",
    },
    "Judge": {
        "cases.view_all_cases",
        "cases.view_case_report",
        "cases.judge_verdict_trial",
    },
    "Workshop": {
        "investigations.change_detectiveboard",
        "investigations.add_boarditem",
        "investigations.change_boarditem",
        "investigations.delete_boarditem",
        "investigations.add_boardconnection",
        "investigations.delete_boardconnection",
        "evidence.add_evidence",
        "evidence.change_evidence",
        "evidence.fill_forensic_results",
    },
    "Coroner": {
        "evidence.add_evidence",
        "evidence.change_evidence",
        "evidence.fill_forensic_results",
    },
    # Public-side/default roles in the project flow
    "Complainant": set(),
    "Witness": set(),
    "Suspect": set(),
    "Criminal": set(),
}


_CANONICAL_ROLE_LOOKUP: dict[str, str] = {name.lower(): name for name in DEFAULT_ROLE_PERMISSIONS}


def normalize_role_name(raw_name: str | None) -> str:
    if raw_name is None:
        return ""
    cleaned = " ".join(str(raw_name).strip().split())
    if not cleaned:
        return ""

    lowered = cleaned.lower()
    if lowered in ROLE_MERGE_MAP:
        return ROLE_MERGE_MAP[lowered]
    if lowered in _CANONICAL_ROLE_LOOKUP:
        return _CANONICAL_ROLE_LOOKUP[lowered]
    return cleaned


def _resolve_permissions(permission_labels: set[str]) -> list[Permission]:
    resolved: list[Permission] = []
    for label in permission_labels:
        app_label, codename = label.split(".", 1)
        permission = Permission.objects.filter(
            content_type__app_label=app_label,
            codename=codename,
        ).first()
        if permission:
            resolved.append(permission)
    return resolved


def merge_duplicate_roles() -> None:
    """
    Merge legacy/duplicate role groups into canonical role groups.
    """

    for source_lower, target_name in ROLE_MERGE_MAP.items():
        source_group = Group.objects.filter(name__iexact=source_lower).first()
        if not source_group:
            continue

        if source_group.name == target_name:
            continue

        target_group, _ = Group.objects.get_or_create(name=target_name)
        target_group.permissions.add(*source_group.permissions.all())
        target_group.user_set.add(*source_group.user_set.all())
        source_group.delete()


def ensure_default_roles() -> None:
    """
    Ensure project default roles exist and have baseline permissions.

    Idempotent behavior:
    - creates missing groups
    - adds missing baseline permissions
    - does not remove existing custom permissions
    """

    merge_duplicate_roles()

    for role_name, permission_labels in DEFAULT_ROLE_PERMISSIONS.items():
        group, _ = Group.objects.get_or_create(name=role_name)
        permissions = _resolve_permissions(permission_labels)
        if permissions:
            group.permissions.add(*permissions)
