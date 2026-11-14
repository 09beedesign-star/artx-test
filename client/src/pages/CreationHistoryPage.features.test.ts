/**
 * 创作历史：本地文件夹快捷打开 / 单选多选批量删除 / 六色标签 的接线锁。
 *
 * 🔒 2026-11-14 用户要求「所有的色彩标签仅在创作历史的界面中可以看到」——
 *    这里除了断言接线，还全仓扫描确认标签渲染与常量没有外溢到其他页面。
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TAG_COLOR_IDS } from "../lib/creation-history-tags";

const read = (p: string) =>
  readFileSync(resolve(__dirname, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const page = read("./CreationHistoryPage.tsx");
const store = read("../lib/creation-history.ts");
const core = read("../lib/creation-history-core.ts");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("六色标签：名称可编辑 + 左上角显示 + 可取消", () => {
  it("六种颜色都有打标签按钮与名称输入框", () => {
    for (const id of TAG_COLOR_IDS) {
      expect(page).toContain(`data-artx-history-apply-tag={color.id}`);
      expect(page).toContain(`data-artx-history-tag-name={color.id}`);
    }
    expect(page).toContain("CREATION_HISTORY_TAG_COLORS.map");
    expect(page).toContain("onBlur={persistTagNames}");
    expect(page).toContain("maxLength={TAG_NAME_MAX_LENGTH}");
  });

  it("标签名称变化会写回创作历史专属的 settings store", () => {
    expect(page).toContain("writeTagNames(ownerId, normalized)");
    expect(page).toContain("readTagNames(ownerId)");
    expect(store).toContain("return `tags:${ownerId}`");
    expect(store).toContain("SETTINGS_STORE");
    expect(store).not.toContain("localStorage");
  });

  it("编辑好的标签渲染在图片左上角，且每个标签可单独取消", () => {
    expect(page).toContain("data-artx-history-tags=");
    expect(page).toContain('className="absolute left-2 top-2 flex flex-wrap gap-1"');
    expect(page).toContain("data-artx-history-tag={colorId}");
    expect(page).toContain("{tagNames[colorId]}");
    expect(page).toContain("data-artx-history-tag-remove={colorId}");
    expect(page).toContain("void removeTagFromRecord(record, colorId)");
    // 点标签区域不能顺手把图片选中
    expect(page).toContain("onClick={event => event.stopPropagation()}");
  });

  it("可取消：单张 ×、批量「取消标签」两条出口都在", () => {
    expect(page).toContain("data-artx-history-clear-tags=");
    expect(page).toContain("targets.map(clearRecordTags)");
    expect(page).toContain("toggleRecordTag(r, colorId)");
  });
});

describe("🔒 所有色彩标签仅在创作历史界面可见", () => {
  it("全仓除页面/常量/core/测试外，没有任何标签渲染或常量引用", () => {
    const others = walk(resolve(__dirname, "..")).filter(
      f =>
        !f.endsWith("CreationHistoryPage.tsx") &&
        !f.endsWith("creation-history-tags.ts") &&
        !f.endsWith("creation-history-core.ts") &&
        !f.endsWith("creation-history-tags.test.ts") &&
        !f.endsWith("CreationHistoryPage.features.test.ts") &&
        !f.includes(".test."),
    );
    expect(others.length).toBeGreaterThan(100);
    for (const file of others) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} 渲染了创作历史色彩标签`).not.toContain("data-artx-history-tag");
      expect(src, `${file} 引用了标签常量`).not.toContain("CREATION_HISTORY_TAG_COLORS");
      expect(src, `${file} 读取了记录的 tagIds`).not.toContain(".tagIds");
    }
  });

  it("标签分配写在记录自身，删记录即删标签，不另建全局映射", () => {
    expect(core).toContain("tagIds?: TagColorId[]");
    expect(store).not.toContain("tagAssignments");
  });

  it("创作历史仍然纯本地：不写接口、不接云同步", () => {
    for (const src of [page, store, core]) {
      expect(src).not.toMatch(/method:\s*["'](POST|PUT|PATCH)/i);
      expect(src).not.toMatch(/workspace-sync|scheduleWorkspaceSync/);
    }
  });
});

describe("单选 / 多选 / 批量删除", () => {
  it("单击单选、Ctrl/Cmd 增量、Shift 范围选", () => {
    expect(page).toContain("event.metaKey || event.ctrlKey");
    expect(page).toContain("event.shiftKey && lastAnchorRef.current");
    expect(page).toContain("orderedIds.slice(Math.min(a, b), Math.max(a, b) + 1)");
    expect(page).toContain("data-artx-history-select={record.id}");
    expect(page).toContain("data-artx-history-select-all=");
    expect(page).toContain("data-artx-history-selection-count=");
  });

  it("批量删除走已有的批量函数，且清空选中态", () => {
    expect(page).toContain("deleteCreationHistoryRecords(selectedIds)");
    expect(page).toContain("setSelectedIds([])");
    expect(page).toContain("data-artx-history-delete-selected=");
    // 不能退化成逐条删除
    expect(page).not.toContain("selectedIds.map(id => deleteCreationHistoryRecords([id]))");
  });

  it("批量打标签一次事务写完，避免逐条刷新读到中间态", () => {
    expect(page).toContain("updateCreationHistoryRecords(targets.map(r => toggleRecordTag(r, colorId)))");
    expect(store).toContain("export async function updateCreationHistoryRecords(");
    expect(store).toContain("await putRecords(records);");
    expect(store).toContain("if (!options.silent) notifyChanged();");
  });

  it("记录被删掉后清理选中态里的孤儿 id", () => {
    expect(page).toContain("const next = prev.filter(id => records.some(r => r.id === id))");
  });
});

describe("快速打开保存的本地文件夹", () => {
  it("右侧有打开按钮，走已保存的目录句柄", () => {
    expect(page).toContain("data-artx-history-open-folder=");
    expect(page).toContain("void openFolderView(folder.handle)");
    expect(page).toContain("folder.status === \"ready\"");
  });

  it("页内列出目录图片，另提供系统文件窗口定位", () => {
    expect(page).toContain("readLocalFolderImages(handle)");
    expect(page).toContain("openLocalFolderInSystemPicker(handle)");
    expect(page).toContain("data-artx-history-folder-view=");
    expect(page).toContain("data-artx-history-system-picker=");
    expect(page).toContain("data-artx-history-folder-file={file.name}");
    expect(store).toContain("IMAGE_FILE_RE");
    expect(store).toContain("startIn: handle");
  });

  it("浮层 portal 到 body，且 objectURL 会被释放", () => {
    expect(page).toContain("createPortal(");
    expect(page).toContain("document.body,");
    expect(page).toContain("URL.revokeObjectURL(file.url)");
    expect(page).toContain("onClick={closeFolderView}");
  });
});
