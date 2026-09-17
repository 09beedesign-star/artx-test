/**
 * 灵感卡片虚拟头像——**渲染层的唯一出口**。
 *
 * 【为什么要单独抽一个组件】
 * ⚠️⚠️ 头像有两个渲染出口：首页 `HomePage.tsx` 的推荐板块、
 * 共享卡片 `InspirationCard.tsx`（专题页 + 个人中心两个 tab 都用它）。
 * 兜底逻辑（CDN 挂了换本地 Logo）如果只写在其中一个出口里，
 * 另一个出口在 DiceBear 不可达时仍然是**破图**，而且**不会报任何错**。
 * 📌 这正是本项目踩过十几次的「同一份逻辑多个出口，只改一个等于没改」。
 * 所以先建这个组件作为唯一事实源，再让两个出口都接进来。
 *
 * 【兜底图为什么是 artxstudio-logo.png】
 * 站点此前 `client/index.html` 里**根本没有 <link rel="icon">**，
 * 浏览器标签页显示的是空白默认图标。全项目唯一的品牌位图就是这张
 * `assets/brand/artxstudio-logo.png`，同时它也被用作 AppShell 与首页的站点标识。
 * 本次一并把它注册成 favicon，于是「标签页那个 Logo」与这里的兜底图是同一张。
 */

import { useCallback, useEffect, useState } from "react";

import artxStudioLogo from "@/assets/brand/artxstudio-logo.png";
import { getInspirationAvatarAlt, getInspirationAvatarUrl } from "@/lib/inspiration-avatar";

type InspirationAvatarProps = {
  /** 灵感标题——跨页面唯一稳定的身份键，不要换成 rank / index / imageUrl */
  title: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
  /** 供测试与调试定位用 */
  testId?: string;
};

/**
 * 本地兜底图。
 *
 * ⚠️ 这里刻意 import 而不是写 `/assets/...` 字面量路径：
 * 构建产物的文件名带内容哈希（`artxstudio-logo-DWGVxm5a.png`），
 * 写死路径在生产环境必然 404 —— 而 404 的兜底图和「没兜底」表现完全一样。
 */
export const AVATAR_FALLBACK_SRC = artxStudioLogo;

export function InspirationAvatar({ title, className, style, testId }: InspirationAvatarProps) {
  const remoteSrc = getInspirationAvatarUrl(title);
  const [failed, setFailed] = useState(false);

  /**
   * ⚠️ title 变了要把失败标记清掉。
   * 否则一旦某张头像加载失败过，这个组件实例后续复用（列表虚拟滚动、切 tab）
   * 时会**一直**显示兜底图，即便新 title 对应的头像其实能正常加载。
   */
  useEffect(() => {
    setFailed(false);
  }, [remoteSrc]);

  const handleError = useCallback(() => {
    setFailed(true);
  }, []);

  /*
    ⚠️⚠️ 兜底图是**宽幅横版** Logo（4338×799，宽高比 5.4:1），
    而头像容器是 44×44 的圆。沿用正常头像的 `object-cover` 会把 Logo 中间
    那一竖条裁出来放大 —— 结果是一块认不出是什么的糊色块，
    比直接破图更糟（用户会以为是加载错误）。
    📌 兜底时必须换成 `contain` 并补一层浅底，让整个 Logo 缩进圆里完整可辨。
  */
  const fitStyle: React.CSSProperties = failed
    ? { objectFit: "contain", padding: 3, background: "#ffffff" }
    : { objectFit: "cover" };

  return (
    <img
      src={failed ? AVATAR_FALLBACK_SRC : remoteSrc}
      alt={getInspirationAvatarAlt(title)}
      aria-hidden="true"
      data-testid={testId}
      className={className}
      style={{ ...style, ...fitStyle }}
      onError={handleError}
      loading="lazy"
    />
  );
}
