/**
 * 灵感点赞 / 收藏的 React 接入层。
 *
 * 把「读状态 + 订阅广播 + 切换」三件事封成一个 hook，
 * 📌 三个页面共用它，避免各自写一遍订阅 —— 少写一处 `addEventListener`，
 * 那个页面就会静默地不跟随更新（用户看到的就是「取消了它还在」）。
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  INSPIRATION_REACTIONS_EVENT,
  isInspirationReacted,
  readInspirationReactions,
  toggleInspirationReaction,
  type InspirationReactionItem,
  type InspirationReactionKind,
  type InspirationReactionState,
} from "@/lib/inspiration-reactions";

export function useInspirationReactions() {
  const { user } = useAuth();
  const userId = user?.id || "";
  const [state, setState] = useState<InspirationReactionState>(() =>
    readInspirationReactions(userId)
  );

  useEffect(() => {
    // 切换账号要立刻换桶，否则会把上一个账号的收藏显示给新用户。
    setState(readInspirationReactions(userId));
    const handler = () => setState(readInspirationReactions(userId));
    window.addEventListener(INSPIRATION_REACTIONS_EVENT, handler);
    // 跨标签页同步：另一个标签页里取消收藏，这个标签页也要跟着消失。
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(INSPIRATION_REACTIONS_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, [userId]);

  const toggle = useCallback(
    (
      kind: InspirationReactionKind,
      item: Omit<InspirationReactionItem, "reactedAt">
    ) => {
      const result = toggleInspirationReaction(userId, kind, item);
      setState(result.state);
      return result.active;
    },
    [userId]
  );

  const isActive = useCallback(
    (kind: InspirationReactionKind, id: string) =>
      isInspirationReacted(state, kind, id),
    [state]
  );

  return { state, toggle, isActive, likedItems: state.like, favoriteItems: state.favorite };
}
