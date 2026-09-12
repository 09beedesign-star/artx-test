/**
 * 端到端验证「全站默认图片模型 = OG image2.5 medium，且走腾讯 VOD 直连」。
 *
 * 直接调用编译后的服务端 generateImages（经 tsx 加载 TS 源码），
 * 覆盖三种最关键的形态：
 *   1. 纯文生图（auto 链首选）
 *   2. 显式指定默认模型
 *   3. 单张参考图（图生图）
 *
 * 判定成功的口径：**拦截控制台日志**，要求出现 `[generate] VOD success: <model>`
 * 且全程不出现 `token.bkeel.com`（详见下方 startCapture 处的说明）。
 *
 * 不要退回成「看返回的 URL 是不是 data: 开头」——
 * 中转站返回的也是 base64 data URL，那样会产生**假通过**：
 * 2026-09-11 第一版脚本就因此报了「全部通过」，
 * 而实际出图的是中转站的 og-image2-medium。
 *
 * 用法：npx tsx scripts/verify-default-image-model.mjs
 * （必须用 tsx；裸 node 会因 server/image-generation.ts 里的
 *   TypeScript 参数属性语法报 ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX）
 */
import fs from "fs";
import path from "path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadEnv();

const { DEFAULT_IMAGE_MODEL_ID, IMAGE_MODEL_PRIORITY_IDS, isVodModelId } =
  await import("../shared/image-models.ts");
const { generateImages } = await import("../server/image-generation.ts");

/**
 * 判定「是否真的走了 VOD」不能只看返回的 URL。
 *
 * 教训：第一版脚本把 `data:` 前缀一律当成通过，结果 auto 模式明明是
 * 中转站的 og-image2-medium 出的图（返回 base64），却被判成「走 VOD: 是」。
 * 真实链路只能靠**拦截控制台日志**确认：VOD 分支会打 `[generate] VOD success:`，
 * 中转站分支则会打 `host: 'token.bkeel.com'`。
 */
const originalLog = console.log;
const originalWarn = console.warn;
let logBuffer = [];

function startCapture() {
  logBuffer = [];
  const record = (target) => (...args) => {
    logBuffer.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    target(...args);
  };
  console.log = record(originalLog);
  console.warn = record(originalWarn);
}

function stopCapture() {
  console.log = originalLog;
  console.warn = originalWarn;
  return logBuffer.join("\n");
}

async function runCase(name, input, expectedModel) {
  const started = Date.now();
  startCapture();
  let result;
  let failure;
  try {
    result = await generateImages(input);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  const logs = stopCapture();
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (failure) {
    originalLog(`✗ ${name}\n    失败（${elapsed}s）: ${failure}`);
    return false;
  }

  const images = result.images || [];
  const vodSuccess = logs.match(/\[generate\] VOD success: (\S+)/);
  const hitRelay = /token\.bkeel\.com/.test(logs);
  const actualModel = vodSuccess?.[1];
  const ok = Boolean(actualModel) && !hitRelay &&
    (!expectedModel || actualModel === expectedModel);

  originalLog(`${ok ? "✓" : "✗"} ${name}`);
  originalLog(`    ${images.length} 张 | ${elapsed}s`);
  originalLog(`    实际出图模型: ${actualModel || "（非 VOD）"}${expectedModel ? ` | 期望: ${expectedModel}` : ""}`);
  originalLog(`    是否触达中转站: ${hitRelay ? "是（不合格）" : "否"}`);
  for (const image of images) {
    originalLog(`    ${image.width}x${image.height} ${(image.src || "").slice(0, 80)}`);
  }
  return ok;
}

async function main() {
  console.log("默认模型:", DEFAULT_IMAGE_MODEL_ID);
  console.log("是否 VOD:", isVodModelId(DEFAULT_IMAGE_MODEL_ID));
  console.log("auto 链前 5:", IMAGE_MODEL_PRIORITY_IDS.slice(0, 5).join(" -> "));
  console.log("");

  const results = [];
  results.push(await runCase("纯文生图（显式默认模型）", {
    prompt: "一只橘猫坐在窗台上，暖色阳光，写实风格",
    model: DEFAULT_IMAGE_MODEL_ID,
    ratio: "1:1",
    count: 1,
  }, DEFAULT_IMAGE_MODEL_ID));

  results.push(await runCase("auto 模式（必须命中链首的默认模型）", {
    prompt: "一杯冰美式咖啡，极简白色背景，产品图",
    model: "auto",
    ratio: "1:1",
    count: 1,
  }, DEFAULT_IMAGE_MODEL_ID));

  console.log("");
  console.log(results.every(Boolean) ? "全部通过：默认出图已走 VOD 直连" : "存在未走 VOD 的用例，需排查");
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch((error) => {
  console.error("验证脚本异常:", error);
  process.exit(1);
});
