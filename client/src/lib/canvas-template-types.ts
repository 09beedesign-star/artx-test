/**
 * 画布版式目录的数据类型。
 *
 * 目录文件由离线生成器导出，键名刻意压短（372KB → 便于按需裁剪），
 * 每个字段的含义在这里集中说明一次，运行时不要再凭名字猜。
 */

/** 归一化矩形 [x, y, w, h]；0 表示「无此区块」。 */
export type TemplateBox = [number, number, number, number] | 0;

/** 线性渐变：[x0, y0, x1, y1, ...色标]，坐标是 0..1。 */
export type TemplateGradient = Array<number | string>;

export interface TemplateDecoration {
  /** r=矩形 e=椭圆 p=路径 o=程序化网点 */
  k: "r" | "e" | "p" | "o";
  b: [number, number, number, number];
  /** 颜色：角色名 background/ink/accent/neutral/none，或直接是 #hex */
  c?: string;
  /** 覆盖填充色 / 渐变 */
  f?: string | TemplateGradient;
  st?: string;
  /** 线宽，按画板高度的比例 */
  sw?: number;
  o?: number;
  /** 圆角，按 min(W,H) 的比例 */
  cr?: number;
  /** 旋转角度（度） */
  rr?: number;
  /** k=p 时：catalog.paths 的下标 */
  p?: number;
  /** k=o 时：catalog.dots 的下标 */
  dt?: number;
}

export interface TemplateLabel {
  t: string;
  b: [number, number, number, number];
  /** 字号，按画板高度的比例 */
  s: number;
  c: string;
  ff?: string;
  w?: number;
  a?: string;
  lh?: number;
  /** 字距，按画板高度的比例 */
  tr?: number;
  sw?: number;
  rr?: number;
  st?: string;
  i?: 1;
  /** 置于背景层 */
  bg?: 1;
  /** 该文案可被用户替换 */
  rp?: 1;
}

export interface TemplateGeometry {
  m: number;
  t: TemplateBox;
  z: number;
  s: TemplateBox;
  a: TemplateBox;
  md: TemplateBox[];
  tx: TemplateBox[];
  d: TemplateDecoration[];
  l: TemplateLabel[];
  /** 隐藏页眉页脚 */
  hc?: 1;
  cm?: 1;
  nl?: 1;
  bf?: string | TemplateGradient;
}

export interface TemplateTitleStyle {
  f?: string;
  w?: number;
  t?: number;
  s?: number;
  a?: string;
  i?: 0 | 1;
  lh?: number;
  ff?: string;
  c?: string;
}

export interface TemplateLayoutData {
  i: string;
  n: string;
  c: string;
  h: string;
  pt: string;
  d: string;
  p: string;
  ts: TemplateTitleStyle;
  /** 栏数 / 行数 / 目录序号 / 图片位数 / 预览长宽比 / 正文样式 */
  cl: number;
  rw: number;
  ix: number;
  mc: number;
  pa: number;
  bs: TemplateTitleStyle;
  pc: { mn: number; mx: number; o: string[]; mt: string[] };
  /** 去重后的几何变体 */
  v: TemplateGeometry[];
  /** 11 档长宽比 → [aspect, variantIndex] */
  g: Array<[number, number]>;
  /** 页眉多一条强调线 */
  xr?: 1;
}

export interface TemplateCatalog {
  palettes: Record<string, [string, string, string, string]>;
  fonts: Record<string, string>;
  paths: string[];
  /** 半调网点：base64 打包的 [x, y, r] 点表 */
  dots: Array<{ n: number; b: string }>;
  categories: string[];
  layouts: TemplateLayoutData[];
}
