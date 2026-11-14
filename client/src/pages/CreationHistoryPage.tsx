/**
 * CreationHistoryPage — 创作历史（工作台侧边栏「画布社区」下方入口）。
 *
 * 🔒 纯本地：记录存 IndexedDB，图片存用户选择的本地文件夹，**不进云端**。
 * 右侧按 历史 / 项目 / 图片格式 / 所属项目 / 时间 五个维度排序分组。
 * 缺省（还没设置本地文件夹）时显示提示文案 + 文件夹创建入口。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  Download,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  HardDrive,
  History,
  RefreshCw,
  ShieldCheck,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  CREATION_HISTORY_CHANGED_EVENT,
  CREATION_HISTORY_SORT_OPTIONS,
  FORMAT_LABELS,
  deleteCreationHistoryRecords,
  forgetLocalDirectory,
  getDirectoryPermission,
  getSavedDirectory,
  groupCreationHistory,
  isLocalFolderSupported,
  openLocalFolderInSystemPicker,
  pickLocalDirectory,
  readCreationHistory,
  readLocalFolderImages,
  readTagNames,
  requestDirectoryPermission,
  syncPendingRecordsToDirectory,
  updateCreationHistoryRecords,
  writeTagNames,
  type CreationHistoryRecord,
  type CreationHistorySortKey,
  type LocalDirectoryHandle,
  type LocalFolderFile,
} from "@/lib/creation-history";
import {
  CREATION_HISTORY_TAG_COLORS,
  DEFAULT_TAG_NAMES,
  TAG_NAME_MAX_LENGTH,
  clearRecordTags,
  countTaggedRecords,
  normalizeTagIds,
  normalizeTagNames,
  tagColor,
  toggleRecordTag,
  type TagColorId,
  type TagNames,
} from "@/lib/creation-history-tags";

type FolderState =
  | { status: "loading" }
  | { status: "unsupported" }
  | { status: "none" }
  | { status: "needs-permission"; handle: LocalDirectoryHandle }
  | { status: "ready"; handle: LocalDirectoryHandle };

function formatDateTime(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function CreationHistoryPage() {
  const { user } = useAuth();
  const ownerId = user?.id || "guest";
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const c = {
    bg: isDark ? "#111111" : "#ffffff",
    text: isDark ? "#f1f1f3" : "#161616",
    sub: isDark ? "#999999" : "#777777",
    border: isDark ? "rgba(255,255,255,0.08)" : "rgba(22,22,22,0.08)",
    card: isDark ? "#1a1a1a" : "#f7f7f7",
    panel: isDark ? "#151515" : "#fafafa",
    active: isDark ? "rgba(255,255,255,0.10)" : "rgba(22,22,22,0.08)",
    btnBg: isDark ? "#ffffff" : "#161616",
    btnFg: isDark ? "#161616" : "#ffffff",
  };

  const [records, setRecords] = useState<CreationHistoryRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [folder, setFolder] = useState<FolderState>({ status: "loading" });
  const [sortKey, setSortKey] = useState<CreationHistorySortKey>("history");
  const [ascending, setAscending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  /** 🔒 2026-11-14：单选 / 多选 / 批量删除 */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** 🔒 六色标签名称（可编辑，存创作历史专属 IndexedDB settings） */
  const [tagNames, setTagNames] = useState<TagNames>(DEFAULT_TAG_NAMES);
  /** 🔒 快速打开本地文件夹视图 */
  const [folderViewOpen, setFolderViewOpen] = useState(false);
  const [folderFiles, setFolderFiles] = useState<LocalFolderFile[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);

  const tagNamesRef = useRef(tagNames);
  tagNamesRef.current = tagNames;
  const folderFilesRef = useRef<LocalFolderFile[]>([]);
  folderFilesRef.current = folderFiles;
  const lastAnchorRef = useRef<string | null>(null);

  // 标签名称只在挂载时读一次：编辑过程中不能被 refresh 覆盖掉正在输入的草稿。
  useEffect(() => {
    void readTagNames(ownerId).then(setTagNames);
  }, [ownerId]);

  // 记录被删掉后把选中态里的孤儿 id 清掉，避免「已选 3 张」但实际只剩 1 张。
  useEffect(() => {
    setSelectedIds(prev => {
      const next = prev.filter(id => records.some(r => r.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [records]);

  const refresh = useCallback(async () => {
    const [list, handle] = await Promise.all([readCreationHistory(ownerId), getSavedDirectory(ownerId)]);
    setRecords(list);
    setLoaded(true);
    if (!isLocalFolderSupported()) setFolder({ status: "unsupported" });
    else if (!handle) setFolder({ status: "none" });
    else setFolder((await getDirectoryPermission(handle)) === "granted" ? { status: "ready", handle } : { status: "needs-permission", handle });
  }, [ownerId]);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(CREATION_HISTORY_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CREATION_HISTORY_CHANGED_EVENT, onChange);
  }, [refresh]);

  const groups = useMemo(() => groupCreationHistory(records, sortKey, { ascending }), [records, sortKey, ascending]);
  const pendingCount = records.filter(r => !r.localFileName).length;

  const syncPending = async (handle: LocalDirectoryHandle) => {
    setSyncing(true);
    try {
      const n = await syncPendingRecordsToDirectory(ownerId, handle);
      if (n) toast.success(`已保存 ${n} 张图片到本地文件夹「${handle.name}」`);
    } finally {
      setSyncing(false);
      void refresh();
    }
  };

  const handlePickFolder = async () => {
    const handle = await pickLocalDirectory(ownerId);
    if (!handle) return;
    toast.success(`已设置本地文件夹「${handle.name}」`, { description: "之后生成的图片会自动保存到这里" });
    await refresh();
    if (records.some(r => !r.localFileName)) void syncPending(handle);
  };

  const handleGrant = async () => {
    if (folder.status !== "needs-permission") return;
    if (await requestDirectoryPermission(folder.handle)) {
      await refresh();
      if (pendingCount) void syncPending(folder.handle);
    } else {
      toast.error("没有获得文件夹写入权限");
    }
  };

  const handleDelete = async (record: CreationHistoryRecord) => {
    await deleteCreationHistoryRecords([record.id]);
    toast.success("已从创作历史移除", { description: record.localFileName ? "本地文件夹里的图片不会被删除" : undefined });
  };

  const handleDownload = (record: CreationHistoryRecord) => {
    const a = document.createElement("a");
    a.href = record.src;
    a.download = record.localFileName || `ArtX_${record.id}.png`;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  };

  const orderedIds = useMemo(() => records.map(r => r.id), [records]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const tagCounts = useMemo(() => countTaggedRecords(records), [records]);

  /** 单击=单选、Ctrl/Cmd=增量多选、Shift=范围多选（与文件管理器同一套心智）。 */
  const toggleSelect = useCallback((id: string, event: ReactMouseEvent) => {
    if (event.shiftKey && lastAnchorRef.current) {
      const a = orderedIds.indexOf(lastAnchorRef.current);
      const b = orderedIds.indexOf(id);
      if (a >= 0 && b >= 0) {
        setSelectedIds(orderedIds.slice(Math.min(a, b), Math.max(a, b) + 1));
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    } else {
      setSelectedIds(prev => (prev.length === 1 && prev[0] === id ? [] : [id]));
    }
    lastAnchorRef.current = id;
  }, [orderedIds]);

  const persistTagNames = useCallback(() => {
    const normalized = normalizeTagNames(tagNamesRef.current);
    setTagNames(normalized);
    void writeTagNames(ownerId, normalized);
  }, [ownerId]);

  /** ⚠️ 批量写标签必须一次事务完成，逐条 notifyChanged 会让页面读到中间态。 */
  const applyTagToSelected = async (colorId: TagColorId) => {
    if (!selectedIds.length) return;
    const targets = records.filter(r => selectedSet.has(r.id));
    await updateCreationHistoryRecords(targets.map(r => toggleRecordTag(r, colorId)));
    toast.success(`已更新 ${targets.length} 张图片的「${tagNamesRef.current[colorId]}」标签`);
  };

  const clearSelectedTags = async () => {
    if (!selectedIds.length) return;
    const targets = records.filter(r => selectedSet.has(r.id));
    await updateCreationHistoryRecords(targets.map(clearRecordTags));
    toast.success(`已取消 ${targets.length} 张图片的色彩标签`);
  };

  const removeTagFromRecord = async (record: CreationHistoryRecord, colorId: TagColorId) => {
    await updateCreationHistoryRecords([toggleRecordTag(record, colorId)]);
  };

  const deleteSelected = async () => {
    if (!selectedIds.length) return;
    const count = selectedIds.length;
    await deleteCreationHistoryRecords(selectedIds);
    setSelectedIds([]);
    toast.success(`已删除 ${count} 张创作记录`, { description: "本地文件夹里的图片不会被删除" });
  };

  const releaseFolderFiles = useCallback(() => {
    folderFilesRef.current.forEach(file => {
      try { URL.revokeObjectURL(file.url); } catch { /* 已释放 */ }
    });
  }, []);

  useEffect(() => () => {
    folderFilesRef.current.forEach(file => {
      try { URL.revokeObjectURL(file.url); } catch { /* 已释放 */ }
    });
  }, []);

  /** 🔒 快速打开已保存的本地文件夹：浏览器不允许唤起 Finder，改为在页内列出目录内容。 */
  const openFolderView = async (handle: LocalDirectoryHandle) => {
    releaseFolderFiles();
    setFolderViewOpen(true);
    setFolderLoading(true);
    try {
      if ((await getDirectoryPermission(handle)) !== "granted") {
        setFolderFiles([]);
        toast.error("需要重新授权才能读取本地文件夹");
        return;
      }
      setFolderFiles(await readLocalFolderImages(handle));
    } finally {
      setFolderLoading(false);
    }
  };

  const closeFolderView = () => {
    setFolderViewOpen(false);
    releaseFolderFiles();
    setFolderFiles([]);
  };

  const openInSystemPicker = async (handle: LocalDirectoryHandle) => {
    if ((await openLocalFolderInSystemPicker(handle)) === "unsupported") {
      toast.error("当前浏览器不支持在系统文件窗口定位，请用 Chrome 或 Edge");
    }
  };

  const folderReady = folder.status === "ready";

  // ── 缺省：还没设置本地文件夹 ──
  const emptyFolderBlock = (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center" data-testid="creation-history-empty">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: c.card }}>
        <FolderPlus size={28} style={{ color: c.text }} />
      </div>
      <p style={{ fontSize: 18, fontWeight: 600, color: c.text }}>还没有设置本地保存文件夹</p>
      <p className="mt-2 max-w-[420px]" style={{ fontSize: 13, lineHeight: 1.7, color: c.sub }}>
        创作历史只保存在你的电脑上，不会上传到云端。选择或新建一个文件夹后，
        每次生成的图片都会自动存进去，服务端图片过期后也能随时找回。
      </p>
      {folder.status === "unsupported" ? (
        <p className="mt-5 rounded-lg px-4 py-2.5" style={{ fontSize: 12.5, color: c.text, background: c.card }}>
          当前浏览器不支持选择本地文件夹，请使用 Chrome 或 Edge 打开；历史记录仍会保存在本浏览器中。
        </p>
      ) : (
        <button
          type="button"
          onClick={handlePickFolder}
          className="mt-6 flex h-10 items-center gap-2 rounded-full px-5 transition-opacity hover:opacity-85"
          style={{ background: c.btnBg, color: c.btnFg, fontSize: 13.5, fontWeight: 600 }}
        >
          <FolderPlus size={16} />
          选择 / 新建本地文件夹
        </button>
      )}
      <p className="mt-3" style={{ fontSize: 11.5, color: c.sub }}>在弹出的系统窗口里可以直接点「新建文件夹」</p>
    </div>
  );

  const emptyRecordsBlock = (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <History size={28} style={{ color: c.sub }} />
      <p className="mt-3" style={{ fontSize: 15, fontWeight: 600, color: c.text }}>还没有创作记录</p>
      <p className="mt-1.5" style={{ fontSize: 12.5, color: c.sub }}>在画布里生成图片后，会自动出现在这里</p>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: c.bg, color: c.text }}>
      {/* ── 主区 ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pb-4 pt-7">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 650, letterSpacing: "-0.01em" }}>创作历史</h1>
            <p className="mt-1 flex items-center gap-1.5" style={{ fontSize: 12.5, color: c.sub }}>
              <ShieldCheck size={13} />
              仅保存在本机，不上传云端 · 共 {records.length} 张
            </p>
          </div>
        </div>

        {records.length > 0 && (
          <div data-artx-history-toolbar="" className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-8 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-artx-history-select-all=""
                onClick={() => (selectedIds.length === records.length ? setSelectedIds([]) : setSelectedIds(orderedIds))}
                className="h-8 rounded-lg px-3"
                style={{ border: `1px solid ${c.border}`, color: c.text, fontSize: 12 }}
              >
                {selectedIds.length === records.length ? "取消全选" : "全选"}
              </button>
              <span data-artx-history-selection-count="" style={{ fontSize: 12, color: c.sub }}>
                已选 {selectedIds.length} / {records.length} 张
              </span>
            </div>
            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span style={{ fontSize: 11.5, color: c.sub }}>打标签</span>
                {CREATION_HISTORY_TAG_COLORS.map(color => (
                  <button
                    key={color.id}
                    type="button"
                    data-artx-history-apply-tag={color.id}
                    title={`给选中的图片打「${tagNames[color.id]}」标签（再次点击取消）`}
                    onClick={() => void applyTagToSelected(color.id)}
                    className="h-6 w-6 rounded-full transition-transform hover:scale-110"
                    style={{ background: color.hex, border: `2px solid ${c.bg}`, boxShadow: `0 0 0 1px ${c.border}` }}
                  />
                ))}
                <button
                  type="button"
                  data-artx-history-clear-tags=""
                  onClick={() => void clearSelectedTags()}
                  className="h-8 rounded-lg px-3"
                  style={{ border: `1px solid ${c.border}`, color: c.text, fontSize: 12 }}
                >
                  取消标签
                </button>
                <button
                  type="button"
                  data-artx-history-delete-selected=""
                  onClick={() => void deleteSelected()}
                  className="flex h-8 items-center gap-1.5 rounded-lg px-3"
                  style={{ background: c.btnBg, color: c.btnFg, fontSize: 12, fontWeight: 600 }}
                >
                  <Trash2 size={12} />
                  删除选中 ({selectedIds.length})
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pb-10">
          {!loaded || folder.status === "loading" ? null : records.length === 0 ? (
            folderReady ? emptyRecordsBlock : emptyFolderBlock
          ) : (
            <>
              {!folderReady && (
                <div className="mb-5 flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ background: c.card }}>
                  <span style={{ fontSize: 12.5 }}>
                    {folder.status === "needs-permission"
                      ? `需要重新授权才能继续写入本地文件夹「${folder.handle.name}」`
                      : folder.status === "unsupported"
                        ? "当前浏览器不支持本地文件夹，记录仅保存在本浏览器中"
                        : "还没有设置本地保存文件夹，图片仅存在服务端 15 天"}
                  </span>
                  {folder.status !== "unsupported" && (
                    <button
                      type="button"
                      onClick={folder.status === "needs-permission" ? handleGrant : handlePickFolder}
                      className="shrink-0 rounded-full px-3.5 py-1.5"
                      style={{ background: c.btnBg, color: c.btnFg, fontSize: 12, fontWeight: 600 }}
                    >
                      {folder.status === "needs-permission" ? "重新授权" : "选择 / 新建文件夹"}
                    </button>
                  )}
                </div>
              )}
              {groups.map(group => (
                <section key={group.key} className="mb-7">
                  {sortKey !== "history" && (
                    <h2 className="mb-3 flex items-baseline gap-2" style={{ fontSize: 14, fontWeight: 600 }}>
                      {group.label}
                      <span style={{ fontSize: 12, fontWeight: 400, color: c.sub }}>{group.records.length}</span>
                    </h2>
                  )}
                  <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                    {group.records.map(record => {
                      const selected = selectedSet.has(record.id);
                      const tags = normalizeTagIds(record.tagIds);
                      return (
                        <div
                          key={record.id}
                          data-artx-history-card={record.id}
                          className="group overflow-hidden rounded-xl"
                          style={{ background: c.card, border: `1px solid ${selected ? c.text : c.border}`, boxShadow: selected ? `0 0 0 2px ${c.active}` : "none" }}
                        >
                          <div
                            className="relative aspect-square overflow-hidden"
                            onClick={event => toggleSelect(record.id, event)}
                            style={{ background: isDark ? "#0d0d0d" : "#eeeeee", cursor: "pointer" }}
                          >
                            <img src={record.src} alt={record.prompt.slice(0, 40)} loading="lazy" className="h-full w-full object-cover" />
                            <span
                              className="absolute bottom-2 left-2 rounded-md px-1.5 py-0.5"
                              style={{ fontSize: 10.5, fontWeight: 600, background: "rgba(255,255,255,0.9)", color: "#161616" }}
                            >
                              {FORMAT_LABELS[record.format]}
                            </span>
                            {/* 🔒 色彩标签固定在图片左上角；点标签区域不触发选中。 */}
                            {tags.length > 0 && (
                              <div
                                data-artx-history-tags=""
                                className="absolute left-2 top-2 flex flex-wrap gap-1"
                                style={{ right: 40 }}
                                onClick={event => event.stopPropagation()}
                              >
                                {tags.map(colorId => {
                                  const color = tagColor(colorId);
                                  return (
                                    <span
                                      key={colorId}
                                      data-artx-history-tag={colorId}
                                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"
                                      style={{ background: color.hex, color: color.fg, fontSize: 10.5, fontWeight: 650 }}
                                    >
                                      {tagNames[colorId]}
                                      <button
                                        type="button"
                                        data-artx-history-tag-remove={colorId}
                                        title="取消这个标签"
                                        onClick={event => {
                                          event.stopPropagation();
                                          void removeTagFromRecord(record, colorId);
                                        }}
                                        className="flex h-3.5 w-3.5 items-center justify-center rounded-full"
                                        style={{ color: color.fg, opacity: 0.85 }}
                                      >
                                        <X size={10} />
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <button
                              type="button"
                              data-artx-history-select={record.id}
                              title={selected ? "取消选中" : "选中这张图片"}
                              onClick={event => {
                                event.stopPropagation();
                                toggleSelect(record.id, event);
                              }}
                              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md"
                              style={{
                                background: selected ? c.text : "rgba(255,255,255,0.92)",
                                color: selected ? c.bg : "#161616",
                                border: `1px solid ${selected ? c.text : "rgba(22,22,22,0.18)"}`,
                              }}
                            >
                              {selected && <Check size={14} />}
                            </button>
                            <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <button type="button" title="下载" onClick={event => { event.stopPropagation(); handleDownload(record); }} className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "#161616", color: "#fff" }}>
                                <Download size={13} />
                              </button>
                              <button type="button" title="从历史移除" onClick={event => { event.stopPropagation(); void handleDelete(record); }} className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "#161616", color: "#fff" }}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          <div className="px-3 py-2.5" onClick={event => toggleSelect(record.id, event)} style={{ cursor: "pointer" }}>
                            <p className="truncate" style={{ fontSize: 12.5, fontWeight: 560 }} title={record.prompt}>
                              {record.prompt || record.style || "未命名作品"}
                            </p>
                            <p className="mt-1 truncate" style={{ fontSize: 11, color: c.sub }}>
                              {record.projectName}{record.folderName ? ` · ${record.folderName}` : ""}
                            </p>
                            <p className="mt-0.5 flex items-center justify-between" style={{ fontSize: 11, color: c.sub }}>
                              <span>{formatDateTime(record.createdAt)}</span>
                              {record.localFileName ? (
                                <span className="flex items-center gap-0.5" title={record.localFileName}><HardDrive size={11} />已存本地</span>
                              ) : (
                                <span>未存本地</span>
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── 右侧：排序 + 本地文件夹 ── */}
      <aside className="flex w-[240px] shrink-0 flex-col gap-6 overflow-y-auto px-4 py-7" style={{ background: c.panel, borderLeft: `1px solid ${c.border}` }}>
        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <span style={{ fontSize: 11, fontWeight: 600, color: c.sub, letterSpacing: "0.04em" }}>排序方式</span>
            <button
              type="button"
              onClick={() => setAscending(v => !v)}
              title={ascending ? "当前：时间正序" : "当前：时间倒序"}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5"
              style={{ fontSize: 11, color: c.text }}
            >
              {ascending ? <ArrowUpNarrowWide size={13} /> : <ArrowDownWideNarrow size={13} />}
              {ascending ? "最早" : "最新"}
            </button>
          </div>
          <div className="flex flex-col gap-0.5" role="radiogroup" aria-label="排序方式">
            {CREATION_HISTORY_SORT_OPTIONS.map(option => {
              const active = option.key === sortKey;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSortKey(option.key)}
                  className="flex h-8 items-center justify-between rounded-lg px-2.5 text-left"
                  style={{ background: active ? c.active : "transparent", color: active ? c.text : c.sub, fontSize: 12.5, fontWeight: active ? 600 : 440 }}
                >
                  按{option.label}
                  {active && <Check size={13} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 🔒 六色标签：名称可编辑，编辑后立即显示在图片左上角；仅本页可见。 */}
        <div data-artx-history-tag-panel="">
          <div className="mb-2 flex items-center justify-between px-1">
            <span style={{ fontSize: 11, fontWeight: 600, color: c.sub, letterSpacing: "0.04em" }}>色彩标签</span>
            <Tag size={13} style={{ color: c.sub }} />
          </div>
          <p className="mb-2 px-1" style={{ fontSize: 10.5, lineHeight: 1.6, color: c.sub }}>
            名称可直接修改。选中图片后点上方的颜色圆点打标签，标签只在创作历史里显示。
          </p>
          <div className="flex flex-col gap-1">
            {CREATION_HISTORY_TAG_COLORS.map(color => (
              <div key={color.id} className="flex items-center gap-2 rounded-lg px-2 py-1" style={{ background: c.card }}>
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: color.hex }} />
                <input
                  data-artx-history-tag-name={color.id}
                  value={tagNames[color.id]}
                  maxLength={TAG_NAME_MAX_LENGTH}
                  onChange={event => setTagNames(prev => ({ ...prev, [color.id]: event.target.value }))}
                  onBlur={persistTagNames}
                  onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
                  className="min-w-0 flex-1 bg-transparent outline-none"
                  style={{ color: c.text, fontSize: 12, borderBottom: `1px solid ${c.border}` }}
                />
                <span title="已打该标签的图片数" style={{ fontSize: 10.5, color: c.sub, minWidth: 16, textAlign: "right" }}>
                  {tagCounts[color.id]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-2 block px-1" style={{ fontSize: 11, fontWeight: 600, color: c.sub, letterSpacing: "0.04em" }}>本地保存文件夹</span>
          <div className="rounded-xl p-3" style={{ background: c.card }}>
            {folder.status === "ready" || folder.status === "needs-permission" ? (
              <>
                <p className="flex items-center gap-1.5 truncate" style={{ fontSize: 13, fontWeight: 600 }}>
                  <FolderOpen size={14} />
                  {folder.handle.name}
                </p>
                <p className="mt-1" style={{ fontSize: 11, color: c.sub }}>
                  {folder.status === "ready" ? (pendingCount ? `${pendingCount} 张尚未保存到本地` : "全部图片已保存到本地") : "需要重新授权写入"}
                </p>
                <div className="mt-3 flex flex-col gap-1.5">
                  {folder.status === "ready" && (
                    <button
                      type="button"
                      data-artx-history-open-folder=""
                      onClick={() => void openFolderView(folder.handle)}
                      className="flex h-8 items-center justify-center gap-1.5 rounded-lg"
                      style={{ background: c.btnBg, color: c.btnFg, fontSize: 12, fontWeight: 600 }}
                    >
                      <FolderOpen size={12} />
                      打开本地文件夹
                    </button>
                  )}
                  {folder.status === "needs-permission" ? (
                    <button type="button" onClick={handleGrant} className="h-8 rounded-lg" style={{ background: c.btnBg, color: c.btnFg, fontSize: 12, fontWeight: 600 }}>
                      重新授权
                    </button>
                  ) : pendingCount > 0 ? (
                    <button type="button" disabled={syncing} onClick={() => void syncPending(folder.handle)} className="flex h-8 items-center justify-center gap-1.5 rounded-lg disabled:opacity-60" style={{ background: c.btnBg, color: c.btnFg, fontSize: 12, fontWeight: 600 }}>
                      <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
                      {syncing ? "保存中…" : "保存到本地"}
                    </button>
                  ) : null}
                  <button type="button" onClick={handlePickFolder} className="h-8 rounded-lg" style={{ border: `1px solid ${c.text}`, color: c.text, fontSize: 12 }}>
                    更换文件夹
                  </button>
                  <button type="button" onClick={() => void forgetLocalDirectory(ownerId)} className="h-7" style={{ color: c.sub, fontSize: 11.5 }}>
                    断开文件夹
                  </button>
                </div>
              </>
            ) : folder.status === "unsupported" ? (
              <p style={{ fontSize: 11.5, lineHeight: 1.6, color: c.sub }}>当前浏览器不支持本地文件夹，请用 Chrome / Edge。</p>
            ) : (
              <>
                <p style={{ fontSize: 11.5, lineHeight: 1.6, color: c.sub }}>未设置。选择后生成的图片会自动存到这个文件夹。</p>
                <button type="button" onClick={handlePickFolder} className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg" style={{ background: c.btnBg, color: c.btnFg, fontSize: 12, fontWeight: 600 }}>
                  <FolderPlus size={13} />
                  选择 / 新建文件夹
                </button>
              </>
            )}
          </div>
          <p className="mt-2 flex items-start gap-1 px-1" style={{ fontSize: 10.5, lineHeight: 1.6, color: c.sub }}>
            <ShieldCheck size={11} className="mt-[3px] shrink-0" />
            记录只存在本浏览器，图片只写入你选的文件夹，不会上传云端。
          </p>
        </div>
      </aside>

      {folderViewOpen && folder.status === "ready" && createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.46)" }}
          onClick={closeFolderView}
        >
          <div
            data-artx-history-folder-view=""
            className="flex max-h-[80vh] w-[min(920px,90vw)] flex-col overflow-hidden rounded-2xl"
            style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
            onClick={event => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${c.border}` }}>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate" style={{ fontSize: 15, fontWeight: 650 }}>
                  <FolderOpen size={15} />
                  {folder.handle.name}
                </p>
                <p className="mt-0.5" style={{ fontSize: 11.5, color: c.sub }}>
                  本地文件夹 · {folderFiles.length} 张图片
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  data-artx-history-system-picker=""
                  onClick={() => void openInSystemPicker(folder.handle)}
                  className="flex h-8 items-center gap-1.5 rounded-lg px-3"
                  style={{ border: `1px solid ${c.border}`, color: c.text, fontSize: 12 }}
                >
                  <ExternalLink size={12} />
                  在系统窗口打开
                </button>
                <button type="button" title="关闭" onClick={closeFolderView} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: c.text }}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {folderLoading ? (
                <p style={{ fontSize: 12.5, color: c.sub }}>正在读取文件夹…</p>
              ) : folderFiles.length === 0 ? (
                <p style={{ fontSize: 12.5, color: c.sub }}>文件夹里还没有图片，或浏览器暂时没有读取权限。</p>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
                  {folderFiles.map(file => (
                    <a
                      key={file.name}
                      href={file.url}
                      download={file.name}
                      data-artx-history-folder-file={file.name}
                      className="block overflow-hidden rounded-lg"
                      style={{ border: `1px solid ${c.border}` }}
                    >
                      <img src={file.url} alt={file.name} className="aspect-square w-full object-cover" />
                      <p className="truncate px-2 py-1.5" style={{ fontSize: 10.5, color: c.sub }}>{file.name}</p>
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="shrink-0 px-5 py-3" style={{ borderTop: `1px solid ${c.border}`, fontSize: 10.5, color: c.sub, lineHeight: 1.6 }}>
              浏览器不允许网页直接唤起 Finder / 资源管理器；这里列出文件夹中的图片，点「在系统窗口打开」可在系统文件选择器里定位到同一目录。点图片可下载。
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
