/**
 * 全站唯一的「打开计费浮层」入口。
 *
 * ⚠️ 这个 Provider 存在的理由，是因为充值入口根本不止 TopBar 一处：
 *   · TopBar 的积分胶囊 / 升级按钮（12 个页面共用）
 *   · 首页的首充引导按钮（首页压根没有 TopBar）
 *   · 积分说明页正文底部的「去充值」「查看订阅方案」
 * 只把 TopBar 改成弹窗，剩下两处依旧整页跳走 —— 用户在积分说明页会看到
 * 「右上角点充值是浮层、正文点去充值是跳页」这种精神分裂的行为，而且零报错。
 * 「同一份逻辑的多个出口」是本项目已经踩过九次的坑，这次直接收敛成一个。
 *
 * ⚠️ 挂载位置必须在 WouterRouter 内部：openBilling 要读 location 判断
 * 「当前是不是已经在 /billing」，useLocation 脱离 Router 会直接抛错。
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import BillingDialog from "./BillingDialog";
import type { BillingTab } from "./billing-shared";

type BillingDialogContextValue = {
  openBilling: (tab?: BillingTab) => void;
  closeBilling: () => void;
};

const BillingDialogContext = createContext<BillingDialogContextValue | null>(null);

export function BillingDialogProvider({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BillingTab>("recharge");

  const closeBilling = useCallback(() => setOpen(false), []);

  /*
    ⚠️ 唯一的例外是 /billing 页面自己：它整页就是订阅与充值，
    再弹一个内容一模一样的浮层等于把页面盖住，用户会以为卡了。
    这里改成切页内 tab（页面靠 URL 的 ?tab= 决定显示哪一块）。
    这也是「除计费页自身外全站都用弹窗」这条范围约定的落点。
  */
  const openBilling = useCallback(
    (nextTab: BillingTab = "recharge") => {
      if (location.startsWith("/billing")) {
        navigate(`/billing?tab=${nextTab}`, { replace: true });
        return;
      }
      setTab(nextTab);
      setOpen(true);
    },
    [location, navigate]
  );

  const value = useMemo(
    () => ({ openBilling, closeBilling }),
    [openBilling, closeBilling]
  );

  return (
    <BillingDialogContext.Provider value={value}>
      {children}
      <BillingDialog open={open} initialTab={tab} onClose={closeBilling} />
    </BillingDialogContext.Provider>
  );
}

/*
  ⚠️ 这里刻意在缺 Provider 时抛错，而不是返回一个静默的空实现。
  计费入口点了没反应是最难排查的一类故障（用户只会说「按钮坏了」），
  宁可在开发期就炸掉。
*/
export function useBillingDialog() {
  const ctx = useContext(BillingDialogContext);
  if (!ctx) {
    throw new Error("useBillingDialog 必须在 BillingDialogProvider 内部使用");
  }
  return ctx;
}

export default BillingDialogProvider;
