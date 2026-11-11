#!/usr/bin/env python3
"""
变异自证:电商画布模式切换 Tab 圆角统一
每条变异必须让测试报红,确认测试不是摆设。
"""
import subprocess, sys, os, shutil

WORKSPACE = "client/src/components/ecommerce/EcommerceWorkspace.tsx"
VITEST = "node_modules/.bin/vitest"
NODE = "/Users/ericbi/.workbuddy/binaries/node/versions/20.18.0/bin/node"
TEST_FILE = "client/src/components/ecommerce/ecommerce-tab-border-radius.test.ts"
ORIGINAL = None

def read():
    with open(WORKSPACE, "r") as f:
        return f.read()

def write(content):
    with open(WORKSPACE, "w") as f:
        f.write(content)

def run_test():
    result = subprocess.run(
        ["node_modules/.bin/vitest", "run", TEST_FILE],
        capture_output=True, text=True, timeout=60,
        cwd="/Users/ericbi/WorkBuddy/artx/artx-test-main",
        env={**os.environ, "NODE": NODE}
    )
    # 提取失败数
    out = result.stdout
    if "failed" in out:
        return "RED"
    elif "5 passed" in out or "passed" in out:
        return "GREEN"
    else:
        return "UNKNOWN: " + out[-500:]

def mutate(old, new, label):
    global ORIGINAL
    src = read()
    if old not in src:
        print(f"  ⚠️ 锚点不存在,跳过: {label}")
        return
    write(src.replace(old, new, 1))
    status = run_test()
    # 恢复
    write(ORIGINAL)
    icon = "🔴" if status == "RED" else "🟢" if status == "GREEN" else "❓"
    print(f"  {icon} {label}: {status}")
    if status == "GREEN":
        print(f"  ⚠️ 存活!变异未让测试报红,需收紧测试!")
    return status

def main():
    global ORIGINAL
    ORIGINAL = read()
    print(f"源码长度: {len(ORIGINAL)} 字符")
    print(f"变异测试开始...\n")
    
    results = []
    
    # 变异1:容器圆角改回 rounded(从 rounded-md → rounded)
    results.append(mutate(
        'className="grid grid-cols-2 gap-1 rounded-md p-1"',
        'className="grid grid-cols-2 gap-1 rounded p-1"',
        "容器 rounded-md → rounded"
    ))
    
    # 变异2:按钮圆角改回 rounded(从 rounded-md → rounded)
    results.append(mutate(
        'className="rounded-md py-1.5 text-center text-[12px] transition-colors"',
        'className="rounded py-1.5 text-center text-[12px] transition-colors"',
        "按钮 rounded-md → rounded"
    ))
    
    # 变异3:容器圆角改 rounded-lg(8px,与按钮不一致)
    results.append(mutate(
        'className="grid grid-cols-2 gap-1 rounded-md p-1"',
        'className="grid grid-cols-2 gap-1 rounded-lg p-1"',
        "容器 rounded-md → rounded-lg"
    ))
    
    # 变异4:按钮圆角改 rounded-lg
    results.append(mutate(
        'className="rounded-md py-1.5 text-center text-[12px] transition-colors"',
        'className="rounded-lg py-1.5 text-center text-[12px] transition-colors"',
        "按钮 rounded-md → rounded-lg"
    ))
    
    # 变异5:按钮去掉圆角(删 rounded-md)
    results.append(mutate(
        'className="rounded-md py-1.5 text-center text-[12px] transition-colors"',
        'className="py-1.5 text-center text-[12px] transition-colors"',
        "按钮删除 rounded-md"
    ))
    
    # 变异6:容器去掉圆角
    results.append(mutate(
        'className="grid grid-cols-2 gap-1 rounded-md p-1"',
        'className="grid grid-cols-2 gap-1 p-1"',
        "容器删除 rounded-md"
    ))
    
    # 变异7:按钮改 rounded-full(大圆角,与容器不一致)
    results.append(mutate(
        'className="rounded-md py-1.5 text-center text-[12px] transition-colors"',
        'className="rounded-full py-1.5 text-center text-[12px] transition-colors"',
        "按钮 rounded-md → rounded-full"
    ))
    
    # 变异8:容器改 rounded-full
    results.append(mutate(
        'className="grid grid-cols-2 gap-1 rounded-md p-1"',
        'className="grid grid-cols-2 gap-1 rounded-full p-1"',
        "容器 rounded-md → rounded-full"
    ))
    
    red = sum(1 for r in results if r == "RED")
    green = sum(1 for r in results if r == "GREEN")
    print(f"\n结果: {red}/{len(results)} 红, {green}/{len(results)} 绿")
    if green > 0:
        print("⚠️ 有存活的变异,测试需要收紧!")
        sys.exit(1)
    else:
        print("✅ 全部变异被杀死,测试有效!")

if __name__ == "__main__":
    main()
