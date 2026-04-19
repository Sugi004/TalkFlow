import base64
import hashlib
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


ENCRYPTION_PREFIX = "enc:v1:"
UNREADABLE_MESSAGE_PLACEHOLDER = "[Unable to decrypt message]"


def _get_message_encryption_key() -> bytes:
    key_material = os.getenv("MESSAGE_ENCRYPTION_KEY") or os.getenv("SECRET_KEY")
    if not key_material:
        raise RuntimeError("Missing MESSAGE_ENCRYPTION_KEY or SECRET_KEY for message encryption")
    return hashlib.sha256(key_material.encode("utf-8")).digest()


def is_encrypted_content(value: str | None) -> bool:
    return bool(value and value.startswith(ENCRYPTION_PREFIX))


def encrypt_message_content(value: str | None) -> str | None:
    if value is None or value == "" or is_encrypted_content(value):
        return value

    nonce = os.urandom(12)
    cipher = AESGCM(_get_message_encryption_key())
    ciphertext = cipher.encrypt(nonce, value.encode("utf-8"), None)
    payload = base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")
    return f"{ENCRYPTION_PREFIX}{payload}"


def decrypt_message_content(value: str | None) -> str | None:
    if value is None or value == "" or not is_encrypted_content(value):
        return value

    encoded = value[len(ENCRYPTION_PREFIX):]
    raw = base64.urlsafe_b64decode(encoded.encode("ascii"))
    nonce, ciphertext = raw[:12], raw[12:]
    cipher = AESGCM(_get_message_encryption_key())
    return cipher.decrypt(nonce, ciphertext, None).decode("utf-8")


def decrypt_message_content_safe(
    value: str | None,
    fallback: str | None = UNREADABLE_MESSAGE_PLACEHOLDER,
) -> str | None:
    try:
        return decrypt_message_content(value)
    except (InvalidTag, ValueError, TypeError):
        return fallback
