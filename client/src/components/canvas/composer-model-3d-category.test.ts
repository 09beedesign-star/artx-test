import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

/**
 * 2026-11-22 用户要求：右下角模型菜单只留生图 / 对话，不再提供 3D 分类。
 * 推翻原先「右下角必须有 3D tab」的前提，保留独立 3D 入口、公共组件与计费隔离保护。
 * 仅关闭入口及状态写入，不在本次菜单改动中重构历史 3D 执行链路或修改计费。
 */
const canvasSource = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf8");
const selectorSource = readFileSync(resolve(__dirname, "ModelSelector.tsx"), "utf8");
const popoverStart = canvasSource.indexOf("<AssistantModelPopover");
expect(popoverStart, "找不到右下角浮层调用，样本无效").toBeGreaterThan(-1);
const popoverEnd = canvasSource.indexOf("/>", popoverStart);
expect(popoverEnd).toBeGreaterThan(popoverStart);
const popover = canvasSource.slice(popoverStart, popoverEnd);
const tabs = popover.match(/tabs=\{\[([\s\S]*?)\]\}/)?.[1];
expect(tabs, "找不到分类配置，样本无效").toBeTruthy();
const categoryHandler = popover.match(/onCategoryChange=\{cat => \{([\s\S]*?)\n\s*\}\}/)?.[1];
expect(categoryHandler, "找不到分类切换回调，样本无效").toBeTruthy();

function changeCategory(cat: string) {
  const writes: Array<[string, string]> = [];
  new Function("cat", "setAssistantModelPanelCategory", "setAssistantModelTab", categoryHandler!)(
    cat,
    (value: string) => writes.push(["panel", value]),
    (value: string) => writes.push(["business", value])
  );
  return writes;
}

describe("右下角模型菜单移除 3D 分类", () => {
  it("仅配置生图和对话，不能通过开发环境开关重新出现 3D", () => {
    const ids = [...tabs!.matchAll(/id:\s*"([^"]+)"/g)].map(match => match[1]);
    expect(ids).toEqual(["image", "text"]);
    expect(tabs).toContain('label: "生图"');
    expect(tabs).toContain('label: "对话"');
    expect(tabs).not.toMatch(/THREED|3[dD]/);
    expect(popover).toContain("showAuto");
  });

  it.each(["image", "text"])("%s 分类正常同步展示和业务页签", category => {
    expect(changeCategory(category)).toEqual([["panel", category], ["business", category]]);
  });

  it.each(["3d", "video", ""])("拒绝分类 %s，不能由共享回调恢复 3D 状态", category => {
    expect(changeCategory(category)).toEqual([]);
  });

  it("分类初值与其他状态写入不会从持久化恢复 3D", () => {
    const ast = ts.createSourceFile("InfiniteCanvas.tsx", canvasSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declarations: ts.VariableDeclaration[] = [];
    const writes: ts.CallExpression[] = [];
    const tabTypes: ts.TypeAliasDeclaration[] = [];
    function visit(node: ts.Node) {
      if (ts.isTypeAliasDeclaration(node) && node.name.text === "CanvasAssistantModelTab") tabTypes.push(node);
      if (ts.isVariableDeclaration(node)) declarations.push(node);
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        ["setAssistantModelPanelCategory", "setAssistantModelTab"].includes(node.expression.text)) {
        writes.push(node);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    expect(tabTypes, "业务分类类型必须存在且唯一").toHaveLength(1);
    expect(ts.isUnionTypeNode(tabTypes[0].type)).toBe(true);
    const tabValues = (tabTypes[0].type as ts.UnionTypeNode).types.map(type =>
      ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal) ? type.literal.text : type.getText(ast));
    expect(tabValues.sort()).toEqual(["image", "text"]);

    function stateInitializer(name: string) {
      const matches = declarations.filter(node => ts.isArrayBindingPattern(node.name) &&
        node.name.elements.some(element => ts.isBindingElement(element) &&
          ts.isIdentifier(element.name) && element.name.text === name));
      expect(matches, `找不到唯一的 ${name} 状态声明，样本无效`).toHaveLength(1);
      const initializer = matches[0].initializer;
      expect(initializer && ts.isCallExpression(initializer), `${name} 必须由 useState 初始化`).toBe(true);
      const call = initializer as ts.CallExpression;
      expect(call.expression.getText(ast)).toBe("useState");
      expect(call.arguments).toHaveLength(1);
      return call.arguments[0];
    }

    expect(stateInitializer("assistantModelPanelCategory").getText(ast)).toBe("assistantModelTab");
    const tabInitializer = stateInitializer("assistantModelTab");
    expect(ts.isArrowFunction(tabInitializer), "业务页签必须先过滤持久化初值").toBe(true);
    for (const stored of ["image", "text", "3d", "video", "", null]) {
      const initialTab = new Function("window", "readOwnedPreference", "CANVAS_ASSISTANT_MODEL_TAB_STORAGE_KEY",
        `return (${tabInitializer.getText(ast)})();`)({}, () => stored, "model-tab");
      expect(initialTab, `持久化分类 ${stored} 不得恢复 3D`).toBe(stored === "text" ? "text" : "image");
    }

    const handlerStart = canvasSource.indexOf(categoryHandler!, popoverStart);
    expect(handlerStart, "找不到已验证白名单的回调范围").toBeGreaterThan(popoverStart);
    const handlerEnd = handlerStart + categoryHandler!.length;
    for (const setter of ["setAssistantModelPanelCategory", "setAssistantModelTab"]) {
      const setterWrites = writes.filter(call => call.expression.getText(ast) === setter);
      expect(setterWrites.length, `${setter} 写入不存在，不能空集通过`).toBeGreaterThan(0);
      for (const call of setterWrites) {
        const location = ast.getLineAndCharacterOfPosition(call.getStart(ast)).line + 1;
        expect(call.arguments, `${setter}:${location} 必须仅写入一个安全值`).toHaveLength(1);
        const value = call.arguments[0];
        const safeLiteral = ts.isStringLiteral(value) && ["text", "image"].includes(value.text);
        const safeTab = ts.isIdentifier(value) && value.text === "assistantModelTab";
        const guardedCategory = ts.isIdentifier(value) && value.text === "cat" &&
          call.getStart(ast) >= handlerStart && call.end <= handlerEnd;
        expect(safeLiteral || safeTab || guardedCategory,
          `${setter}:${location} 禁止未过滤的分类写入：${value.getText(ast)}`).toBe(true);
      }
    }
  });

  it("保留其他位置的独立 3D 入口和唯一生成链路", () => {
    const start = canvasSource.indexOf("onSubmit={({ prompt, model }) => {");
    expect(start, "找不到独立 3D 面板回调").toBeGreaterThan(-1);
    const callback = canvasSource.slice(start, start + 1600);
    expect(callback).toContain("runCanvasThreeDGeneration({");
    expect(callback).toMatch(/model,/);
    expect(canvasSource).toContain("enable3D={THREED_GENERATION_ON}");
  });

  it("公共组件仍支持其他入口的 3D 型号和积分提示，不做全局删除", () => {
    expect(selectorSource).toContain("THREED_AI_MODEL_OPTIONS.find(m => m.id === model)");
    expect(selectorSource).toContain("getAiThreeDModelCreditPolicy(model.id)");
    expect(selectorSource).toMatch(/is3D && threeDCredit/);
    expect(selectorSource).toContain("积分/次");
  });
});
