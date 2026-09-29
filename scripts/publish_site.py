from __future__ import annotations

import getpass
import json
import os
import subprocess
import sys
import tarfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(args, *, env=None):
    result = subprocess.run(args, cwd=ROOT, env=env, text=True, capture_output=True)
    if result.returncode:
        message = (result.stderr or result.stdout or "Command failed").strip()
        raise RuntimeError(message)
    return result.stdout.strip()


def main():
    try:
        raw = getpass.getpass("Ready for Site workflow JSON on stdin (input is hidden).\n")
        payload = json.loads(raw)
        credential = payload["credential"]
        archive_path = Path(payload["archivePath"]).resolve()
        project_id = payload["project_id"]

        if not (ROOT / ".git").exists():
            run(["git", "init", "-b", credential.get("branch", "main")])
        run(["git", "config", "user.name", "Codex Sites"])
        run(["git", "config", "user.email", "sites@openai.com"])
        run(["git", "add", ".openai/hosting.json", "dist", "scripts"])
        status = run(["git", "status", "--porcelain"])
        if status:
            run(["git", "commit", "-m", "Build U.S. data center research dashboard"])

        remotes = run(["git", "remote"]).splitlines()
        if "origin" in remotes:
            run(["git", "remote", "set-url", "origin", credential["remote_url"]])
        else:
            run(["git", "remote", "add", "origin", credential["remote_url"]])

        env = os.environ.copy()
        env.update({
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "http.extraHeader",
            "GIT_CONFIG_VALUE_0": f"Authorization: Bearer {credential['token']}",
        })
        branch = credential.get("branch", "main")
        run(["git", "push", "--force", "origin", f"HEAD:{branch}"], env=env)
        commit_sha = run(["git", "rev-parse", "HEAD"])

        archive_path.parent.mkdir(parents=True, exist_ok=True)
        with tarfile.open(archive_path, "w:gz") as tar:
            tar.add(ROOT / ".openai", arcname=".openai")
            tar.add(ROOT / "dist", arcname="dist")

        print(json.dumps({
            "project_id": project_id,
            "checkout_path": str(ROOT),
            "commit_sha": commit_sha,
            "archive": str(archive_path),
        }))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
