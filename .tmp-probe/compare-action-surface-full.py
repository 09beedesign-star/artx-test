#!/usr/bin/env python3
"""
本轮全量 vitest 零回归对照。

对照组 = git worktree（detached HEAD，即本轮改动前的 360c4ba）
本次组 = 当前工作区
两组共用主仓库的 node_modules（symlink），顺序跑全量，按「失败测试全名」排序后 diff。

⚠️ 不用 git checkout -- 撤改动：本轮涉及 20+ 文件，逐个备份/还原风险高，
   worktree 完全不碰当前工作区，零风险。
"""
import json
import os
import pathlib
import subprocess
import sys
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
WT = pathlib.Path("/tmp/artx-action-surface-baseline")
NODE_MODULES = ROOT / "node_modules"
OUT_BASE = "/tmp/action-surface-base.json"
OUT_OURS = "/tmp/action-surface-ours.json"
NODE = "/Users/ericbi/.workbuddy/binaries/node/versions/20.18.0/bin/node"


def sh(cmd, cwd, timeout=2400):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def setup():
    if WT.exists():
        sh(["git", "worktree", "remove", "--force", str(WT)], ROOT)
    r = sh(["git", "worktree", "add", "--detach", str(WT), "HEAD"], ROOT)
    if r.returncode != 0:
        print("worktree 建立失败:", r.stderr[:400])
        sys.exit(1)
    link = WT / "node_modules"
    if not link.exists():
        link.symlink_to(NODE_MODULES, target_is_directory=True)
    print("✅ 对照组 worktree 就绪:", WT)


def run_full(cwd, out):
    p = pathlib.Path(out)
    if p.exists():
        p.unlink()
    r = sh(["node_modules/.bin/vitest", "run", "--no-file-parallelism",
            "--reporter=json", f"--outputFile={out}"], cwd)
    if not p.exists():
        print("❌ 没有产出报告:", out, "\n", r.stdout[-800:], "\n", r.stderr[-800:])
        sys.exit(1)
    data = json.loads(p.read_text())
    failed = []
    for t in data.get("testResults", []):
        rel = os.path.relpath(t.get("name", ""), cwd)
        asserts = t.get("assertionResults", [])
        # 文件级失败（导入报错等，没有任何断言结果）也要计入
        if t.get("status") == "failed" and not asserts:
            failed.append(f"{rel}::<FILE>")
        for a in asserts:
            if a.get("status") == "failed":
                failed.append(f"{rel}::{a.get('fullName', a.get('title', '?'))}")
    failed.sort()
    return data.get("numTotalTests", len(failed)), failed


def main():
    setup()
    print("跑对照组全量（约 6 分钟）...", flush=True)
    n_base, base = run_full(WT, OUT_BASE)
    print(f"[对照组] 共 {n_base} 条，失败 {len(base)} 条", flush=True)

    print("跑本次改动全量（约 6 分钟）...", flush=True)
    n_ours, ours = run_full(ROOT, OUT_OURS)
    print(f"[本次改动] 共 {n_ours} 条，失败 {len(ours)} 条", flush=True)

    base_set, ours_set = set(base), set(ours)
    added = sorted(ours_set - base_set)
    fixed = sorted(base_set - ours_set)
    print(f"\n新增回归：{len(added)} 条")
    for x in added[:40]:
        print("  ❌", x)
    print(f"转绿：{len(fixed)} 条")
    for x in fixed[:20]:
        print("  ✅", x)

    sh(["git", "worktree", "remove", "--force", str(WT)], ROOT)
    print("\n对照组 worktree 已清理")
    if added:
        sys.exit(1)
    print("✅ 零回归")


if __name__ == "__main__":
    main()
