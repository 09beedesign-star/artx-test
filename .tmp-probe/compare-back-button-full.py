#!/usr/bin/env python3
"""本轮全量 vitest 零回归对照：同一时刻跑「撤掉本次改动」与「带本次改动」两组。"""
import json
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKUP = pathlib.Path("/tmp/back-button-full-backup")
OUT = pathlib.Path("/tmp/back-button-full.json")
E = "client/src/components/ecommerce/"

MODIFIED = [
    E + "EcommerceHistory.tsx",
    E + "EcommerceTemplateGallery.tsx",
    E + "EcommerceTemplateDetail.tsx",
    E + "EcommerceWorkspace.tsx",
]
CREATED = [
    E + "back-button-tokens.ts",
    E + "ecommerce-back-button.test.ts",
]
ALL = MODIFIED + CREATED


def snapshot():
    if BACKUP.exists():
        shutil.rmtree(BACKUP)
    for rel in ALL:
        dst = BACKUP / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / rel, dst)


def restore():
    for rel in ALL:
        shutil.copy2(BACKUP / rel, ROOT / rel)
    for rel in ALL:
        assert (ROOT / rel).read_bytes() == (BACKUP / rel).read_bytes(), f"还原不一致：{rel}"


def to_baseline():
    subprocess.run(["git", "checkout", "--", *MODIFIED], cwd=ROOT, check=True)
    for rel in CREATED:
        (ROOT / rel).unlink()


def run_full(tag):
    if OUT.exists():
        OUT.unlink()
    proc = subprocess.run(
        ["npx", "vitest", "run", "--no-file-parallelism",
         "--reporter=json", f"--outputFile={OUT}"],
        cwd=ROOT, capture_output=True, text=True,
    )
    if not OUT.exists():
        print(f"[{tag}] 没有 JSON 产出：\n{proc.stdout[-2000:]}\n{proc.stderr[-2000:]}")
        return None
    data = json.loads(OUT.read_text())
    total = data.get("numTotalTests", 0)
    if total < 2000:
        print(f"[{tag}] 只收集到 {total} 条用例，样本无效")
        return None
    failed = sorted(
        a["fullName"]
        for res in data.get("testResults", [])
        for a in res.get("assertionResults", [])
        if a.get("status") == "failed"
    )
    print(f"[{tag}] 共 {total} 条，失败 {len(failed)} 条")
    return failed


def main():
    snapshot()
    try:
        to_baseline()
        base = run_full("对照组")
        restore()
        after = run_full("本次改动")
    finally:
        restore()
    if base is None or after is None:
        print("对照组或实验组无效，无法判定零回归")
        sys.exit(1)
    base_set, after_set = set(base), set(after)
    new_fails = sorted(after_set - base_set)
    fixed = sorted(base_set - after_set)
    print(f"\n新增回归：{len(new_fails)} 条")
    for f in new_fails:
        print("  +", f)
    print(f"转绿：{len(fixed)} 条")
    for f in fixed:
        print("  -", f)
    sys.exit(0 if not new_fails else 1)


if __name__ == "__main__":
    main()
