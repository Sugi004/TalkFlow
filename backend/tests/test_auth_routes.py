import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from support import FakeScalarResult, ensure_backend_test_env

ensure_backend_test_env()

from fastapi import HTTPException
from schemas import UserCreate, UserLogin
from routers.auth import auth_public_key, login, register, token

class AuthRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_register_rejects_duplicate_email(self):
        user_data = UserCreate(
            email="owner@example.com",
            password="StrongPass1!",
            full_name="Owner",
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=SimpleNamespace(id=1))),
        )

        with self.assertRaises(HTTPException) as context:
            await register(request=SimpleNamespace(), user_data=user_data, db=db)

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(context.exception.detail, "Email already registered")

    async def test_register_hashes_password_and_returns_token(self):
        user_data = UserCreate(
            email="owner@example.com",
            password="StrongPass1!",
            full_name="Owner",
            avatar_url="https://example.com/avatar.png",
        )

        async def refresh_user(user):
            user.id = 7

        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=None)),
            add=Mock(),
            commit=AsyncMock(),
            refresh=AsyncMock(side_effect=refresh_user),
        )

        with (
            patch("routers.auth.hash_password", return_value="hashed-password"),
            patch("routers.auth.create_access_token", return_value="jwt-token") as create_token,
        ):
            response = await register(request=SimpleNamespace(), user_data=user_data, db=db)

        self.assertEqual(response, {"access_token": "jwt-token", "token_type": "bearer"})
        added_user = db.add.call_args.args[0]
        self.assertEqual(added_user.email, "owner@example.com")
        self.assertEqual(added_user.hashed_password, "hashed-password")
        self.assertEqual(added_user.full_name, "Owner")
        self.assertEqual(added_user.avatar_url, "https://example.com/avatar.png")
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(added_user)
        create_token.assert_called_once_with(data={"sub": "owner@example.com"})

    async def test_register_decrypts_encrypted_password_before_hashing(self):
        user_data = UserCreate(
            email="owner@example.com",
            password="ciphertext",
            password_encrypted=True,
            full_name="Owner",
        )

        async def refresh_user(user):
            user.id = 9

        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=None)),
            add=Mock(),
            commit=AsyncMock(),
            refresh=AsyncMock(side_effect=refresh_user),
        )

        with (
            patch("routers.auth.decrypt_password_payload", return_value="StrongPass1!"),
            patch("routers.auth.validate_password_strength"),
            patch("routers.auth.hash_password", return_value="hashed-password"),
            patch("routers.auth.create_access_token", return_value="jwt-token"),
        ):
            response = await register(request=SimpleNamespace(), user_data=user_data, db=db)

        self.assertEqual(response, {"access_token": "jwt-token", "token_type": "bearer"})
        added_user = db.add.call_args.args[0]
        self.assertEqual(added_user.hashed_password, "hashed-password")

    async def test_login_rejects_invalid_password(self):
        user_data = UserLogin(email="owner@example.com", password="StrongPass1!")
        stored_user = SimpleNamespace(email="owner@example.com", hashed_password="hashed-password")
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=stored_user)),
        )

        with patch("routers.auth.verify_password", return_value=False):
            with self.assertRaises(HTTPException) as context:
                await login(request=SimpleNamespace(), user_data=user_data, db=db)

        self.assertEqual(context.exception.status_code, 401)
        self.assertEqual(context.exception.detail, "Incorrect email or password")

    async def test_token_returns_bearer_token_for_valid_form_credentials(self):
        stored_user = SimpleNamespace(email="owner@example.com", hashed_password="hashed-password")
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=stored_user)),
        )
        form_data = SimpleNamespace(username="owner@example.com", password="StrongPass1!")

        with (
            patch("routers.auth.verify_password", return_value=True),
            patch("routers.auth.create_access_token", return_value="form-jwt-token"),
        ):
            response = await token(form_data=form_data, db=db)

        self.assertEqual(response, {"access_token": "form-jwt-token", "token_type": "bearer"})

    async def test_login_decrypts_encrypted_password_before_verification(self):
        user_data = UserLogin(
            email="owner@example.com",
            password="ciphertext",
            password_encrypted=True,
        )
        stored_user = SimpleNamespace(email="owner@example.com", hashed_password="hashed-password")
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=stored_user)),
        )

        with (
            patch("routers.auth.decrypt_password_payload", return_value="StrongPass1!"),
            patch("routers.auth.verify_password", return_value=True) as verify_password,
            patch("routers.auth.create_access_token", return_value="jwt-token"),
        ):
            response = await login(request=SimpleNamespace(), user_data=user_data, db=db)

        self.assertEqual(response, {"access_token": "jwt-token", "token_type": "bearer"})
        verify_password.assert_called_once_with("StrongPass1!", "hashed-password")

    async def test_public_key_endpoint_returns_pem_metadata(self):
        with patch("routers.auth.get_password_public_key_pem", return_value="-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----"):
            response = await auth_public_key()

        self.assertEqual(response["algorithm"], "RSA-OAEP-256")
        self.assertIn("PUBLIC KEY", response["public_key"])


if __name__ == "__main__":
    unittest.main()
