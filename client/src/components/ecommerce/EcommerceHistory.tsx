/**
 * 电商画布 / 智能产品 · 生成记录
 *
 * 记录历史生成：模式、模型、模板、张数、积分、结果图，持久化到 localStorage。
 * 点「查看结果」回到工作台并展示这批结果。
 *
 * ⚠️ 只记录图片 URL：结果图在后端，与工作台图片同享保留规则（15 天，由服务端配）。
 *
 * 【2026-10-18】新增：全部图片显示 + 独立下载 + 过期倒计时 + 自动修剪。
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Download, ImageOff, Sparkles, Trash2 } from "lucide-react";
import { LIME, type EcommerceMode, type EcommercePalette, downloadImage } from "./shared";
import {
  fetchUploadExpiry,
  buildUploadExpiryIndex,
  lookupUploadExpiry,
  EMPTY_UPLOAD_EXPIRY,
  type UploadExpiryResponse,
} from "@/lib/upload-expiry";
import {
  formatDaysLeftBadge,
  formatDaysLeft,
  getExpiryUrgency,
} from "@shared/upload-retention";
import { getAiApiBaseUrlForClient } from "@/lib/ai";
import {
  pruneExpiredHistory,
  getHistoryEntryDaysLeft,
  type ImageHistoryScope,
} from "@/lib/image-gen-history";

export type EcommerceHistoryEntry = {
  id: string;
  mode: EcommerceMode;
  model: string;
  count: number;
  credits: number;
  templateName: string;
  backgroundName: string;
  prompt: string;
  images: string[];
  createdAt: number;
};

type Props = {
  palette: EcommercePalette;
  entries: EcommerceHistoryEntry[];
  /** 回到工作台并展示这批结果；不传则不显示「查看结果」（弹窗里没有可回的工作台） */
  onOpen?: (entry: EcommerceHistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  /** 作用域（默认电商画布） */
  scope?: ImageHistoryScope;
  /** 账号 ID，用于清理过期记录 */
  accountId?: string | null;
  /** 页面标题 */
  title?: string;
  /** 面包屑与返回链接；传 null 不渲染整行（弹窗内嵌用） */
  breadcrumb?: { label: string; href: string } | null;
  backLink?: { label: string; href: string } | null;
  /** 空状态引导文案与链接；emptyLinkHref 传 null 不渲染链接 */
  emptyText?: string;
  emptyLinkText?: string;
  emptyLinkHref?: string | null;
};

