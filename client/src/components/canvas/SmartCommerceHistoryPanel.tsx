/**
 * 智能产品 · 历史记录弹窗
 *
 * 复用 EcommerceHistory 的列表逻辑，配置为智能产品的文案和链接。
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { History, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { EcommerceHistory } from "../ecommerce/EcommerceHistory";
import type { EcommerceHistoryEntry } from "../ecommerce/EcommerceHistory";
import { ecommercePalette } from "../ecommerce/shared";
import {
  readEcommerceHistory,
  deleteEcommerceHistoryEntry,
  clearEcommerceHistory,
} from "@/lib/image-gen-history";

type Props = {
  isDark: boolean;
  onClose: () => void;
  /** 点击查看结果时的回调（可选）：比如在画布上铺图或通知父组件 */
  onOpenResult?: (entry: EcommerceHistoryEntry) => void;
};

export function SmartCommerceHistoryPanel({ isDark, onClose, onOpenResult }: Props) {
  const { user } = useAuth();
  const accountId = user?.id ?? null;

  const [entries, setEntries] = useState<EcommerceHistoryEntry[]>(() =>
    readEcommerceHistory(accountId, "smart-commerce"),
  );

  const palette = ecommercePalette(isDark);

  const dialog = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: isDark ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.4)" }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{
          background: palette.panel,
          border: `1px solid ${palette.border}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: palette.border }}
        >
          <div className="flex items-center gap-2">
            <History size={16} style={{ color: palette.text }} />
            <h2 className="text-[14px] font-semibold" style={{ color: palette.text }}>
              智能产品 · 历史记录
            </h2>
          </div>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md hover:opacity-70"
            style={{ color: palette.sub }}
            aria-label="关闭历史记录"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* 历史列表（带滚动） */}
        <div className="relative flex-1 overflow-hidden">
          <EcommerceHistory
            palette={palette}
            entries={entries}
            onOpen={onOpenResult ? entry => { onOpenResult(entry); onClose(); } : undefined}
            onRemove={id => setEntries(deleteEcommerceHistoryEntry(accountId, id, "smart-commerce"))}
            onClear={() => {
              clearEcommerceHistory(accountId, "smart-commerce");
              setEntries([]);
            }}
            scope="smart-commerce"
            accountId={accountId}
            title="历史记录"
            breadcrumb={null}
            backLink={null}
            emptyText="还没有生成记录"
            emptyLinkText="开始生成第一张智能产品图"
            emptyLinkHref={null}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
