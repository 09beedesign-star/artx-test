#!/usr/bin/env node
/**
 * 模型能力环境变量前置校验。
 *
 * 为什么需要它：
 * 模型的「定义」（有哪些型号、怎么路由、怎么计费）写在 shared/*.ts 里，随 git 走；
 * 但模型的「凭证」（API key、VOD 密钥）在 .env / .env.gray 里，被 gitignore 拦着，
 * 不会跟代码一起到生产。两者一旦对不上，站点会在**用户点击的那一刻**才报错，
 * 而不是在部署时。这个脚本把失败点前移到部署流水线里。
 *
 * 2026-09-12 的真实事故场景（本脚本正是为此而写）：
 * 全站图片链路切换为腾讯 VOD 直连、中转站图片能力整体下线，
 * 但 deploy/tencent-cloud/artx-server.env.example 里**从来没有过** TENCENT_VOD_* 三件套。
 * 若直接推送上线，所有出图请求都会命中
 *   「图片生成不可用：腾讯 VOD AIGC 凭证未配置」
 * 且没有任何兜底通道 —— 属于 100% 功能性事故。
 *
 * 用法：
 *   node scripts/verify-model-env.mjs              # 读当前进程环境变量
 *   node scripts/verify-model-env.mjs --file .env  # 读指定 env 文件
 *
 * 退出码：0 = 全部必需项就绪；1 = 存在缺失（CI 会因此中断部署）。
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const envFile = fileIndex >= 0 ? args[fileIndex + 1] : null;

/** 从 env 文件解析出键值对。只认未被注释的 KEY=VALUE 行。 */
function parseEnvFile(filePath) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    console.error(`找不到 env 文件：${absolute}`);
    process.exit(1);
  }
  const parsed = {};
  for (const rawLine of fs.readFileSync(absolute, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    // 去掉包裹的引号：.env 里 AI_TEXT_MODEL='claude-opus-5' 这种写法是合法的
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    parsed[key] = value;
  }
  return parsed;
}

const env = envFile ? parseEnvFile(envFile) : process.env;
const read = (key) => (env[key] || "").trim();

/**
 * 能力清单。
 *
 * required=true 的能力缺凭证 → 退出码 1，部署必须中断。
 * required=false 的能力缺凭证 → 只提示，因为它们有明确的降级路径，
 * 站点核心功能不受影响。
 */
const capabilities = [
  {
    name: "图片生成（腾讯 VOD AIGC）",
    keys: ["TENCENT_VOD_SID", "TENCENT_VOD_SKEY", "TENCENT_VOD_SUB_APP_ID"],
    required: true,
    impact: "全站所有出图功能 100% 不可用，无兜底通道（中转站图片能力已于 2026-09-12 下线）",
  },
  {
    name: "文本 / 多模态理解（中转站 claude-opus-5）",
    keys: ["AI_TEXT_API_KEY", "AI_TEXT_BASE_URL"],
    required: true,
    impact: "对话、意图路由、OCR 文字提取全部不可用",
  },
  {
    name: "图生文 / 视觉识图（复用中转站图片端点）",
    keys: ["AI_IMAGE_API_KEY", "AI_IMAGE_BASE_URL"],
    required: false,
    impact: "多模态识图与部分 OCR 链路降级",
  },
  {
    name: "佐糖 PicWish 图像工具链（抠图 / 擦除 / 高清化）",
    keys: ["PICWISH_API_KEY", "PICWISH_BASE_URL"],
    required: false,
    impact: "擦字的佐糖通道失效，降级到本地像素擦除",
  },
  {
    name: "美图局部重绘",
    keys: ["ACCESS_KEY", "SECRET_KEY"],
    required: false,
    impact: "擦字的美图通道失效，降级到佐糖 / 本地像素擦除",
  },
  {
    name: "参数化擦字引擎",
    keys: ["TEXT_ENGINE_BASE_URL"],
    required: false,
    impact: "改字场景的擦除质量下降；删除整行场景不受影响（本就走本地擦除）",
  },
];

let hasBlocking = false;
console.log(`模型能力环境检查${envFile ? `（来源：${envFile}）` : "（来源：当前进程环境变量）"}\n`);

for (const capability of capabilities) {
  const missing = capability.keys.filter((key) => !read(key));
  if (missing.length === 0) {
    console.log(`OK   ${capability.name}`);
    continue;
  }
  if (capability.required) {
    hasBlocking = true;
    console.log(`FAIL ${capability.name}`);
    console.log(`     缺少：${missing.join(", ")}`);
    console.log(`     后果：${capability.impact}`);
  } else {
    console.log(`WARN ${capability.name}`);
    console.log(`     缺少：${missing.join(", ")}`);
    console.log(`     降级：${capability.impact}`);
  }
}

/**
 * AI_IMAGE_MODEL 的取值校验。
 *
 * 这一项单独拎出来，因为它的失败方式很隐蔽：填一个「不在注册表里」的型号
 * （历史上模板里写死的 gpt-image-2 就是），normalize 之后 isSupported=false，
 * 请求靠 fallback 链才勉强落到默认模型 —— 能跑，但语义错误，
 * 且一旦 fallback 逻辑收紧就会直接出不了图。留空反而是最稳妥的。
 */
const imageModel = read("AI_IMAGE_MODEL");
if (imageModel) {
  if (!imageModel.startsWith("vod-")) {
    console.log(`\nWARN AI_IMAGE_MODEL="${imageModel}" 不是 vod-* 型号`);
    console.log("     图片链路已于 2026-09-12 全面改为腾讯 VOD 直连。");
    console.log("     建议留空，回落到 DEFAULT_IMAGE_MODEL_ID（vod-og25-sunburst-medium）。");
  } else {
    console.log(`\nOK   AI_IMAGE_MODEL="${imageModel}"`);
  }
} else {
  console.log("\nOK   AI_IMAGE_MODEL 留空 → 回落到 vod-og25-sunburst-medium（推荐写法）");
}

/**
 * TEXT_ENGINE_BASE_URL 指向环回地址的检查。
 *
 * 生产服务器上照抄本地的 127.0.0.1:8077 是个很容易犯的错：
 * 配置看起来"有值"所以不会触发上面的 WARN，但实际每次擦字都会去连
 * 服务器本机并不存在的 8077 端口，白等一次连接超时才降级。
 */
const engineUrl = read("TEXT_ENGINE_BASE_URL");
if (engineUrl && /127\.0\.0\.1|localhost/.test(engineUrl)) {
  console.log(`\nWARN TEXT_ENGINE_BASE_URL="${engineUrl}" 指向本机环回地址`);
  console.log("     若生产服务器上没有部署该 python 服务，请改为留空，");
  console.log("     否则每次擦字都会先等一次连接超时才降级。");
}

console.log("");
if (hasBlocking) {
  console.error("存在阻断性缺失，部署应中断。请在服务器的 .env.gray 中补齐上述变量。");
  process.exit(1);
}
console.log("必需的模型能力凭证均已就绪。");
