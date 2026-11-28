/**
 * 画布尺寸模板库
 * 
 * 包含国际通用纸张尺寸和数字终端设备屏幕分辨率，
 * 用户选择模板后会在画布中创建对应尺寸的空白图片节点。
 */

export type CanvasSizeTplCategory = {
  id: string;
  label: string;
};

export type CanvasSizeTpl = {
  id: number;
  name: string;
  /** 宽度（像素） */
  width: number;
  /** 高度（像素） */
  height: number;
  categoryId: string;
  /** 备注信息（如 DPI、屏幕尺寸等） */
  note?: string;
};

export const CANVAS_SIZE_TPL_CATEGORIES: CanvasSizeTplCategory[] = [
  { id: "all", label: "全部尺寸" },
  { id: "paper", label: "国际通用纸张" },
  { id: "device", label: "数字终端设备" },
];

export const CANVAS_SIZE_TEMPLATES: CanvasSizeTpl[] = [
  // ==================== 国际通用纸张 ====================
  
  // ISO 216定义文件及C系信封尺寸
  { 
    id: 1, 
    name: "A4 纸张 (72 PPI)", 
    width: 595, 
    height: 842, 
    categoryId: "paper",
    note: "屏幕显示"
  },
  { 
    id: 2, 
    name: "A4 纸张 (150 PPI)", 
    width: 1240, 
    height: 1754, 
    categoryId: "paper",
    note: "普通打印"
  },
  { 
    id: 3, 
    name: "A4 纸张 (300 PPI)", 
    width: 2480, 
    height: 3508, 
    categoryId: "paper",
    note: "标准印刷"
  },
  
  // A系列纸张 (72 PPI 参考)
  { 
    id: 4, 
    name: "A0 纸张 (72 PPI)", 
    width: 2384, 
    height: 3370, 
    categoryId: "paper",
    note: "841×1189mm"
  },
  { 
    id: 5, 
    name: "A1 纸张 (72 PPI)", 
    width: 1684, 
    height: 2384, 
    categoryId: "paper",
    note: "594×841mm"
  },
  { 
    id: 6, 
    name: "A2 纸张 (72 PPI)", 
    width: 1191, 
    height: 1684, 
    categoryId: "paper",
    note: "420×594mm"
  },
  { 
    id: 7, 
    name: "A3 纸张 (72 PPI)", 
    width: 842, 
    height: 1191, 
    categoryId: "paper",
    note: "297×420mm"
  },
  { 
    id: 8, 
    name: "A5 纸张 (72 PPI)", 
    width: 420, 
    height: 595, 
    categoryId: "paper",
    note: "148×210mm"
  },
  
  // B系列纸张 (72 PPI 参考)
  { 
    id: 9, 
    name: "B4 纸张 (72 PPI)", 
    width: 729, 
    height: 1032, 
    categoryId: "paper",
    note: "257×364mm"
  },
  { 
    id: 10, 
    name: "B5 纸张 (72 PPI)", 
    width: 516, 
    height: 729, 
    categoryId: "paper",
    note: "182×257mm"
  },
  
  // C系列信封
  { 
    id: 11, 
    name: "C4 信封 (72 PPI)", 
    width: 649, 
    height: 919, 
    categoryId: "paper",
    note: "229×324mm, 适合用于A4文件"
  },
  
  // ==================== 数字终端设备 ====================
  
  // ========== 最新机型分辨率 (2025-2026 款) ==========
  
  { 
    id: 100, 
    name: "iPhone 17 Pro Max", 
    width: 1320, 
    height: 2868, 
    categoryId: "device",
    note: "6.9英寸屏幕, 460 PPI"
  },
  { 
    id: 101, 
    name: "iPhone 17 Pro / 17", 
    width: 1206, 
    height: 2622, 
    categoryId: "device",
    note: "6.3英寸屏幕, 460 PPI"
  },
  { 
    id: 102, 
    name: "iPhone 16e / 17e", 
    width: 1170, 
    height: 2532, 
    categoryId: "device",
    note: "6.1英寸屏幕, 60Hz刷新率"
  },
  { 
    id: 103, 
    name: "iPhone 16 Pro Max", 
    width: 1320, 
    height: 2868, 
    categoryId: "device",
    note: "6.9英寸屏幕"
  },
  { 
    id: 104, 
    name: "iPhone 16 Pro", 
    width: 1206, 
    height: 2622, 
    categoryId: "device",
    note: "6.3英寸屏幕"
  },
  
  // ========== 前代机型分辨率 (2023-2024 款) ==========
  
  { 
    id: 110, 
    name: "iPhone 15 Pro Max / 15 Plus", 
    width: 1290, 
    height: 2796, 
    categoryId: "device",
    note: "6.7英寸屏幕"
  },
  { 
    id: 111, 
    name: "iPhone 15 Pro / 15", 
    width: 1179, 
    height: 2556, 
    categoryId: "device",
    note: "6.1英寸屏幕"
  },
  { 
    id: 112, 
    name: "iPhone 14 Pro Max", 
    width: 1290, 
    height: 2796, 
    categoryId: "device",
    note: "6.7英寸屏幕"
  },
  { 
    id: 113, 
    name: "iPhone 14 / 13 系列", 
    width: 1170, 
    height: 2532, 
    categoryId: "device",
    note: "6.1英寸屏幕"
  },
  
  // ========== 手机与平板分辨率 ==========
  
  { 
    id: 120, 
    name: "iPhone 3/3s", 
    width: 320, 
    height: 480, 
    categoryId: "device",
    note: "3.5英寸"
  },
  { 
    id: 121, 
    name: "iPhone 4/4s", 
    width: 640, 
    height: 960, 
    categoryId: "device",
    note: "3.5英寸"
  },
  { 
    id: 122, 
    name: "iPhone 5/5s", 
    width: 640, 
    height: 1136, 
    categoryId: "device",
    note: "4.0英寸"
  },
  { 
    id: 123, 
    name: "iPhone 6", 
    width: 750, 
    height: 1334, 
    categoryId: "device",
    note: "4.7英寸"
  },
  { 
    id: 124, 
    name: "iPhone 6 Plus", 
    width: 1080, 
    height: 1920, 
    categoryId: "device",
    note: "5.5英寸"
  },
  { 
    id: 125, 
    name: "iPhone 8", 
    width: 750, 
    height: 1334, 
    categoryId: "device",
    note: "4.7英寸"
  },
  { 
    id: 126, 
    name: "iPhone 14", 
    width: 1170, 
    height: 2532, 
    categoryId: "device",
    note: "6.1英寸"
  },
  { 
    id: 127, 
    name: "iPhone 17e", 
    width: 1170, 
    height: 2532, 
    categoryId: "device",
    note: "6.1英寸"
  },
  { 
    id: 128, 
    name: "iPhone 17 Pro 高端用户分辨率", 
    width: 1206, 
    height: 2622, 
    categoryId: "device",
    note: "但本质官方使用低质量屏幕大版本适配"
  },
  
  // ========== iPad 分辨率 ==========
  
  { 
    id: 130, 
    name: "iPad 1/2", 
    width: 768, 
    height: 1024, 
    categoryId: "device",
    note: "9.7英寸"
  },
  { 
    id: 131, 
    name: "iPad 3/4", 
    width: 1536, 
    height: 2048, 
    categoryId: "device",
    note: "9.7英寸"
  },
  { 
    id: 132, 
    name: "iPad mini 2", 
    width: 1536, 
    height: 2048, 
    categoryId: "device",
    note: "7.9英寸"
  },
  { 
    id: 133, 
    name: "iPad 2025款", 
    width: 2360, 
    height: 1640, 
    categoryId: "device",
    note: "11英寸"
  },
  
  // ========== 安卓手机常见分辨率 ==========
  
  { 
    id: 140, 
    name: "720p", 
    width: 720, 
    height: 1280, 
    categoryId: "device",
    note: "百元机, 入门机"
  },
  { 
    id: 141, 
    name: "1080p (FHD)", 
    width: 1080, 
    height: 1920, 
    categoryId: "device",
    note: "前几年主流"
  },
  { 
    id: 142, 
    name: "1.5K", 
    width: 1220, 
    height: 2712, 
    categoryId: "device",
    note: "自研主流, 中高端现状, 2772×1240等"
  },
  { 
    id: 143, 
    name: "2K", 
    width: 1440, 
    height: 3168, 
    categoryId: "device",
    note: "旗舰机, 3136×1440等"
  },
  { 
    id: 144, 
    name: "4K", 
    width: 2160, 
    height: 3840, 
    categoryId: "device",
    note: "索尼Xperia 1等, 已少见"
  },
  
  // ========== iPhone Duo 折叠屏 ==========
  
  { 
    id: 150, 
    name: "iPhone Duo 内屏", 
    width: 1878, 
    height: 2670, 
    categoryId: "device",
    note: "7.6英寸 Super Retina XDR OLED, 430 ppi"
  },
  { 
    id: 151, 
    name: "iPhone Duo 外屏", 
    width: 1398, 
    height: 2034, 
    categoryId: "device",
    note: "5.4英寸 Super Retina XDR OLED, 460 ppi"
  },
];
