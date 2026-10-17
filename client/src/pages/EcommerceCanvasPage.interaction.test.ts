/**
 * 电商画布 · 交互框架回归测试（源码断言）
 *
 * 【为什么用源码断言而不是渲染断言】
 * 这个页面是 wouter 子路由 + 提在壳里的草稿 state 拼出来的，
 * 真正的故障模式不是「某个断言算错」，而是「有人改动时被静默回滚」：
 * 2026-10-15 就发生过 App.tsx / AppShell.tsx 被外部写入者覆盖，
 * 路由和导航项被吞掉，页面看起来正常、实际上掉进 NotFound。
 * 渲染测试在当时也一样绿（因为整条路由都没了），
 * 只有把「路由必须存在」「死按钮不许回来」钉成源码断言才能立刻变红。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(here, "EcommerceCanvasPage.tsx"), "utf8");
const workspaceSource = readFileSync(
  resolve(here, "../components/ecommerce/EcommerceWorkspace.tsx"),
  "utf8",
);
const gallerySource = readFileSync(
  resolve(here, "../components/ecommerce/EcommerceTemplateGallery.tsx"),
  "utf8",
);
const detailSource = readFileSync(
  resolve(here, "../components/ecommerce/EcommerceTemplateDetail.tsx"),
  "utf8",
);
const historySource = readFileSync(
  resolve(here, "../components/ecommerce/EcommerceHistory.tsx"),
  "utf8",
);
const appSource = readFileSync(resolve(here, "../App.tsx"), "utf8");
const shellSource = readFileSync(
  resolve(here, "../components/layout/AppShell.tsx"),
  "utf8",
);

describe("电商画布：父路由挂载", () => {
  it("App 里注册的是 /ecommerce-canvas/* 通配路由，不是定值路由", () => {
    /*
      ⚠️ 定值 path 不吃尾斜杠：静态托管（含发布用的静态产物）会把
         /ecommerce-canvas 重定向成 /ecommerce-canvas/，定值 path 不匹配，
         页面会掉进 NotFound —— 线上就是这么白的，且控制台零报错。
    */
    expect(appSource).toContain('<Route path="/ecommerce-canvas/*">');
    expect(appSource).not.toContain('<Route path="/ecommerce-canvas">');
  });

  it("路由里挂的是 EcommerceCanvasPage，且包在 AppShell 里（保留侧边栏）", () => {
    expect(appSource).toContain("import EcommerceCanvasPage from");
    expect(appSource).toContain("<AppShell>");
    expect(appSource).toContain("<EcommerceCanvasPage />");
  });
});

describe("电商画布：子路由分发", () => {
  it("壳里按子路径分发 post / product / templates / templates/:id / history", () => {
    expect(pageSource).toContain('const ROOT = "/ecommerce-canvas"');
    expect(pageSource).toContain('TEMPLATE_PREFIX = "templates/"');
    expect(pageSource).toContain('sub === "post"');
    expect(pageSource).toContain('sub === "product"');
    expect(pageSource).toContain('sub === "templates"');
    expect(pageSource).toContain('sub === "history"');
    expect(pageSource).toContain('sub.startsWith(TEMPLATE_PREFIX)');
  });

  it("解析前先剥尾斜杠，否则静态托管加斜杠后 sub 会带脏后缀", () => {
    expect(pageSource).toContain('rawPath.replace(/\\/+$/, "")');
  });

  it("未知子路径重定向回工作台，而不是白屏", () => {
    expect(pageSource).toContain("<Redirect");
    expect(pageSource).toContain("replace");
  });

  it("模板库/详情页通过 ?tpl=<id> 把选中模板带回工作台", () => {
    expect(pageSource).toContain('params.get("tpl")');
    expect(pageSource).toContain("${ROOT}/post?tpl=${template.id}");
    /*
      ⚠️ 这个 effect 必须靠 updateDraft 的「同值返回原对象」短路，
         否则会陷入 effect → setState → effect 的死循环。
    */
    expect(pageSource).toContain("prev.tplId === id ? prev :");
  });
});

describe("电商画布：草稿跨路由不丢", () => {
  it("draft state 提在路由壳里，而不是工作台内部", () => {
    expect(pageSource).toContain("useState<EcommerceDraft>(createDefaultDraft)");
    expect(pageSource).toContain("updateDraft={updateDraft}");
    // 工作台只收 props，不再自己持有草稿
    expect(workspaceSource).not.toContain("useState<EcommerceDraft>");
  });

  it("updateDraft 同时支持 patch 与 updater 两种调用形式", () => {
    expect(pageSource).toContain("typeof patch === \"function\"");
  });
});

