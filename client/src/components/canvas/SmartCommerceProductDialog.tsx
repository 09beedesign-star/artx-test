import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  BookmarkPlus,
  Boxes,
  Check,
  ChevronDown,
  ChevronUp,
  FileImage,
  GripHorizontal,
  ImagePlus,
  LoaderCircle,
  MoveDiagonal2,
  PenLine,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PicwishBackgroundSelector } from "@/components/canvas/PicwishBackgroundSelector";
import { useAuth } from "@/contexts/AuthContext";
import {
  SMART_COMMERCE_DEFAULT_PAYLOAD,
  SMART_COMMERCE_PRESET_LIMIT,
  createSmartCommercePresetId,
  nextSmartCommercePresetName,
  readActiveSmartCommercePresetId,
  readSmartCommercePresets,
  writeActiveSmartCommercePresetId,
  writeSmartCommercePresets,
  type SmartCommercePreset,
  type SmartCommercePresetPayload,
} from "@/lib/smart-commerce-presets";
// 引用标签的尺寸/配色唯一事实源，与画布提示词框里的 image 引用标签同源。
// ⚠️ 禁止在本文件里复制一份常量：那会造出第二个出口，改一处另一处不动且零报错。
import {
  COMPOSER_REF_TOKEN_SIZE,
  getComposerRefTokenColors,
} from "@/components/canvas/composer-ref-token";
import {
  buildEcommercePromptRules,
  findWhiteBackgroundConflicts,
  getEcommerceStyleProfile,
} from "@/lib/ecommerce-style-profiles";
import type { PicWishBackgroundTemplate } from "@/lib/ai";

/**
 * 背景生成方式。
 * - template：走 PicWish 电商背景模板库（原有链路，保持不变）
 * - prompt：用户自己写提示词，交给 gem 图片大模型按产品图生成
 */
export type SmartCommerceBackgroundMode = "template" | "prompt";

/**
 * 电商产品图的输出分辨率档位。
 *
 * 【2026-09-18】新增 1k，并把它设为默认（原默认是 2k）。
 *
 * 为什么要改：电商产品图的绝大多数用途是列表页缩略图和详情页配图，
 * 1K 完全够用；默认给 2K 等于让「不做选择的那部分用户」长期承担
 * 更慢的生成速度和更大的图片体积，收益却看不见。
 * 默认值的意义就在于服务那些不做选择的人，所以缺省取最实用的一档。
 *
 * ⚠️ 这里**不是**为了省用户积分，别在别处这么解释。
 *    smart_background 是 per_request 固定 480 积分（ai-credit-policy.ts:134），
 *    而分辨率系数只作用于 text_to_image（同文件 :352 的 capability 判断）——
 *    电商链路无论出 1K 还是 4K，扣的积分**一模一样**。
 *    真实收益是生成更快、传输与存储更省，以及 PicWish 侧的算力占用更低。
 *
 * ⚠️ 只改默认值，不动可选项：2K / 4K 完整保留，
 *    用户主动点选高分辨率时行为与改动前逐位一致。
 */
export type SmartCommerceResolution = "1k" | "2k" | "4k";

export type SmartCommerceProductCreateDetail = {
  imageSrc: string;
  fileName?: string;
  userPrompt: string;
  prompt: string;
  style: string;
  composition: string;
  /**
   * 选中的电商平台预设名（未选则为空串）。
   *
   * 2026-09-16：替代原先的 productScale。画布侧只做透传与展示，
   * 真正决定输出画布的是 customWidth / customHeight。
   */
  ecommercePlatform: string;
  /**
   * 该平台的设计风格族 id（未选平台时为空串）。
   *
   * ⚠️ 风格的**实际生效路径是 prompt 字段**，这里只是给画布侧展示和排查用。
   *    别误以为带上这个字段风格就生效了——「透传 ≠ 被消费」是本项目
   *    踩过十一次的坑。真正让模型看见风格的是 prompt 里那段指令。
   */
  ecommerceStyleId?: string;
  sceneType?: number;
  ratio: string;
  resolution: SmartCommerceResolution;
  count: number;
  customWidth: number;
  customHeight: number;
  /** 背景生成方式，画布侧据此分流到不同的生图链路 */
  backgroundMode: SmartCommerceBackgroundMode;
  /** 提示词模式下用户输入的原始文案；模板模式为空串 */
  customPrompt: string;
  /**
   * 可选的风格参考图（dataURL）。
   *
   * ⚠️ 它与 imageSrc 是两种完全不同的角色，不能混用：
   *    imageSrc     = 要被逐像素保护的产品主体
   *    referenceSrc = 只提供背景风格的样张，其内容一律不得进入画面
   */
  referenceSrc?: string;
  referenceName?: string;
};

type Props = {
  isDark: boolean;
  canvasRightInset: number;
  onClose: () => void;
};

const IMAGE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * 常用画幅预设。尺寸以 **2K 档**为基准，1k / 4k 由 getOutputSize 按系数缩放。
 *
 * ⚠️ 每一档的**短边**都必须落在它该在的档位里（落档按短边，不是长边）：
 *      2k 档短边 ≤ 2048，4k 档短边 ≤ 4096，1k 档短边 ≤ 1088。
 *    这不是洁癖 —— 短边越界会让界面显示的档位和用量报表对不上，且零报错。
 *
 * 【2026-09-18 修正】3:4 原为 2160×2880，短边 2160 > 2048，
 *    用户选 2K 却被记成 4K 档。改为 2048×2732 后短边 2048 正好压在档位上沿，
 *    比例 0.7496 与 3:4（0.75）的偏差 0.05%，肉眼与版面都无差别。
 *    宽度必须锁 2048（不能是 2049）——它就是 2K 档短边的上限值本身。
 */
const RESOLUTION_PRESETS = [
  { label: "1:1", ratio: "1:1", width: 2048, height: 2048 },
  { label: "4:5", ratio: "4:5", width: 2048, height: 2560 },
  { label: "3:4", ratio: "3:4", width: 2048, height: 2732 },
  { label: "16:9", ratio: "16:9", width: 2560, height: 1440 },
  { label: "9:16", ratio: "9:16", width: 1440, height: 2560 },
  { label: "3:2", ratio: "3:2", width: 2400, height: 1600 },
] as const;

/**
 * 产品构图。
 *
 * 【2026-09-16 文案与功能对齐】
 * left / right 原先叫「左侧留白 / 右侧留白」，但这两个 id 的实际行为
 * （前端 prompt 与服务端 anchors 的 x=0.12 / x=0.88）一直都是**产品靠左 / 产品靠右**，
 * 也就是说 "left" 指的是产品在左、留白在右 —— 名字和功能是反着读的。
 *
 * 用户要求文案改成「产品居左 / 产品居右」，这恰好就是代码的真实行为，
 * 所以这次是把标签改对，并把英文 prompt 的主语从「留白在哪」改写成「产品在哪」，
 * 让提示词的重心也落在产品位置上，与新文案完全同义。
 */
const PRODUCT_COMPOSITIONS = [
  { id: "center", label: "居中主视觉", icon: AlignCenter, prompt: "Place the product in the visual center with balanced surrounding space and a clear hero presentation." },
  { id: "left", label: "产品居左", icon: AlignLeft, prompt: "Place the product itself on the left side of the frame, aligned to the left third, and keep the right side as the open background area." },
  { id: "right", label: "产品居右", icon: AlignRight, prompt: "Place the product itself on the right side of the frame, aligned to the right third, and keep the left side as the open background area." },
  { id: "bottom", label: "底部陈列", icon: ArrowDownToLine, prompt: "Place the product low in the frame on a grounded display surface, leaving a richer upper background with spatial depth." },
  { id: "diagonal", label: "斜向布局", icon: MoveDiagonal2, prompt: "Use an asymmetrical diagonal composition with the product offset to create movement while keeping the product fully visible." },
] as const;

/**
 * 电商平台主流画布尺寸预设。
 *
 * 数据来源：用户提供的《电商平台图片参数表 v20260916》，25 个平台的主图规格。
 * 这里只取「决定画布」的三件事：主图尺寸、比例、背景要求（白底 / 任意），
 * 其余字段（文件大小上限、格式、水印规则）不影响出图画布，不搬进来当噪音。
 *
 * ⚠️ Etsy 在原表里 cover_size=2000x2000 与 cover_ratio=4:3 自相矛盾。
 *    画布以**像素尺寸**为唯一依据（它直接驱动 customWidth/customHeight），
 *    ratio 字段仅用于兜底，所以这里按 2000x2000 实际比例记为 1:1，避免
 *    「标着 4:3 却出方图」这种对不上的提示。
 *
 * ⚠️ bg 为 "white" 的平台强制白底，这是平台硬性审核规则，
 *    必须写进提示词，否则用户选了 Amazon 却出了场景图，等于白生成。
 */
type EcommercePreset = {
  id: string;
  name: string;
  region: string;
  width: number;
  height: number;
  ratio: string;
  /** white = 平台要求纯白背景；any = 任意背景 */
  bg: "white" | "any";
};

