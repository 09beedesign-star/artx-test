import { describe, expect, it, vi } from "vitest";

/**
 * ai-intent.ts 顶部 import 了 `@/lib/ai`，而 vitest 不解析 `@/` alias，
 * 整个 suite 会加载失败（表现为 "0 test"，极易被误读成通过）。
 * 这里把它 mock 掉：本测试只覆盖两个纯函数，不触碰任何网络调用。
 */
vi.mock("@/lib/ai", () => ({
  callLLM: vi.fn(),
  generateAiImages: vi.fn(),
  searchReferenceImages: vi.fn(),
  editImageWithPrompt: vi.fn(),
}));

import {
  detectVisualSpecInput,
  flattenVisualSpecToPrompt,
  routeCreativeIntent,
} from "../ai-intent";

/**
 * 2026-09-13 回归测试。
 *
 * 背景：用户把一整段描述画面的 JSON（直播 UI 样机）贴进输入框，期望出图，
 * 实际却收到文字回复。根因不是"判定太保守"，而是**扫描范围错了** ——
 * DIRECT_TEXT_PATTERN 扫的是整段输入，而 JSON 的 value 里塞满了自然语言
 * （弹幕「Neuralink进展如何？」里的「如何」），于是在 routeCreativeIntent
 * 的文本分支就直接 return 了，生图正则与大模型判定一行都没执行。
 *
 * 因此 detectVisualSpecInput 只看 JSON 的 **key**，不看 value。
 * 下面的 B 组用例专门锁住"value 含提问文案也不能判成文字"这个核心诉求。
 */

// 用户 2026-09-13 实际输入的精简版，保留了会触发文本正则的弹幕文案。
const LIVE_UI_SPEC = JSON.stringify({
  type: "直播 UI 样机",
  subject: {
    description: "Elon Musk 的肖像，面带微笑，身穿印有白色技术示意图的黑色 T 恤",
    background: "左侧显示带有 'SPACEX' 文字的屏幕，右侧显示红色的 'Tesla T logo'",
  },
  ui_overlay: {
    top_header: {
      host_info: "头像，名称 'Elon Musk'，副标题 '55.6万本场点赞'，红色 '关注' 按钮",
      rank_badge: "带有 '全站第1名' 的金币图标",
    },
    bottom_left_chat: {
      message_count: 7,
      messages: [
        "小火箭: 马斯克！未来可期！",
        "AI探索者: Neuralink进展如何？",
        "用户123: 讲讲AI吧，会取代人类吗？",
      ],
    },
    bottom_right_product_card: {
      title: "特斯拉Cybertruck 电动皮卡",
      price: "¥ 1,618,000",
      button: "红色 '抢' 按钮",
    },
    bottom_bar: {
      input_field: "'说点什么...'",
      icons: ["笑脸", "购物车", "礼物盒", "分享"],
    },
  },
});

describe("detectVisualSpecInput — 应识别为结构化视觉规格", () => {
  it("识别用户实际输入的直播 UI 样机 JSON", () => {
    expect(detectVisualSpecInput(LIVE_UI_SPEC)).toBe(true);
  });

  it("识别中文海报规格", () => {
    const spec = JSON.stringify({
      type: "海报",
      subject: { description: "一只橘猫" },
      layout: { title: "夏日特惠" },
    });
    expect(detectVisualSpecInput(spec)).toBe(true);
  });

  it("识别英文视觉规格", () => {
    const spec = JSON.stringify({
      type: "poster",
      subject: "a cat",
      background: "beach",
      style: "flat illustration",
    });
    expect(detectVisualSpecInput(spec)).toBe(true);
  });

  it("识别场景 + 构图型规格", () => {
    const spec = JSON.stringify({
      scene: "雨夜街道",
      composition: "中心构图",
      palette: ["#0af", "#333"],
    });
    expect(detectVisualSpecInput(spec)).toBe(true);
  });
});

describe("detectVisualSpecInput — 不得误判的输入", () => {
  it("接口返回数据不算视觉规格", () => {
    const payload = JSON.stringify({ code: 0, message: "ok", data: { list: [1, 2, 3] } });
    expect(detectVisualSpecInput(payload)).toBe(false);
  });

  it("配置文件不算视觉规格", () => {
    const payload = JSON.stringify({ port: 3000, host: "localhost", debug: true });
    expect(detectVisualSpecInput(payload)).toBe(false);
  });

  it("只有 title + description 的通用对象不算视觉规格", () => {
    // 二者都在白名单里，但都不是强视觉信号 key，必须靠 STRONG_KEYS 挡住。
    const payload = JSON.stringify({ title: "周报", description: "本周完成了三件事" });
    expect(detectVisualSpecInput(payload)).toBe(false);
  });

  it("普通提问不算视觉规格", () => {
    expect(detectVisualSpecInput("这张图片是什么意思")).toBe(false);
  });

  it("纯文案需求不算视觉规格", () => {
    expect(detectVisualSpecInput("帮我写一段产品介绍文案")).toBe(false);
  });

  it("顶层是数组时不算视觉规格", () => {
    expect(detectVisualSpecInput('[{"type":"海报"},{"subject":"猫"}]')).toBe(false);
  });

  it("非法 JSON 不算视觉规格", () => {
    expect(detectVisualSpecInput("{type: 海报, subject: 猫}")).toBe(false);
  });

  it("空字符串与过短输入不算视觉规格", () => {
    expect(detectVisualSpecInput("")).toBe(false);
    expect(detectVisualSpecInput("{}")).toBe(false);
  });
});