describe("电商画布：按钮不许是死的", () => {
  it("不再有常亮且点击为空的假 Switch", () => {
    /*
      首版的「生成数量」「张数」是 <Switch on onToggle={() => {}} />：
      永远开着、点了什么都不发生。这是最典型的死按钮——
      界面上看着可交互，用户点几次才发现是块贴图。
    */
    expect(workspaceSource).not.toContain("onToggle={() => {}}");
  });

  it("数量类控件走 CountRow（说明 + 步进器），不再套假开关", () => {
    expect(workspaceSource).toContain("<CountRow");
    expect(workspaceSource).toContain("label=\"生成数量\"");
    expect(workspaceSource).toContain("label=\"张数\"");
  });

  it("上传区承诺了「拖拽」就真的接了 onDrop", () => {
    expect(workspaceSource).toContain("点击或拖拽上传");
    expect(workspaceSource).toContain("onDragOver");
    expect(workspaceSource).toContain("onDrop");
    expect(workspaceSource).toContain("setDragOver");
    // file input 支持多选，否则「最多 5 张」无从上传
    expect(workspaceSource).toContain("multiple");
  });

  it("结果图可点开预览，并给出下载出口", () => {
    expect(pageSource).toContain("onPreviewResult={index => setPreviewIndex(index)}");
    expect(workspaceSource).toContain("下载全部");
    expect(workspaceSource).toContain("重新生成");
  });
});

describe("电商画布：二级页真实可达", () => {
  it("工作台提供进入模板库总览的入口", () => {
    expect(workspaceSource).toContain('href="/ecommerce-canvas/templates"');
    expect(workspaceSource).toContain("查看全部");
  });

  it("未选模板时给出可点的跳转入口，而不是一句静态提示", () => {
    expect(workspaceSource).toContain("去模板库挑一个");
  });

  it("模板卡提供进入详情二级页的入口", () => {
    expect(workspaceSource).toContain("onOpenDetail={picked => onOpenTemplateDetail(picked.id)}");
  });

  it("产品图空态给出可点的背景模板入口", () => {
    expect(workspaceSource).toContain("挑选电商背景模板");
    expect(workspaceSource).toContain("setBgSelectorOpen(true)");
  });

  it("详情页缺失模板时给出返回出口，不白屏", () => {
    expect(detailSource).toContain("模板不存在");
    expect(detailSource).toContain('href="/ecommerce-canvas/templates"');
  });

  it("历史页空态给出去生成的入口", () => {
    expect(historySource).toContain("去生成第一套带货图文");
    expect(historySource).toContain("清空记录");
  });
});

describe("电商画布：背景模板不带第三方品牌字样", () => {
  it("页面用户可见文案里不再出现 PicWish / 佐糖", () => {
    /*
      ⚠️ 只清 UI 文案：底层接口 / 组件名（listPicWishBackgroundTemplates、
         PicwishBackgroundSelector）属于实现标识，改名要动服务端契约，
         不在本次范围内，所以这里断言的是「给用户看的文字」。
    */
    const uiSources = [workspaceSource, gallerySource, detailSource, historySource, pageSource];
    for (const source of uiSources) {
      // 去掉注释，只检查会被编译进产物、可能被渲染出来的部分
      const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
      const withoutLineComments = withoutBlockComments.replace(/\/\/[^\n]*/g, "");
      expect(withoutLineComments).not.toContain("PicWish");
      expect(withoutLineComments).not.toContain("佐糖");
    }
  });

  it("背景模板相关 UI 文案改用中性表述", () => {
    expect(workspaceSource).toContain("使用默认电商背景模板 · 点击挑选");
    expect(workspaceSource).not.toContain("使用 PicWish 默认电商背景模板");
    expect(workspaceSource).toContain("上传产品图并在左侧挑选电商背景模板");
    expect(workspaceSource).not.toContain("挑选 PicWish 电商背景模板");
  });

  /*
    2026-10-17 真实出图实测：1K 档显式传 1088×1088 → 服务端放大到 1536 → 按 2K 扣 150，
    界面却报 70。锁死「默认 1 张 + 默认 70 积分档 + 1K 不传像素」。
  */
  it("defaults to 1 product image on the 70-credit model and never sends pixels for 1k", () => {
    expect(pageSource).toContain("productCount: 1,");
    expect(pageSource).toContain("const DEFAULT_MODEL_ID = DEFAULT_IMAGE_MODEL_ID;");
    expect(pageSource).toContain('draft.productTier !== "1k"');
  });
});
