/*
 * 视角 / 外形轮廓锁的测试（2026-09-29）。
 *
 * 守三件事：
 *   1. 纯函数：camera_view 豁免，其余（含未知 operation）一律上锁 —— 默认值 = 锁；
 *   2. 后端两条上游出口（VOD 参考图 / OpenAI images/edits）都接上了锁，且去掉了
 *      "unless the user explicitly asks to change them" 这个漏洞；
 *   3. 前端悬浮提示词提交链路：框选与不框选都在 LLM 增强之后加锁，
 *      且改写指令里不再出现「输出必须是一张新的结果图」。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildViewpointLockInstruction,
  VIEWPOINT_LOCK_INSTRUCTION_EN,
  VIEWPOINT_LOCK_PROMPT_ZH,
} from "../shared/viewpoint-lock";

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const countOf = (s: string, needle: string) => s.split(needle).length - 1;

describe("buildViewpointLockInstruction", () => {
  it("camera_view 豁免（它的目的就是换视角）", () => {
    expect(buildViewpointLockInstruction("camera_view")).toBe("");
  });

  it.each(["edit", "annotation_edit", "text_edit", undefined, null, "some_new_op"])(
    "%s 必须上锁（默认值 = 锁）",
    op => {
      expect(buildViewpointLockInstruction(op as string | undefined)).toBe(
        VIEWPOINT_LOCK_INSTRUCTION_EN
      );
    }
  );

  it("锁的内容覆盖视角、透视、取景、轮廓", () => {
    for (const word of ["camera angle", "perspective", "framing", "silhouette", "outline"]) {
      expect(VIEWPOINT_LOCK_INSTRUCTION_EN).toContain(word);
    }
    for (const word of ["镜头视角", "透视", "取景", "外形轮廓"]) {
      expect(VIEWPOINT_LOCK_PROMPT_ZH).toContain(word);
    }
  });
});

describe("后端两条上游出口都接上了视角锁", () => {
  const server = read("server/image-generation.ts");

  it("定义一次、两处 prompt 数组各引用一次", () => {
    expect(server).toContain(
      "const viewpointLockInstruction = buildViewpointLockInstruction(input.operation);"
    );
    expect(
      countOf(server, "viewpointLockInstruction,"),
      "VOD 参考图出口 + /images/edits 出口，少一个 = 一半模型照样换视角"
    ).toBe(2);
  });

  it("去掉 'unless the user explicitly asks to change them' 漏洞", () => {
    expect(server).not.toContain("unless the user explicitly asks to change them");
  });
});

describe("前端悬浮提示词提交链路", () => {
  const canvas = read("client/src/components/canvas/InfiniteCanvas.tsx");

  it("改写指令不再要求「新的结果图」，改为注入视角保持规则", () => {
    expect(canvas).not.toContain("输出必须是一张新的结果图");
    expect(canvas).toContain("...VIEWPOINT_LOCK_REWRITE_RULES_ZH,");
  });

  it("finalPrompt 不论是否框选都带视角锁，且在增强之后", () => {
    const at = canvas.indexOf("const finalPrompt = [\n          VIEWPOINT_LOCK_PROMPT_ZH,");
    expect(at, "finalPrompt 锚点失效").toBeGreaterThan(-1);
    const block = canvas.slice(at, at + 300);
    expect(block).toContain("VIEWPOINT_LOCK_PROMPT_ZH,");
    expect(block).toContain("具体修改要求：${optimizedText}");
    expect(block, "不能退回「不框选就只用 optimizedText」").not.toContain(": optimizedText;");
    expect(at).toBeGreaterThan(canvas.indexOf("const optimizedText ="));
  });
});
