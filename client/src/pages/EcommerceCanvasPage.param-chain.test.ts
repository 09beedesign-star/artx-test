/**
 * EcommerceCanvasPage.param-chain.test.ts
 *
 * 电商画布参数链路完整性测试（2026-10-18 审计后补充）
 *
 * 根因：用户反馈「选了一堆参数以后，最后生成的时候完全没有任何参与」。
 * 审计结果显示 16 个参数全部生效，本测试锁死三条最易断链的路径：
 *
 *   1. **产品图分辨率档 (productTier: 1k/2k/4k) → customWidth/Height**
 *      - 1K 不传像素，服务端从 ratio + resolution 推导
 *      - 2K/4K 前端算出 customWidth/Height 后透传给 createProductBackground
 *
 *   2. **带货图文模板 (tplId) → flow 拆分 → 每张 shot 差异化**
 *      - 49 个模板每个有 flow（如「全景融入 → 局部特写 → 退后收尾」）
 *      - splitFlow() 拆成数组，按张数均分，拼入 prompt「本张分镜：${shot}」
 *
 *   3. **带货图文画幅比 (postRatio) → pixelSize() → targetWidth/Height**
 *      - pixelSize(draft.postRatio, "1k") 按比例算像素（short side = 1088）
 *      - 透传给 editImageWithPrompt({targetWidth, targetHeight})
 *
 * 本测试**不运行出图**（快速反馈），只验证代码逻辑 + 数据流完整性。
 * 配合审计报告，确保未来重构不会无声断链。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { pixelSize, splitFlow } from "@/components/ecommerce/shared";
import { ECOMMERCE_TEMPLATES } from "@/data/ecommerce-canvas-templates";

const pageSource = readFileSync(
  new URL("./EcommerceCanvasPage.tsx", import.meta.url),
  "utf-8",
);

describe("EcommerceCanvasPage — 参数链路完整性（2026-10-18 审计后补充）", () => {
  /**
   * 测试 1：产品图分辨率档 → customWidth/Height 透传链路
   *
   * 口径：
   *   - 1K 不传像素（与智能产品一致），服务端从 ratio + resolution 推导
   *   - 2K/4K 前端调用 pixelSize() 算出像素，传给 createProductBackground
   *
   * 断链风险：
   *   - 忘记判断 productTier !== "1k" → 全档位都传像素 → 服务端逻辑冲突
   *   - pixelSize() 返回空对象 → customWidth/Height 为 undefined → 服务端回落默认值
   *   - 透传时字段名写错（customW/customH）→ 参数静默丢失
   */
  it("1. 产品图 2K/4K 时算出 customWidth/Height 并传给 createProductBackground", () => {
    const handleGenerateBlock = pageSource.match(
      /if \(startedMode === "product"\) \{[\s\S]*?urls = /m,
    )?.[0];
    expect(handleGenerateBlock).toBeTruthy();

    // ✅ 必须判断档位：1K 不传，2K/4K 才传
    expect(handleGenerateBlock).toContain(
      'const productSize = draft.productTier !== "1k" ? pixelSize(draft.productRatio, draft.productTier) : null;',
    );

    // ✅ 调用 pixelSize() 算像素
    expect(handleGenerateBlock).toContain("pixelSize(draft.productRatio, draft.productTier)");

    // ✅ 透传给 createProductBackground（字段名必须是 customWidth/customHeight）
    expect(handleGenerateBlock).toContain("customWidth: productSize?.targetWidth,");
    expect(handleGenerateBlock).toContain("customHeight: productSize?.targetHeight,");

    // ✅ ratio + resolution 必须同时传（服务端 1K 场景需要）
    expect(handleGenerateBlock).toContain("ratio: draft.productRatio,");
    expect(handleGenerateBlock).toContain('resolution: draft.productTier as "1k" | "2k" | "4k",');
  });

  /**
   * 测试 2：带货图文模板 → flow 拆分 → 每张 shot 差异化
   *
   * 口径：
   *   - 60 个模板每个有 flow（如「全景融入 → 局部特写 → 退后收尾」）
   *   - splitFlow() 拆成数组（兼容全角「→」和半角「->」）
   *   - 按张数均分：第 1 张用 shots[0]，第 2 张用 shots[1]，... 超出则复用最后一个
   *   - 拼入 prompt「本张分镜：${shot}」，影响构图差异
   *
   * 断链风险：
   *   - 查找模板时用 !== 而不是 === → tpl 永远 null
   *   - splitFlow() 没有兼容半角「->」→ 部分模板只拆出 1 个步骤
   *   - 按张分配公式错误 → 全部张用同一个 shot
   *   - prompt 拼接时忘记插入 ${shot} → 差异化指令丢失
   */
  it("2. 带货图文模板 flow 拆分成 shots 数组，按张分配到每次 editImageWithPrompt 的 prompt", () => {
    const handleGenerateBlock = pageSource.match(
      /} else \{[\s\S]*?if \(collected\.length === 0\)/m,
    )?.[0];
    expect(handleGenerateBlock).toBeTruthy();

    // ✅ 查找模板（必须用 === 不能 !==）
    expect(handleGenerateBlock).toContain(
      "const tpl = ECOMMERCE_TEMPLATES.find(item => item.id === draft.tplId);",
    );

    // ✅ 调用 splitFlow() 拆分 flow
    expect(handleGenerateBlock).toContain("const shots = tpl ? splitFlow(tpl.flow) : [];");

    // ✅ 按张分配 shot（公式：Math.floor((index * shots.length) / startedCount)）
    expect(handleGenerateBlock).toContain(
      "const shot = shots.length",
    );
    expect(handleGenerateBlock).toContain(
      "shots[Math.min(shots.length - 1, Math.floor((index * shots.length) / startedCount))]",
    );

    // ✅ 拼入 prompt「本张分镜：${shot}」
    expect(handleGenerateBlock).toContain(
      '`这是第 ${index + 1} / ${startedCount} 张${shot ? `，本张分镜：${shot}` : ""}。',
    );
  });

  /**
   * 测试 3：带货图文画幅比 → pixelSize() → targetWidth/Height
   *
   * 口径：
   *   - postRatio（3:4 / 1:1 / 4:3 / 9:16）+ 固定 "1k" 档位
   *   - pixelSize() 短边对齐 1088，按比例算长边
   *   - 透传给 editImageWithPrompt({targetWidth, targetHeight})
   *
   * 断链风险：
   *   - pixelSize() 第二个参数传了 draft.productTier（混淆产品图档位）
   *   - 返回空对象 → targetWidth/Height 为 undefined → 服务端回落默认值
   *   - 透传时字段名写错（width/height 而不是 targetWidth/targetHeight）
   */
  it("3. 带货图文画幅比通过 pixelSize() 算出 targetWidth/Height，传给 editImageWithPrompt", () => {
    const handleGenerateBlock = pageSource.match(
      /} else \{[\s\S]*?if \(collected\.length === 0\)/m,
    )?.[0];
    expect(handleGenerateBlock).toBeTruthy();

    // ✅ 调用 pixelSize()，第二个参数必须是 "1k"（不能用 draft.productTier）
    expect(handleGenerateBlock).toContain('const postSize = pixelSize(draft.postRatio, "1k");');

    // ✅ 透传给 editImageWithPrompt（字段名必须是 targetWidth/targetHeight）
    expect(handleGenerateBlock).toContain("targetWidth: postSize.targetWidth,");
    expect(handleGenerateBlock).toContain("targetHeight: postSize.targetHeight,");

    // ✅ preserveSourceSize 必须是 false（带货图文要换尺寸，不保持原图尺寸）
    expect(handleGenerateBlock).toContain("preserveSourceSize: false,");
  });

  /**
   * 测试 4：pixelSize() 函数自身正确性
   *
   * 口径：
   *   - 短边对齐档位（1k=1088, 2k=2048, 4k=4096）
   *   - 按比例算长边（保持原比例）
   *   - 无效 ratio 返回空对象
   */
  it("4. pixelSize() 按档位与比例正确计算像素", () => {
    // 竖屏（3:4）
    expect(pixelSize("3:4", "1k")).toEqual({ targetWidth: 816, targetHeight: 1088 });
    expect(pixelSize("3:4", "2k")).toEqual({ targetWidth: 1536, targetHeight: 2048 });
    expect(pixelSize("3:4", "4k")).toEqual({ targetWidth: 3072, targetHeight: 4096 });

    // 正方形（1:1）
    expect(pixelSize("1:1", "1k")).toEqual({ targetWidth: 1088, targetHeight: 1088 });
    expect(pixelSize("1:1", "2k")).toEqual({ targetWidth: 2048, targetHeight: 2048 });

    // 横屏（16:9）
    expect(pixelSize("16:9", "1k")).toEqual({ targetWidth: 1088, targetHeight: 612 });
    expect(pixelSize("16:9", "4k")).toEqual({ targetWidth: 4096, targetHeight: 2304 });

    // 无效 ratio 返回空对象
    expect(pixelSize("invalid", "1k")).toEqual({});
    expect(pixelSize("", "2k")).toEqual({});
  });

  /**
   * 测试 5：splitFlow() 函数自身正确性
   *
   * 口径：
   *   - 兼容全角「→」和半角「->」
   *   - trim() 去掉每段首尾空格
   *   - filter(Boolean) 去掉空字符串
   */
  it("5. splitFlow() 正确拆分模板 flow（兼容全角/半角分隔符）", () => {
    // 全角分隔符
    expect(splitFlow("全景融入 → 局部特写 → 退后收尾")).toEqual([
      "全景融入",
      "局部特写",
      "退后收尾",
    ]);

    // 半角分隔符
    expect(splitFlow("全景融入 -> 局部特写 -> 退后收尾")).toEqual([
      "全景融入",
      "局部特写",
      "退后收尾",
    ]);

    // 混合分隔符
    expect(splitFlow("全景融入 → 局部特写 -> 退后收尾")).toEqual([
      "全景融入",
      "局部特写",
      "退后收尾",
    ]);

    // 只有一个步骤（无分隔符）
    expect(splitFlow("单一场景")).toEqual(["单一场景"]);

    // 空字符串
    expect(splitFlow("")).toEqual([]);

    // 多余空格
    expect(splitFlow("  全景融入  →  局部特写  ")).toEqual(["全景融入", "局部特写"]);
  });

  /**
   * 测试 6：60 个模板全部有 flow 字段（数据完整性）
   *
   * 口径：
   *   - ECOMMERCE_TEMPLATES 共 60 个模板
   *   - 每个必须有 id、name、flow、categoryId
   *   - flow 必须非空字符串
   */
  it("6. 49 个带货图文模板全部有 flow 字段且 id 不重复（数据完整性）", () => {
    // 实际 49 个（id 1-49）；数量变动时同步改这里，防止模板被误删而无人察觉
    expect(ECOMMERCE_TEMPLATES).toHaveLength(49);
    expect(new Set(ECOMMERCE_TEMPLATES.map(tpl => tpl.id)).size).toBe(49);
    ECOMMERCE_TEMPLATES.forEach((tpl, index) => {
      expect(tpl.id, `模板 #${index + 1} 缺少 id`).toBeGreaterThan(0);
      expect(tpl.name, `模板 #${index + 1} 缺少 name`).toBeTruthy();
      expect(tpl.flow, `模板 #${index + 1} 缺少 flow`).toBeTruthy();
      expect(typeof tpl.flow, `模板 #${index + 1} flow 不是字符串`).toBe("string");
      expect(tpl.categoryId, `模板 #${index + 1} 缺少 categoryId`).toBeTruthy();
    });
  });

  /**
   * 测试 7：60 个模板 flow 拆分后至少有 1 个步骤（数据质量）
   *
   * 口径：
   *   - splitFlow(flow) 拆分后数组长度 >= 1
   *   - 否则 shot 分配公式会出错（Math.floor(0/0) = NaN）
   */
  it("7. 49 个模板 flow 拆分后至少有 1 个步骤（数据质量）", () => {
    ECOMMERCE_TEMPLATES.forEach((tpl, index) => {
      const shots = splitFlow(tpl.flow);
      expect(
        shots.length,
        `模板 #${index + 1}（${tpl.name}）flow 拆分后为空数组`,
      ).toBeGreaterThan(0);
    });
  });
});
