# backend/accounts/tests.py
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group

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
        self.client.force_authenticate(user=self.admin)

    def test_create_role(self):
        url = reverse('roles-list')
        response = self.client.post(url, {'name': 'Detective'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Group.objects.filter(name='Detective').exists())

    def test_assign_role(self):
        group = Group.objects.create(name='Officer')
        url = reverse('user-roles-assign-role', args=[self.user.id])
        response = self.client.post(url, {'name': 'Officer'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(self.user.groups.filter(name='Officer').exists())
