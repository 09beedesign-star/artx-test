#!/usr/bin/env python3
"""
浏览器 A/B 取证：Tab 圆角修复前后的 computed 值
"""
import subprocess, time

PATH = "/Users/ericbi/WorkBuddy/artx/artx-test-main/client/src/components/ecommerce/EcommerceWorkspace.tsx"
PROBE = "/Users/ericbi/WorkBuddy/artx/artx-test-main/.tmp-probe/probe-ecom-tab-ab.mjs"
NODE = "/Users/ericbi/.workbuddy/binaries/node/versions/20.18.0/bin/node"
CWD = "/Users/ericbi/WorkBuddy/artx/artx-test-main"

OLD = 'className="rounded-md py-1.5 text-center text-[12px] transition-colors"'
NEW = 'className="rounded py-1.5 text-center text-[12px] transition-colors"'

with open(PATH) as f:
    original = f.read()
assert OLD in original, "修复后的 class 不存在"

def probe(label):
    out = subprocess.run([NODE, PROBE, label], capture_output=True, text=True, cwd=CWD, timeout=90)
    line = out.stdout.strip().splitlines()[-1] if out.stdout.strip() else out.stderr[-300:]
    print(line, flush=True)
    return line

try:
    print("=== A: 修复后（rounded-md）===", flush=True)
    after = probe("修复后")
    time.sleep(1)

    print("\n=== B: 临时改回修复前（rounded）===", flush=True)
    with open(PATH, "w") as f:
        f.write(original.replace(OLD, NEW, 1))
    time.sleep(3)  # 等 vite HMR
    before = probe("修复前")
    time.sleep(1)
finally:
    with open(PATH, "w") as f:
        f.write(original)
    time.sleep(1)

with open(PATH) as f:
    assert f.read() == original, "❌ 文件未恢复！"
print("\n✅ 源码已完整恢复", flush=True)
print(f"\n修复后: {after}")
print(f"修复前: {before}")
