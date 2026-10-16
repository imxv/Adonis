#!/usr/bin/env python3
"""Serve the active dist and retained, fingerprinted assets without a restart."""

from __future__ import annotations

import argparse
import mimetypes
import re
import shutil
from functools import partial
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


HASHED_ASSET = re.compile(r"[-.][A-Za-z0-9_-]{8,}\.[A-Za-z0-9.]+$")


class ReleaseHandler(BaseHTTPRequestHandler):
    """Resolve current once per request, then serve only a release's dist files."""

    def __init__(self, *args, current: Path, releases: Path, **kwargs):
        self.current = Path(current)
        self.releases = Path(releases).resolve()
        super().__init__(*args, **kwargs)

    def do_GET(self):
        self._serve(head_only=False)

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


def create_server(current: Path, releases: Path, host: str, port: int) -> ThreadingHTTPServer:
    handler = partial(ReleaseHandler, current=current, releases=releases)
    return ThreadingHTTPServer((host, port), handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--current", type=Path, default=Path("/root/project/adonis-current"))
    parser.add_argument("--releases", type=Path, default=Path("/root/project/adonis-releases"))
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    with create_server(args.current, args.releases, args.host, args.port) as server:
        print(f"Serving {args.current} on {args.host}:{args.port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
