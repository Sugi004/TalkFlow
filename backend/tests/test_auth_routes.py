import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from starlette.requests import Request

from support import FakeScalarResult, ensure_backend_test_env

ensure_backend_test_env()

from fastapi import HTTPException
from schemas import UserCreate, UserLogin
from routers.auth import (
    auth_public_key,
    login,
    register,
    resend_verification_email,
    token,
    verify_email,
)


def create_mock_request():
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/test-path",
        "client": ("127.0.0.1", 123),
        "headers": [],
    }
    return Request(scope)

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
            await register(request=create_mock_request(), user_data=user_data, db=db)

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(context.exception.detail, "Email already registered")

    async def test_register_rejects_duplicate_username_case_insensitively(self):
        user_data = UserCreate(
            email="owner@example.com",
            password="StrongPass1!",
            full_name="Owner",
        )
        db = SimpleNamespace(
            execute=AsyncMock(
                side_effect=[
                    FakeScalarResult(value=None),
                    FakeScalarResult(value=SimpleNamespace(id=7, full_name="owner")),
                ]
            ),
        )

        with self.assertRaises(HTTPException) as context:
            await register(request=create_mock_request(), user_data=user_data, db=db)

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(context.exception.detail, "Username is already taken")

    async def test_register_hashes_password_and_returns_verification_response(self):
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
            patch("routers.auth.create_email_verification_token", return_value="verify-token"),
            patch("routers.auth.send_verification_email", new=AsyncMock()) as send_email,
        ):
            response = await register(request=create_mock_request(), user_data=user_data, db=db)

        self.assertEqual(
            response,
            {
                "message": "Verification email sent. Please verify your email before logging in.",
                "requires_email_verification": True,
            },
        )
        added_user = db.add.call_args.args[0]
        self.assertEqual(added_user.email, "owner@example.com")
        self.assertEqual(added_user.hashed_password, "hashed-password")
        self.assertEqual(added_user.full_name, "Owner")
        self.assertEqual(added_user.avatar_url, "https://example.com/avatar.png")
        self.assertFalse(added_user.is_email_verified)
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(added_user)
        send_email.assert_awaited_once()

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
            patch("routers.auth.create_email_verification_token", return_value="verify-token"),
            patch("routers.auth.send_verification_email", new=AsyncMock()),
        ):
            response = await register(request=create_mock_request(), user_data=user_data, db=db)

        self.assertEqual(
            response,
            {
                "message": "Verification email sent. Please verify your email before logging in.",
                "requires_email_verification": True,
            },
        )
        added_user = db.add.call_args.args[0]
        self.assertEqual(added_user.hashed_password, "hashed-password")

    async def test_login_rejects_invalid_password(self):
        user_data = UserLogin(email="owner@example.com", password="StrongPass1!")
        stored_user = SimpleNamespace(
            email="owner@example.com",
            hashed_password="hashed-password",
            is_email_verified=True,
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=stored_user)),
        )

        with patch("routers.auth.verify_password", return_value=False):
            with self.assertRaises(HTTPException) as context:
                await login(request=create_mock_request(), user_data=user_data, db=db)

        self.assertEqual(context.exception.status_code, 401)
        self.assertEqual(context.exception.detail, "Incorrect email or password")

    async def test_login_rejects_unverified_email(self):
        user_data = UserLogin(email="owner@example.com", password="StrongPass1!")
        stored_user = SimpleNamespace(
            email="owner@example.com",
            hashed_password="hashed-password",
            is_email_verified=False,
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=stored_user)),
        )

        with patch("routers.auth.verify_password", return_value=True):
            with self.assertRaises(HTTPException) as context:
                await login(request=create_mock_request(), user_data=user_data, db=db)

        self.assertEqual(context.exception.status_code, 403)
        self.assertEqual(context.exception.detail, "Please verify your email before logging in.")

    async def test_resend_verification_email_resends_for_unverified_users(self):
        stored_user = SimpleNamespace(
            email="owner@example.com",
            full_name="Owner",
            is_email_verified=False,
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=stored_user)),
        )
        payload = SimpleNamespace(email="owner@example.com")

        with (
            patch("routers.auth.create_email_verification_token", return_value="verify-token"),
            patch("routers.auth.send_verification_email", new=AsyncMock()) as send_email,
        ):
            response = await resend_verification_email(
                request=create_mock_request(),
                payload=payload,
                db=db,
            )

        self.assertEqual(response, {"message": "Verification email sent again. Please check your inbox."})
        send_email.assert_awaited_once()

    async def test_token_returns_bearer_token_for_valid_form_credentials(self):
        stored_user = SimpleNamespace(
            email="owner@example.com",
            hashed_password="hashed-password",
            is_email_verified=True,
        )
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
        stored_user = SimpleNamespace(
            email="owner@example.com",
            hashed_password="hashed-password",
            is_email_verified=True,
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=stored_user)),
        )

        with (
            patch("routers.auth.decrypt_password_payload", return_value="StrongPass1!"),
            patch("routers.auth.verify_password", return_value=True) as verify_password,
            patch("routers.auth.create_access_token", return_value="jwt-token"),
        ):
            response = await login(request=create_mock_request(), user_data=user_data, db=db)

        self.assertEqual(response, {"access_token": "jwt-token", "token_type": "bearer"})
        verify_password.assert_called_once_with("StrongPass1!", "hashed-password")

    async def test_verify_email_marks_user_verified_and_redirects(self):
        stored_user = SimpleNamespace(
            email="owner@example.com",
            is_email_verified=False,
            email_verified_at=None,
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=stored_user)),
            commit=AsyncMock(),
        )

        with patch("routers.auth.decode_email_verification_token", return_value="owner@example.com"):
            response = await verify_email(token="verify-token", db=db)

        self.assertEqual(response.status_code, 303)
        self.assertIn("/email-verified?status=success", response.headers["location"])
        self.assertTrue(stored_user.is_email_verified)
        self.assertIsNotNone(stored_user.email_verified_at)
        db.commit.assert_awaited_once()

    async def test_verify_email_redirects_invalid_tokens_back_to_login(self):
        db = SimpleNamespace(execute=AsyncMock(), commit=AsyncMock())

        with patch("routers.auth.decode_email_verification_token", side_effect=ValueError("bad token")):
            response = await verify_email(token="bad-token", db=db)

        self.assertEqual(response.status_code, 303)
        self.assertIn("/email-verified?status=invalid", response.headers["location"])
        db.execute.assert_not_called()

    async def test_public_key_endpoint_returns_pem_metadata(self):
        with patch("routers.auth.get_password_public_key_pem", return_value="-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----"):
            response = await auth_public_key()

        self.assertEqual(response["algorithm"], "RSA-OAEP-256")
        self.assertIn("PUBLIC KEY", response["public_key"])


if __name__ == "__main__":
    unittest.main()
