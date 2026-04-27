import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from support import FakeScalarResult, ensure_backend_test_env


ensure_backend_test_env()

from fastapi import HTTPException
from routers.users import check_username, delete_my_account, search_users, update_me
from schemas import UserUpdate


class UsersRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_delete_my_account_removes_created_conversations_and_user(self):
        current_user = SimpleNamespace(id=1, email="owner@example.com")
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(values=[62, 63])),
            commit=AsyncMock(),
        )

        response = await delete_my_account(current_user=current_user, db=db)

        self.assertEqual(
            response,
            {"message": "Your account and associated messages have been permanently deleted."},
        )
        self.assertEqual(db.execute.await_count, 5)
        db.commit.assert_awaited_once()

    async def test_delete_my_account_removes_only_user_rows_when_no_created_conversations(self):
        current_user = SimpleNamespace(id=1, email="owner@example.com")
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(values=[])),
            commit=AsyncMock(),
        )

        response = await delete_my_account(current_user=current_user, db=db)

        self.assertEqual(
            response,
            {"message": "Your account and associated messages have been permanently deleted."},
        )
        self.assertEqual(db.execute.await_count, 4)
        db.commit.assert_awaited_once()

    async def test_check_username_returns_available_for_unused_username(self):
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=None)),
        )

        response = await check_username(username="unique_handle", db=db)

        self.assertEqual(response, {"available": True, "message": "Username is available"})
        db.execute.assert_awaited_once()

    async def test_check_username_returns_taken_for_existing_username(self):
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=SimpleNamespace(id=2, full_name="unique_handle"))),
        )

        response = await check_username(username="Unique_Handle", db=db)

        self.assertEqual(response, {"available": False, "message": "Username is already taken"})
        db.execute.assert_awaited_once()

    async def test_check_username_returns_taken_when_multiple_duplicate_rows_exist(self):
        db = SimpleNamespace(
            execute=AsyncMock(
                return_value=FakeScalarResult(
                    values=[
                        SimpleNamespace(id=2, full_name="unique_handle"),
                        SimpleNamespace(id=3, full_name="Unique_Handle"),
                    ]
                )
            ),
        )

        response = await check_username(username="Unique_Handle", db=db)

        self.assertEqual(response, {"available": False, "message": "Username is already taken"})
        db.execute.assert_awaited_once()

    async def test_check_username_returns_validation_message_for_invalid_username(self):
        db = SimpleNamespace(
            execute=AsyncMock(),
        )

        response = await check_username(username="ab", db=db)

        self.assertEqual(response, {"available": False, "message": "Username must be at least 3 characters long"})
        db.execute.assert_not_called()

    async def test_update_me_only_changes_supplied_fields(self):
        current_user = SimpleNamespace(
            id=1,
            email="owner@example.com",
            full_name="Old Name",
            avatar_url="https://example.com/original.png",
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=None)),
            add=Mock(),
            commit=AsyncMock(),
            refresh=AsyncMock(),
        )

        response = await update_me(
            user_update=UserUpdate(full_name="New Name"),
            current_user=current_user,
            db=db,
        )

        self.assertIs(response, current_user)
        self.assertEqual(current_user.full_name, "New Name")
        self.assertEqual(current_user.avatar_url, "https://example.com/original.png")
        db.add.assert_called_once_with(current_user)
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(current_user)

    async def test_update_me_rejects_duplicate_username_case_insensitively(self):
        current_user = SimpleNamespace(
            id=1,
            email="owner@example.com",
            full_name="Owner",
            avatar_url=None,
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=SimpleNamespace(id=2, full_name="owner"))),
            add=Mock(),
            commit=AsyncMock(),
            refresh=AsyncMock(),
        )

        with self.assertRaises(HTTPException) as context:
            await update_me(
                user_update=UserUpdate(full_name="OWNER"),
                current_user=current_user,
                db=db,
            )

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(context.exception.detail, "Username is already taken")
        db.add.assert_not_called()
        db.commit.assert_not_awaited()
        db.refresh.assert_not_awaited()

    async def test_search_users_rejects_short_queries(self):
        db = SimpleNamespace(execute=AsyncMock())
        current_user = SimpleNamespace(id=1)

        with self.assertRaises(HTTPException) as context:
            await search_users(q="a", db=db, current_user=current_user)

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(
            context.exception.detail,
            "Search query must be at least 2 characters long",
        )
        db.execute.assert_not_called()

    async def test_search_users_returns_matching_results(self):
        current_user = SimpleNamespace(id=1)
        matching_users = [
            SimpleNamespace(id=2, email="teammate@example.com", full_name="Teammate", avatar_url=None),
            SimpleNamespace(id=3, email="tester@example.com", full_name="QA Tester", avatar_url=None),
        ]
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(values=matching_users)),
        )

        results = await search_users(q="te", db=db, current_user=current_user)

        self.assertEqual(results, matching_users)
        db.execute.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
