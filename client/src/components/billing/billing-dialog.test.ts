import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-09-15 用户要求：「在画布中点击右上角充值按钮，增加一个充值的弹窗，
 * 不跳出当前画布」。经确认，范围是**全站**（除 /billing 页面自身），
 * 「升级」按钮一起改成弹窗。
 *
 * 这组测试守三件事，每一件单独失守都会让需求悄悄回退：
 *
 * 1. **入口不再 navigate 跳页** —— 这是需求本身。一旦有人图省事把
 *    onClick 改回 navigate("/billing")，画布又会被卸载，零报错。
 *
 * 2. **页面与弹窗共用同一份实现** —— 这是本项目最贵的一条教训
 *    （「同一份数据的多个出口」已踩九次）。如果 BillingDialog 自己复制一套
 *    套餐卡/下单逻辑，以后改价格只会改到一边，另一边纹丝不动且不报错。
 *
 * 3. **余额靠事件同步** —— 弹窗形态下页面不会重新挂载，
 *    右上角的积分数字**只能**靠 artx:credits-updated 事件更新。
 */
const read = (file: string) =>
  readFileSync(resolve(__dirname, file), "utf-8");

const readTopBar = () =>
  readFileSync(
    resolve(__dirname, "../workspace/TopBar.tsx"),
    "utf-8",
  );

/**
 * 只剥「整行都是注释」的形态。
 * 通用的 /\/\*[\s\S]*?\*\//g 会被源码里的正则字面量、字符串中的 `/*` 带偏，
 * 一路贪婪吞掉真实代码，让断言在残缺源码上假通过。
 * 行注释也不能用 /\/\/.*$/gm —— 那会把字符串里的 https:// 从中间切断。
 */
const stripComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const readProvider = () => read("BillingDialogProvider.tsx");

const readPage = (file: string) =>
  readFileSync(resolve(__dirname, "../../pages", file), "utf-8");

