import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from support import FakeScalarResult, ensure_backend_test_env


ensure_backend_test_env()

from fastapi import HTTPException
from routers.users import search_users, update_me
from schemas import UserUpdate


class UsersRouteTests(unittest.IsolatedAsyncioTestCase):
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