function formatTime(ts: number) {
  const date = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EcommerceHistory({
  palette,
  entries,
  onOpen,
  onRemove,
  onClear,
  scope = "ecommerce-canvas",
  accountId = null,
  title = "生成记录",
  breadcrumb = { label: "电商画布", href: "/ecommerce-canvas/post" },
  backLink = { label: "← 返回工作台", href: "/ecommerce-canvas/post" },
  emptyText = "还没有生成记录",
  emptyLinkText = "去生成第一套带货图文",
  emptyLinkHref = "/ecommerce-canvas/post",
}: Props) {
  const [expiryData, setExpiryData] = useState<UploadExpiryResponse>(EMPTY_UPLOAD_EXPIRY);

  useEffect(() => {
    let cancelled = false;
    // ⚠️ base 必须与生成接口同口径（图是从那个后端出来的，过期也只有它知道）
    fetchUploadExpiry({ apiBaseUrl: getAiApiBaseUrlForClient() }).then(data => {
      if (!cancelled) setExpiryData(data);
    });
    return () => { cancelled = true; };
  }, []);

  // 清理过期条目（只做一次，避免倒计时触发频繁存储写）
  useEffect(() => {
    if (!accountId || !(expiryData.retentionDays > 0)) return;
    pruneExpiredHistory(accountId, expiryData.retentionDays, scope);
  }, [accountId, expiryData.retentionDays, scope]);

  const expiryIndex = buildUploadExpiryIndex(expiryData.entries);

  function handleDownload(src: string, entryId: string, imageIndex: number) {
    const fileName = `${scope}-${entryId}-${imageIndex + 1}.jpg`;
    downloadImage(src, fileName);
  }

  function handleDownloadBatch(images: string[], entryId: string) {
    images.forEach((src, i) => handleDownload(src, entryId, i));
  }

  // 计算每条记录的剩余天数，过期的过滤掉
  const visibleEntries = entries.filter(entry => {
    if (!(expiryData.retentionDays > 0)) return true;
    return getHistoryEntryDaysLeft(entry, expiryData.retentionDays) > 0;
  });

  return (
    // ⚠️ h-full + overflow-y-auto：AppShell 内容区 overflow-hidden，min-h-full 会让超出部分被切掉、滚不动。
    <div className="ecommerce-scroll relative flex h-full overflow-y-auto" style={{ background: palette.bg, color: palette.text }}>
      <div className="mx-auto flex h-fit w-full max-w-[1080px] flex-col p-5">
        {/* 面包屑 + 返回工作台 */}
        {breadcrumb ? (
          <div className="mb-3 flex items-center gap-1.5 text-[11px]" style={{ color: palette.sub }}>
            <Link href={breadcrumb.href} className="transition-colors hover:opacity-80" style={{ color: palette.sub }}>
              {breadcrumb.label}
            </Link>
            <ChevronRight size={11} />
            <span style={{ color: palette.text }}>{title}</span>
            {backLink ? (
              <Link
                href={backLink.href}
                className="ml-auto rounded-md px-2.5 py-1"
                style={{ border: `1px solid ${palette.border}`, color: palette.sub }}
              >
                {backLink.label}
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="mb-3 flex items-baseline gap-2">
          {breadcrumb ? <div className="text-[14px] font-semibold">{title}</div> : null}
          <div className="text-[11px]" style={{ color: palette.sub }}>
            共 {visibleEntries.length} 条记录
          </div>
          {visibleEntries.length > 0 ? (
            <button
              type="button"
              className="ml-auto rounded-md px-2.5 py-1 text-[11px]"
              style={{ border: `1px solid ${palette.border}`, color: palette.sub }}
              onClick={onClear}
            >
              清空记录
            </button>
          ) : null}
        </div>

        {visibleEntries.length === 0 ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl p-8 text-center"
            style={{ border: `1px dashed ${palette.border}`, color: palette.sub }}
          >
            <Sparkles size={20} style={{ color: LIME }} />
            <div className="text-[13px]">{emptyText}</div>
            {emptyLinkHref ? (
              <Link
                href={emptyLinkHref}
                className="text-[12px] underline"
                style={{ color: LIME }}
              >
                {emptyLinkText}
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleEntries.map(entry => {
              const daysLeft = getHistoryEntryDaysLeft(entry, expiryData.retentionDays);
              const isExpiringSoon = daysLeft > 0 && daysLeft <= expiryData.warningDays;
              return (
                <div
                  key={entry.id}
                  className="flex flex-col gap-2 rounded-xl p-3"
                  style={{ background: palette.panel, border: `1px solid ${palette.border}` }}
                >
                  {/* 头部：元信息 + 操作按钮 */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium" style={{ color: palette.text }}>
                        {entry.mode === "post"
                          ? `带货图文 · ${entry.templateName || "未选模板"}`
                          : `产品图 · ${entry.backgroundName || "默认电商背景"}`}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: palette.sub }}>
                        <span>{entry.model}</span>
                        <span>·</span>
                        <span>{entry.count} 张</span>
                        {entry.credits > 0 && (
                          <>
                            <span>·</span>
                            <span>{entry.credits} 积分</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{formatTime(entry.createdAt)}</span>
                        {isExpiringSoon && (
                          <>
                            <span>·</span>
                            <span
                              className="rounded px-1 py-0.5 text-[10px] font-medium"
                              style={{
                                background: getExpiryUrgency(daysLeft) === "critical" ? "rgba(239,68,68,0.1)" : "rgba(249,115,22,0.1)",
                                color: getExpiryUrgency(daysLeft) === "critical" ? "#ef4444" : "#f97316",
                              }}
                            >
                              {formatDaysLeft(daysLeft)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {onOpen ? (
                        <button
                          type="button"
                          className="rounded-md px-3 py-1.5 text-[12px] font-medium"
                          style={{ background: "rgba(197,237,71,0.14)", border: "1px solid rgba(197,237,71,0.4)", color: LIME }}
                          onClick={() => onOpen(entry)}
                        >
                          查看结果
                        </button>
                      ) : null}
                      {entry.images.length > 0 && (
                        <button
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-md"
                          style={{ border: `1px solid ${palette.border}`, color: palette.sub }}
                          aria-label="下载所有图片"
                          title="下载所有图片"
                          onClick={() => handleDownloadBatch(entry.images, entry.id)}
                        >
                          <Download size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-md"
                        style={{ border: `1px solid ${palette.border}`, color: palette.sub }}
                        aria-label="删除这条记录"
                        onClick={() => onRemove(entry.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* 图片网格：全部显示，每张可独立下载 */}
                  {entry.images.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {entry.images.map((src, i) => {
                        const expiry = lookupUploadExpiry(expiryIndex, src);
                        return (
                          <div
                            key={i}
                            className="group relative overflow-hidden rounded"
                            style={{ border: `1px solid ${palette.border}` }}
                          >
                            <img
                              src={src}
                              alt=""
                              className="aspect-[3/4] w-full object-cover"
                            />
                            {expiry && (
                              <span
                                className="absolute bottom-1 right-1 rounded-sm px-1 py-0.5 text-[9px] font-medium"
                                style={{
                                  background: getExpiryUrgency(expiry.daysLeft) === "critical" ? "#ef4444" : "#f97316",
                                  color: "#fff",
                                }}
                              >
                                {formatDaysLeftBadge(expiry.daysLeft)}
                              </span>
                            )}
                            <button
                              type="button"
                              className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                              aria-label="下载这张图片"
                              onClick={() => handleDownload(src, entry.id, i)}
                            >
                              <Download size={16} style={{ color: "#fff" }} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      className="flex h-20 items-center justify-center rounded"
                      style={{ border: `1px dashed ${palette.border}`, color: palette.sub }}
                    >
                      <ImageOff size={16} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