describe("画布内充值弹窗（2026-09-15）", () => {
  it("积分与升级按钮都改为开弹窗，不再整页跳转", () => {
    const src = stripComments(readTopBar());

    /*
      ⚠️ 反向断言必须锚在「带 query 的完整跳转字符串」上。
      只锚 "/billing" 会误伤 Provider 里给计费页自身留的那条
      navigate(`/billing?tab=${tab}`) —— 那条是正确行为（见下一个用例）。
      这里要挡的是两个按钮各自写死的整页跳转。
    */
    expect(src).not.toContain('navigate("/billing?tab=recharge")');
    expect(src).not.toContain('navigate("/billing?tab=subscription")');

    // 正向：两个按钮都走同一个入口函数，tab 不同。
    expect(src).toContain('openBilling("recharge")');
    expect(src).toContain('openBilling("subscription")');
    expect(src).toContain("useBillingDialog()");
  });

  /*
    ⚠️⚠️ 这条是 2026-09-15 当场补的，起因是差点交付一个半成品。

    最初只改了 TopBar，以为「TopBar 被 12 个页面共用，改一处就全站统一」。
    实际扫一遍才发现充值入口根本不止这一个：
      · HomePage 的首充引导按钮 —— 首页压根没有 TopBar
      · CreditsGuidePage 正文底部的「去充值 / 查看订阅方案」两个 <Link>
    结果会是：积分说明页右上角点充值弹浮层、正文点「去充值」整页跳走，
    同一页两种行为，而且零报错。

    这就是本项目踩过九次的「同一份逻辑的多个出口」。
    这条断言守的是「出口已经收敛成一个」，不是「某个按钮能用」。
  */
  it("全站充值入口只有一个出口，没有任何页面自己跳 /billing", () => {
    const entries = {
      "TopBar.tsx": stripComments(readTopBar()),
      "HomePage.tsx": stripComments(readPage("HomePage.tsx")),
      "CreditsGuidePage.tsx": stripComments(readPage("CreditsGuidePage.tsx")),
    };

    for (const [name, src] of Object.entries(entries)) {
      expect(src, `${name} 没接到全站统一入口`).toContain("useBillingDialog");
      // 反向：任何形式的整页跳转/硬链接都不许再出现。
      expect(src, `${name} 仍在 navigate 跳计费页`).not.toContain(
        'navigate("/billing',
      );
      expect(src, `${name} 仍有跳计费页的硬链接`).not.toContain(
        'href="/billing',
      );
    }
  });

  it("只有计费页自身例外——页面里不再叠一个同款弹窗", () => {
    /*
      /billing 整页就是订阅与充值，再弹一个内容一模一样的浮层等于把页面
      盖住，用户会以为卡了。所以那一处改为切页内 tab。
      这条同时也是「全站都用弹窗」这个范围决定的唯一例外，
      删掉它就等于把例外也一并抹掉。
    */
    const src = stripComments(readProvider());
    expect(src).toContain('location.startsWith("/billing")');
    expect(src).toContain(
      "navigate(`/billing?tab=${nextTab}`, { replace: true })",
    );
  });

  it("弹窗只挂一次，挂在 App 根部而不是各页面各挂一个", () => {
    /*
      ⚠️ 弹窗本体如果挂在 TopBar 里，首页（没有 TopBar）就永远打不开。
      挂在 Provider 里、Provider 包住 AppRoutes = 全站共用同一个实例。
    */
    const provider = stripComments(readProvider());
    expect(provider).toContain("<BillingDialog");

    const app = stripComments(
      readFileSync(resolve(__dirname, "../../App.tsx"), "utf-8"),
    );
    expect(app).toContain("<BillingDialogProvider>");

    // 反向：除 Provider 外没有第二处挂载点。
    expect(stripComments(readTopBar())).not.toContain("<BillingDialog");
  });

  it("弹窗不重新实现计费逻辑，直接复用页面同款组件", () => {
    /*
      ⚠️ 这是本组最关键的一条。

      「同一份数据的多个出口」在本项目已经踩了九次，每次的表现都一样：
      改了一个出口，功能等于没做，而且零报错。计费是花钱的地方，
      价格与额度一旦两份，用户看到的和实际扣的就会对不上。

      所以断言的是「两边 import 的是同一批共享模块」，
      而不是「两边渲染出来长得像」——后者测不出复制粘贴。
    */
    const dialog = stripComments(read("BillingDialog.tsx"));
    const page = stripComments(
      readFileSync(resolve(__dirname, "../../pages/BillingPage.tsx"), "utf-8"),
    );

    for (const shared of [
      "SubscriptionPanel",
      "RechargePanel",
      "PaymentMethodPicker",
      "PaymentDialogs",
      "useBillingCenter",
    ]) {
      expect(dialog, `弹窗没有复用 ${shared}`).toContain(shared);
      expect(page, `页面没有复用 ${shared}`).toContain(shared);
    }

    // 反向：弹窗里不许出现自己的一套下单逻辑。
    expect(dialog).not.toContain("/api/billing/orders");
    expect(dialog).not.toContain("quoteCreditRecharge");
    expect(page).not.toContain("/api/billing/orders");
  });

  it("定价与套餐数据只有一份，且来自 shared/billing-config", () => {
    /*
      唯一事实源。共享层可以读 @shared/billing-config，
      但不许把里面的数字抄成本地常量副本。
    */
    const shared = stripComments(read("billing-shared.ts"));
    expect(shared).toContain("@shared/billing-config");

    // 卡片配置里不许出现任何套餐额度数字（详见 BillingPage.plan-credits.test.ts）。
    const start = shared.indexOf("export const subscriptionPlans = [");
    expect(start).toBeGreaterThan(-1);
    const block = shared.slice(start, shared.indexOf("\n];", start));
    expect(block).not.toMatch(/\d{3,}/);
  });

  it("支付成功后广播余额——弹窗形态下这是唯一的同步通道", () => {
    /*
      页面形态下用户跳回来会重新挂载、重新拉 summary，
      弹窗形态下背后的页面根本没动过。右上角那个数字只能靠事件更新。
      少了这一条，用户充完值看到余额没变，会以为钱没到账。
    */
    const shared = stripComments(read("billing-shared.ts"));
    const controller = stripComments(read("use-billing-center.ts"));
    expect(shared).toContain("artx:credits-updated");
    expect(controller).toContain("notifyCreditsUpdated(summary.balance)");

    // TopBar 侧必须在听。
    const topBar = stripComments(readTopBar());
    expect(topBar).toContain("artx:credits-updated");
  });

  it("二维码与成功弹窗必须盖在计费弹窗之上", () => {
    /*
      计费弹窗 z-[70] < 二维码 z-[80] < 成功 z-[90]。
      层级写反的话，用户在画布里点充值会看到二维码被计费弹窗盖住，
      而这属于「没有任何报错的纯视觉故障」，最容易漏。
    */
    const dialog = stripComments(read("BillingDialog.tsx"));
    const dialogs = stripComments(read("PaymentDialogs.tsx"));
    expect(dialog).toContain("z-[70]");
    expect(dialogs).toContain("z-[80]");
    expect(dialogs).toContain("z-[90]");
  });

  it("Esc 只关最上层，扫码过程中不会被一脚踹掉", () => {
    const dialog = stripComments(read("BillingDialog.tsx"));
    const guard = dialog.indexOf('event.key !== "Escape"');
    expect(guard, "没找到 Esc 处理").toBeGreaterThan(0);
    const body = dialog.slice(guard, guard + 260);
    // 二维码/成功弹窗开着时直接 return，不关计费弹窗。
    expect(body).toContain("paymentDialog?.open");
    expect(body).toContain("successDialog?.open");
  });

  it("重新打开时回到调用方指定的 tab", () => {
    /*
      组件常驻在 TopBar 里不卸载，useState 的初始值只在首次挂载生效。
      不同步这一下，用户先点「升级」再点「积分」，看到的还是订阅页 ——
      零报错，纯粹不听话。
    */
    const dialog = stripComments(read("BillingDialog.tsx"));
    expect(dialog).toContain("if (open) setActiveTab(initialTab)");
  });

  it("剥注释不会误删真实代码（上面几条断言的前置保障）", () => {
    for (const file of ["BillingDialog.tsx", "billing-shared.ts"]) {
      const raw = read(file);
      const stripped = stripComments(raw);
      expect(stripped.length, `${file} 剥注释没生效`).toBeLessThan(raw.length);
      // 锚点必须是只可能出现在代码里的完整片段。
      const anchor =
        file === "BillingDialog.tsx"
          ? "export default function BillingDialog("
          : "export async function billingFetch<T>(";
      expect(
        stripped.split(anchor).length - 1,
        `${file} 剥注释误删了真实代码`,
      ).toBe(raw.split(anchor).length - 1);
    }

    // 确认剥离确实生效：TopBar 里那句解释性注释必须已消失。
    expect(stripComments(readTopBar())).not.toContain(
      "整个画布组件被卸载",
    );
  });
});
