import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from support import FakeScalarResult, ensure_backend_test_env


ensure_backend_test_env()

from fastapi import HTTPException
from models import MessageStatus, MessageType
from routers.messages import mark_message_as_read, send_message
from schemas import MessageCreate


class MessageRouteTests(unittest.IsolatedAsyncioTestCase):
    def build_current_user(self):
        return SimpleNamespace(
            id=1,
            email="owner@example.com",
            full_name="Owner",
            avatar_url="https://example.com/avatar.png",
        )

    async def test_send_message_requires_membership(self):
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult(value=None)),
        )

        with self.assertRaises(HTTPException) as context:
            await send_message(
                conversation_id=12,
                message=MessageCreate(content="Hello", message_type=MessageType.text),
                current_user=self.build_current_user(),
                db=db,
            )

        self.assertEqual(context.exception.status_code, 403)
        self.assertEqual(
            context.exception.detail,
            "You are not a participant in this conversation",
        )

    async def test_send_message_encrypts_content_and_updates_unread_counts(self):
        current_user = self.build_current_user()
        recipient = SimpleNamespace(user_id=2)

        async def refresh_message(message):
            now = datetime.now(timezone.utc)
            message.id = 101
            message.created_at = now
            message.updated_at = now

        db = SimpleNamespace(
            execute=AsyncMock(
                side_effect=[
                    FakeScalarResult(value=SimpleNamespace(conversation_id=44, user_id=1)),
                    FakeScalarResult(values=[recipient]),
                ]
            ),
            add=Mock(),
            commit=AsyncMock(),
            refresh=AsyncMock(side_effect=refresh_message),
        )

        with (
            patch("routers.messages.encrypt_message_content", return_value="enc:v1:test-payload"),
            patch("routers.messages.set_message_status", new=AsyncMock()) as set_status,
            patch("routers.messages.increment_unread_count", new=AsyncMock()) as increment_unread,
        ):
            response = await send_message(
                conversation_id=44,
                message=MessageCreate(content="Ship it", message_type=MessageType.text),
                current_user=current_user,
                db=db,
            )

        saved_message = db.add.call_args.args[0]
        self.assertEqual(saved_message.content, "enc:v1:test-payload")
        self.assertEqual(saved_message.sender_id, current_user.id)
        self.assertEqual(saved_message.conversation_id, 44)
        self.assertEqual(response.content, "Ship it")
        self.assertEqual(response.status, MessageStatus.sent)
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(saved_message)
        set_status.assert_awaited_once_with(44, 101, "sent")
        increment_unread.assert_awaited_once_with(44, 2)

    async def test_mark_message_as_read_updates_redis_and_db(self):
        current_user = self.build_current_user()
        unread_message = SimpleNamespace(id=9)
        db = SimpleNamespace(
            execute=AsyncMock(
                side_effect=[
                    FakeScalarResult(value=SimpleNamespace(conversation_id=55, user_id=1)),
                    FakeScalarResult(values=[unread_message]),
                    FakeScalarResult(),
                ]
            ),
            commit=AsyncMock(),
        )

        with (
            patch("routers.messages.set_bulk_message_status", new=AsyncMock()) as set_bulk_status,
            patch("routers.messages.reset_unread_count", new=AsyncMock()) as reset_unread,
        ):
            response = await mark_message_as_read(
                conversation_id=55,
                current_user=current_user,
                db=db,
            )

        self.assertEqual(response, {"message": "Messages marked as read"})
        set_bulk_status.assert_awaited_once_with(55, [9], "read")
        reset_unread.assert_awaited_once_with(current_user.id, 55)
        db.commit.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
