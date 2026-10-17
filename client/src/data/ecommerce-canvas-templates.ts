/**
 * 电商画布 · 带货图文分镜模板库
 *
 * 来源：对美图设计室「AI带货图文」（designkit.cn/shoppable-carousel）
 * 的界面逆向复刻 —— 49 个分镜模板的名称与分镜公式原样保留，
 * 分类 tab 也与其品类结构对齐（男装/女装… 玩具/盲盒）。
 *
 * flow（分镜公式）直接拼进生成 prompt，用于约束多张图之间的
 * 拍摄节奏（钩子 → 展示 → 收尾），是本功能与普通文生图的核心差异。
 */

export type EcommerceTplCategory = {
  id: string;
  label: string;
};

export type EcommerceTpl = {
  id: number;
  name: string;
  /** 分镜公式，如「全景融入 → 局部特写 → 退后收尾」 */
  flow: string;
  categoryId: string;
};

export const ECOMMERCE_TPL_CATEGORIES: EcommerceTplCategory[] = [
  { id: "all", label: "全部模板" },
  { id: "fashion", label: "男装/女装/运动服饰" },
  { id: "bag", label: "鞋包/配饰" },
  { id: "outdoor", label: "运动器械/户外装备" },
  { id: "home", label: "家具/家装" },
  { id: "daily", label: "日用/家纺" },
  { id: "tool", label: "五金/工具/汽摩" },
  { id: "3c", label: "3C数码/家电" },
  { id: "beauty", label: "美妆/个护" },
  { id: "health", label: "健康/保健" },
  { id: "toy", label: "玩具/盲盒" },
];

