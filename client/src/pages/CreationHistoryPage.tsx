/**
 * CreationHistoryPage — 创作历史（工作台侧边栏「画布社区」下方入口）。
 *
 * 🔒 纯本地：记录存 IndexedDB，图片存用户选择的本地文件夹，**不进云端**。
 * 右侧按 历史 / 项目 / 图片格式 / 所属项目 / 时间 五个维度排序分组。
 * 缺省（还没设置本地文件夹）时显示提示文案 + 文件夹创建入口。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  Download,
  FolderOpen,
  FolderPlus,
  HardDrive,
  History,
  RefreshCw,
  ShieldCheck,
  Trash2,
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
  pickLocalDirectory,
  readCreationHistory,
  requestDirectoryPermission,
  syncPendingRecordsToDirectory,
  type CreationHistoryRecord,
  type CreationHistorySortKey,
  type LocalDirectoryHandle,
} from "@/lib/creation-history";

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
                    {group.records.map(record => (
                      <div key={record.id} className="group overflow-hidden rounded-xl" style={{ background: c.card, border: `1px solid ${c.border}` }}>
                        <div className="relative aspect-square overflow-hidden" style={{ background: isDark ? "#0d0d0d" : "#eeeeee" }}>
                          <img src={record.src} alt={record.prompt.slice(0, 40)} loading="lazy" className="h-full w-full object-cover" />
                          <span
                            className="absolute left-2 top-2 rounded-md px-1.5 py-0.5"
                            style={{ fontSize: 10.5, fontWeight: 600, background: "rgba(255,255,255,0.9)", color: "#161616" }}
                          >
                            {FORMAT_LABELS[record.format]}
                          </span>
                          <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button type="button" title="下载" onClick={() => handleDownload(record)} className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "#161616", color: "#fff" }}>
                              <Download size={13} />
                            </button>
                            <button type="button" title="从历史移除" onClick={() => void handleDelete(record)} className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "#161616", color: "#fff" }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <div className="px-3 py-2.5">
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
                    ))}
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
    </div>
  );
}
