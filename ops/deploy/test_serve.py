"""Integration tests for deployment HTTP behavior; these do not test the game UI."""

import http.client
import os
import tempfile
import threading
import unittest
from pathlib import Path

from serve import create_server


class ReleaseServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.releases = self.root / "releases"
        self.releases.mkdir()
        self.current = self.root / "current"
        self.old = self.make_release("af9928f79ba1", "old")
        self.new = self.make_release("new-release", "new")
        self.activate(self.old)
        self.server = create_server(self.current, self.releases, "127.0.0.1", 0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.temp.cleanup()

    def make_release(self, name, label):
        dist = self.releases / name / "dist"
        (dist / "assets").mkdir(parents=True)
        (dist / "index.html").write_text(label)
        (dist / "deployment.json").write_text('{"release":"' + label + '"}')
        return dist

    def activate(self, dist):
        temporary = self.root / "current-next"
        temporary.symlink_to(dist)
        os.replace(temporary, self.current)

    def request(self, path, method="GET"):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        try:
            connection.request(method, path)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_current_switch_and_uncached_entrypoints(self):
        for path in ("/", "/index.html", "/deployment.json"):
            status, headers, body = self.request(path)
            self.assertEqual(status, 200)
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertIn(b"old", body)
        self.activate(self.new)
        for path in ("/", "/index.html?v=2", "/deployment.json?v=2"):
            status, headers, body = self.request(path)
            self.assertEqual(status, 200)
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertIn(b"new", body)

    def test_retained_hashed_assets_survive_switch(self):
        asset = "game-Abc12_-9.js"
        (self.old / "assets" / asset).write_text("old bundle")
        (self.releases / "broken-link").symlink_to(self.root / "absent")
        self.activate(self.new)
        status, headers, body = self.request("/assets/" + asset)
        self.assertEqual(status, 200)
        self.assertEqual(body, b"old bundle")
        self.assertEqual(headers["Cache-Control"], "public, max-age=31536000, immutable")
        (self.new / "assets" / asset).write_text("current wins")
        self.assertEqual(self.request("/assets/" + asset)[2], b"current wins")

    def test_unhashed_files_do_not_fall_back_and_directories_are_not_listed(self):
        (self.old / "assets" / "plain.js").write_text("old mutable asset")
        (self.new / "settings.json").write_text("{}")
        self.activate(self.new)
        for path in ("/assets/plain.js", "/assets/", "/missing", "/src/main.js", "/.git/config"):
            with self.subTest(path=path):
                status, headers, body = self.request(path)
                self.assertEqual(status, 404)
                self.assertEqual(headers["Cache-Control"], "no-store")
                self.assertEqual(body, b"")
        self.assertEqual(self.request("/settings.json")[1]["Cache-Control"], "no-cache")

    def test_head_has_headers_but_no_body(self):
        status, headers, body = self.request("/", "HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Length"], "3")
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(body, b"")

    def test_rejects_path_traversal_and_symlinks_outside_dist(self):
        secret = self.root / "secret.txt"
        secret.write_text("not public")
        (self.old / "leak.txt").symlink_to(secret)
        (self.old / "assets" / "leak-12345678.js").symlink_to(secret)
        (self.old / ".git").mkdir()
        (self.old / ".git" / "config").write_text("not public")
        (self.old / "alias.txt").symlink_to(self.old / ".git" / "config")
        for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/assets/%2e%2e/index.html", "/%2eGit/config", "/.git/config", "/leak.txt", "/alias.txt", "/%00", "/..%5csecret.txt", "/assets/leak-12345678.js"):
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 404)
        self.activate(self.new)
        self.assertEqual(self.request("/assets/leak-12345678.js")[0], 404)

    def test_current_or_fallback_dist_cannot_escape_release_store(self):
        outside_dist = self.root / "outside" / "dist"
        (outside_dist / "assets").mkdir(parents=True)
        (outside_dist / "index.html").write_text("not public")
        (outside_dist / "assets" / "leak-12345678.js").write_text("not public")
        (self.releases / "evil").symlink_to(outside_dist.parent)
        self.activate(outside_dist)
        self.assertEqual(self.request("/")[0], 404)
        self.assertEqual(self.request("/assets/leak-12345678.js")[0], 404)

    def test_staging_releases_are_not_public(self):
        staging = self.make_release(".staging-next", "not public")
        (staging / "assets" / "leak-12345678.js").write_text("not public")
        self.assertEqual(self.request("/assets/leak-12345678.js")[0], 404)
        self.activate(staging)
        self.assertEqual(self.request("/")[0], 404)


if __name__ == "__main__":
    unittest.main()
