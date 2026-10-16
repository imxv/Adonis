#!/usr/bin/env python3
"""Serve the active dist and retained, fingerprinted assets without a restart, plus the global leaderboard."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import shutil
import threading
import time
from functools import partial
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit


HASHED_ASSET = re.compile(r"[-.][A-Za-z0-9_-]{8,}\.[A-Za-z0-9.]+$")

SCORES_PATH = "/api/scores"
STYLE_RANKS = ("D", "C", "B", "A", "S", "SS")


class RateLimited(Exception):
    pass


def clean_entry(raw: object) -> dict:
    """Validate a submitted run. Raises ValueError on anything malformed or implausible."""
    if not isinstance(raw, dict):
        raise ValueError("entry")

    def number(key: str, low: int, high: int) -> int:
        value = raw.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(key)
        value = int(value)
        if not low <= value <= high:
            raise ValueError(key)
        return value

    name = "".join(ch for ch in str(raw.get("name", "")) if ch.isprintable()).strip()[:12] or "无名骑士"
    score = number("score", 0, 5_000_000)
    floor = number("floor", 1, 9)
    kills = number("kills", 0, 50_000)
    level = number("lv", 1, 200)
    secs = number("secs", 0, 6 * 3600)
    diff = raw.get("diff")
    if diff not in ("easy", "normal", "hard"):
        raise ValueError("diff")
    # Not proof against cheating, only against numbers no real run can reach.
    if score > 50_000 + kills * 900 + floor * 20_000:
        raise ValueError("score")
    rank = raw.get("rank") if raw.get("rank") in STYLE_RANKS else "D"
    return {
        "name": name,
        "score": score,
        "floor": floor,
        "kills": kills,
        "lv": level,
        "secs": secs,
        "diff": diff,
        "victory": raw.get("victory") is True,
        "rank": rank,
        "weapon": str(raw.get("weapon", ""))[:16],
        "pid": str(raw.get("pid", ""))[:40],
    }


class ScoreBoard:
    """The global leaderboard: validated runs, best first, kept in one JSON file that is replaced atomically."""

    KEEP = 500
    TOP = 50
    COOLDOWN = 8.0

    def __init__(self, path: Path):
        self.path = Path(path)
        self.lock = threading.Lock()
        self.last_post: dict[str, float] = {}
        self.entries: list[dict] = []
        self.runs = 0
        try:
            data = json.loads(self.path.read_text("utf-8"))
            if isinstance(data, dict):
                self.entries = [e for e in data.get("entries", []) if isinstance(e, dict) and isinstance(e.get("score"), int)]
                self.runs = int(data.get("runs", len(self.entries)))
        except (OSError, ValueError, TypeError):
            pass

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(self.path.name + ".tmp")
        temporary.write_text(json.dumps({"runs": self.runs, "entries": self.entries}, ensure_ascii=False), "utf-8")
        os.replace(temporary, self.path)

    def _public(self, entries: list[dict], pid: str) -> list[dict]:
        out = []
        for e in entries:
            row = {k: v for k, v in e.items() if k != "pid"}
            row["you"] = bool(pid) and e.get("pid") == pid
            out.append(row)
        return out

    def top(self, pid: str = "") -> dict:
        with self.lock:
            best = next((i + 1 for i, e in enumerate(self.entries) if pid and e.get("pid") == pid), 0)
            return {"top": self._public(self.entries[: self.TOP], pid), "runs": self.runs, "best": best}

    def submit(self, raw: object, client: str, now: float | None = None) -> dict:
        entry = clean_entry(raw)
        now = time.time() if now is None else now
        with self.lock:
            if now - self.last_post.get(client, -1e9) < self.COOLDOWN:
                raise RateLimited()
            self.last_post[client] = now
            entry["date"] = int(now * 1000)
            self.entries.append(entry)
            self.entries.sort(key=lambda e: (-e["score"], e.get("date", 0)))
            rank = next(i + 1 for i, e in enumerate(self.entries) if e is entry)
            self.runs += 1
            del self.entries[self.KEEP:]
            self._save()
            pid = entry["pid"]
            best = next((i + 1 for i, e in enumerate(self.entries) if pid and e.get("pid") == pid), 0)
            return {"rank": rank, "runs": self.runs, "best": best, "top": self._public(self.entries[: self.TOP], pid)}


class ReleaseHandler(BaseHTTPRequestHandler):
    """Resolve current once per request, then serve only a release's dist files."""

    def __init__(self, *args, current: Path, releases: Path, board: ScoreBoard | None = None, **kwargs):
        self.current = Path(current)
        self.releases = Path(releases).resolve()
        self.board = board
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if urlsplit(self.path).path == SCORES_PATH:
            self._scores_get()
            return
        self._serve(head_only=False)

    def do_POST(self):
        if urlsplit(self.path).path == SCORES_PATH:
            self._scores_post()
            return
        self._not_found()

    # ---- leaderboard API

    def _json(self, status: HTTPStatus, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _client(self) -> str:
        forwarded = self.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        return forwarded or self.client_address[0]

    def _scores_get(self):
        if self.board is None:
            self._not_found()
            return
        pid = parse_qs(urlsplit(self.path).query).get("pid", [""])[0][:40]
        self._json(HTTPStatus.OK, self.board.top(pid))

    def _scores_post(self):
        if self.board is None:
            self._not_found()
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if not 0 < length <= 4096:
            self._json(HTTPStatus.BAD_REQUEST, {"error": "size"})
            return
        try:
            raw = json.loads(self.rfile.read(length).decode("utf-8"))
            result = self.board.submit(raw, self._client())
        except RateLimited:
            self._json(HTTPStatus.TOO_MANY_REQUESTS, {"error": "slow down"})
            return
        except (ValueError, UnicodeDecodeError):
            self._json(HTTPStatus.BAD_REQUEST, {"error": "invalid"})
            return
        self._json(HTTPStatus.OK, result)

    def do_HEAD(self):
        self._serve(head_only=True)

    def _request_parts(self) -> tuple[str, ...] | None:
        try:
            path = unquote(urlsplit(self.path).path, errors="strict")
        except (UnicodeError, ValueError):
            return None
        if not path.startswith("/") or "\x00" in path or "\\" in path:
            return None
        parts = tuple(part for part in path.split("/") if part)
        # Reject rather than normalize traversal, hidden files, and .git paths.
        if any(part.startswith(".") for part in parts):
            return None
        return parts or ("index.html",)

    def _dist_root(self, path: Path) -> Path | None:
        try:
            root = path.resolve(strict=True)
            # current must resolve to releases/<release>/dist. Symlinked release
            # directories or dist directories cannot escape the release store.
            if (root.name != "dist" or root.parent.parent != self.releases
                    or root.parent.name.startswith(".")):
                return None
            if not root.is_dir():
                return None
            return root
        except (OSError, RuntimeError):
            return None

    @staticmethod
    def _file_in_dist(root: Path, parts: tuple[str, ...]) -> Path | None:
        try:
            candidate = root.joinpath(*parts).resolve(strict=True)
            relative = candidate.relative_to(root)
            if any(part.startswith(".") for part in relative.parts):
                return None
            return candidate if candidate.is_file() else None
        except (OSError, RuntimeError, ValueError):
            return None

    def _find_file(self, parts: tuple[str, ...], hashed_asset: bool) -> Path | None:
        current_root = self._dist_root(self.current)
        if current_root is not None:
            candidate = self._file_in_dist(current_root, parts)
            if candidate is not None:
                return candidate
        if not hashed_asset:
            return None
        try:
            entries = list(self.releases.iterdir())
        except OSError:
            return None
        releases = []
        for entry in entries:
            try:
                releases.append((entry.stat().st_mtime, entry))
            except OSError:
                # Cleanup or a broken symlink must not disable other fallbacks.
                continue
        # Newest first is useful for retained assets shared by releases.
        for _, release in sorted(releases, reverse=True):
            root = self._dist_root(release / "dist")
            if root is None or root == current_root:
                continue
            candidate = self._file_in_dist(root, parts)
            if candidate is not None:
                return candidate
        return None

    def _not_found(self):
        self.send_response(HTTPStatus.NOT_FOUND)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _serve(self, head_only: bool):
        parts = self._request_parts()
        if parts is None:
            self._not_found()
            return
        hashed_asset = (
            len(parts) >= 2 and parts[0] == "assets"
            and HASHED_ASSET.search(parts[-1]) is not None
        )
        path = self._find_file(parts, hashed_asset)
        if path is None:
            self._not_found()
            return
        try:
            source = path.open("rb")
        except OSError:
            self._not_found()
            return
        with source:
            size = source.seek(0, 2)
            source.seek(0)
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(size))
            self.send_header("X-Content-Type-Options", "nosniff")
            if parts in (("index.html",), ("deployment.json",)):
                cache_control = "no-store"
            elif hashed_asset:
                cache_control = "public, max-age=31536000, immutable"
            else:
                cache_control = "no-cache"
            self.send_header("Cache-Control", cache_control)
            self.end_headers()
            if not head_only:
                try:
                    shutil.copyfileobj(source, self.wfile)
                except (BrokenPipeError, ConnectionResetError):
                    pass


def create_server(current: Path, releases: Path, host: str, port: int, scores: Path | None = None) -> ThreadingHTTPServer:
    board = ScoreBoard(scores) if scores is not None else None
    handler = partial(ReleaseHandler, current=current, releases=releases, board=board)
    return ThreadingHTTPServer((host, port), handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--current", type=Path, default=Path("/root/project/adonis-current"))
    parser.add_argument("--releases", type=Path, default=Path("/root/project/adonis-releases"))
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--scores", type=Path, default=Path("/root/project/adonis-deploy/scores.json"), help="global leaderboard file")
    args = parser.parse_args()
    with create_server(args.current, args.releases, args.host, args.port, args.scores) as server:
        print(f"Serving {args.current} on {args.host}:{args.port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
