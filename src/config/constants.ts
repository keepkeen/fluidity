/**
 * 全局常量配置
 * 集中管理魔法数字和配置值
 */

// ============ 布局尺寸 ============

export const LAYOUT = {
  // 轮播图尺寸
  CAROUSEL: {
    SIZE_LARGE: 424,
    SIZE_MEDIUM: 350,
    SIZE_SMALL: 280,
    SIZE_MOBILE: "min(85vw, 320px)",
  },

  // 手风琴尺寸
  ACCORDION: {
    LINK_HEIGHT: 32, // 每个链接的高度 (px)
    MIN_HEIGHT: 120, // 最小高度
    MAX_HEIGHT: 600, // 最大高度
    DEFAULT_HEIGHT: 200, // 默认高度
    COMPACT_MIN_HEIGHT: 140,
    COMPACT_MAX_HEIGHT: 280,
    PADDING: 20, // 上下 padding

    // 宽度
    MIN_WIDTH: 100,
    MAX_WIDTH: 500,
    DEFAULT_WIDTH: 200,
  },

  // 设置窗口
  SETTINGS: {
    GAP: "var(--settings-window-gap)",
    CONTENT_WIDTH: 400,
  },
} as const

// ============ 动画时间 ============

export const ANIMATION = {
  // 过渡时间 (ms)
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,

  // 轮播
  CAROUSEL_FADE: 500,
  CAROUSEL_DEFAULT_INTERVAL: 5000,
  CAROUSEL_MIN_INTERVAL: 2000,
  CAROUSEL_MAX_INTERVAL: 15000,
} as const

// ============ 缓存配置 ============

export const CACHE = {
  // 搜索缓存
  SEARCH_TTL: 5000, // 5 秒
  SEARCH_MAX_SIZE: 50,

  // Bing 壁纸缓存
  BING_WALLPAPER_TTL: 6 * 60 * 60 * 1000, // 6 小时

  // AI 主题缓存
  AI_THEME_TTL: 24 * 60 * 60 * 1000, // 24 小时
} as const

// ============ 图片配置 ============

export const IMAGE = {
  // 本地图片上传
  MAX_SIZE_MB: 2,
  MAX_DIMENSION: 1920,
  JPEG_QUALITY: 0.85,

  // 压缩阈值
  COMPRESS_THRESHOLD_KB: 500,
} as const

// ============ 搜索配置 ============

export const SEARCH = {
  // 建议数量
  MAX_SUGGESTIONS: 5,
  MAX_LINK_SUGGESTIONS: 8,
  MAX_ENGINE_SUGGESTIONS: 8,

  // 模糊匹配
  FUZZY_MIN_SCORE: 10,
  EXACT_MIN_SCORE: 70,

  // 历史记录
  MAX_HISTORY: 20,
} as const

// ============ AI 配置 ============

export const AI = {
  // 重试
  MAX_RETRIES: 2,
  RETRY_DELAY: 1000,

  // 超时
  REQUEST_TIMEOUT: 30000,

  // 主题生成
  THEME_GENERATION_TIMEOUT: 60000,
} as const

// ============ 无障碍 ============

export const A11Y = {
  // 焦点管理
  FOCUS_VISIBLE_OUTLINE: "2px solid var(--accent-color)",
  FOCUS_VISIBLE_OFFSET: "2px",

  // 最小触摸目标
  MIN_TOUCH_TARGET: 44,

  // 对比度要求
  MIN_CONTRAST_RATIO: 4.5,
} as const

// ============ 本地存储键 ============

export const STORAGE_KEYS = {
  DESIGN: "design",
  THEMES: "themes",
  LINKS: "links",
  SEARCH: "search",
  LINK_DISPLAY: "link-display-settings",
  WALLPAPER: "wallpaper-settings",
  CARD_AREA: "card-area-settings",
  TODOS: "todos",
  SEARCH_HISTORY: "search-history",
  LINK_ANALYTICS: "link-analytics",
  BING_WALLPAPER_CACHE: "bing-wallpaper-cache",
  AI_SETTINGS: "ai-settings",
  AI_THEME_CACHE: "ai-theme-cache",
  ONBOARDING_COMPLETED: "onboarding-completed",
} as const