const ECOMMERCE_PRESET_GROUPS: {
  id: string;
  label: string;
  items: readonly EcommercePreset[];
}[] = [
  {
    id: "cn",
    label: "国内平台",
    items: [
      { id: "taobao-tmall", name: "淘宝 / 天猫", region: "CN", width: 800, height: 800, ratio: "1:1", bg: "white" },
      { id: "jd", name: "京东", region: "CN", width: 800, height: 800, ratio: "1:1", bg: "white" },
      { id: "pinduoduo", name: "拼多多", region: "CN", width: 800, height: 800, ratio: "1:1", bg: "white" },
      { id: "douyin", name: "抖音电商", region: "CN", width: 800, height: 800, ratio: "1:1", bg: "any" },
      { id: "kuaishou", name: "快手电商", region: "CN", width: 800, height: 800, ratio: "1:1", bg: "any" },
      { id: "xiaohongshu", name: "小红书", region: "CN", width: 1080, height: 1440, ratio: "3:4", bg: "any" },
      { id: "wechat-channel", name: "微信视频号小店", region: "CN", width: 800, height: 800, ratio: "1:1", bg: "any" },
      { id: "vip", name: "唯品会", region: "CN", width: 950, height: 1200, ratio: "3:4", bg: "any" },
      { id: "dewu", name: "得物", region: "CN", width: 800, height: 800, ratio: "1:1", bg: "white" },
      { id: "youzan", name: "有赞", region: "CN", width: 800, height: 800, ratio: "1:1", bg: "any" },
    ],
  },
  {
    id: "global",
    label: "海外平台",
    items: [
      { id: "amazon", name: "Amazon", region: "全球", width: 2000, height: 2000, ratio: "1:1", bg: "white" },
      { id: "temu", name: "Temu", region: "全球", width: 1600, height: 1600, ratio: "1:1", bg: "white" },
      { id: "ebay", name: "eBay", region: "全球", width: 1600, height: 1600, ratio: "1:1", bg: "any" },
      { id: "aliexpress", name: "AliExpress", region: "全球", width: 1000, height: 1000, ratio: "1:1", bg: "any" },
      { id: "shein", name: "SHEIN", region: "全球", width: 1340, height: 1785, ratio: "3:4", bg: "any" },
      { id: "walmart", name: "Walmart", region: "美国", width: 2200, height: 2200, ratio: "1:1", bg: "white" },
      { id: "target", name: "Target", region: "美国", width: 1500, height: 1500, ratio: "1:1", bg: "white" },
      { id: "bestbuy", name: "BestBuy", region: "北美", width: 2000, height: 2000, ratio: "1:1", bg: "white" },
      { id: "etsy", name: "Etsy", region: "美国 / 欧洲", width: 2000, height: 2000, ratio: "1:1", bg: "any" },
      { id: "shopee", name: "Shopee", region: "东南亚", width: 1000, height: 1000, ratio: "1:1", bg: "any" },
      { id: "lazada", name: "Lazada", region: "东南亚", width: 1000, height: 1000, ratio: "1:1", bg: "any" },
      { id: "ozon", name: "Ozon", region: "俄罗斯", width: 1200, height: 1200, ratio: "1:1", bg: "white" },
      { id: "allegro", name: "Allegro", region: "波兰", width: 1000, height: 1000, ratio: "1:1", bg: "any" },
      { id: "flipkart", name: "Flipkart", region: "印度", width: 1000, height: 1000, ratio: "1:1", bg: "white" },
      { id: "mercadolibre", name: "MercadoLibre", region: "拉美", width: 1200, height: 1200, ratio: "1:1", bg: "any" },
    ],
  },
];

const ECOMMERCE_PRESETS: readonly EcommercePreset[] = ECOMMERCE_PRESET_GROUPS.flatMap(
  group => group.items
);

/**
 * 平台 id 清单 / bg 规则表，导出给风格档案的守卫测试核对。
 *
 * ⚠️ 必须从上面的数据**推导**出来，不能另写一份数组。
 *    手抄一份的话，这里加了平台而那里忘了加，守卫测试反而成了摆设
 *    —— 它核对的是两份同样过时的数据，照样全绿。
 */
export const ECOMMERCE_PLATFORM_IDS: readonly string[] = ECOMMERCE_PRESETS.map(
  item => item.id
);

export const ECOMMERCE_PLATFORM_BG_RULES: Readonly<Record<string, "white" | "any">> =
  Object.fromEntries(ECOMMERCE_PRESETS.map(item => [item.id, item.bg]));

type ResolutionPreset = (typeof RESOLUTION_PRESETS)[number];

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      const value = event.target?.result;
      if (typeof value === "string") resolve(value);
      else reject(new Error("图片读取失败"));
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-5 items-center justify-between gap-3">
      <h3 className="text-[11px] font-semibold leading-5 text-inherit">
        {children}
      </h3>
      {aside ? <span className="text-[10px] leading-4 opacity-55">{aside}</span> : null}
    </div>
  );
}

/**
 * 画幅预设 × 分辨率档位 → 实际输出像素。
 *
 * RESOLUTION_PRESETS 里的尺寸是按 **2K 基准**写死的，
 * 所以 2k 直接用原值，其余档位在它之上按倍数缩放：
 *   1k = ×0.5
 *   4k = ×1.5（3840/2560，沿用原有系数不变）
 *
 * ⚠️ 缩放后的**短边**必须仍落在用户选的那一档里
 *    （1k ≤ 1088，2k ≤ 2048，4k ≤ 4096；落档按短边，见 resolveImageResolutionTier）。
 *    越界不会报任何错，只会让界面显示的档位和用量报表对不上。
 *    18 个组合（6 画幅 × 3 档）已全部验证落档正确，
 *    并由 SmartCommerceProductDialog.test.ts 的守卫持续兜住 ——
 *    日后加新画幅时若短边越界，那条测试会直接点名是哪一个。
 */
function getOutputSize(preset: ResolutionPreset, resolution: SmartCommerceResolution) {
  if (resolution === "2k") {
    return { width: preset.width, height: preset.height };
  }
  const scale = resolution === "4k" ? 3840 / 2560 : 0.5;
  return {
    width: Math.max(1, Math.round(preset.width * scale)),
    height: Math.max(1, Math.round(preset.height * scale)),
  };
}

