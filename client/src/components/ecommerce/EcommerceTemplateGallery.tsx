/**
 * 电商画布 · 模板库总览（二级页 /ecommerce-canvas/templates）
 *
 * 工作台右栏只放得下一屏卡片，49 个模板翻起来很累。这个二级页给：
 *   · 关键词搜索（模板名 + 分镜公式）
 *   · 完整分类切换
 *   · 点击卡片 = 选中并回到工作台
 *   · 卡片「详情」= 进模板详情页
 *
 * ⚠️ 搜索同时匹配 name 与 flow：分镜公式是用户唯一能想起来的线索
 *    （"记得有个先特写再退后的模板"），只搜名字等于没有搜索。
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Search, Sparkles, X } from "lucide-react";
import {
  ECOMMERCE_TEMPLATES,
  ECOMMERCE_TPL_CATEGORIES,
  type EcommerceTpl,
} from "@/data/ecommerce-canvas-templates";
import { EcommerceTemplateCard } from "./EcommerceTemplateCard";
import { LIME, type EcommercePalette } from "./shared";
import { templateIndexById } from "./template-visual";

type Props = {
  palette: EcommercePalette;
  selectedId: number | null;
  onPick: (template: EcommerceTpl) => void;
  onOpenDetail: (id: number) => void;
};

export function EcommerceTemplateGallery({ palette, selectedId, onPick, onOpenDetail }: Props) {
  const [category, setCategory] = useState("all");
  const [keyword, setKeyword] = useState("");

  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return ECOMMERCE_TEMPLATES.filter(item => {
      if (category !== "all" && item.categoryId !== category) return false;
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) || item.flow.toLowerCase().includes(query)
      );
    });
  }, [category, keyword]);

  return (
    /*
      ⚠️ h-full + 内层 overflow-y-auto：AppShell 内容区是 overflow-hidden，
         原先 min-h-full 会被 49 张卡片撑高、多出的部分被直接切掉，
         鼠标滚轮完全滚不动（2026-10-17 用户反馈）。
    */
    <div className="relative flex h-full" style={{ background: palette.bg, color: palette.text }}>
      <div
        data-testid="ecommerce-gallery-scroll"
        className="ecommerce-scroll flex h-full w-full flex-col overflow-y-auto p-5"
      >
        {/* 面包屑 + 返回工作台 */}
        <div className="mb-3 flex items-center gap-1.5 text-[11px]" style={{ color: palette.sub }}>
          <Link href="/ecommerce-canvas/post" className="transition-colors hover:opacity-80" style={{ color: palette.sub }}>
            电商画布
          </Link>
          <ChevronRight size={11} />
          <span style={{ color: palette.text }}>模板库</span>
          <Link
            href="/ecommerce-canvas/post"
            className="ml-auto rounded-md px-2.5 py-1"
            style={{ border: `1px solid ${palette.border}`, color: palette.sub }}
          >
            ← 返回工作台
          </Link>
        </div>

        <div className="mb-1 flex items-baseline gap-2">
          <div className="text-[14px] font-semibold">模板库</div>
          <div className="text-[11px]" style={{ color: palette.sub }}>
            共 {ECOMMERCE_TEMPLATES.length} 个分镜模板 · 已展示 {visible.length} 个
          </div>
        </div>

        {/* 搜索 */}
        <div
          className="mb-3 flex items-center gap-2 rounded-md px-3 py-2"
          style={{ background: palette.panel, border: `1px solid ${palette.border}` }}
        >
          <Search size={13} style={{ color: palette.sub }} />
          <input
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            placeholder="搜索模板名或分镜公式，如「特写」「收尾」"
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
            style={{ color: palette.text }}
          />
          {keyword ? (
            <button type="button" onClick={() => setKeyword("")} aria-label="清空搜索" style={{ color: palette.sub }}>
              <X size={13} />
            </button>
          ) : null}
        </div>

        {/* 分类 */}
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {ECOMMERCE_TPL_CATEGORIES.map(item => (
            <button
              key={item.id}
              type="button"
              className="shrink-0 rounded-full px-3 py-1.5 text-[12px]"
              style={{
                background: category === item.id ? "rgba(197,237,71,0.16)" : palette.field,
                border: `1px solid ${category === item.id ? "rgba(197,237,71,0.62)" : palette.border}`,
                color: category === item.id ? LIME : palette.text,
              }}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl p-8 text-center"
            style={{ border: `1px dashed ${palette.border}`, color: palette.sub }}
          >
            <Sparkles size={20} style={{ color: LIME }} />
            <div className="text-[13px]">没有匹配的模板</div>
            <button
              type="button"
              className="text-[12px] underline"
              style={{ color: LIME }}
              onClick={() => {
                setKeyword("");
                setCategory("all");
              }}
            >
              清空筛选条件
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map(item => (
              <EcommerceTemplateCard
                key={item.id}
                template={item}
                index={templateIndexById(item.id)}
                selected={selectedId === item.id}
                palette={palette}
                onSelect={onPick}
                onOpenDetail={picked => onOpenDetail(picked.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
