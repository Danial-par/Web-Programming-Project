# backend/accounts/tests.py
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group

from .role_bootstrap import ensure_default_roles

User = get_user_model()

class AuthTests(APITestCase):
    def setUp(self):
        self.register_url = reverse('register')
        self.login_url = reverse('login')
        self.user_data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'phone': '09120000000',
            'national_id': '1234567890',
            'password': 'strong_password',
            'first_name': 'Test',
            'last_name': 'User'
        }

    def test_registration(self):
        response = self.client.post(self.register_url, self.user_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(User.objects.get().national_id, '1234567890')

    def test_login_with_different_identifiers(self):
        User.objects.create_user(**self.user_data)
        
        identifiers = [
            self.user_data['username'],
            self.user_data['email'],
            self.user_data['phone'],
            self.user_data['national_id']
        ]

        for identifier in identifiers:
            response = self.client.post(self.login_url, {
                'identifier': identifier,
                'password': self.user_data['password']
            })
            self.assertEqual(response.status_code, status.HTTP_200_OK, f"Failed login with {identifier}")
            self.assertIn('access', response.data)

class RBACTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('admin', 'admin@example.com', 'pass')
        self.user = User.objects.create_user(
            'normal', 'normal@e.com', 'pass', phone='1', national_id='1'
        )
        ensure_default_roles()
        self.client.force_authenticate(user=self.admin)

    def test_create_role(self):
        url = reverse('roles-list')
        response = self.client.post(url, {'name': 'New-Group'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Group.objects.filter(name='New-Group').exists())

    def test_create_alias_role_name_uses_existing_canonical_group(self):
        url = reverse('roles-list')
        response = self.client.post(url, {'name': 'Administrator'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(Group.objects.filter(name='Admin').exists())
        self.assertFalse(Group.objects.filter(name='Administrator').exists())

    def test_assign_role(self):
        group = Group.objects.create(name='New-Group')
        url = reverse('user-roles-assign-role', args=[self.user.id])
        response = self.client.post(url, {'name': 'New-Group'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(self.user.groups.filter(name='New-Group').exists())

    def test_assign_legacy_alias_role_normalizes_to_canonical(self):
        url = reverse('user-roles-assign-role', args=[self.user.id])
        response = self.client.post(url, {'name': 'Police Officer'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(self.user.groups.filter(name='Officer').exists())
        self.assertFalse(self.user.groups.filter(name='Police Officer').exists())


class RoleBootstrapTests(APITestCase):
    def test_default_roles_created_with_permissions(self):
        ensure_default_roles()

        # Roles from the project doc should exist from the beginning.
        expected_roles = [
            "Chief",
            "Captain",
            "Sergeant",
            "Detective",
            "Cadet",
            "Complainant",
            "Witness",
            "Suspect",
            "Criminal",
            "Judge",
            "Coroner",
            "Admin",
            "Officer",
        ]
        for role_name in expected_roles:
            self.assertTrue(Group.objects.filter(name=role_name).exists(), f"Missing default role: {role_name}")

        cadet = Group.objects.get(name="Cadet")
        detective = Group.objects.get(name="Detective")
        judge = Group.objects.get(name="Judge")
        coroner = Group.objects.get(name="Coroner")

        self.assertTrue(
            cadet.permissions.filter(
                content_type__app_label="cases",
                codename="cadet_review_complaint",
            ).exists()
        )
        self.assertTrue(
            detective.permissions.filter(
                content_type__app_label="investigations",
                codename="propose_case_suspect",
            ).exists()
        )
        self.assertTrue(
            judge.permissions.filter(
                content_type__app_label="cases",
                codename="judge_verdict_trial",
            ).exists()
        )
        self.assertTrue(
            coroner.permissions.filter(
                content_type__app_label="evidence",
                codename="fill_forensic_results",
            ).exists()
        )

    def test_bootstrap_is_idempotent(self):
        ensure_default_roles()
        group_count_before = Group.objects.count()
        permission_count_before = Group.objects.get(name="Detective").permissions.count()

        ensure_default_roles()
        self.assertEqual(group_count_before, Group.objects.count())
        self.assertEqual(permission_count_before, Group.objects.get(name="Detective").permissions.count())

    def test_legacy_duplicate_roles_are_merged(self):
        legacy_admin = Group.objects.create(name="Administrator")
        legacy_police_officer = Group.objects.create(name="Police Officer")
        legacy_sergent = Group.objects.create(name="Sergent")
        legacy_corenary = Group.objects.create(name="Corenary")
        legacy_worksop = Group.objects.create(name="Worksop")
        user = User.objects.create_user("legacy", "legacy@example.com", "pass", phone="99", national_id="99")
        legacy_admin.user_set.add(user)
        legacy_police_officer.user_set.add(user)
        legacy_sergent.user_set.add(user)
        legacy_corenary.user_set.add(user)
        legacy_worksop.user_set.add(user)

        ensure_default_roles()

        self.assertFalse(Group.objects.filter(name="Administrator").exists())
        self.assertFalse(Group.objects.filter(name="Police Officer").exists())
        self.assertFalse(Group.objects.filter(name="Patrol Officer").exists())
        self.assertFalse(Group.objects.filter(name="Sergent").exists())
        self.assertFalse(Group.objects.filter(name="Corenary").exists())
        self.assertFalse(Group.objects.filter(name__iexact="Workshop").exists())
        self.assertFalse(Group.objects.filter(name__iexact="Worksop").exists())
        self.assertTrue(Group.objects.filter(name="Admin").exists())
        self.assertTrue(Group.objects.filter(name="Officer").exists())
        self.assertTrue(Group.objects.filter(name="Sergeant").exists())
        self.assertTrue(Group.objects.filter(name="Coroner").exists())
