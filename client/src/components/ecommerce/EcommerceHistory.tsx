/**
 * 电商画布 · 生成记录（二级页 /ecommerce-canvas/history）
 *
 * 记录本次会话里跑过的每一次生成：模式、模型、模板、张数、积分、结果图。
 * 点「查看结果」回到工作台并把这批结果重新铺到结果区。
 *
 * ⚠️ 只记录图片 URL，不落原图：结果图是 CDN 地址会过期（见存储模块说明），
 *    存进来也只是引用，不额外占空间；加载失败时卡片自己藏掉缩略图。
 */
import { Link } from "wouter";
import { ChevronRight, ImageOff, Sparkles, Trash2 } from "lucide-react";
import { LIME, type EcommerceMode, type EcommercePalette } from "./shared";

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
  /** 回到工作台并展示这批结果 */
  onOpen: (entry: EcommerceHistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
};

function formatTime(ts: number) {
  const date = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EcommerceHistory({ palette, entries, onOpen, onRemove, onClear }: Props) {
  return (
    <div className="relative flex min-h-full" style={{ background: palette.bg, color: palette.text }}>
      <div className="mx-auto flex w-full max-w-[1080px] flex-col p-5">
        {/* 面包屑 + 返回工作台 */}
        <div className="mb-3 flex items-center gap-1.5 text-[11px]" style={{ color: palette.sub }}>
          <Link href="/ecommerce-canvas/post" className="transition-colors hover:opacity-80" style={{ color: palette.sub }}>
            电商画布
          </Link>
          <ChevronRight size={11} />
          <span style={{ color: palette.text }}>生成记录</span>
          <Link
            href="/ecommerce-canvas/post"
            className="ml-auto rounded-md px-2.5 py-1"
            style={{ border: `1px solid ${palette.border}`, color: palette.sub }}
          >
            ← 返回工作台
          </Link>
        </div>

        <div className="mb-3 flex items-baseline gap-2">
          <div className="text-[14px] font-semibold">生成记录</div>
          <div className="text-[11px]" style={{ color: palette.sub }}>
            本次会话共 {entries.length} 次生成
          </div>
          {entries.length > 0 ? (
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

        {entries.length === 0 ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl p-8 text-center"
            style={{ border: `1px dashed ${palette.border}`, color: palette.sub }}
          >
            <Sparkles size={20} style={{ color: LIME }} />
            <div className="text-[13px]">还没有生成记录</div>
            <Link
              href="/ecommerce-canvas/post"
              className="text-[12px] underline"
              style={{ color: LIME }}
            >
              去生成第一套带货图文
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center gap-3 rounded-xl p-3"
                style={{ background: palette.panel, border: `1px solid ${palette.border}` }}
              >
                {/* 缩略图行：最多带 4 张，够识别是哪一批 */}
                <div className="flex shrink-0 gap-1.5">
                  {entry.images.slice(0, 4).map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt=""
                      className="h-14 w-11 rounded object-cover"
                      style={{ border: `1px solid ${palette.border}` }}
                    />
                  ))}
                  {entry.images.length === 0 ? (
                    <span
                      className="flex h-14 w-11 items-center justify-center rounded"
                      style={{ border: `1px dashed ${palette.border}`, color: palette.sub }}
                    >
                      <ImageOff size={13} />
                    </span>
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium" style={{ color: palette.text }}>
                    {entry.mode === "post"
                      ? `带货图文 · ${entry.templateName || "未选模板"}`
                      : `产品图 · ${entry.backgroundName || "默认电商背景"}`}
                  </div>
                  <div className="mt-0.5 truncate text-[11px]" style={{ color: palette.sub }}>
                    {entry.model} · {entry.count} 张 · {entry.credits} 积分 · {formatTime(entry.createdAt)}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md px-3 py-1.5 text-[12px] font-medium"
                    style={{ background: "rgba(197,237,71,0.14)", border: "1px solid rgba(197,237,71,0.4)", color: LIME }}
                    onClick={() => onOpen(entry)}
                  >
                    查看结果
                  </button>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
