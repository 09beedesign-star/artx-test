/**
 * 电商画布 · 上传图片删除按钮浮层测试
 *
 * 验证删除按钮（❌）在图片右上角浮动，不被圆角裁切。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(
  resolve(__dirname, "./EcommerceWorkspace.tsx"),
  "utf-8",
);

describe("EcommerceWorkspace - 上传图片删除按钮浮层", () => {
  it("外层容器没有 overflow-hidden（避免裁切按钮）", () => {
    // 删除按钮的父容器（相对定位）不应该有 overflow-hidden
    const relativeContainerMatch = src.match(
      /className="relative h-\[52px\] w-\[52px\]"[^>]*>/,
    );
    expect(relativeContainerMatch).toBeTruthy();
    expect(relativeContainerMatch![0]).not.toContain("overflow-hidden");
  });

  it("图片容器（内层）有 overflow-hidden 和圆角", () => {
    // 图片的直接父容器应该有 overflow-hidden 和 rounded-md
    const imageWrapperMatch = src.match(
      /<div className="h-full w-full overflow-hidden rounded-md"/,
    );
    expect(imageWrapperMatch).toBeTruthy();
  });

  it("删除按钮定位在右上角外侧（right-[-4px] top-[-4px]）", () => {
    // 删除按钮应该用负偏移让圆形按钮的中心在图片边缘
    const removeButtonMatch = src.match(
      /className="absolute right-\[-4px\] top-\[-4px\][^"]*"/,
    );
    expect(removeButtonMatch).toBeTruthy();
  });

  it("删除按钮有 hover 缩放效果", () => {
    // 删除按钮应该有 hover:scale-110 提升交互反馈
    const removeButtonMatch = src.match(
      /className="absolute right-\[-4px\] top-\[-4px\][^"]*hover:scale-110[^"]*"/,
    );
    expect(removeButtonMatch).toBeTruthy();
  });

  it("删除按钮尺寸为 16px（h-4 w-4）", () => {
    // 删除按钮应该是 16px × 16px 的圆形
    const removeButtonMatch = src.match(
      /className="absolute right-\[-4px\] top-\[-4px\][^"]*h-4 w-4[^"]*"/,
    );
    expect(removeButtonMatch).toBeTruthy();
  });
});
