/**
 * 部署门禁：模型能力凭证校验的接入防护测试。
 *
 * 背景（2026-09-13）：
 * scripts/verify-model-env.mjs 在 2026-09-12 就写好了，package-tencent-cloud-release.sh
 * 里甚至写着注释"部署流水线在切换 current 软链之前调用它"——但流水线**从头到尾没有调用过**。
 * 脚本只是被 cp 进了发布包，躺在那里。
 *
 * 📌 **"有脚本"和"有门禁"是两回事。** 这类退化零报错、零征兆：
 * 打包步骤照常成功，脚本文件确实在发布包里，代码审查时看注释也像是接好了。
 * 唯一能锁住它的就是这里显式断言"workflow 里确实有调用"。
 *
 * 本文件锁三件事：
 *   1. 门禁确实被调用了（不只是被 cp 进包）；
 *   2. 调用位置正确 —— 必须在 ln -sfn 切换 current 之前，否则只是事后播报事故；
 *   3. 校验对象正确 —— 必须合并两个 .env.gray，因为父目录那份才最终生效。
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), "utf8");

const WORKFLOW = ".github/workflows/deploy-tencent-cloud.yml";
const GATE_SCRIPT = "scripts/verify-model-env.mjs";

describe("部署门禁：模型能力凭证校验已接入流水线", () => {
  const workflow = read(WORKFLOW);

  it("流水线必须真的调用门禁脚本，而不只是把它打进发布包", () => {
    // ⚠️ 这里必须匹配"执行"而不是"存在"。
    // package-tencent-cloud-release.sh 里的 `cp scripts/verify-model-env.mjs ...`
    // 也含有脚本名，但那只是拷贝——正是这次要修的退化形态。
    expect(workflow).toMatch(/node\s+scripts\/verify-model-env\.mjs/);
  });

  it("门禁必须在切换 current 软链之前执行", () => {
    const gateIndex = workflow.indexOf("node scripts/verify-model-env.mjs");
    const symlinkIndex = workflow.indexOf('ln -sfn "${base}/releases/${release}" "${base}/current"');

    expect(gateIndex, "找不到门禁调用").toBeGreaterThan(-1);
    expect(symlinkIndex, "找不到 current 软链切换").toBeGreaterThan(-1);

    // 顺序颠倒的话，凭证缺失时 current 已经指向坏版本，
    // 门禁就从"阻止事故"退化成"事后播报事故"——最坏的一种假安全感。
    expect(gateIndex, "门禁必须在 ln -sfn 之前，否则站点已经坏了才报警").toBeLessThan(symlinkIndex);
  });

  it("门禁必须在 .env.gray 拷入新 release 之后执行", () => {
    // 放更早的话，新 release 里还没有 .env.gray，校验的是空气。
    const copyEnvIndex = workflow.indexOf('cp "${base}/current/.env.gray" "${base}/releases/${release}/.env.gray"');
    const gateIndex = workflow.indexOf("node scripts/verify-model-env.mjs");

    expect(copyEnvIndex, "找不到 .env.gray 拷贝步骤").toBeGreaterThan(-1);
    expect(gateIndex).toBeGreaterThan(copyEnvIndex);
  });

  it("门禁必须合并两个 .env.gray 后再校验", () => {
    // systemd 顺序加载 current/.env.gray → ${base}/.env.gray，**后者覆盖前者**。
    // 部署只把 current/.env.gray 拷进新 release，父目录那份从不参与拷贝，两者随时漂移。
    // 只查 release 里那份 = 校验的不是真正生效的配置，是最隐蔽的盲区。
    expect(workflow).toContain('${base}/.env.gray');
    expect(workflow).toMatch(/cat "\$\{base\}\/\.env\.gray" >> "\$\{merged_env\}"/);

    // 反向断言：不得退回"只查 release 里那一份"的写法。
    expect(workflow).not.toMatch(/verify-model-env\.mjs --file \.env\.gray\s*\)/);
  });

  it("Activate 步骤必须开启 set -e，否则门禁失败也拦不住后续命令", () => {
    // 门禁靠非零退出码生效。少了 set -e，脚本会继续往下跑到 ln -sfn，
    // 表现为"日志里有 FAIL，但部署照样成功"——两道防线都在却拦不住任何人。
    const activateStart = workflow.indexOf("name: Activate release");
    const activateSection = workflow.slice(activateStart, workflow.indexOf("name: Verify public smoke"));
    expect(activateSection).toMatch(/set -euo pipefail/);
  });
});

describe("部署门禁：脚本自身的能力边界必须写明", () => {
  const script = read(GATE_SCRIPT);

  it("成功路径必须打印'不做鉴权'的免责声明", () => {
    // ⚠️ 这个脚本最大的风险不是漏报，是**误导**：
    // 它只查变量存在性，key 过期 / 余额耗尽 / 上游宕机一律报 OK。
    // 看日志的人只看到一片 OK 就以为模型没问题，是真实发生过的误判。
    // 所以免责声明必须出现在运行输出里，而不是只躺在文件头注释里。
    const successIndex = script.indexOf("必需的模型能力凭证均已就绪");
    expect(successIndex).toBeGreaterThan(-1);

    const tail = script.slice(successIndex);
    expect(tail).toMatch(/不做鉴权/);
    expect(tail).toMatch(/console\.log/);
  });

  it("必需能力缺失时必须以退出码 1 中断", () => {
    expect(script).toMatch(/process\.exit\(1\)/);
  });

  it("VOD 图片凭证必须是阻断级而不是警告级", () => {
    // 中转站图片能力已于 2026-09-12 下线，VOD 缺失 = 全站出图 100% 不可用且无兜底。
    // 这一项若被降级成 required:false，门禁就形同虚设。
    const vodBlock = script.slice(
      script.indexOf("TENCENT_VOD_SID"),
      script.indexOf("TENCENT_VOD_SID") + 400
    );
    expect(vodBlock).toMatch(/required:\s*true/);
  });
});
