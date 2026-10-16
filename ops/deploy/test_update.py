"""Deployment integration tests: local Git, fake npm, and a real HTTP server."""

import functools
import http.server
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("adonis_update", Path(__file__).with_name("update.py"))
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.repo = self.root / "repository"
        self.repo.mkdir()
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Deployment Test")
        self.git("config", "user.email", "deploy@example.invalid")
        self.binary = self.root / "bin"
        self.binary.mkdir()
        npm = self.binary / "npm"
        npm.write_text(f"#!{sys.executable}\n" + '''
import os
from pathlib import Path
import sys
with Path(os.environ["FAKE_NPM_LOG"]).open("a") as log:
    log.write(" ".join(sys.argv[1:]) + "\\n")
if sys.argv[1] == "ci":
    Path("node_modules").mkdir(exist_ok=True)
else:
    payload = Path("payload.txt").read_text()
    if payload == "FAIL":
        sys.exit(23)
    Path("dist/assets").mkdir(parents=True, exist_ok=True)
    Path("dist/index.html").write_text('<html>' + payload + '<script src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css"></html>')
    Path("dist/assets/app.js").write_text("console.log('test')")
    if payload != "MISSING_ASSET":
        Path("dist/assets/app.css").write_text("body {}")
''')
        npm.chmod(0o755)
        self.npm_log = self.root / "npm.log"
        self.environment = patch.dict(os.environ, {
            "PATH": str(self.binary) + os.pathsep + os.environ["PATH"],
            "FAKE_NPM_LOG": str(self.npm_log),
        })
        self.environment.start()
        self.health_timeout = patch.object(update, "HEALTH_SECONDS", 0)
        self.health_timeout.start()
        current = self.root / "current"
        self.bad_health = False
        test = self

        class Handler(http.server.SimpleHTTPRequestHandler):
            def do_GET(self):
                if test.bad_health and self.path.startswith("/deployment.json"):
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b'{"sourceCommit":"wrong"}')
                else:
                    super().do_GET()

            def log_message(self, *_args):
                pass

        self.server = http.server.ThreadingHTTPServer(
            ("127.0.0.1", 0), functools.partial(Handler, directory=str(current)),
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.config = {
            "repo_url": str(self.repo), "branch": "main", "state_dir": str(self.root / "state"),
            "releases_dir": str(self.root / "releases"), "current_link": str(current),
            "poll_seconds": 1, "retry_seconds": 300, "keep_releases": 2,
            "command_timeout_seconds": 10,
            "health_url": f"http://127.0.0.1:{self.server.server_port}",
        }
        self.updater = update.Updater(self.config)
        self.commit("first")

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.health_timeout.stop()
        self.environment.stop()
        self.temporary.cleanup()

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.repo), *args], stderr=subprocess.DEVNULL, text=True).strip()

    def commit(self, payload):
        (self.repo / "payload.txt").write_text(payload)
        self.git("add", "payload.txt")
        self.git("commit", "-m", payload)
        return self.git("rev-parse", "HEAD")

    def published(self):
        return self.updater.status()["deployment"].get("sourceCommit")

    def calls(self):
        return self.npm_log.read_text().splitlines() if self.npm_log.exists() else []

    def test_success_and_duplicate_commit_are_idempotent(self):
        sha = self.git("rev-parse", "HEAD")
        self.assertTrue(self.updater.once())
        self.assertEqual(self.published(), sha)
        self.assertEqual(self.calls(), ["ci --no-audit --no-fund", "run build"])
        target = self.updater.target()
        self.assertTrue(self.updater.once())
        self.assertEqual(self.updater.target(), target)
        self.assertEqual(len(self.calls()), 2)
        self.assertTrue(self.updater.once(force=True))
        self.assertNotEqual(self.updater.target(), target)
        self.assertEqual(self.published(), sha)

    def test_build_failure_preserves_current_and_retries_new_commit_immediately(self):
        self.assertTrue(self.updater.once())
        old = self.updater.target()
        failed_sha = self.commit("FAIL")
        self.assertFalse(self.updater.once())
        self.assertEqual(self.updater.target(), old)
        self.assertEqual(self.updater.status()["status"]["failedCommit"], failed_sha)
        count = len(self.calls())
        self.assertTrue(self.updater.once())
        self.assertEqual(self.updater.status()["status"]["phase"], "backoff")
        self.assertEqual(len(self.calls()), count)
        new_sha = self.commit("recovered")
        self.assertTrue(self.updater.once())
        self.assertEqual(self.published(), new_sha)
        self.assertFalse(list(self.updater.releases.glob(".building-*")))

    def test_health_failure_restores_previous_link(self):
        self.assertTrue(self.updater.once())
        old = self.updater.target()
        self.commit("second")
        self.bad_health = True
        self.assertFalse(self.updater.once())
        self.assertEqual(self.updater.target(), old)
        self.assertIn("health check failed", self.updater.status()["status"]["lastError"])

    def test_missing_asset_is_rejected_before_publication(self):
        self.assertTrue(self.updater.once())
        old = self.updater.target()
        self.commit("MISSING_ASSET")
        self.assertFalse(self.updater.once())
        self.assertEqual(self.updater.target(), old)
        self.assertIn("missing local asset", self.updater.status()["status"]["lastError"])

    def test_metadata_write_failure_after_health_preserves_live_tree(self):
        self.assertTrue(self.updater.once())
        old = self.updater.target()
        new_sha = self.commit("second")
        original = update.write_json

        def fail_success_status(path, value):
            if Path(path) == self.updater.status_path and value.get("phase") == "idle" and value.get("currentCommit") == new_sha:
                raise OSError("injected status write failure")
            original(path, value)

        with patch.object(update, "write_json", side_effect=fail_success_status):
            self.assertFalse(self.updater.once())
        self.assertEqual(self.updater.target(), old)
        self.assertTrue((old / "index.html").is_file())
        self.updater.remove(old.parent)
        self.assertTrue((old / "index.html").is_file())

    def test_lock_and_pause_prevent_deployment(self):
        with update.locked(self.updater.lock_path):
            self.assertFalse(self.updater.once())
            with self.assertRaisesRegex(RuntimeError, "updates paused; a build is finishing"):
                self.updater.rollback()
        self.assertTrue(self.updater.paused())
        self.updater.control(True)
        self.assertTrue(self.updater.once())
        self.assertIsNone(self.updater.target())
        self.assertEqual(self.calls(), [])
        self.updater.control(False)
        self.assertTrue(self.updater.once())

    def test_pause_during_build_prevents_promotion(self):
        build = self.updater.build

        def pause_after_build(sha):
            release = build(sha)
            self.updater.control(True)
            return release

        with patch.object(self.updater, "build", side_effect=pause_after_build):
            self.assertTrue(self.updater.once())
        self.assertIsNone(self.updater.target())
        self.assertFalse(list(self.updater.releases.glob(".building-*")))

    def test_branch_advancing_during_build_skips_stale_release(self):
        build = self.updater.build

        def advance_after_build(sha):
            release = build(sha)
            self.commit("new-head")
            return release

        with patch.object(self.updater, "build", side_effect=advance_after_build):
            self.assertTrue(self.updater.once())
        self.assertIsNone(self.updater.target())
        self.assertEqual(self.updater.status()["status"]["phase"], "superseded")
        self.assertTrue(self.updater.once())
        self.assertEqual(self.published(), self.git("rev-parse", "HEAD"))

    def test_rollback_pauses_following_and_retains_manual_directories(self):
        manual = self.updater.releases / "af9928f79ba1"
        manual.mkdir()
        (manual / "keep.txt").write_text("manual release")
        first_sha = self.git("rev-parse", "HEAD")
        self.assertTrue(self.updater.once())
        self.commit("second")
        self.assertTrue(self.updater.once())
        self.updater.rollback()
        self.assertEqual(self.published(), first_sha)
        self.assertTrue(self.updater.paused())
        self.assertTrue(self.updater.once())
        self.assertEqual(self.published(), first_sha)
        self.assertTrue((manual / "keep.txt").is_file())

    def test_timeout_terminates_build_children(self):
        sentinel = self.root / "orphan-wrote.txt"
        child = f"import time; from pathlib import Path; time.sleep(0.8); Path({str(sentinel)!r}).write_text('orphan')"
        parent = f"import subprocess,sys,time; subprocess.Popen([sys.executable, '-c', {child!r}]); time.sleep(30)"
        self.updater.config["command_timeout_seconds"] = 0.2
        with self.assertRaises(subprocess.TimeoutExpired):
            self.updater.command([sys.executable, "-c", parent])
        time.sleep(1)
        self.assertFalse(sentinel.exists())

    def test_manual_release_remains_selectable_after_two_auto_publications(self):
        manual = self.updater.releases / "af9928f79ba1" / "dist"
        manual.mkdir(parents=True)
        manual_sha = "af9928f79ba1" + "0" * 28
        (manual / "index.html").write_text("<html>manual bootstrap release</html>")
        update.write_json(manual / "deployment.json", {"sourceCommit": manual_sha})
        self.updater.current.symlink_to(manual, target_is_directory=True)
        self.assertTrue(self.updater.once())
        self.commit("second")
        self.assertTrue(self.updater.once())
        self.assertNotEqual(self.updater.status()["status"]["previousTarget"], str(manual))
        self.updater.rollback(manual_sha)
        self.assertEqual(self.updater.target(), manual)
        self.assertEqual(self.published(), manual_sha)
        self.assertTrue(self.updater.paused())
        self.assertTrue((manual / "index.html").is_file())


if __name__ == "__main__":
    unittest.main()