export function SmartCommerceProductDialog({
  isDark,
  canvasRightInset,
  onClose,
}: Props) {
  const productInputRef = useRef<HTMLInputElement | null>(null);
  /**
   * 风格参考图的 file input。
   *
   * ⚠️ 必须与 productInputRef 分开：两者语义完全不同——
   *    产品图是「要被保护的主体」，参考图是「只提供风格的样张」。
   *    共用一个 input 会让用户传错，而传错的后果是产品被当成风格来源重绘。
   */
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [imageSrc, setImageSrc] = useState("");
  const [fileName, setFileName] = useState("");
  /**
   * 风格参考图（可选）。
   *
   * 实测依据（2026-09-16，即梦 4.0 + 蒙版，判据为「目标区内/区外像素改变比」）：
   *   · 纯文字描述风格            → 1.99x（保真崩了，背景被重画）
   *   · 喂参考图 + 一句话指认      → 5.97x ✅
   *   · 喂参考图 + 再补一段文字描述 → 4.89x（比只给一句话更差，图已说清就别再啰嗦）
   *
   * 所以这里走「喂图 + 极简指认」，提示词里只加一句指过去，不展开描述风格细节。
   */
  const [referenceSrc, setReferenceSrc] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [selectedComposition, setSelectedComposition] = useState<(typeof PRODUCT_COMPOSITIONS)[number]>(
    PRODUCT_COMPOSITIONS[0]
  );
  /**
   * 选中的电商平台画布预设（可不选）。
   *
   * ⚠️ 它与「常用画幅 + 分辨率」是**互斥**的两个画布来源，不能同时生效——
   *    同一个输出尺寸有两个出口，必然出现「选了 Amazon 却出 2048 方图」
   *    这种零报错的错版。所以这里做成显式互斥：
   *    选平台会清掉画幅的主导权，点画幅 / 分辨率会取消平台选择。
   */
  const [selectedEcommerce, setSelectedEcommerce] = useState<EcommercePreset | null>(null);
  /**
   * 电商平台列表的展开态。
   *
   * ⚠️⚠️ 2026-09-19：列表改为**绝对定位的向上浮层**，不再是文档流里的一段。
   *    原先它在流内展开，25 个平台把右栏顶高 → 面板整体变高 → 用户看到的
   *    现象就是「点一下下拉，整个弹窗上下跳一下」。
   *    改成浮层后，展开与否对布局零影响，这个 state 只控制浮层显隐。
   */
  const [ecommerceExpanded, setEcommerceExpanded] = useState(false);
  /**
   * 上拉浮层允许的最大高度（px）。
   *
   * ⚠️ 需求原文：「不能超过头部标题栏的分割线位置」。
   *    这条线的位置随面板被拖动而变，所以**不能写死一个常量**——
   *    面板拖到屏幕下方时浮层可用空间变大，拖到上方时变小，
   *    写死会在靠上时穿透标题栏，且不会报任何错。
   *    因此每次展开时实测「触发器顶边 → 标题栏分割线」的距离。
   */
  const [ecommerceMenuMaxHeight, setEcommerceMenuMaxHeight] = useState(188);
  const ecommerceAnchorRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const [showPicwishSelector, setShowPicwishSelector] = useState(false);
  const [selectedPicwishTemplate, setSelectedPicwishTemplate] = useState<PicWishBackgroundTemplate>();
  /**
   * 背景生成方式。默认 template，保持老用户的既有习惯不变。
   *
   * 用户诉求原文：「支持用户在默认背景和提示词输入框中进行动态切换……
   * 也可以通过加载图片之后切换到提示词输入框」——
   * 所以这里是可随时来回切的显式开关，而不是「填了提示词就自动改走另一条链路」的隐式推断。
   * 隐式推断会让用户填了提示词又想用模板时无从取消。
   */
  const [backgroundMode, setBackgroundMode] =
    useState<SmartCommerceBackgroundMode>("template");
  const [customPrompt, setCustomPrompt] = useState("");
  // 默认 1k：见 SmartCommerceResolution 的说明——省钱是缺省，高清是主动选择。
  const [resolution, setResolution] = useState<SmartCommerceResolution>("1k");
  const [count, setCount] = useState(1);
  const [selectedPreset, setSelectedPreset] =
    useState<ResolutionPreset>(RESOLUTION_PRESETS[0]);
  const [isCreating, setIsCreating] = useState(false);
  const [hasDispatched, setHasDispatched] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);

  /*
   * ======================= 参数预设 =======================
   * 需求（2026-09-19）：取消按钮左边加「保存为预设」，右边挂一个上拉箭头，
   * 菜单里列出该账号的全部预设，每条支持 选用 / 重命名 / 更新 / 删除，
   * 并有一条「回到初始态」。下次进面板自动套用上次选中的那份。
   */
  const { user } = useAuth();
  const accountId = user?.id ?? null;
  const [presets, setPresets] = useState<SmartCommercePreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  /** 正在重命名的预设 id；null = 没有任何一条处于重命名态 */
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  /**
   * 预设初始化是否已完成。
   *
   * ⚠️ 必须有这个闸门。自动套用是在 effect 里跑的，而用户完全可能在
   *    effect 跑完之前就点了某个按钮 —— 那样他的选择会被随后到来的
   *    自动套用悄悄覆盖掉。用它保证「只在首次、且只套用一次」。
   */
  const presetHydratedRef = useRef(false);

  const colors = {
    panel: isDark ? "#171717" : "rgba(255,255,255,0.99)",
    surface: isDark ? "rgba(255,255,255,0.055)" : "rgba(22,22,34,0.035)",
    surfaceStrong: isDark ? "rgba(255,255,255,0.085)" : "rgba(22,22,34,0.055)",
    border: isDark ? "rgba(255,255,255,0.11)" : "rgba(22,22,34,0.11)",
    text: isDark ? "rgba(255,255,255,0.92)" : "rgba(22,22,34,0.92)",
    muted: isDark ? "rgba(255,255,255,0.58)" : "rgba(22,22,34,0.55)",
    accent: "#C5ED47",
  };

  const clampPanelPosition = useCallback((left: number, top: number) => {
    if (typeof window === "undefined") return { left, top };
    const panelWidth = panelRef.current?.offsetWidth || Math.min(720, window.innerWidth - 32);
    const panelHeight = panelRef.current?.offsetHeight || Math.min(720, window.innerHeight - 32);
    return {
      left: Math.min(Math.max(16, left), Math.max(16, window.innerWidth - panelWidth - 16)),
      top: Math.min(Math.max(16, top), Math.max(16, window.innerHeight - panelHeight - 16)),
    };
  }, []);

  const defaultPanelPosition = useCallback(() => {
    if (typeof window === "undefined") return { left: 24, top: 76 };
    const panelWidth = panelRef.current?.offsetWidth || Math.min(720, window.innerWidth - 32);
    const canvasWidth = Math.max(360, window.innerWidth - canvasRightInset);
    return clampPanelPosition(Math.round((canvasWidth - panelWidth) / 2), 76);
  }, [canvasRightInset, clampPanelPosition]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPanelPosition(defaultPanelPosition()));
    return () => window.cancelAnimationFrame(frame);
  }, [defaultPanelPosition]);

  useEffect(() => {
    const handleResize = () =>
      setPanelPosition(current =>
        current
          ? clampPanelPosition(current.left, current.top)
          : defaultPanelPosition()
      );
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPanelPosition, defaultPanelPosition]);

  /**
   * 量出上拉浮层能用的最大高度：从触发器顶边一直到**标题栏分割线**。
   *
   * ⚠️ 必须实测，不能写常量：面板可拖动，两者的相对距离随滚动位置和
   *    拖动位置实时变化。写死的值在面板靠上时会让菜单盖住标题栏，
   *    在靠下时又白白浪费空间 —— 两种错都不会报任何错。
   *
   * ⚠️ 触发时机要覆盖「展开瞬间」+「展开期间滚动/缩放/拖动」：
   *    只在展开瞬间量一次，用户滚动内容区后菜单就会越界。
   */
  useEffect(() => {
    if (!ecommerceExpanded) return;
    const measure = () => {
      const anchor = ecommerceAnchorRef.current?.getBoundingClientRect();
      const header = headerRef.current?.getBoundingClientRect();
      if (!anchor || !header) return;
      // header.bottom 就是标题栏那条分割线的 y 坐标；留 8px 视觉间隙。
      const available = anchor.top - header.bottom - 8;
      // 低于 120px 的菜单没有使用价值（一屏装不下两条），给个下限兜住。
      setEcommerceMenuMaxHeight(Math.max(120, Math.min(360, Math.round(available))));
    };
    measure();
    const scroller = ecommerceAnchorRef.current?.closest(".overflow-y-auto");
    scroller?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      scroller?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [ecommerceExpanded, panelPosition]);

  /**
   * 点击浮层之外就关掉它（电商平台列表 / 预设菜单共用一套）。
   *
   * ⚠️ 用 mousedown 而不是 click：click 要等 mouseup，
   *    用户按住拖动面板时菜单会一直挂着跟着跑。
   * ⚠️ 判定用 data 属性而不是 ref.contains：菜单内部有 portal 之外的
   *    输入框（重命名），用属性判定更稳且不依赖节点层级。
   */
  useEffect(() => {
    if (!ecommerceExpanded && !presetMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-smart-commerce-popover]")) return;
      setEcommerceExpanded(false);
      setPresetMenuOpen(false);
      setRenamingPresetId(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // ⚠️ 必须 stopPropagation：否则这次 Esc 会继续冒泡到画布的关闭逻辑，
      //    用户想关的是下拉菜单，结果整个弹窗被关掉。
      event.stopPropagation();
      setEcommerceExpanded(false);
      setPresetMenuOpen(false);
      setRenamingPresetId(null);
    };
    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [ecommerceExpanded, presetMenuOpen]);

  /**
   * 最终输出画布。
   *
   * 选了电商平台预设就**完全以平台规格为准**（平台尺寸是审核硬指标，
   * 再乘 2K/4K 缩放就不合规了）；没选才回到「常用画幅 × 分辨率」。
   * 这里是唯一计算入口，footer 摘要和 detail 都从它取值，避免两处各算一遍。
   */
  const outputSize = selectedEcommerce
    ? { width: selectedEcommerce.width, height: selectedEcommerce.height }
    : getOutputSize(selectedPreset, resolution);
  const outputRatio = selectedEcommerce ? selectedEcommerce.ratio : selectedPreset.ratio;
  const isPromptMode = backgroundMode === "prompt";

  /**
   * 选中平台的设计风格档案。
   *
   * ⚠️ 没选平台时是 null，而不是兜底风格。
   *    未选平台等于用户没有表达平台意图，此时硬塞一段风格指令
   *    会让「不选平台」这个选项变得有副作用——用户会发现自己什么都没选，
   *    出图风格却被悄悄限定了。
   */
  const ecommerceStyle = selectedEcommerce
    ? getEcommerceStyleProfile(selectedEcommerce.id)
    : null;

  /**
   * 白底平台下，用户提示词里与「纯白背景」硬规则冲突的词。
   *
   * 只在提示词模式 + 白底平台时才算——模板模式的背景由 PicWish 决定，
   * 用户没有输入，算了也没有可提示的对象。
   */
  const whiteBgConflicts =
    isPromptMode && selectedEcommerce?.bg === "white"
      ? findWhiteBackgroundConflicts(customPrompt)
      : [];

  /**
   * 把一个风格关键词插进提示词框。
   *
   * ⚠️ 是**追加**而不是替换：用户已经写了半句话时替换掉等于删他的输入。
   * ⚠️ 已存在就不重复插入，否则连点两下会得到「柔和均匀布光，柔和均匀布光」。
   */
  const appendStyleKeyword = useCallback((keyword: string) => {
    setCustomPrompt(current => {
      const text = current.trim();
      if (text.includes(keyword)) return current;
      const next = text ? `${text}，${keyword}` : keyword;
      return next.slice(0, 800);
    });
  }, []);

  /* ===================== 参数预设：采集 / 回填 / 读写 ===================== */

  /**
   * 把当前面板状态打成一份可存储的 payload。
   *
   * ⚠️ 只采集「参数」，不采集产品图与参考图（见 smart-commerce-presets.ts 的说明）。
   */
  const collectPresetPayload = useCallback((): SmartCommercePresetPayload => ({
    compositionId: selectedComposition.id,
    ecommerceId: selectedEcommerce?.id ?? null,
    ratio: selectedPreset.ratio,
    resolution,
    count,
    backgroundMode,
    customPrompt,
    picwishTemplate: selectedPicwishTemplate
      ? {
          id: selectedPicwishTemplate.id,
          name: selectedPicwishTemplate.name,
          category: selectedPicwishTemplate.category,
        }
      : null,
  }), [
    backgroundMode,
    count,
    customPrompt,
    resolution,
    selectedComposition,
    selectedEcommerce,
    selectedPicwishTemplate,
    selectedPreset,
  ]);

  /**
   * 把一份 payload 灌回面板。
   *
   * ⚠️ 电商平台与常用画幅是**互斥**的（见 selectedEcommerce 的说明）。
   *    回填时必须保持这个互斥关系：payload 里有 ecommerceId 就只认平台，
   *    没有才让画幅生效。两个都设会让界面出现「两处都亮着」的错觉。
   *
   * ⚠️ 找不到对应 id 时回落到默认值，而不是保持原样。
   *    保持原样会让用户点了预设却发现「部分参数没变」，而且无从判断是哪几项。
   */
  const applyPresetPayload = useCallback((payload: SmartCommercePresetPayload) => {
    const composition =
      PRODUCT_COMPOSITIONS.find(item => item.id === payload.compositionId) ||
      PRODUCT_COMPOSITIONS[0];
    setSelectedComposition(composition);

    const ratioPreset =
      RESOLUTION_PRESETS.find(item => item.ratio === payload.ratio) || RESOLUTION_PRESETS[0];
    setSelectedPreset(ratioPreset);

    setResolution(
      payload.resolution === "2k" || payload.resolution === "4k" ? payload.resolution : "1k"
    );

    const ecommerce = payload.ecommerceId
      ? ECOMMERCE_PRESETS.find(item => item.id === payload.ecommerceId) || null
      : null;
    setSelectedEcommerce(ecommerce);

    setCount(payload.count);
    setBackgroundMode(payload.backgroundMode === "prompt" ? "prompt" : "template");
    setCustomPrompt(payload.customPrompt);
    setSelectedPicwishTemplate(
      payload.picwishTemplate
        ? ({
            id: payload.picwishTemplate.id,
            name: payload.picwishTemplate.name,
            category: payload.picwishTemplate.category,
          } as PicWishBackgroundTemplate)
        : undefined
    );
  }, []);

  /**
   * 首次挂载时读取该账号的预设，并自动套用上次选中的那一份。
   *
   * ⚠️ 依赖里带 accountId：同一次会话里用户可能登出再登入另一个账号，
   *    不跟着换会让 B 账号看到 A 账号的预设。
   * ⚠️ 换账号时必须把 presetHydratedRef 重新打开，否则第二个账号不会被套用。
   */
  useEffect(() => {
    presetHydratedRef.current = false;
    const stored = readSmartCommercePresets(accountId);
    setPresets(stored);
    const activeId = readActiveSmartCommercePresetId(accountId);
    const active = activeId ? stored.find(item => item.id === activeId) : undefined;
    if (active) {
      setActivePresetId(active.id);
      applyPresetPayload(active.payload);
    } else {
      setActivePresetId(null);
    }
    presetHydratedRef.current = true;
  }, [accountId, applyPresetPayload]);

  /** 统一的落盘出口：状态与 localStorage 永远一起变，避免两边对不上。 */
  const persistPresets = useCallback(
    (next: SmartCommercePreset[]) => {
      setPresets(next);
      if (!writeSmartCommercePresets(accountId, next)) {
        toast("预设保存失败", { description: "浏览器存储不可用或已写满" });
        return false;
      }
      return true;
    },
    [accountId]
  );

  const handleSavePreset = useCallback(() => {
    if (presets.length >= SMART_COMMERCE_PRESET_LIMIT) {
      toast(`最多保存 ${SMART_COMMERCE_PRESET_LIMIT} 组预设`, {
        description: "可以先删除或更新一组已有预设",
      });
      return;
    }
    const now = Date.now();
    const preset: SmartCommercePreset = {
      id: createSmartCommercePresetId(),
      name: nextSmartCommercePresetName(presets),
      payload: collectPresetPayload(),
      createdAt: now,
      updatedAt: now,
    };
    if (!persistPresets([...presets, preset])) return;
    setActivePresetId(preset.id);
    writeActiveSmartCommercePresetId(accountId, preset.id);
    // 保存完直接进入重命名态：新建的名字是「预设 N」，
    // 用户十有八九想立刻改成有意义的名字，少一次点击。
    setPresetMenuOpen(true);
    setRenamingPresetId(preset.id);
    setRenameDraft(preset.name);
    toast("已保存为预设", { description: `${preset.name} · 下次进入会自动套用` });
  }, [accountId, collectPresetPayload, persistPresets, presets]);

  const handleApplyPreset = useCallback(
    (preset: SmartCommercePreset) => {
      applyPresetPayload(preset.payload);
      setActivePresetId(preset.id);
      writeActiveSmartCommercePresetId(accountId, preset.id);
      setPresetMenuOpen(false);
      toast(`已套用「${preset.name}」`);
    },
    [accountId, applyPresetPayload]
  );

  /** 把面板当前参数写进指定预设——需求里的「更新参数」。 */
  const handleUpdatePreset = useCallback(
    (preset: SmartCommercePreset) => {
      const next = presets.map(item =>
        item.id === preset.id
          ? { ...item, payload: collectPresetPayload(), updatedAt: Date.now() }
          : item
      );
      if (!persistPresets(next)) return;
      setActivePresetId(preset.id);
      writeActiveSmartCommercePresetId(accountId, preset.id);
      toast(`已把当前参数更新到「${preset.name}」`);
    },
    [accountId, collectPresetPayload, persistPresets, presets]
  );

  const handleDeletePreset = useCallback(
    (preset: SmartCommercePreset) => {
      const next = presets.filter(item => item.id !== preset.id);
      if (!persistPresets(next)) return;
      // ⚠️ 删的正好是当前选中项时必须同步清掉 active 记录，
      //    否则下次进面板会去找一个已经不存在的 id，表现为「自动套用失灵」。
      if (activePresetId === preset.id) {
        setActivePresetId(null);
        writeActiveSmartCommercePresetId(accountId, null);
      }
      if (renamingPresetId === preset.id) setRenamingPresetId(null);
      toast(`已删除「${preset.name}」`);
    },
    [accountId, activePresetId, persistPresets, presets, renamingPresetId]
  );

  const handleCommitRename = useCallback(
    (preset: SmartCommercePreset) => {
      const name = renameDraft.trim().slice(0, 24);
      setRenamingPresetId(null);
      if (!name || name === preset.name) return;
      persistPresets(
        presets.map(item =>
          item.id === preset.id ? { ...item, name, updatedAt: Date.now() } : item
        )
      );
    },
    [persistPresets, presets, renameDraft]
  );

  /**
   * 回到初始态：把面板恢复成出厂默认，并取消「下次自动套用」。
   *
   * ⚠️ 只清 active 记录，**不删任何预设**。
   *    用户说的是「回到默认的预设参数」，不是「清空我存的预设」——
   *    顺手删掉是不可逆的破坏性操作，绝不能塞在这条命令里。
   */
  const handleResetToDefault = useCallback(() => {
    applyPresetPayload(SMART_COMMERCE_DEFAULT_PAYLOAD);
    setActivePresetId(null);
    writeActiveSmartCommercePresetId(accountId, null);
    setPresetMenuOpen(false);
    toast("已回到初始参数");
  }, [accountId, applyPresetPayload]);

  const activePreset = presets.find(item => item.id === activePresetId) || null;

  const setUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast("请选择图片文件");
      return;
    }
    try {
      const src = await readImageFile(file);
      setImageSrc(src);
      setFileName(file.name);
    } catch (error) {
      toast("图片读取失败", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const setReferenceUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast("请选择图片文件");
      return;
    }
    try {
      const src = await readImageFile(file);
      setReferenceSrc(src);
      setReferenceName(file.name);
    } catch (error) {
      toast("参考图读取失败", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const file = Array.from(event.dataTransfer.files).find(item =>
      item.type.startsWith("image/")
    );
    if (file) {
      await setUpload(file);
      return;
    }
    const html = event.dataTransfer.getData("text/html");
    const uri = event.dataTransfer.getData("text/uri-list").split("\n").find(Boolean);
    const plain = event.dataTransfer.getData("text/plain").trim();
    const htmlSrc = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
    const src = htmlSrc || uri || (/^https?:\/\//i.test(plain) ? plain : "");
    if (!src) {
      toast("没有读取到图片");
      return;
    }
    setImageSrc(src);
    setFileName("网页产品图");
  };

  const handleCreate = () => {
    if (!imageSrc) {
      toast("请先上传产品图片");
      return;
    }
    const trimmedPrompt = customPrompt.trim();
    if (isPromptMode && !trimmedPrompt) {
      toast("请先输入背景提示词", {
        description: "或切换回默认背景使用电商模板库",
      });
      return;
    }
    setIsCreating(true);
    /**
     * 两种模式的提示词分开构造。
     *
     * 共同保留的是「产品主体不可改」这组强约束——无论走哪条链路，
     * 用户上传的商品都不能被重绘、换色或替换成别的东西，
     * 这是电商图的底线，比背景长什么样重要得多。
     */
    const productProtectionRules = [
      "保持上传产品图的商品主体完整清晰，不改变产品颜色、材质、文字、标识、比例和外形。",
      "风格只能影响背景、道具和环境氛围，不能卡通化、重绘或重新解释产品主体。",
    ];
    /*
      风格参考图的指认话术。

      ⚠️ 措辞是死线，不是文案偏好。2026-09-16 实测：
         同样喂一张参考图，写成「第二张图是样张，不是构图参考」这种**抽象否定**，
         改变比从 3.29x 崩到 0.94x —— 模型直接整图重画。
         强调「不是什么」会把注意力引到那个东西上。
      ✅ 正确写法 = 正向指认用途 + 指向明确的单点排除（"背景/内容不要带入"），
         并且**指认之后不要再补一段风格文字描述**（实测 4.89x < 5.97x，反而更差）。
    */
    const referenceStyleRules = referenceSrc
      ? [
          "最后一张图是风格参考图，只用来提供背景的色调、光影、材质和整体视觉风格。",
          "请把它的视觉风格套用到生成的背景上，参考图里的物体和内容不要带入画面。",
          "产品主体仍以产品图为唯一依据，参考图不得影响产品的外观、比例和任何细节。",
        ]
      : [];
    /*
      电商平台规格 + 设计风格约束。

      只在用户真选了平台时才加：
        · 尺寸告诉模型画布长什么样
        · bg === "white" 是平台**审核硬规则**（Amazon / 京东等强制纯白底），
          不写进提示词的话，用户选了 Amazon 却出一张场景图，图是好看的但不能用。
        · 平台设计风格（2026-09-19 新增）——尺寸和白底只约束了画布，
          没约束**长什么样**。同样是白底方图，Amazon 的极简功能性主图和
          小红书的生活种草图是两种完全不同的东西。

      ⚠️ 具体规则内容和**顺序**都在 buildEcommercePromptRules 里，
         不要在这里就地改。它是纯函数，改动必须跟着 ecommerce-style-profiles.test.ts
         的顺序断言走；内联回来就只能靠扫源码测，那是恒绿陷阱。
      没选平台就一条都不加，保持原行为。
    */
    const ecommerceRules = buildEcommercePromptRules(selectedEcommerce);
    const prompt = isPromptMode
      ? [
          "按照下面的描述，为这张产品图生成全新的电商商业背景。",
          `背景描述：${trimmedPrompt}`,
          `产品构图要求：${selectedComposition.prompt}`,
          ...ecommerceRules,
          ...productProtectionRules,
          ...referenceStyleRules,
          "只生成描述中的商业化背景、真实光影、空间和氛围。",
        ].join("\n")
      : [
          "创建真实、干净、有商业质感的产品背景。",
          selectedPicwishTemplate
            ? `电商背景模板：${selectedPicwishTemplate.name}`
            : "使用 PicWish 默认随机电商背景模板。",
          `产品构图要求：${selectedComposition.prompt}`,
          ...ecommerceRules,
          ...productProtectionRules,
          "只生成与选定风格匹配的商业化背景、真实光影、空间和氛围。",
        ].join("\n");
    const templateName = selectedPicwishTemplate?.name || "默认电商背景模板";
    const detail: SmartCommerceProductCreateDetail = {
      imageSrc,
      fileName,
      // 提示词模式下右侧对话流展示用户自己写的原文，模板模式仍展示模板名
      userPrompt: isPromptMode ? trimmedPrompt : templateName,
      prompt,
      style: isPromptMode ? "自定义提示词背景" : templateName,
      composition: selectedComposition.id,
      ecommercePlatform: selectedEcommerce?.name || "",
      ecommerceStyleId: ecommerceStyle?.id,
      // sceneType 是 PicWish 模板编号，提示词模式不走 PicWish，必须留空，
      // 否则服务端会拿它去命中一个与用户描述无关的模板。
      sceneType: isPromptMode ? undefined : selectedPicwishTemplate?.id,
      ratio: outputRatio,
      resolution,
      count,
      customWidth: outputSize.width,
      customHeight: outputSize.height,
      backgroundMode,
      customPrompt: isPromptMode ? trimmedPrompt : "",
      // 只在提示词模式下带参考图：模板模式走 PicWish，上游不接受额外参考图，
      // 传过去也只会被丢掉，反而让人以为生效了。
      referenceSrc: isPromptMode && referenceSrc ? referenceSrc : undefined,
      referenceName: isPromptMode && referenceSrc ? referenceName : undefined,
    };
    window.dispatchEvent(
      new CustomEvent<SmartCommerceProductCreateDetail>(
        "smart-commerce-product-create",
        { detail }
      )
    );
    setHasDispatched(true);
    /**
     * 2026-09-16 需求：生成之后悬浮操作面板自动关闭。
     *
     * ⚠️ 不能在 dispatch 的同一帧直接 onClose()：
     *    事件已经派发出去了，画布侧是异步接管的，但用户这一侧需要看到
     *    「按钮按下去了」的反馈，立刻消失会像点空了。
     *    这里留一个与 isCreating 收尾同节奏的短延时，先让按钮态落地再关。
     *
     * ⚠️ 也不需要再 setIsCreating(false)：组件马上卸载，那次 setState
     *    落在已卸载组件上没有意义。关闭本身就是最终态。
     */
    window.setTimeout(() => {
      setIsCreating(false);
      onClose();
    }, 250);
  };

  const uploadSlot = (
    <div
      role="button"
      tabIndex={0}
      className="relative flex min-h-[236px] w-full flex-col items-center justify-center overflow-hidden rounded-md px-4 text-center transition-colors"
      style={{
        color: colors.text,
        background: colors.surface,
        border: `1px dashed ${imageSrc ? "rgba(197,237,71,0.62)" : colors.border}`,
      }}
      onClick={() => productInputRef.current?.click()}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        productInputRef.current?.click();
      }}
      onDragOver={event => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={event => void handleDrop(event)}
    >
      {imageSrc ? (
        <>
          <img
            src={imageSrc}
            alt={fileName || "产品图"}
            className="absolute inset-2 h-[calc(100%-16px)] w-[calc(100%-16px)] object-contain"
            draggable={false}
          />
          <span className="absolute right-2 top-2 flex gap-1">
            <button
              type="button"
              className="flex h-7 items-center gap-1 rounded px-2 text-[10px] font-semibold"
              style={{
                color: colors.text,
                background: isDark ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.92)",
                border: `1px solid ${colors.border}`,
              }}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                productInputRef.current?.click();
              }}
              aria-label="替换产品图"
              title="替换产品图"
            >
              <RefreshCw size={11} />
              替换
            </button>
            <button
              type="button"
              className="flex h-7 items-center gap-1 rounded px-2 text-[10px] font-semibold"
              style={{
                color: "#F87171",
                background: isDark ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.92)",
                border: `1px solid ${colors.border}`,
              }}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                setImageSrc("");
                setFileName("");
              }}
              aria-label="删除产品图"
              title="删除产品图"
            >
              <Trash2 size={11} />
              删除
            </button>
          </span>
          <span
            className="absolute bottom-2 left-2 right-2 truncate rounded px-2 py-1.5 text-left text-[10px] font-medium"
            style={{
              color: colors.text,
              background: isDark ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.88)",
              border: `1px solid ${colors.border}`,
            }}
          >
            {fileName || "产品图"}
          </span>
        </>
      ) : (
        <>
          <span
            className="mb-2 flex h-10 w-10 items-center justify-center rounded-md"
            style={{ color: colors.accent, background: "rgba(197,237,71,0.12)" }}
          >
            <ImagePlus size={20} />
          </span>
          <span className="text-[12px] font-semibold">上传产品图片</span>
          <span className="mt-1 max-w-[240px] text-[10px] leading-4" style={{ color: colors.muted }}>
            拖入图片或选择本地文件，生成时会保护产品主体，只创建新背景。
          </span>
        </>
      )}
      <input
        ref={productInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          if (file) void setUpload(file);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );

  /**
   * 风格参考图的隐藏 input。
   *
   * ⚠️⚠️ 它曾经被放在 uploadSlot 内部，那是一个会「抢走产品图上传窗口」的真实缺陷：
   *      uploadSlot 的根 div 自身带 onClick → productInputRef.click()，
   *      而程序化触发 referenceInputRef.click() 时，click 事件会从这个隐藏 input
   *      冒泡到那个根 div，于是产品图选择器也被一起唤起 ——
   *      表现就是「点参考图，弹出来的是产品图上传窗口」。
   *
   * ⚠️ 但也不能挪进提示词区：提示词区会随 backgroundMode 切换整段卸载，
   *    input 跟着卸载会让「选图对话框刚弹出、用户切了下 tab，回调就丢了」。
   *
   * ✅ 解法是挂在面板根部：既常驻不卸载，又不在任何带 onClick 的容器里。
   */
  const referenceFileInput = (
    <input
      ref={referenceInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={event => {
        const file = event.currentTarget.files?.[0];
        if (file) void setReferenceUpload(file);
        event.currentTarget.value = "";
      }}
    />
  );

  // 提示词模式下没写提示词就不该允许提交——否则会拿一句空描述去调图片模型。
  const canGenerate = Boolean(
    imageSrc && !isCreating && (!isPromptMode || customPrompt.trim())
  );

  const dialog = (
    <div className="fixed inset-0 z-[3500] pointer-events-none">
      <div
        ref={panelRef}
        data-artx-dialog-surface
        /*
         * ⚠️⚠️ 高度是**固定**的（h-[...]），不是 max-h。
         *
         * 需求原文：「整个面板布局还有面板的高度固定不能是动态变化」。
         * 原先写的是 max-h-[calc(100dvh-32px)]，面板高度由内容撑出来 ——
         * 电商平台列表一展开，内容变高，面板跟着长高，用户看到的就是
         * 「点个下拉，整个弹窗上下跳」。把高度钉死之后，任何内容变化都
         * 只在内容区内部滚动消化，外轮廓一动不动。
         *
         * 720px 是当前所有板块完整展开（含提示词模式）时的舒适高度；
         * 小屏用 100dvh-32px 兜底，保证不超出视口。
         */
        className="fixed flex h-[min(720px,calc(100dvh-32px))] w-[min(720px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg"
        style={{
          pointerEvents: "auto",
          left: panelPosition?.left ?? 16,
          top: panelPosition?.top ?? 76,
          color: colors.text,
          background: colors.panel,
          border: `1px solid ${colors.border}`,
          boxShadow: "0 18px 48px rgba(0,0,0,0.24)",
          backdropFilter: "blur(22px)",
        }}
        onMouseDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
      >
        {/* 参考图 input 挂在面板根部：常驻不卸载，且不在任何带 onClick 的容器里 */}
        {referenceFileInput}
        <header
          ref={headerRef}
          className="flex shrink-0 cursor-grab touch-none items-start justify-between gap-4 px-5 py-3.5 active:cursor-grabbing"
          style={{ borderBottom: `1px solid ${colors.border}` }}
          onPointerDown={event => {
            if (event.button !== 0 || (event.target as HTMLElement).closest("button,input,textarea,select")) return;
            const rect = panelRef.current?.getBoundingClientRect();
            if (!rect) return;
            dragRef.current = {
              pointerId: event.pointerId,
              offsetX: event.clientX - rect.left,
              offsetY: event.clientY - rect.top,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            setPanelPosition(
              clampPanelPosition(
                event.clientX - drag.offsetX,
                event.clientY - drag.offsetY
              )
            );
          }}
          onPointerUp={event => {
            if (dragRef.current?.pointerId !== event.pointerId) return;
            dragRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
              style={{ color: colors.accent, background: "rgba(197,237,71,0.11)" }}
            >
              <Boxes size={18} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold leading-5">智能电商产品</h2>
                <Sparkles size={13} style={{ color: colors.accent }} />
              </div>
              <p className="mt-0.5 hidden text-[10px] leading-4 sm:block" style={{ color: colors.muted }}>
                上传产品图片，选择电商背景模板、数量和输出分辨率。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <GripHorizontal size={16} style={{ color: colors.muted }} />
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md hover:opacity-70"
              style={{ color: colors.muted }}
              onClick={onClose}
              aria-label="关闭智能电商产品"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
            <section className="min-w-0">
              <SectionTitle aside="必选">产品图片</SectionTitle>
              {uploadSlot}

              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_104px]">
                <div>
                  <SectionTitle>常用画幅</SectionTitle>
                  <div className="grid grid-cols-3 gap-1.5">
                    {RESOLUTION_PRESETS.map(preset => {
                      // 选了电商平台预设时画幅不再主导输出，按钮相应不高亮，
                      // 避免出现「两处都亮着但只有一处生效」的错觉。
                      const active = !selectedEcommerce && selectedPreset.ratio === preset.ratio;
                      return (
                        <button
                          key={preset.ratio}
                          type="button"
                          className="h-10 min-w-0 overflow-hidden rounded-md px-1.5 text-left text-[10px] font-semibold transition-colors"
                          style={{
                            color: colors.text,
                            background: active ? "rgba(197,237,71,0.13)" : colors.surface,
                            border: `1px solid ${active ? "rgba(197,237,71,0.58)" : colors.border}`,
                          }}
                          onClick={() => {
                            setSelectedPreset(preset);
                            // 显式互斥：手动挑画幅即表示放弃平台预设。
                            setSelectedEcommerce(null);
                          }}
                        >
                          <span className="block leading-4">{preset.label}</span>
                          <span
                            className="block truncate whitespace-nowrap text-[8px] leading-3 tabular-nums"
                            style={{ color: colors.muted }}
                          >
                            {preset.width}×{preset.height}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <SectionTitle>分辨率</SectionTitle>
                  {/*
                    三档并列，默认停在 1k。
                    行高从 h-10 降到 h-8：多一档而按钮不变高的话，
                    这一列会比左边的「常用画幅」高出一大截，两列顶端对齐的版面会散掉。
                    h-8×3 + 两道 gap ≈ 108px，与画幅列的 86px 差距在一眼可接受的范围内。
                  */}
                  <div className="grid grid-rows-3 gap-1.5">
                    {(["1k", "2k", "4k"] as const).map(item => (
                      <button
                        key={item}
                        type="button"
                        className="h-8 rounded-md text-[10px] font-semibold uppercase transition-colors"
                        style={{
                          color: colors.text,
                          background:
                            !selectedEcommerce && resolution === item
                              ? "rgba(197,237,71,0.13)"
                              : colors.surface,
                          border: `1px solid ${!selectedEcommerce && resolution === item ? "rgba(197,237,71,0.58)" : colors.border}`,
                        }}
                        onClick={() => {
                          setResolution(item);
                          setSelectedEcommerce(null);
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            </section>

            <section className="min-w-0">
              <div>
                {/*
                  2026-09-16：按需求去掉右上角「PicWish 模板 / gem 模型生成」角标。
                  这两个词是实现细节（上游厂商名、模型名），对用户没有决策价值，
                  下面的 tab 已经说清「默认背景 / 提示词生图」的区别了。
                */}
                <SectionTitle>背景生成方式</SectionTitle>
                {/*
                  模式切换：默认背景 ↔ 自定义提示词。
                  两个 tab 常驻显示，任何时候都能来回切，切换不清空另一侧的选择，
                  用户改主意时不用重新挑模板 / 重打提示词。
                */}
                <div
                  className="mb-2 grid grid-cols-2 gap-1 rounded-md p-1"
                  style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                  role="tablist"
                  aria-label="背景生成方式"
                >
                  {(
                    [
                      { id: "template", label: "默认背景", icon: Sparkles },
                      { id: "prompt", label: "提示词生图", icon: PencilLine },
                    ] as const
                  ).map(mode => {
                    const active = backgroundMode === mode.id;
                    const Icon = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className="flex h-8 items-center justify-center gap-1.5 rounded text-[10px] font-semibold transition-colors"
                        style={{
                          color: active ? "#172000" : colors.muted,
                          background: active ? colors.accent : "transparent",
                        }}
                        onClick={() => setBackgroundMode(mode.id)}
                        title={
                          mode.id === "template"
                            ? "使用 PicWish 电商背景模板库"
                            : "用自己的提示词，配合 gem 模型按产品图生成背景"
                        }
                      >
                        <Icon size={12} />
                        {mode.label}
                      </button>
                    );
                  })}
                </div>

                {isPromptMode ? (
                  <div>
                    {/*
                      提示词框 + 内嵌的参考图入口。
                      入口做成框内左下角的小 icon，而不是另起一个上传区——
                      它是提示词的「补充说明」，不是与产品图并列的第二个主输入。
                    */}
                    <div className="relative">
                      <textarea
                        value={customPrompt}
                        onChange={event => setCustomPrompt(event.target.value)}
                        placeholder="描述你想要的电商背景，例如：浅灰水泥台面，柔和自然光从左上方打入，背景虚化的绿植，高级质感"
                        className="w-full resize-none rounded-md px-3 py-2 pb-9 text-[11px] leading-4 outline-none"
                        rows={4}
                        maxLength={800}
                        style={{
                          color: colors.text,
                          background: colors.surface,
                          border: `1px solid ${customPrompt.trim() ? "rgba(197,237,71,0.58)" : colors.border}`,
                          minHeight: 92,
                        }}
                      />
                      {/*
                        提示词框内的参考图区。

                        需求（2026-09-16）：「提示词输入上传参考图之后，仅仅在提示词窗口内
                        按照画布引用图片标签的样式展示，UI 交互和视觉效果与图片引用标签保持一致。」

                        ⚠️ 尺寸与配色一律取自 composer-ref-token.ts，不得在这里硬编码——
                           画布的 image 引用标签用的是同一份常量。写第二份副本意味着
                           以后调整标签外观时这里不会跟着变，而且不会报任何错。
                      */}
                      <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                        {referenceSrc ? (
                          <span
                            data-composer-token="image"
                            className="group relative inline-flex min-w-0 items-center overflow-hidden rounded-[var(--radius-md-design)] align-middle"
                            style={{
                              maxWidth: COMPOSER_REF_TOKEN_SIZE.maxWidth,
                              height: COMPOSER_REF_TOKEN_SIZE.height,
                              gap: COMPOSER_REF_TOKEN_SIZE.gap,
                              padding: COMPOSER_REF_TOKEN_SIZE.padding,
                              ...getComposerRefTokenColors(isDark, false, false),
                              userSelect: "none",
                            }}
                            title={`风格参考图：${referenceName || "已上传"}（点击缩略图更换）`}
                          >
                            <img
                              src={referenceSrc}
                              alt={referenceName || "风格参考图"}
                              draggable={false}
                              onClick={() => referenceInputRef.current?.click()}
                              style={{
                                width: COMPOSER_REF_TOKEN_SIZE.iconSize,
                                height: COMPOSER_REF_TOKEN_SIZE.iconSize,
                                borderRadius: 2,
                                objectFit: "cover",
                                flexShrink: 0,
                                cursor: "zoom-in",
                              }}
                            />
                            <span
                              className="truncate"
                              style={{
                                maxWidth: COMPOSER_REF_TOKEN_SIZE.labelMaxWidth,
                                fontSize: COMPOSER_REF_TOKEN_SIZE.labelFontSize,
                              }}
                            >
                              {referenceName || "参考图"}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setReferenceSrc("");
                                setReferenceName("");
                                if (referenceInputRef.current) {
                                  referenceInputRef.current.value = "";
                                }
                              }}
                              /*
                               * 与画布提示词框引用标签的移除按钮保持同规格：
                               * 16px 命中区 + 11px 图标 + hover 圆形高亮
                               * （规格定义见 InfiniteCanvas 的 image 标签注释）。
                               */
                              className="flex h-4 w-4 items-center justify-center flex-shrink-0 rounded-full bg-transparent transition-colors hover:bg-black/10 dark:hover:bg-white/20"
                              style={{
                                color: isDark
                                  ? "oklch(0.72 0.008 270)"
                                  : "oklch(0.42 0.008 270)",
                                border: "none",
                                padding: 0,
                                lineHeight: 1,
                              }}
                              title="移除引用"
                              aria-label="移除引用"
                            >
                              <X size={11} strokeWidth={2.25} />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-medium transition-colors"
                            style={{ color: colors.muted, background: "transparent" }}
                            onClick={() => referenceInputRef.current?.click()}
                            title="上传风格参考图：只借鉴它的色调光影材质，产品本身不受影响"
                          >
                            <ImagePlus size={13} />
                            参考图
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      className="mt-1 flex items-center justify-between text-[9px] leading-4"
                      style={{ color: colors.muted }}
                    >
                      <span>
                        {referenceSrc
                          ? "参考图只影响背景风格，产品外观比例细节不变"
                          : "产品主体会被保护，提示词只影响背景"}
                      </span>
                      <span className="tabular-nums">{customPrompt.length}/800</span>
                    </div>

                    {/*
                      平台风格助写区（2026-09-19）。

                      需求原文：「关联到提示词中，这样的话可以帮助用户在提示词当中
                      输入的提示词都符合这个电商平台的设计风格」。

                      ⚠️ 这里给的是**可点击插入的半句话**，不是抽象标签。
                         写「高级感」这种词等于没写——用户点进去也不知道自己在
                         描述什么；写「浅灰水泥台面」才真的能把提示词写具体。

                      ⚠️ 没选平台时整块不渲染。未选平台 = 用户没表达平台意图，
                         此时冒出一堆风格词会让「不选平台」这个选项变得有副作用。
                    */}
                    {ecommerceStyle && selectedEcommerce ? (
                      <div
                        className="mt-2 rounded-md px-2.5 py-2"
                        style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                      >
                        <div className="flex items-center gap-1.5">
                          <Store size={11} style={{ color: colors.accent }} />
                          <span className="text-[10px] font-semibold" style={{ color: colors.text }}>
                            {selectedEcommerce.name} · {ecommerceStyle.label}
                          </span>
                        </div>
                        <p className="mt-1 text-[9px] leading-4" style={{ color: colors.muted }}>
                          已把该平台的设计调性写进提示词。点下方关键词可补进你的描述：
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {ecommerceStyle.keywords.map(keyword => {
                            const used = customPrompt.includes(keyword);
                            return (
                              <button
                                key={keyword}
                                type="button"
                                className="flex h-6 items-center gap-1 rounded px-1.5 text-[9px] font-medium transition-colors"
                                style={{
                                  color: used ? "#172000" : colors.text,
                                  background: used ? colors.accent : colors.surfaceStrong,
                                  border: `1px solid ${used ? "rgba(197,237,71,0.75)" : colors.border}`,
                                }}
                                onClick={() => appendStyleKeyword(keyword)}
                                title={used ? "已加入提示词" : `插入「${keyword}」`}
                              >
                                {used ? <Check size={9} /> : null}
                                {keyword}
                              </button>
                            );
                          })}
                        </div>

                        {/*
                          白底冲突提示。

                          ⚠️ 只提示，**不自动改写**用户的提示词。
                             偷偷改掉用户写的话是更糟的选择——他会发现自己的
                             输入变了，却不知道变成了什么。把冲突摆出来，
                             让他自己决定是改词还是换平台。
                        */}
                        {whiteBgConflicts.length > 0 ? (
                          <p
                            className="mt-1.5 rounded px-1.5 py-1 text-[9px] leading-4"
                            style={{
                              color: "#FAC775",
                              background: "rgba(250,199,117,0.10)",
                              border: "1px solid rgba(250,199,117,0.32)",
                            }}
                          >
                            {selectedEcommerce.name} 要求纯白底，你的描述里有「
                            {whiteBgConflicts.slice(0, 3).join("、")}
                            」可能出不了审核图。可改用白底相关的描述，或换一个不限背景的平台。
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex h-20 w-full items-center justify-center gap-3 rounded-md px-4 text-left transition-colors"
                    style={{
                      color: colors.text,
                      border: `1px solid ${showPicwishSelector ? "rgba(197,237,71,0.68)" : colors.border}`,
                      background: showPicwishSelector ? "rgba(197,237,71,0.1)" : colors.surface,
                    }}
                    onClick={() => setShowPicwishSelector(true)}
                    title="电商背景模板选择"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ color: colors.accent, background: "rgba(197,237,71,0.12)" }}>
                      <Sparkles size={17} />
                    </span>
                    <span className="min-w-0 text-[11px] font-semibold">
                      {selectedPicwishTemplate?.name || "电商背景模板库"}
                    </span>
                  </button>
                )}
              </div>

              <div className="mt-4">
                <SectionTitle>产品构图</SectionTitle>
                <div className="grid grid-cols-5 gap-1.5">
                  {PRODUCT_COMPOSITIONS.map(composition => {
                    const active = selectedComposition.id === composition.id;
                    const Icon = composition.icon;
                    return (
                      <button
                        key={composition.id}
                        type="button"
                        className="flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-[9px] font-semibold transition-colors"
                        style={{
                          color: active ? colors.text : colors.muted,
                          background: active ? "rgba(197,237,71,0.13)" : colors.surface,
                          border: `1px solid ${active ? "rgba(197,237,71,0.58)" : colors.border}`,
                        }}
                        onClick={() => setSelectedComposition(composition)}
                        title={composition.label}
                      >
                        <Icon size={14} />
                        <span className="max-w-full truncate whitespace-nowrap">{composition.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/*
                电商平台画布预设（替代原「产品占画面比例」，占同一块位置）。

                布局约束来自需求原文：「整体电商平台UI采用列表的形式，支持收起和展开，
                嵌入智能产品板块中，替代 产品占画面比例 的位置区域，不改变整个板块的UI布局。」

                ⚠️⚠️ 2026-09-19 改为**向上展开的绝对定位浮层**。

                   在这之前列表是在文档流里展开的：25 个平台一摊开就把右栏顶高，
                   面板整体跟着变高 —— 用户描述的「布局总是会上下变化」就是它。
                   哪怕加了 max-h 封顶，那 188px 仍然是实打实的额外高度。

                   浮层方案下，列表脱离文档流（absolute + bottom-full），
                   展开与否对周围元素零影响，面板外轮廓完全静止。

                ⚠️ 向上展开的上边界不能超过标题栏分割线（需求硬要求），
                   由 ecommerceMenuMaxHeight 实测得出，超出部分内部滚动。

                ⚠️ 父级链路上任何一层有 overflow:hidden 都会把浮层裁掉且零报错。
                   这里的锚点 div 本身**不能**加 overflow-hidden —— 原来那个
                   包着按钮和列表的容器带 overflow-hidden（为了圆角裁切），
                   浮层挪进去会直接消失。所以圆角裁切下沉到触发器自己身上。
              */}
              <div className="relative mt-4" ref={ecommerceAnchorRef} data-smart-commerce-popover>
                <SectionTitle aside={selectedEcommerce ? `${outputSize.width}×${outputSize.height}` : "可选"}>
                  电商平台尺寸
                </SectionTitle>
                <div
                  className="rounded-md"
                  style={{ border: `1px solid ${selectedEcommerce ? "rgba(197,237,71,0.58)" : colors.border}`, background: colors.surface }}
                >
                  <button
                    type="button"
                    className="flex h-10 w-full items-center justify-between gap-2 px-2.5 text-[10px] font-semibold"
                    style={{ color: colors.text }}
                    onClick={() => setEcommerceExpanded(value => !value)}
                    aria-expanded={ecommerceExpanded}
                    aria-label="电商平台尺寸预设"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Store size={13} style={{ color: colors.accent }} />
                      <span className="truncate">
                        {selectedEcommerce ? selectedEcommerce.name : "选择电商平台画布尺寸"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {selectedEcommerce ? (
                        <span
                          role="button"
                          tabIndex={0}
                          className="rounded px-1 text-[9px] font-medium"
                          style={{ color: colors.muted }}
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            setSelectedEcommerce(null);
                          }}
                          onKeyDown={event => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            event.stopPropagation();
                            setSelectedEcommerce(null);
                          }}
                          title="取消平台预设，改用常用画幅"
                        >
                          清除
                        </span>
                      ) : null}
                      {/*
                        ⚠️ 箭头方向要与实际展开方向一致：菜单向上弹，
                           收起态就该显示「向上箭头」提示可上拉，展开后翻成向下（= 点它收起）。
                           沿用原先「展开显 ChevronUp」的写法会让箭头指向与动作相反。
                      */}
                      {ecommerceExpanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                    </span>
                  </button>
                </div>
                {ecommerceExpanded ? (
                  <div
                    className="absolute bottom-full left-0 right-0 z-30 mb-1.5 overflow-y-auto rounded-md px-1.5 pb-1.5"
                    style={{
                      maxHeight: ecommerceMenuMaxHeight,
                      background: colors.panel,
                      border: `1px solid ${colors.border}`,
                      boxShadow: "0 -12px 32px rgba(0,0,0,0.32)",
                    }}
                    role="listbox"
                    aria-label="电商平台画布尺寸"
                  >
                    {ECOMMERCE_PRESET_GROUPS.map(group => (
                        <div key={group.id}>
                          <div
                            className="px-1 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-wide"
                            style={{ color: colors.muted }}
                          >
                            {group.label}
                          </div>
                          {group.items.map(preset => {
                            const active = selectedEcommerce?.id === preset.id;
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                className="flex h-8 w-full items-center justify-between gap-2 rounded px-1.5 text-left text-[10px] transition-colors"
                                style={{
                                  color: active ? colors.text : colors.muted,
                                  background: active ? "rgba(197,237,71,0.13)" : "transparent",
                                }}
                                onClick={() => {
                                  setSelectedEcommerce(preset);
                                  setEcommerceExpanded(false);
                                }}
                                title={`${preset.name} · ${preset.region} · ${preset.width}×${preset.height}${preset.bg === "white" ? " · 平台要求纯白底" : ""}`}
                              >
                                <span className="flex min-w-0 items-center gap-1.5">
                                  {active ? (
                                    <Check size={11} style={{ color: colors.accent }} />
                                  ) : (
                                    <span className="inline-block w-[11px]" />
                                  )}
                                  <span className="truncate font-semibold">{preset.name}</span>
                                  {preset.bg === "white" ? (
                                    <span
                                      className="shrink-0 rounded px-1 text-[8px]"
                                      style={{ color: colors.muted, border: `1px solid ${colors.border}` }}
                                    >
                                      白底
                                    </span>
                                  ) : null}
                                </span>
                                <span className="shrink-0 tabular-nums text-[9px]" style={{ color: colors.muted }}>
                                  {preset.width}×{preset.height}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                  </div>
                ) : null}
                {selectedEcommerce ? (
                  <p className="mt-1 text-[9px] leading-4" style={{ color: colors.muted }}>
                    已按 {selectedEcommerce.name} 主图规格输出，上方常用画幅与分辨率本次不生效。
                    {/*
                      平台调性一句话。让用户在**选平台那一刻**就知道
                      自己顺带选中了什么风格，而不是等出了图才发现。
                    */}
                    {ecommerceStyle ? (
                      <>
                        <br />
                        风格调性：{ecommerceStyle.label}（{ecommerceStyle.tone}），已自动写入提示词。
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>

              <div className="mt-4">
                <SectionTitle>生成数量</SectionTitle>
                <div className="grid grid-cols-9 gap-1">
                  {IMAGE_COUNTS.map(item => (
                    <button
                      key={item}
                      type="button"
                      className="h-9 rounded-md text-[10px] font-semibold transition-colors"
                      style={{
                        color: count === item ? "#172000" : colors.text,
                        background: count === item ? colors.accent : colors.surface,
                        border: `1px solid ${count === item ? "rgba(197,237,71,0.75)" : colors.border}`,
                      }}
                      onClick={() => setCount(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {hasDispatched ? (
                <div
                  className="mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-[10px] leading-4"
                  style={{
                    color: colors.text,
                    background: colors.surfaceStrong,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  <Check size={13} style={{ color: colors.accent }} />
                  生成任务已发送到画布，结果会在产品图右侧生成。
                </div>
              ) : null}
            </section>
          </div>
        </div>

        {showPicwishSelector ? <PicwishBackgroundSelector isDark={isDark} selectedTemplate={selectedPicwishTemplate} onSelect={setSelectedPicwishTemplate} onClose={() => setShowPicwishSelector(false)} /> : null}
        <footer
          className="relative flex shrink-0 items-center justify-between gap-3 px-5 py-3"
          style={{ borderTop: `1px solid ${colors.border}` }}
        >
          <span className="flex min-w-0 items-center gap-2 text-[10px]" style={{ color: colors.muted }}>
            <FileImage size={13} />
            {selectedEcommerce
              ? `${selectedEcommerce.name} ${outputSize.width}×${outputSize.height}`
              : `${selectedPreset.label} · ${resolution.toUpperCase()}`}{" "}
            · {count} 张 · {isPromptMode ? "提示词生图" : "默认背景"}
            {activePreset ? ` · ${activePreset.name}` : ""}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {/*
              参数预设：左边「保存当前为预设」，右边上拉箭头展开已存预设。

              ⚠️ 两个按钮拼成一个分段控件（中间只有一道 1px 分隔线），
                 而不是两颗独立按钮 —— 它们操作的是同一个对象，
                 拆开会让用户以为箭头是另一个功能。

              ⚠️ 菜单同样是**向上展开的绝对定位浮层**，理由与电商平台列表一致：
                 footer 在面板底部，向下展开会直接掉到面板外面被裁掉。
            */}
            <div className="relative" data-smart-commerce-popover>
              <div
                className="flex h-9 items-stretch overflow-hidden rounded-md"
                style={{
                  border: `1px solid ${presetMenuOpen || activePreset ? "rgba(197,237,71,0.55)" : colors.border}`,
                  background: colors.surface,
                }}
              >
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 text-[11px] font-semibold transition-opacity hover:opacity-80"
                  style={{ color: colors.text }}
                  onClick={handleSavePreset}
                  title="把当前面板的全部参数保存为一组预设，下次进入自动套用"
                >
                  <BookmarkPlus size={13} style={{ color: colors.accent }} />
                  保存预设
                </button>
                <button
                  type="button"
                  className="flex w-8 items-center justify-center transition-opacity hover:opacity-80"
                  style={{ color: colors.muted, borderLeft: `1px solid ${colors.border}` }}
                  onClick={() => {
                    setPresetMenuOpen(value => !value);
                    setRenamingPresetId(null);
                  }}
                  aria-expanded={presetMenuOpen}
                  aria-label="我的预设参数"
                  title="我的预设参数"
                >
                  {presetMenuOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                </button>
              </div>

              {presetMenuOpen ? (
                <div
                  className="absolute bottom-full right-0 z-40 mb-2 w-[300px] overflow-hidden rounded-md"
                  style={{
                    background: colors.panel,
                    border: `1px solid ${colors.border}`,
                    boxShadow: "0 -14px 36px rgba(0,0,0,0.36)",
                  }}
                  role="menu"
                  aria-label="预设参数列表"
                >
                  <div
                    className="px-3 py-2 text-[9px] font-semibold uppercase tracking-wide"
                    style={{ color: colors.muted, borderBottom: `1px solid ${colors.border}` }}
                  >
                    我的预设（{presets.length}/{SMART_COMMERCE_PRESET_LIMIT}）
                  </div>

                  {/*
                    ⚠️ 列表区单独限高滚动，而不是让整个菜单长高：
                       12 组预设 + 底部「回到初始态」全摊开会顶破面板顶边，
                       而「回到初始态」必须始终可见（它是兜底出口）。
                  */}
                  <div className="max-h-[228px] overflow-y-auto py-1">
                    {presets.length === 0 ? (
                      <p className="px-3 py-3 text-[10px] leading-4" style={{ color: colors.muted }}>
                        还没有预设。调好参数后点左边「保存预设」，下次进入就会自动套用。
                      </p>
                    ) : (
                      presets.map(preset => {
                        const active = preset.id === activePresetId;
                        const renaming = renamingPresetId === preset.id;
                        return (
                          <div
                            key={preset.id}
                            className="flex items-center gap-1 px-1.5 py-0.5"
                            style={{ background: active ? "rgba(197,237,71,0.10)" : "transparent" }}
                          >
                            {renaming ? (
                              <input
                                autoFocus
                                value={renameDraft}
                                maxLength={24}
                                onChange={event => setRenameDraft(event.target.value)}
                                onBlur={() => handleCommitRename(preset)}
                                onKeyDown={event => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    handleCommitRename(preset);
                                    return;
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setRenamingPresetId(null);
                                  }
                                }}
                                className="h-7 min-w-0 flex-1 rounded px-2 text-[10px] outline-none"
                                style={{
                                  color: colors.text,
                                  background: colors.surface,
                                  border: `1px solid rgba(197,237,71,0.55)`,
                                }}
                                aria-label="预设名称"
                              />
                            ) : (
                              <button
                                type="button"
                                className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded px-2 text-left text-[10px] transition-colors"
                                style={{ color: active ? colors.text : colors.muted }}
                                onClick={() => handleApplyPreset(preset)}
                                title={`套用「${preset.name}」`}
                              >
                                {active ? (
                                  <Check size={11} style={{ color: colors.accent }} />
                                ) : (
                                  <span className="inline-block w-[11px]" />
                                )}
                                <span className="truncate font-semibold">{preset.name}</span>
                              </button>
                            )}
                            {/*
                              行内命令：重命名 / 更新参数 / 删除。
                              ⚠️ 它们必须与「套用」分开命中区，否则点更新会连带套用一次，
                                 把用户刚调好的参数用旧值覆盖掉 —— 正好与他的意图相反。
                            */}
                            <span className="flex shrink-0 items-center gap-0.5">
                              <button
                                type="button"
                                className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-white/10"
                                style={{ color: colors.muted }}
                                onClick={() => {
                                  setRenamingPresetId(preset.id);
                                  setRenameDraft(preset.name);
                                }}
                                aria-label={`重命名 ${preset.name}`}
                                title="重命名"
                              >
                                <PenLine size={12} />
                              </button>
                              <button
                                type="button"
                                className="flex h-7 items-center gap-1 rounded px-1.5 text-[9px] font-semibold transition-colors hover:bg-white/10"
                                style={{ color: colors.accent }}
                                onClick={() => handleUpdatePreset(preset)}
                                aria-label={`把当前参数更新到 ${preset.name}`}
                                title="用当前面板参数覆盖这组预设"
                              >
                                <Save size={12} />
                                更新
                              </button>
                              <button
                                type="button"
                                className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-white/10"
                                style={{ color: "#F87171" }}
                                onClick={() => handleDeletePreset(preset)}
                                aria-label={`删除 ${preset.name}`}
                                title="删除这组预设"
                              >
                                <Trash2 size={12} />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <button
                    type="button"
                    className="flex h-9 w-full items-center gap-1.5 px-3 text-left text-[10px] font-semibold transition-colors hover:bg-white/5"
                    style={{ color: colors.muted, borderTop: `1px solid ${colors.border}` }}
                    onClick={handleResetToDefault}
                    title="恢复面板出厂默认参数，并取消下次自动套用（不会删除已存预设）"
                  >
                    <RotateCcw size={12} />
                    回到初始态
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="h-9 rounded-md px-4 text-[11px] font-semibold"
              style={{ color: colors.text, background: colors.surface }}
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              disabled={!canGenerate}
              className="flex h-9 items-center gap-2 rounded-md px-4 text-[11px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
              style={{ color: "#172000", background: colors.accent }}
              onClick={handleCreate}
            >
              {isCreating ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
              生成产品图
            </button>
          </div>
        </footer>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
