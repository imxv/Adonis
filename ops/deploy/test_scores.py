"""Integration tests for the global leaderboard API in serve.py."""

import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from serve import ScoreBoard, clean_entry, create_server


def run(**over):
    entry = {"name": "骑士", "score": 1200, "floor": 2, "kills": 80, "lv": 9, "secs": 300, "diff": "normal", "victory": False, "rank": "B", "weapon": "spear", "pid": "p1"}
    entry.update(over)
    return entry


class ScoreApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        dist = root / "releases" / "r1" / "dist"
        dist.mkdir(parents=True)
        (dist / "index.html").write_text("game")
        (root / "current").symlink_to(dist)
        self.scores = root / "state" / "scores.json"
        self.server = create_server(root / "current", root / "releases", "127.0.0.1", 0, self.scores)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.temp.cleanup()

    def call(self, method, path, body=None, client="10.0.0.1"):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        try:
            data = json.dumps(body).encode() if body is not None else None
            headers = {"Content-Type": "application/json", "X-Forwarded-For": client}
            connection.request(method, path, body=data, headers=headers)
            response = connection.getresponse()
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
        finally:
            connection.close()

    def test_empty_board_then_submit_ranks_and_persists(self):
        status, body = self.call("GET", "/api/scores")
        self.assertEqual(status, 200)
        self.assertEqual(body["top"], [])
        status, body = self.call("POST", "/api/scores", run(score=900))
        self.assertEqual((status, body["rank"], body["runs"]), (200, 1, 1))
        status, body = self.call("POST", "/api/scores", run(score=1500, pid="p2"), client="10.0.0.2")
        self.assertEqual(body["rank"], 1)
        self.assertEqual([e["score"] for e in body["top"]], [1500, 900])
        self.assertNotIn("pid", body["top"][0])
        self.assertTrue(json.loads(self.scores.read_text())["entries"])

    def test_own_entries_are_marked_by_player_id(self):
        self.call("POST", "/api/scores", run(score=500, pid="me"))
        self.call("POST", "/api/scores", run(score=700, pid="other"), client="10.0.0.9")
        status, body = self.call("GET", "/api/scores?pid=me")
        self.assertEqual(status, 200)
        self.assertEqual([e["you"] for e in body["top"]], [False, True])
        self.assertEqual(body["best"], 2)

    def test_rejects_malformed_and_implausible_runs(self):
        for bad in (run(score=-1), run(diff="nightmare"), run(score=10_000_000), run(kills="lots"), run(score=999_999, kills=0, floor=1), [1, 2]):
            status, _ = self.call("POST", "/api/scores", bad, client=f"10.1.{len(str(bad))}.1")
            self.assertEqual(status, 400)

    def test_rate_limit_per_client(self):
        self.assertEqual(self.call("POST", "/api/scores", run())[0], 200)
        self.assertEqual(self.call("POST", "/api/scores", run())[0], 429)
        self.assertEqual(self.call("POST", "/api/scores", run(), client="10.0.0.3")[0], 200)

    def test_static_files_still_served(self):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        connection.request("GET", "/")
        self.assertEqual(connection.getresponse().read(), b"game")
        connection.close()


class CleanEntryTests(unittest.TestCase):
    def test_name_is_trimmed_and_defaults(self):
        self.assertEqual(clean_entry(run(name="  \x07超长的名字一二三四五六七八九十 "))["name"], "超长的名字一二三四五六七")
        self.assertEqual(clean_entry(run(name=""))["name"], "无名骑士")

    def test_board_keeps_best_and_survives_reload(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "scores.json"
            board = ScoreBoard(path)
            for i in range(3):
                board.submit(run(score=100 * i, pid=f"p{i}"), client=f"c{i}", now=1000 + i)
            again = ScoreBoard(path)
            self.assertEqual([e["score"] for e in again.top()["top"]], [200, 100, 0])
            self.assertEqual(again.runs, 3)


if __name__ == "__main__":
    unittest.main()