describe("flattenVisualSpecToPrompt", () => {
  it("保留全部文案、数字与嵌套层级信息", () => {
    const prompt = flattenVisualSpecToPrompt(LIVE_UI_SPEC);
    // 画面里要出现的关键文案一个都不能丢
    expect(prompt).toContain("Elon Musk");
    expect(prompt).toContain("55.6万本场点赞");
    expect(prompt).toContain("全站第1名");
    expect(prompt).toContain("特斯拉Cybertruck 电动皮卡");
    expect(prompt).toContain("¥ 1,618,000");
    expect(prompt).toContain("说点什么...");
    // 数组元素不能被吞掉
    expect(prompt).toContain("礼物盒");
    expect(prompt).toContain("Neuralink进展如何？");
  });

  it("输出为自然语言而非原始 JSON 语法", () => {
    const prompt = flattenVisualSpecToPrompt(LIVE_UI_SPEC);
    expect(prompt).toContain("请严格按照以下结构化视觉规格生成一张完整的图片");
    // 不应把 JSON 的结构符号原样丢给图片模型
    expect(prompt.startsWith("{")).toBe(false);
  });

  it("解析失败时原样返回，不抛错", () => {
    expect(flattenVisualSpecToPrompt("not a json")).toBe("not a json");
  });
});

/**
 * 端到端接线测试 —— 这一组才是真正锁住本次修复的用例。
 *
 * ⚠️ 教训：最初只测了 detectVisualSpecInput / flattenVisualSpecToPrompt 两个纯函数，
 * 做变异测试时把 routeCreativeIntent 里的短路条件改成 `if (false && ...)`，
 * 15 个用例**依然全绿** —— 因为函数本身没坏，坏的是"函数有没有被接上"。
 * 所以必须直接断言 routeCreativeIntent 的返回值。
 *
 * callLLM 已被 mock 成 vi.fn()（返回 undefined），一旦短路失效、
 * 流程落到大模型分支就会抛错或返回非 image，用例必然失败。
 */
describe("routeCreativeIntent — 结构化视觉规格必须直接判定为出图", () => {
  it("用户的直播 UI 样机 JSON 返回 image 且不调用大模型", async () => {
    const decision = await routeCreativeIntent({
      module: "test-visual-spec",
      prompt: LIVE_UI_SPEC,
    });
    expect(decision.mode).toBe("image");
    expect(decision.reason).toBe("命中结构化视觉规格（JSON）");
    expect(decision.confidence).toBe("high");
  });

  it("imagePrompt 已摊平成自然语言且保留关键文案", async () => {
    const decision = await routeCreativeIntent({
      module: "test-visual-spec",
      prompt: LIVE_UI_SPEC,
    });
    expect(decision.imagePrompt).toBeTruthy();
    expect(decision.imagePrompt).toContain("特斯拉Cybertruck 电动皮卡");
    expect(decision.imagePrompt).toContain("全站第1名");
    // 不能把原始 JSON 直接透传给图片模型
    expect(decision.imagePrompt?.trim().startsWith("{")).toBe(false);
  });

  it("规格 value 里的提问文案不得把判定带偏成文字", async () => {
    // 这正是 2026-09-13 事故的触发点：弹幕「Neuralink进展如何？」中的
    // 「如何」命中 DIRECT_TEXT_PATTERN。此用例锁死该回归。
    expect(LIVE_UI_SPEC).toContain("如何");
    const decision = await routeCreativeIntent({
      module: "test-visual-spec",
      prompt: LIVE_UI_SPEC,
    });
    expect(decision.mode).not.toBe("text");
    expect(decision.mode).toBe("image");
  });

  it("英文视觉规格同样直接判 image", async () => {
    const spec = JSON.stringify({
      type: "poster",
      subject: "a cat wearing a hat",
      background: "sunset beach",
      style: "flat illustration",
    });
    const decision = await routeCreativeIntent({ module: "test-visual-spec", prompt: spec });
    expect(decision.mode).toBe("image");
  });

  it("普通提问不受影响，不会被误判成出图", async () => {
    const decision = await routeCreativeIntent({
      module: "test-visual-spec",
      prompt: "这张图片是什么意思",
    });
    // 命中 DIRECT_TEXT_PATTERN，应在正则层直接判文字
    expect(decision.mode).toBe("text");
  });

  it("明确的生图祈使句仍然判 image（不得被新短路影响）", async () => {
    const decision = await routeCreativeIntent({
      module: "test-visual-spec",
      prompt: "帮我画一张夏日促销海报",
    });
    expect(decision.mode).toBe("image");
  });
});
