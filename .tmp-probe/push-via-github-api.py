#!/usr/bin/env python3
"""github.com 被本机代理掐断、api.github.com 仍可用时的等价推送。

用 Git Data API 复刻本地 HEAD 的 tree / commit 对象；只有算出来的 commit sha
与本地 HEAD 完全一致才更新分支 ref —— 否则本地与远端会静默分叉，不如不推。
"""
import base64
import json
import pathlib
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
OWNER, REPO, BRANCH = "09beedesign-star", "artx-test", "ui/tuxu-restyle"


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def token():
    out = subprocess.check_output(
        ["git", "credential", "fill"], cwd=ROOT, text=True,
        input="protocol=https\nhost=github.com\n\n",
    )
    m = re.search(r"^password=(.+)$", out, re.M)
    if not m:
        raise RuntimeError("credential store 里没有 github.com 的 PAT")
    return m.group(1).strip()


def api(method, path, payload=None, tok=""):
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={
            "Authorization": f"Bearer {tok}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "artx-workbuddy",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def iso_from_git(line):
    """author 卢生 <mail> 1762785514 +0800 -> 2026-11-10T19:38:34+08:00"""
    m = re.search(r"(\d+) ([+-])(\d{2})(\d{2})$", line)
    ts = int(m.group(1))
    sign = 1 if m.group(2) == "+" else -1
    tz = timezone(sign * timedelta(hours=int(m.group(3)), minutes=int(m.group(4))))
    return datetime.fromtimestamp(ts, tz).isoformat()


def identity(line):
    m = re.match(r"^(?:author|committer) (.+?) <([^>]+)> \d+ [+-]\d{4}$", line)
    return {"name": m.group(1), "email": m.group(2)}


def main():
    tok = token()
    head = git("rev-parse", "HEAD")
    parent = git("rev-parse", "HEAD^")
    local_tree = git("rev-parse", "HEAD^{tree}")
    parent_tree = git("rev-parse", "HEAD^^{tree}")
    raw = subprocess.check_output(["git", "cat-file", "-p", "HEAD"], cwd=ROOT, text=True)
    lines = raw.split("\n")
    author_line = next(x for x in lines if x.startswith("author "))
    committer_line = next(x for x in lines if x.startswith("committer "))
    message = raw.split("\n\n", 1)[1]
    paths = git("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").splitlines()
    print(f"本地 HEAD={head[:8]} parent={parent[:8]} tree={local_tree[:8]} 文件 {len(paths)} 个")

    ref = api("GET", f"git/ref/heads/{BRANCH}", tok=tok)
    remote_sha = ref["object"]["sha"]
    print(f"远端 {BRANCH}={remote_sha[:8]}")
    if remote_sha != parent:
        print("远端已被别的会话推进，停止（避免覆盖他人提交）")
        sys.exit(2)

    blobs = []
    for rel in paths:
        content = (ROOT / rel).read_bytes()
        blob = api("POST", "git/blobs", {"content": base64.b64encode(content).decode(), "encoding": "base64"}, tok)
        blobs.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    tree = api("POST", "git/trees", {"base_tree": parent_tree, "tree": blobs}, tok)
    print(f"API tree={tree['sha'][:8]} 本地 tree={local_tree[:8]}")
    if tree["sha"] != local_tree:
        print("tree 不一致，停止（不更新 ref）")
        sys.exit(3)

    author = {**identity(author_line), "date": iso_from_git(author_line)}
    committer = {**identity(committer_line), "date": iso_from_git(committer_line)}
    commit = api("POST", "git/commits", {
        "tree": tree["sha"], "parents": [parent], "message": message,
        "author": author, "committer": committer,
    }, tok)
    print(f"API commit={commit['sha'][:8]} 本地 commit={head[:8]}")
    if commit["sha"] != head:
        print("commit sha 不一致（可能被服务端签名），停止（不更新 ref，避免本地远端分叉）")
        sys.exit(4)

    api("PATCH", f"git/refs/heads/{BRANCH}", {"sha": head, "force": False}, tok)
    print(f"✅ 远端 {BRANCH} 已快进到 {head[:8]}，与本地完全一致")


if __name__ == "__main__":
    main()
