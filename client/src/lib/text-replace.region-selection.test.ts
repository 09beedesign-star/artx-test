import { describe, expect, it } from "vitest";
import { findChangedLineIndexes, selectEditedTextRegions } from "./text-replace";

const region = (text: string) => ({ text, x: 0, y: 0, width: 1, height: 1 });

describe("findChangedLineIndexes 行级 diff", () => {
  it("只标记被改动的行", () => {
    const changed = findChangedLineIndexes("第一行\n第二行\n第三行", "第一行\n新的第二行\n第三行");
    expect([...changed]).toEqual([1]);
  });

  it("仅改标点或大小写也算改动", () => {
    const changed = findChangedLineIndexes("Hello World\n保持不变", "hello world!\n保持不变");
    expect([...changed]).toEqual([0]);
  });

  it("完全没改时返回空集合", () => {
    expect(findChangedLineIndexes("A\nB", "A\nB").size).toBe(0);
  });
});

describe("selectEditedTextRegions 四级降级匹配", () => {
  it("exact：OCR 文本与文案一致时只选中被改动的区域", () => {
    const regions = [region("标题文字"), region("副标题文字"), region("底部说明")];
    const result = selectEditedTextRegions(
      regions,
      "标题文字\n副标题文字\n底部说明",
      "全新标题\n副标题文字\n底部说明",
    );
    expect(result.strategy).toBe("exact");
    expect(result.regions.map(r => r.text)).toEqual(["标题文字"]);
  });

  it("fuzzy：OCR 少认几个字时仍能命中，不会全选", () => {
    // OCR 把「限时特惠活动进行中」认成了「限时特惠活动进行」（漏了一个字），
    // 归一化后互不包含（因为长度接近但不构成子串关系），只能靠字符重合度命中。
    const regions = [region("限时特恵活动进行"), region("全场包邮")];
    const result = selectEditedTextRegions(
      regions,
      "限时特惠活动进行中\n全场包邮",
      "春季新品上市\n全场包邮",
    );
    expect(result.strategy).toBe("fuzzy");
    expect(result.regions.map(r => r.text)).toEqual(["限时特恵活动进行"]);
  });

  it("positional：文本完全对不上但行数一致时，按行序命中", () => {
    const regions = [region("@@@"), region("###"), region("$$$")];
    const result = selectEditedTextRegions(
      regions,
      "第一行\n第二行\n第三行",
      "第一行\n第二行\n改动的第三行",
    );
    expect(result.strategy).toBe("positional");
    expect(result.regions.map(r => r.text)).toEqual(["$$$"]);
  });

  it("all：行数和文本都对不上才退化为全部区域", () => {
    const regions = [region("@@@"), region("###")];
    const result = selectEditedTextRegions(
      regions,
      "第一行\n第二行\n第三行",
      "第一行\n第二行\n改动的第三行",
    );
    expect(result.strategy).toBe("all");
    expect(result.regions).toHaveLength(2);
  });

  it("没有任何改动时不选中任何区域", () => {
    const regions = [region("标题文字"), region("底部说明")];
    const result = selectEditedTextRegions(regions, "标题文字\n底部说明", "标题文字\n底部说明");
    expect(result.regions).toHaveLength(0);
  });

  it("区域为空时安全返回", () => {
    const result = selectEditedTextRegions([], "A", "B");
    expect(result.regions).toHaveLength(0);
  });

  it("改一行不会把整页区域都选中（回归：只改一行却擦整页）", () => {
    const regions = [
      region("春季新品发布会"),
      region("三月十五日上午十点"),
      region("北京国际会议中心"),
      region("扫码报名参与"),
    ];
    const original = "春季新品发布会\n三月十五日上午十点\n北京国际会议中心\n扫码报名参与";
    const edited = "春季新品发布会\n三月二十日上午十点\n北京国际会议中心\n扫码报名参与";
    const result = selectEditedTextRegions(regions, original, edited);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].text).toBe("三月十五日上午十点");
  });
});
