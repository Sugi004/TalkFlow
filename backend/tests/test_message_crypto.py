import os
import unittest

from backend.message_crypto import decrypt_message_content, encrypt_message_content, is_encrypted_content


class MessageCryptoTests(unittest.TestCase):
    def setUp(self):
        self.previous_key = os.environ.get("MESSAGE_ENCRYPTION_KEY")
        os.environ["MESSAGE_ENCRYPTION_KEY"] = "devchat-test-message-key"

    def tearDown(self):
        if self.previous_key is None:
            os.environ.pop("MESSAGE_ENCRYPTION_KEY", None)
        else:
            os.environ["MESSAGE_ENCRYPTION_KEY"] = self.previous_key

    def test_roundtrip_encrypts_and_decrypts_plaintext(self):
        plaintext = "hello from DevChat"
        encrypted = encrypt_message_content(plaintext)

        self.assertNotEqual(encrypted, plaintext)
        self.assertTrue(is_encrypted_content(encrypted))
        self.assertEqual(decrypt_message_content(encrypted), plaintext)

    def test_plaintext_values_remain_backward_compatible(self):
        self.assertEqual(decrypt_message_content("legacy plaintext"), "legacy plaintext")
        self.assertEqual(encrypt_message_content(""), "")
        self.assertIsNone(encrypt_message_content(None))


if __name__ == "__main__":
    unittest.main()
