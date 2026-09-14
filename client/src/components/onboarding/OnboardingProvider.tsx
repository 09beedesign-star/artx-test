/**
 * 新手引导调度器
 *
 * 职责：
 *  - 读写 localStorage(`artx:onboarding:v1`) 记录各分段完成度
 *  - 监听路由，首次进入某个场景时自动播放对应分段
 *  - 暴露 `useOnboarding().start(segmentId)` 供弹窗类分段（邀请好友）手动触发
 *  - 避开路由 loading 遮罩的 720ms 窗口（靠 segment.startDelayMs）
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import {
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_VERSION,
  createEmptyOnboardingState,
  getSegment,
  resolveAutoSegment,
  type OnboardingState,
  type TourSegment,
  type TourSegmentId,
} from "@shared/onboarding-steps";
import OnboardingTour from "./OnboardingTour";

/* ────────────────────────── 持久化 ────────────────────────── */

function readState(): OnboardingState {
  if (typeof window === "undefined") return createEmptyOnboardingState();
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return createEmptyOnboardingState();
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    if (parsed.version !== ONBOARDING_VERSION) {
      // 内容版本升级 → 视为全新用户重新引导
      return createEmptyOnboardingState();
    }
    return {
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
      dismissedAll: Boolean(parsed.dismissedAll),
      version: ONBOARDING_VERSION,
    };
  } catch {
    return createEmptyOnboardingState();
  }
}

function writeState(state: OnboardingState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 隐私模式下 localStorage 可能抛错，静默忽略 —— 引导不是关键路径 */
  }
}

/* ────────────────────────── Context ────────────────────────── */

interface OnboardingContextValue {
  /** 手动启动某个分段（忽略完成状态），用于「重新观看」和弹窗内触发 */
  start: (segmentId: TourSegmentId, options?: { onlyIfUnseen?: boolean }) => void;
  /** 当前是否正在播放 */
  active: boolean;
  /** 某分段是否已完成 */
  isCompleted: (segmentId: TourSegmentId) => boolean;
  /** 清空所有进度，下次进入各场景会重新引导 */
  resetAll: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    // 刻意不抛错：引导是增强功能，缺失 Provider 时降级为 no-op，
    // 避免把非关键功能变成白屏事故。
    return {
      start: () => {},
      active: false,
      isCompleted: () => true,
      resetAll: () => {},
    };
  }
  return ctx;
}

/* ────────────────────────── Provider ────────────────────────── */

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [state, setState] = useState<OnboardingState>(() => readState());
  const [activeSegment, setActiveSegment] = useState<TourSegment | null>(null);
  const timerRef = useRef<number | null>(null);
  // 本次会话已尝试自动播放过的分段，防止同一路由反复触发
  const attemptedRef = useRef<Set<TourSegmentId>>(new Set());

  const persist = useCallback((next: OnboardingState) => {
    setState(next);
    writeState(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /* —— 路由变化时决定是否自动播放 —— */
  useEffect(() => {
    clearTimer();
    if (activeSegment) return;

    const candidate = resolveAutoSegment(location, state);
    if (!candidate) return;
    if (attemptedRef.current.has(candidate.id)) return;

    attemptedRef.current.add(candidate.id);
    timerRef.current = window.setTimeout(() => {
      setActiveSegment(candidate);
    }, candidate.startDelayMs ?? 600);

    return clearTimer;
  }, [location, state, activeSegment, clearTimer]);

  const markCompleted = useCallback(
    (segmentId: TourSegmentId) => {
      if (state.completed.includes(segmentId)) return;
      persist({ ...state, completed: [...state.completed, segmentId] });
    },
    [state, persist],
  );

  const handleFinish = useCallback(() => {
    if (activeSegment) markCompleted(activeSegment.id);
    setActiveSegment(null);
  }, [activeSegment, markCompleted]);

  const handleSkip = useCallback(() => {
    // 跳过也算看过，不再纠缠用户
    if (activeSegment) markCompleted(activeSegment.id);
    setActiveSegment(null);
  }, [activeSegment, markCompleted]);

  const handleDismissAll = useCallback(() => {
    persist({ ...state, dismissedAll: true });
    setActiveSegment(null);
  }, [state, persist]);

  const start = useCallback<OnboardingContextValue["start"]>(
    (segmentId, options) => {
      const segment = getSegment(segmentId);
      if (!segment) return;
      if (options?.onlyIfUnseen) {
        if (state.dismissedAll) return;
        if (state.completed.includes(segmentId)) return;
        if (attemptedRef.current.has(segmentId)) return;
        attemptedRef.current.add(segmentId);
      }
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        setActiveSegment(segment);
      }, segment.startDelayMs ?? 0);
    },
    [state, clearTimer],
  );

  const resetAll = useCallback(() => {
    attemptedRef.current.clear();
    persist(createEmptyOnboardingState());
  }, [persist]);

  const isCompleted = useCallback(
    (segmentId: TourSegmentId) => state.completed.includes(segmentId),
    [state.completed],
  );

  const value = useMemo<OnboardingContextValue>(
    () => ({ start, active: activeSegment !== null, isCompleted, resetAll }),
    [start, activeSegment, isCompleted, resetAll],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {activeSegment && (
        <OnboardingTour
          segment={activeSegment}
          open
          onFinish={handleFinish}
          onSkip={handleSkip}
          onDismissAll={handleDismissAll}
        />
      )}
    </OnboardingContext.Provider>
  );
}

export default OnboardingProvider;
