import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from models import Conversation, Participants, User
from routers.conversation import (
    add_participant,
    leave_or_delete_conversation,
    remove_participant,
    update_group_conversation,
)
from routers.users import delete_my_avatar
from schemas import GroupConversationUpdate, ParticipantCreate


class FakeScalarResult:
    def __init__(self, value=None, values=None):
        self.value = value
        self.values = values or []

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        return self

    def all(self):
        return self.values

    def first(self):
        return self.value


def build_user(user_id: int, email: str, full_name: str):
    now = datetime.now(timezone.utc)
    user = User(
        id=user_id,
        email=email,
        hashed_password="hashed",
        full_name=full_name,
        avatar_url=None,
    )
    user.created_at = now
    user.updated_at = now
    user.last_seen = now
    user.is_online = False
    return user


def build_conversation(conversation_id: int = 1):
    now = datetime.now(timezone.utc)
    conversation = Conversation(
        id=conversation_id,
        is_group=True,
        group_name="Dev Squad",
        group_avatar_url=None,
        created_by=1,
    )
    conversation.created_at = now
    conversation.updated_at = now
    return conversation


def build_participant(conversation_id: int, user_id: int, is_admin: bool = False):
    participant = Participants(conversation_id=conversation_id, user_id=user_id, is_admin=is_admin)
    participant.joined_at = datetime.now(timezone.utc)
    return participant


class GroupAndProfileTests(unittest.IsolatedAsyncioTestCase):
    async def test_delete_my_avatar_clears_avatar(self):
        user = build_user(1, "owner@example.com", "Owner")
        user.avatar_url = "https://example.com/avatar.png"
        db = SimpleNamespace(add=Mock(), commit=AsyncMock(), refresh=AsyncMock())

        response = await delete_my_avatar(current_user=user, db=db)

        self.assertIsNone(user.avatar_url)
        self.assertIs(response, user)
        db.add.assert_called_once_with(user)
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(user)

    async def test_add_participant_creates_new_group_member(self):
        conversation = build_conversation()
        current_user = build_user(1, "owner@example.com", "Owner")
        new_user = build_user(2, "member@example.com", "Member")
        current_participant = build_participant(conversation.id, current_user.id, is_admin=True)
        joined_at = datetime.now(timezone.utc)
        persisted_new_participant = build_participant(conversation.id, new_user.id)

        async def populate_participant(participant):
            participant.id = 99
            participant.joined_at = joined_at

        db = SimpleNamespace(
            execute=AsyncMock(side_effect=[
                FakeScalarResult(value=conversation),
                FakeScalarResult(value=current_participant),
                FakeScalarResult(value=current_participant),
                FakeScalarResult(value=None),
                FakeScalarResult(value=new_user),
                FakeScalarResult(values=[
                    (current_participant, current_user),
                    (persisted_new_participant, new_user),
                ]),
            ]),
            add=Mock(),
            commit=AsyncMock(),
            refresh=AsyncMock(side_effect=populate_participant),
        )

        with patch("routers.conversation.publish_membership_event", new=AsyncMock()) as publish_event:
            response = await add_participant(
                conversation_id=conversation.id,
                data=ParticipantCreate(user_id=new_user.id),
                current_user=current_user,
                db=db,
            )

        added_participant = db.add.call_args.args[0]
        self.assertIsInstance(added_participant, Participants)
        self.assertEqual(added_participant.user_id, new_user.id)
        self.assertEqual(response.id, 99)
        self.assertEqual(response.user_id, new_user.id)
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once()
        publish_event.assert_awaited_once()

    async def test_update_group_conversation_updates_name_and_avatar(self):
        conversation = build_conversation()
        current_user = build_user(1, "owner@example.com", "Owner")
        admin_participant = build_participant(conversation.id, current_user.id, is_admin=True)
        member = build_user(2, "member@example.com", "Member")
        member_participant = build_participant(conversation.id, member.id, is_admin=False)
        payload = GroupConversationUpdate(group_name="Launch Team", group_avatar_url="https://example.com/group.png")

        db = SimpleNamespace(
            execute=AsyncMock(side_effect=[
                FakeScalarResult(value=conversation),
                FakeScalarResult(value=admin_participant),
                FakeScalarResult(values=[
                    (admin_participant, current_user),
                    (member_participant, member),
                ]),
            ]),
            add=Mock(),
            commit=AsyncMock(),
            refresh=AsyncMock(),
        )

        with patch("routers.conversation.get_online_map", new=AsyncMock(return_value={})) as get_online_map:
            response = await update_group_conversation(
                conversation_id=conversation.id,
                data=payload,
                current_user=current_user,
                db=db,
            )

        self.assertEqual(conversation.group_name, "Launch Team")
        self.assertEqual(conversation.group_avatar_url, "https://example.com/group.png")
        self.assertTrue(response.current_user_is_admin)
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(conversation)
        get_online_map.assert_awaited_once()

    async def test_remove_participant_deletes_target_member(self):
        conversation = build_conversation()
        current_user = build_user(1, "owner@example.com", "Owner")
        admin_participant = build_participant(conversation.id, current_user.id, is_admin=True)
        target_participant = build_participant(conversation.id, 2, is_admin=False)
        target_user = build_user(2, "member@example.com", "Member")
        remaining = [admin_participant]

        db = SimpleNamespace(
            execute=AsyncMock(side_effect=[
                FakeScalarResult(value=conversation),
                FakeScalarResult(value=admin_participant),
                FakeScalarResult(value=target_participant),
                FakeScalarResult(value=target_user),
                FakeScalarResult(values=remaining),
            ]),
            delete=AsyncMock(),
            flush=AsyncMock(),
            commit=AsyncMock(),
        )

        with patch("routers.conversation.publish_membership_event", new=AsyncMock()) as publish_event:
            response = await remove_participant(
                conversation_id=conversation.id,
                user_id=2,
                current_user=current_user,
                db=db,
            )

        self.assertEqual(response["message"], "Participant removed")
        db.delete.assert_awaited_once_with(target_participant)
        db.flush.assert_awaited_once()
        db.commit.assert_awaited_once()
        publish_event.assert_awaited_once()

    async def test_admin_leave_reassigns_group_admin(self):
        conversation = build_conversation()
        current_user = build_user(1, "owner@example.com", "Owner")
        leaving_participant = build_participant(conversation.id, current_user.id, is_admin=True)
        remaining_participant = build_participant(conversation.id, 2, is_admin=False)
        promoted_user = build_user(2, "member@example.com", "Member")

        db = SimpleNamespace(
            execute=AsyncMock(side_effect=[
                FakeScalarResult(value=conversation),
                FakeScalarResult(value=leaving_participant),
                FakeScalarResult(values=[remaining_participant]),
                FakeScalarResult(value=promoted_user),
            ]),
            delete=AsyncMock(),
            flush=AsyncMock(),
            commit=AsyncMock(),
        )

        with patch("routers.conversation.publish_membership_event", new=AsyncMock()) as publish_event:
            response = await leave_or_delete_conversation(
                conversation_id=conversation.id,
                current_user=current_user,
                db=db,
            )

        self.assertEqual(response["message"], "Left conversation")
        self.assertTrue(remaining_participant.is_admin)
        db.delete.assert_awaited_once_with(leaving_participant)
        db.flush.assert_awaited_once()
        db.commit.assert_awaited_once()
        publish_event.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