export const ECOMMERCE_TEMPLATES: EcommerceTpl[] = [
  { id: 1, name: "居家角落随手拍", flow: "全景融入 → 局部特写 → 退后收尾", categoryId: "home" },
  { id: 2, name: "手背试色测评", flow: "效果对比 → 逐项标注 → 质地三格", categoryId: "beauty" },
  { id: 3, name: "街头随身出街", flow: "回眸抓拍 → 多角度行走 → 正面全身", categoryId: "fashion" },
  { id: 4, name: "手机直出痛点安利", flow: "挡脸钩子 → 场景痛点 → 用后收尾", categoryId: "3c" },
  { id: 5, name: "桌面棉麻平铺", flow: "缠绕平铺 → 材质细节 → 拆件收尾", categoryId: "daily" },
  { id: 6, name: "居家四处种草", flow: "空间中景 → 换角落 → 材质特写", categoryId: "home" },
  { id: 7, name: "车内拆箱上手", flow: "举起特写 → 换角度细节 → 上手收尾", categoryId: "tool" },
  { id: 8, name: "粉色标签卖点讲解", flow: "托举全貌 → 功能标注 → 适合谁", categoryId: "beauty" },
  { id: 9, name: "痛点现场到解决", flow: "麻烦现场 → 逐步使用 → 收拾干净", categoryId: "daily" },
  { id: 10, name: "左右对照见效", flow: "对照钩子 → 逐维对比 → 改善汇总", categoryId: "health" },
  { id: 11, name: "一段小故事", flow: "情境独白 → 问题登场 → 情绪收尾", categoryId: "daily" },
  { id: 12, name: "窗光静物美学", flow: "斜光特写 → 局部做工 → 桌面全景", categoryId: "home" },
  { id: 13, name: "分区功能图解", flow: "全貌标注 → 逐区引线 → 接口特写", categoryId: "3c" },
  { id: 14, name: "收纳实测反转", flow: "配件钩子 → 偏见反转 → 前后对比", categoryId: "daily" },
  { id: 15, name: "白底平铺解构", flow: "正反平铺 → 材质微距 → 四格卖点", categoryId: "fashion" },
  { id: 16, name: "暗光微距质感", flow: "佩戴特写 → 材质微距 → 上手收尾", categoryId: "bag" },
  { id: 17, name: "软萌摆位种草", flow: "萌物特写 → 双场景引线 → 互动提问", categoryId: "toy" },
  { id: 18, name: "多功能卖点实测", flow: "桌面钩子 → 功能实测 → 极简陈列", categoryId: "3c" },
  { id: 19, name: "高颜值陈列", flow: "静物陈列 → 细节全貌 → 大小展示", categoryId: "beauty" },
  { id: 20, name: "卖点图解海报", flow: "核心面板 → 分步图解 → 参数总结", categoryId: "3c" },
  { id: 21, name: "便签记录真人测评", flow: "多件合集 → 逐一展示 → 搭配总结", categoryId: "fashion" },
  { id: 22, name: "极简好物清单", flow: "合集钩子 → 单品详解 → 礼貌收尾", categoryId: "daily" },
  { id: 23, name: "核心卖点图解", flow: "全貌展示 → 细节拆解 → 包装收尾", categoryId: "tool" },
  { id: 24, name: "沉浸开箱展示", flow: "托举全貌 → 细节展示 → 礼盒收尾", categoryId: "toy" },
  { id: 25, name: "复古家居场景陈列", flow: "角落点缀 → 全景陈列 → 换位搭配", categoryId: "home" },
  { id: 26, name: "场景融入图鉴", flow: "空间一 → 多角融入 → 局部收尾", categoryId: "home" },
  { id: 27, name: "空满状态全解", flow: "空置悬念 → 逐步满载 → 多面收尾", categoryId: "daily" },
  { id: 28, name: "日常上身穿搭实录", flow: "单品上身 → 多场变换 → 全身收尾", categoryId: "fashion" },
  { id: 29, name: "日常随拍展示", flow: "自然使用 → 多角度细节 → 整体全景", categoryId: "outdoor" },
  { id: 30, name: "上身试穿与细节", flow: "上身效果 → 细节展示 → 全身版型", categoryId: "fashion" },
  { id: 31, name: "沉浸开箱试穿", flow: "开箱静物 → 多场景上身 → 细节收尾", categoryId: "fashion" },
  { id: 32, name: "沉浸式日常随拍", flow: "随手取用 → 使用细节 → 自然收尾", categoryId: "daily" },
  { id: 33, name: "多款细节展示", flow: "多款陈列 → 悬挂细节 → 单手特写", categoryId: "bag" },
  { id: 34, name: "出行安抚种草", flow: "收纳展示 → 途中实操 → 情绪收尾", categoryId: "outdoor" },
  { id: 35, name: "沉浸式细节展示", flow: "全貌陈列 → 局部特写 → 细节收尾", categoryId: "bag" },
  { id: 36, name: "硬核卖点讲解", flow: "全貌钩子 → 细节卖点 → 场景收尾", categoryId: "tool" },
  { id: 37, name: "细节到户外上身", flow: "款式全览 → 尺寸细节 → 场景佩戴", categoryId: "outdoor" },
  { id: 38, name: "清洁实测讲解", flow: "麻烦现场 → 逐步使用 → 收尾全貌", categoryId: "daily" },
  { id: 39, name: "硬核好物展示", flow: "全貌钩子 → 细节展示 → 互动收尾", categoryId: "tool" },
  { id: 40, name: "阶段见效打卡", flow: "阶段打卡 → 见效变化 → 产品细节", categoryId: "health" },
  { id: 41, name: "日常对照图解", flow: "使用情境 → 特点用法 → 实拍收尾", categoryId: "health" },
  { id: 42, name: "理想到痛点反转", flow: "理想期望 → 连环痛点 → 给出解法", categoryId: "daily" },
  { id: 43, name: "多肤色真人试色", flow: "色号定调 → 多色并测 → 色号总览", categoryId: "beauty" },
  { id: 44, name: "真实蜕变记录", flow: "痛点特写 → 过程记录 → 揭晓好物", categoryId: "health" },
  { id: 45, name: "痛点替代展示", flow: "普通现状 → 升级替换 → 多场景用", categoryId: "3c" },
  { id: 46, name: "真实情境独白", flow: "情绪带入 → 细节感受 → 情绪收尾", categoryId: "daily" },
  { id: 47, name: "走心情感共鸣", flow: "风景独白 → 情感唤醒 → 抚慰下单", categoryId: "health" },
  { id: 48, name: "硬核图解讲解", flow: "全景卖点 → 结构剖析 → 适用情境", categoryId: "tool" },
  { id: 49, name: "复古电影感穿搭", flow: "造型亮相 → 穿着细节 → 场景收尾", categoryId: "fashion" },
];

/** 生成设置下拉的枚举（与目标站点选项一致） */
export const ECOMMERCE_PLATFORMS = ["TikTok", "小红书", "Instagram"] as const;
export const ECOMMERCE_MARKETS = [
  "美国", "欧洲", "中国大陆", "俄罗斯", "东南亚", "西班牙", "德国", "日本", "韩国", "巴西", "墨西哥",
] as const;
export const ECOMMERCE_LANGUAGES = ["英文", "简体中文", "繁體中文", "日本語", "한국어", "Español", "Deutsch"] as const;
export const ECOMMERCE_RATIOS = ["1:1", "4:5", "9:16", "3:4", "4:3"] as const;
