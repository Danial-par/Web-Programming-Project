"""
Central role-based access: assigning a user to a Group by name (e.g. "Cadet",
"Officer", "Detective") grants the corresponding capabilities even if the
group has no Django permissions assigned. Aligns with project doc role names.
"""

# Well-known group names used across the project (from doc / frontend config)
ROLE_CADET = "Cadet"
ROLE_OFFICER = "Officer"
ROLE_DETECTIVE = "Detective"
ROLE_SERGEANT = "Sergeant"
ROLE_CAPTAIN = "Captain"
ROLE_CHIEF = "Chief"
ROLE_JUDGE = "Judge"
ROLE_ADMIN = "Admin"
ROLE_WORKSHOP = "Workshop"


def _user_group_names(user):
    if not user or not user.is_authenticated:
        return set()
    return set(user.groups.values_list("name", flat=True))


def has_perm_or_role(user, permission_codenames, group_names):
    """
    Return True if user has any of the given permissions OR is in any of the given groups.
    permission_codenames: e.g. ["cases.view_all_cases"]
    group_names: e.g. ["Chief", "Captain"]
    """
    if not user or not user.is_authenticated:
        return False
    for codename in permission_codenames:
        if user.has_perm(codename):
            return True
    names = _user_group_names(user)
    if any(n in group_names for n in names):
        return True
    return False


# ----- Cases: complaints (keep in sync with cases.permissions) -----
def user_can_see_all_complaints(user):
    if not user or not user.is_authenticated:
        return False
    return has_perm_or_role(
        user,
        [
            "cases.view_all_complaints",
            "cases.cadet_review_complaint",
            "cases.officer_review_complaint",
        ],
        (ROLE_CADET, ROLE_OFFICER),
    )


def user_can_cadet_review_complaint(user):
    if not user or not user.is_authenticated:
        return False
    return has_perm_or_role(user, ["cases.cadet_review_complaint"], (ROLE_CADET,))


def user_can_officer_review_complaint(user):
    if not user or not user.is_authenticated:
        return False
    return has_perm_or_role(user, ["cases.officer_review_complaint"], (ROLE_OFFICER,))


# ----- Cases: case visibility & report -----
def user_can_view_all_cases(user):
    return has_perm_or_role(
        user,
        ["cases.view_all_cases"],
        (ROLE_CHIEF, ROLE_CAPTAIN, ROLE_ADMIN),
    )


def user_can_add_case(user):
    return has_perm_or_role(
        user,
        ["cases.add_case"],
        (ROLE_CHIEF, ROLE_CAPTAIN, ROLE_OFFICER),
    )


def user_can_view_case_report(user):
    """Judge, Captain, Chief (or permission) can view full case report."""
    return has_perm_or_role(
        user,
        [
            "cases.view_all_cases",
            "cases.judge_verdict_trial",
            "cases.view_case_report",
            "investigations.submit_captain_interrogation_decision",
            "investigations.review_critical_interrogation",
        ],
        (ROLE_DETECTIVE, ROLE_SERGEANT, ROLE_JUDGE, ROLE_CAPTAIN, ROLE_CHIEF, ROLE_ADMIN),
    )


def user_can_judge_verdict_trial(user):
    return has_perm_or_role(user, ["cases.judge_verdict_trial"], (ROLE_JUDGE,))


def user_can_assign_detective(user):
    """Captain/Chief/Admin (or explicit permission) can assign detective to a case."""
    return has_perm_or_role(
        user,
        ["cases.view_all_cases"],
        (ROLE_CAPTAIN, ROLE_CHIEF, ROLE_ADMIN),
    )


# ----- Cases: scene reports -----
def user_can_view_all_scene_reports(user):
    return has_perm_or_role(
        user,
        ["cases.view_all_scene_reports", "cases.approve_scene_report"],
        (ROLE_OFFICER, ROLE_CAPTAIN, ROLE_CHIEF, ROLE_ADMIN),
    )


def user_can_create_scene_report(user):
    return has_perm_or_role(
        user,
        ["cases.create_scene_report"],
        (ROLE_OFFICER, ROLE_CAPTAIN, ROLE_CHIEF),
    )


def user_can_approve_scene_report(user):
    return has_perm_or_role(
        user,
        ["cases.approve_scene_report"],
        (ROLE_OFFICER, ROLE_CAPTAIN, ROLE_CHIEF),
    )


