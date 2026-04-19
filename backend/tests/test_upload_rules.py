import unittest

from support import ensure_backend_test_env


ensure_backend_test_env()

from upload_rules import is_allowed_upload, normalize_content_type, sanitize_file_name


class UploadRulesTests(unittest.TestCase):
    def test_source_files_are_allowed_with_empty_mime(self):
        self.assertTrue(is_allowed_upload("component.tsx", ""))
        self.assertEqual(normalize_content_type("component.tsx", ""), "text/plain")

    def test_special_project_files_are_allowed(self):
        self.assertTrue(is_allowed_upload("Dockerfile", ""))
        self.assertEqual(normalize_content_type("Dockerfile", ""), "text/plain")

    def test_images_keep_renderable_content_type(self):
        self.assertEqual(normalize_content_type("photo.png", ""), "image/png")
        self.assertTrue(is_allowed_upload("photo.png", "image/png"))

    def test_unknown_binary_is_rejected(self):
        self.assertFalse(is_allowed_upload("program.exe", "application/x-msdownload"))

    def test_path_segments_are_removed_from_file_name(self):
        self.assertEqual(sanitize_file_name("../src/App.tsx"), "App.tsx")


if __name__ == "__main__":
    unittest.main()
