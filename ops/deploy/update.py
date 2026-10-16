#!/usr/bin/env python3
"""Follow one Git branch and atomically publish verified static releases."""

import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import time
import urllib.parse
import urllib.request
import uuid


MARKER = ".adonis-auto-release.json"
HEALTH_SECONDS = 15


def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text())
    except FileNotFoundError:
        return {} if default is None else default


def write_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + ".tmp-" + uuid.uuid4().hex)
    try:
        temporary.write_text(json.dumps(value, indent=2) + "\n")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


@contextlib.contextmanager
def locked(path, blocking=False, busy_message=None):
    with Path(path).open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
        except BlockingIOError as error:
            if busy_message:
                raise RuntimeError(busy_message) from error
            raise
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("src"):
            self.assets.append(attrs["src"])
        if tag == "link" and attrs.get("href") and (
            "stylesheet" in attrs.get("rel", "").split()
            or urllib.parse.urlsplit(attrs["href"]).path.endswith((".js", ".css"))
        ):
            self.assets.append(attrs["href"])


class Updater:
    def __init__(self, config):
        self.config = config
        self.state = Path(config["state_dir"]).resolve()
        self.releases = Path(config["releases_dir"]).resolve()
        current = Path(config["current_link"])
        self.current = current.parent.resolve() / current.name
        self.state.mkdir(parents=True, exist_ok=True)
        self.releases.mkdir(parents=True, exist_ok=True)
        self.current.parent.mkdir(parents=True, exist_ok=True)
        self.mirror = self.state / "repository.git"
        self.status_path = self.state / "status.json"
        self.control_path = self.state / "control.json"
        self.lock_path = self.state / "deploy.lock"
        self.branch = config.get("branch", "main")
        if self.branch.startswith("-") or ".." in self.branch:
            raise ValueError("invalid branch name")

    def log(self, message):
        line = f"{timestamp()} {message}"
        print(line, flush=True)
        with (self.state / "deploy.log").open("a") as handle:
            handle.write(line + "\n")

    def set_status(self, phase, **fields):
        status = read_json(self.status_path)
        status.update(fields, phase=phase, updatedAt=timestamp())
        write_json(self.status_path, status)
        return status

    def control(self, paused):
        with locked(self.state / "control.lock", blocking=True):
            value = {"paused": paused, "updatedAt": timestamp()}
            write_json(self.control_path, value)
        self.log("Automatic updates " + ("paused" if paused else "resumed"))
        return value

    def paused(self):
        return read_json(self.control_path).get("paused", False)

    def target(self):
        if self.current.is_symlink():
            return self.current.resolve()
        if self.current.exists():
            raise RuntimeError(f"current_link must be a symlink: {self.current}")
        return None

    def status(self):
        target = self.target()
        return {
            "control": read_json(self.control_path, {"paused": False}),
            "status": read_json(self.status_path),
            "currentTarget": str(target) if target else None,
            "deployment": read_json(target / "deployment.json") if target else {},
        }

    def command(self, args, cwd=None):
        self.log("Running " + " ".join(map(str, args)))
        with (self.state / "deploy.log").open("a") as output:
            process = subprocess.Popen(
                list(map(str, args)), cwd=cwd, stdout=output, stderr=subprocess.STDOUT,
                start_new_session=True, env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
            )
            try:
                code = process.wait(timeout=self.config.get("command_timeout_seconds", 900))
            except BaseException:
                # npm scripts can spawn children; terminate the entire build group.
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        pass
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
                raise
        if code:
            raise RuntimeError(f"command failed ({code}): {' '.join(map(str, args))}; see {self.state / 'deploy.log'}")

    def fetch(self):
        if not self.mirror.exists():
            self.command(["git", "init", "--bare", self.mirror])
        self.command([
            "git", "--git-dir", self.mirror, "fetch", "--no-tags", "--depth=1",
            self.config["repo_url"], f"+refs/heads/{self.branch}:refs/heads/{self.branch}",
        ])
        # This local read cannot access the network or run repository hooks.
        return subprocess.check_output(
            ["git", "--git-dir", str(self.mirror), "rev-parse", f"refs/heads/{self.branch}"],
            text=True, timeout=10,
        ).strip()

    def owned(self, path):
        if path.is_symlink() or path.parent != self.releases:
            return False
        try:
            marker = read_json(path / MARKER)
            return marker.get("owner") == "adonis-auto-deploy-v1"
        except (OSError, ValueError):
            return False

    def remove(self, path):
        # Never remove the live tree, including after an unexpected metadata or
        # rollback error. Only directories carrying our marker are candidates.
        if self.current.is_symlink() and self.current.resolve().is_relative_to(path.resolve()):
            return
        if self.owned(path):
            shutil.rmtree(path)

    def validate_dist(self, dist):
        index = dist / "index.html"
        if not index.is_file() or not index.stat().st_size:
            raise RuntimeError("build produced no nonempty dist/index.html")
        parser = AssetParser()
        parser.feed(index.read_text())
        for asset in parser.assets:
            url = urllib.parse.urlsplit(asset)
            if url.scheme or url.netloc:
                continue
            relative = urllib.parse.unquote(url.path).lstrip("/")
            file = (dist / relative).resolve()
            if not file.is_relative_to(dist.resolve()) or not file.is_file():
                raise RuntimeError(f"build references missing local asset: {asset}")

    def build(self, sha):
        path = self.releases / (".building-" + sha[:12] + "-" + uuid.uuid4().hex[:12])
        path.mkdir()
        write_json(path / MARKER, {"owner": "adonis-auto-deploy-v1", "sourceCommit": sha, "createdAt": timestamp()})
        try:
            archive = path / "source.tar"
            self.command(["git", "--git-dir", self.mirror, "archive", "--format=tar", "--output", archive, sha])
            source = path / "source"
            source.mkdir()
            with tarfile.open(archive) as tar:
                # No links/special files are needed by this static application.
                for member in tar.getmembers():
                    destination = (source / member.name).resolve()
                    if not destination.is_relative_to(source) or not (member.isfile() or member.isdir()):
                        raise RuntimeError(f"unsupported source archive entry: {member.name}")
                tar.extractall(source)
            archive.unlink()
            self.command(["npm", "ci", "--no-audit", "--no-fund"], cwd=source)
            self.command(["npm", "run", "build"], cwd=source)
            dist = source / "dist"
            self.validate_dist(dist)
            dist.rename(path / "dist")
            # Retain the exact source for inspection, without build dependencies.
            shutil.rmtree(source / "node_modules", ignore_errors=True)
            write_json(path / "dist" / "deployment.json", {
                "project": "Adonis", "sourceRepository": self.config["repo_url"],
                "sourceBranch": self.branch, "sourceCommit": sha, "builtAt": timestamp(),
                "automation": "github-branch-poll",
            })
            return path
        except BaseException:
            self.remove(path)
            raise

    def switch(self, target):
        if self.current.exists() and not self.current.is_symlink():
            raise RuntimeError("refusing to replace a non-symlink current directory")
        temporary = self.current.with_name(self.current.name + ".tmp-" + uuid.uuid4().hex)
        try:
            temporary.symlink_to(target, target_is_directory=True)
            os.replace(temporary, self.current)
        finally:
            temporary.unlink(missing_ok=True)

    def healthy(self, target, sha):
        expected = hashlib.sha256((target / "index.html").read_bytes()).digest()
        deadline = time.monotonic() + HEALTH_SECONDS
        last_error = "health check did not complete"
        while True:
            try:
                base = self.config["health_url"].rstrip("/")
                def get(name):
                    request = urllib.request.Request(
                        base + "/" + name + "?deploy_check=" + uuid.uuid4().hex,
                        headers={"Cache-Control": "no-cache"},
                    )
                    with urllib.request.urlopen(request, timeout=3) as response:
                        return response.read(2 * 1024 * 1024)
                manifest = json.loads(get("deployment.json"))
                if manifest.get("sourceCommit") != sha:
                    raise RuntimeError("served deployment.json has a different commit")
                if hashlib.sha256(get("index.html")).digest() != expected:
                    raise RuntimeError("served index.html does not match the release")
                return
            except Exception as error:
                last_error = str(error)
                if time.monotonic() >= deadline:
                    raise RuntimeError("health check failed: " + last_error) from error
                time.sleep(min(1, max(0, deadline - time.monotonic())))

    def promote(self, path, sha):
        old_target = self.target()
        target = path / "dist"
        manifest = read_json(target / "deployment.json")
        manifest["deployedAt"] = timestamp()
        write_json(target / "deployment.json", manifest)
        try:
            self.switch(target)
            self.healthy(target, sha)
            marker = read_json(path / MARKER)
            marker["validatedAt"] = timestamp()
            write_json(path / MARKER, marker)
            self.set_status(
                "idle", currentCommit=sha, lastSuccessCommit=sha, lastSuccessAt=timestamp(),
                previousTarget=str(old_target) if old_target else None, lastError=None,
                failedCommit=None, retryAfter=0,
            )
        except BaseException:
            if old_target:
                self.switch(old_target)
            else:
                self.current.unlink(missing_ok=True)
            raise
        self.log(f"Published {sha}")

    def cleanup(self):
        current = self.target()
        previous = read_json(self.status_path).get("previousTarget")
        protected = {str(current), previous}
        successes = []
        for path in self.releases.iterdir():
            if not self.owned(path):
                continue
            marker = read_json(path / MARKER)
            if marker.get("validatedAt"):
                successes.append((marker["validatedAt"], path))
            elif str(path / "dist") not in protected:
                self.remove(path)
        successes.sort(reverse=True)
        for _, path in successes[max(1, self.config.get("keep_releases", 5)):]:
            if str(path / "dist") not in protected:
                self.remove(path)

    def once(self, force=False):
        try:
            with locked(self.lock_path):
                return self._once(force)
        except BlockingIOError:
            self.log("Another deploy command is already running")
            return False

    def _once(self, force):
        sha = None
        path = None
        try:
            self.cleanup()
            if self.paused():
                self.set_status("paused")
                return True
            self.set_status("checking")
            sha = self.fetch()
            state = read_json(self.status_path)
            target = self.target()
            current_sha = read_json(target / "deployment.json").get("sourceCommit") if target else None
            self.set_status("checking", latestRemoteCommit=sha, currentCommit=current_sha)
            if not force and current_sha == sha:
                self.set_status("idle")
                return True
            if not force and state.get("failedCommit") == sha and time.time() < state.get("retryAfter", 0):
                self.set_status("backoff")
                return True
            self.set_status("building", lastAttemptCommit=sha, lastAttemptAt=timestamp())
            path = self.build(sha)
            # Do not knowingly publish a commit that stopped being the branch head.
            latest = self.fetch()
            if latest != sha:
                self.set_status("superseded", latestRemoteCommit=latest)
                return True
            # Serialize the short publication with pause/resume so a completed
            # pause cannot race with the symlink switch. Builds never hold this.
            with locked(self.state / "control.lock", blocking=True):
                if self.paused():
                    self.set_status("paused")
                    return True
                release = self.releases / ("auto-" + sha[:12] + "-" + uuid.uuid4().hex[:12])
                path.rename(release)
                path = release
                self.set_status("checking-health")
                self.promote(path, sha)
            path = None
            self.cleanup()
            return True
        except Exception as error:
            self.log(f"Update failed: {error}")
            self.set_status(
                "failed", lastError=str(error), lastFailureAt=timestamp(), failedCommit=sha,
                retryAfter=time.time() + self.config.get("retry_seconds", 300),
            )
            return False
        finally:
            if path is not None and self.target() != path / "dist":
                self.remove(path)

    def rollback(self, commit=None):
        # Pause immediately, even if a build currently holds the deploy lock.
        self.control(True)
        with locked(self.lock_path, busy_message="Automatic updates paused; a build is finishing, retry rollback after it completes"):
            current = self.target()
            state = read_json(self.status_path)
            candidates = []
            for path in self.releases.iterdir():
                if path.name.startswith(".") or path.is_symlink() or not path.is_dir():
                    continue
                target = path / "dist"
                if target.resolve() != target or not target.is_dir():
                    continue
                if self.owned(path):
                    marker = read_json(path / MARKER)
                    if marker.get("validatedAt"):
                        candidates.append((marker["validatedAt"], target))
                else:
                    # Bootstrap/manual releases are retained forever. Discover
                    # them for explicit rollback even after previousTarget moves.
                    try:
                        manifest = read_json(target / "deployment.json")
                        sha = manifest.get("sourceCommit") if isinstance(manifest, dict) else None
                        if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-fA-F]{40}", sha):
                            continue
                        self.validate_dist(target)
                    except (OSError, ValueError, RuntimeError):
                        continue
                    candidates.append(("", target))
            previous = state.get("previousTarget")
            if previous and Path(previous).is_dir():
                candidates.append(("", Path(previous)))
            if commit:
                matches = [target for _, target in sorted(candidates, reverse=True)
                           if read_json(target / "deployment.json").get("sourceCommit", "").startswith(commit)]
                shas = {read_json(target / "deployment.json").get("sourceCommit") for target in matches}
                if len(shas) > 1:
                    raise RuntimeError("rollback commit prefix is ambiguous")
                target = matches[0] if matches else None
            else:
                target = Path(previous) if previous else None
            if target is None or not target.is_dir():
                raise RuntimeError("no retained release matches the rollback request")
            self.validate_dist(target)
            sha = read_json(target / "deployment.json").get("sourceCommit")
            if not sha:
                raise RuntimeError("rollback target has no sourceCommit manifest")
            try:
                self.switch(target)
                self.healthy(target, sha)
            except BaseException:
                if current:
                    self.switch(current)
                raise
            self.set_status("paused", currentCommit=sha, previousTarget=str(current) if current else None, lastError=None)
            self.log(f"Rolled back to {sha}; automatic updates remain paused")

    def run(self):
        while True:
            self.once()
            # A superseded build should pick up the new head without a full delay.
            delay = 1 if read_json(self.status_path).get("phase") == "superseded" else self.config.get("poll_seconds", 60)
            time.sleep(delay)


def main():
    def stop(_signum, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("action", choices=["run", "once", "status", "pause", "resume", "rollback"], nargs="?", default="status")
    parser.add_argument("--force", action="store_true", help="rebuild even if the branch commit is already live")
    parser.add_argument("--commit", help="retained commit (or unique prefix) for rollback")
    args = parser.parse_args()
    try:
        updater = Updater(read_json(args.config))
        if args.action == "run":
            updater.run()
        elif args.action == "once":
            return 0 if updater.once(args.force) else 1
        elif args.action in ("pause", "resume"):
            updater.control(args.action == "pause")
        elif args.action == "rollback":
            updater.rollback(args.commit)
        print(json.dumps(updater.status(), indent=2))
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"deploy: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