def user_can_auto_approve_scene_report(user):
    return has_perm_or_role(
        user,
        ["cases.auto_approve_scene_report"],
        (ROLE_CHIEF, ROLE_ADMIN),
    )


# ----- Investigations: detective board -----
def user_can_change_detective_board(user):
    return has_perm_or_role(
        user,
        ["investigations.change_detectiveboard"],
        (ROLE_DETECTIVE, ROLE_WORKSHOP),
    )


def user_can_add_board_item(user):
    return has_perm_or_role(
        user,
        ["investigations.add_boarditem"],
        (ROLE_DETECTIVE, ROLE_WORKSHOP),
    )


def user_can_change_board_item(user):
    return has_perm_or_role(
        user,
        ["investigations.change_boarditem"],
        (ROLE_DETECTIVE, ROLE_WORKSHOP),
    )


def user_can_delete_board_item(user):
    return has_perm_or_role(
        user,
        ["investigations.delete_boarditem"],
        (ROLE_DETECTIVE, ROLE_WORKSHOP),
    )


def user_can_add_board_connection(user):
    return has_perm_or_role(
        user,
        ["investigations.add_boardconnection"],
        (ROLE_DETECTIVE, ROLE_WORKSHOP),
    )


def user_can_delete_board_connection(user):
    return has_perm_or_role(
        user,
        ["investigations.delete_boardconnection"],
        (ROLE_DETECTIVE, ROLE_WORKSHOP),
    )


# ----- Investigations: suspects -----
def user_can_propose_case_suspect(user):
    return has_perm_or_role(
        user,
        ["investigations.propose_case_suspect"],
        (ROLE_DETECTIVE,),
    )


def user_can_review_case_suspect(user):
    return has_perm_or_role(
        user,
        ["investigations.review_case_suspect"],
        (ROLE_SERGEANT, ROLE_DETECTIVE, ROLE_CAPTAIN, ROLE_CHIEF),
    )


# ----- Investigations: interrogation -----
def user_can_submit_detective_interrogation(user):
    return has_perm_or_role(
        user,
        ["investigations.submit_detective_interrogation"],
        (ROLE_DETECTIVE,),
    )


def user_can_submit_sergeant_interrogation(user):
    return has_perm_or_role(
        user,
        ["investigations.submit_sergeant_interrogation"],
        (ROLE_SERGEANT,),
    )


def user_can_submit_captain_interrogation_decision(user):
    return has_perm_or_role(
        user,
        ["investigations.submit_captain_interrogation_decision"],
        (ROLE_CAPTAIN, ROLE_CHIEF),
    )


def user_can_review_critical_interrogation(user):
    return has_perm_or_role(
        user,
        ["investigations.review_critical_interrogation"],
        (ROLE_CHIEF, ROLE_ADMIN),
    )


# ----- Investigations: tips & rewards -----
def user_can_officer_review_tip(user):
    return has_perm_or_role(
        user,
        ["investigations.officer_review_tip"],
        (ROLE_OFFICER, ROLE_CAPTAIN, ROLE_CHIEF),
    )


def user_can_detective_review_tip(user):
    return has_perm_or_role(
        user,
        ["investigations.detective_review_tip"],
        (ROLE_DETECTIVE,),
    )


def user_can_reward_lookup(user):
    return has_perm_or_role(
        user,
        ["investigations.reward_lookup"],
        (ROLE_OFFICER, ROLE_DETECTIVE, ROLE_CAPTAIN, ROLE_CHIEF),
    )


# ----- Evidence -----
def user_can_add_evidence(user):
    return has_perm_or_role(
        user,
        ["evidence.add_evidence"],
        (ROLE_OFFICER, ROLE_DETECTIVE, ROLE_CAPTAIN, ROLE_CHIEF, ROLE_WORKSHOP),
    )


def user_can_change_evidence(user):
    return has_perm_or_role(
        user,
        ["evidence.change_evidence"],
        (ROLE_OFFICER, ROLE_DETECTIVE, ROLE_CAPTAIN, ROLE_CHIEF, ROLE_WORKSHOP),
    )


def user_can_delete_evidence(user):
    return has_perm_or_role(
        user,
        ["evidence.delete_evidence"],
        (ROLE_OFFICER, ROLE_DETECTIVE, ROLE_CAPTAIN, ROLE_CHIEF),
    )


def user_can_fill_forensic_results(user):
    return has_perm_or_role(
        user,
        ["evidence.fill_forensic_results"],
        (ROLE_WORKSHOP,),
    )
