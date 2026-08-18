import { queryToken } from "../Startpage/Searchbar/Searchbar"

export interface dataElem {
  label: string
  value: string
  /**
   * Cached favicon URL (nullable).
   * Stored with the link so it participates in backup/sync via `link-groups`.
   */
  icon?: string | null
}

export interface linkGroup {
  title: string
  links: dataElem[]
}

export const links: linkGroup[] = [
  {
    title: "Reddit",
    links: [
      {
        label: "r/startpages",
        value: "https://www.reddit.com/r/startpages/",
      },
      {
        label: "r/unixporn",
        value: "https://www.reddit.com/r/unixporn/",
      },
      {
        label: "r/rainmeter",
        value: "https://www.reddit.com/r/rainmeter/",
      },
      {
        label: "r/AnimalsBeingDerps",
        value: "https://www.reddit.com/r/AnimalsBeingDerps/",
      },
    ],
  },
  {
    title: "3D Modelling",
    links: [
      {
        label: "Blender",
        value: "https://www.blender.org/",
      },
      {
        label: "BlenderGuru",
        value: "https://www.blenderguru.com/",
      },
      {
        label: "Poliigon",
        value: "https://www.poliigon.com/",
      },
      {
        label: "Blender tutorial",
        value:
          "https://www.youtube.com/watch?v=NyJWoyVx_XI&list=PLjEaoINr3zgEq0u2MzVgAaHEBt--xLB6U",
      },
      {
        label: "The other Blender tutorial",
        value:
          "https://www.youtube.com/watch?v=bpvh-9H8S1g&list=PL8eKBkZzqDiU-qcoaghCz04sMitC1yx6k&index=1",
      },
    ],
  },
  {
    title: "Design",
    links: [
      {
        label: "PixlrX",
        value: "https://pixlr.com/x/",
      },
      {
        label: "AI Image Enlarger",
        value: "https://bigjpg.com/en",
      },
      {
        label: "Img to Svg Converter",
        value: "https://picsvg.com/",
      },
      {
        label: "Affinity",
        value: "https://affinity.serif.com/en-us/tutorials/designer/desktop/",
      },
      {
        label: "Affinity - YT",
        value: "https://www.youtube.com/c/AffinityRevolution/playlists",
      },
    ],
  },
  {
    title: "Music",
    links: [
      {
        label: "i wanna be a cowboy",
        value: "https://www.youtube.com/watch?v=8zWz92f_HGs",
      },
      {
        label: "let the bodies hit the floor",
        value: "https://www.youtube.com/watch?v=b--VKaCB9u0",
      },
      {
        label: "Nobody Kanna Cross It",
        value: "https://www.youtube.com/watch?v=2wqTnwJGvtc",
      },
      {
        label: "Smug Dancin",
        value: "https://www.youtube.com/watch?v=eNZ9Od1jQ4Q",
      },
      {
        label: "Utamaru - The Sanctified Mind Cover",
        value: "https://www.youtube.com/watch?v=MHlJKLlS07U",
      },
    ],
  },
  {
    title: "Sauce",
    links: [
      {
        label: "Pictures - DeathAndMilk",
        value: "https://www.instagram.com/deathandmilk_/",
      },
      {
        label: "Icons - FontAwesome",
        value: "https://fontawesome.com/icons",
      },
      {
        label: "Text Flicker - CodeMyUI",
        value:
          "https://codemyui.com/crt-screen-text-flicker-animation-in-pure-css/",
      },
      {
        label: "Wave Animation - mburakerman",
        value: "https://codepen.io/mburakerman/pen/eRZZEv",
      },
      {
        label: "Da real sauce ԅ(♡﹃♡ԅ)",
        value: "https://www.youtube.com/watch?v=qr89xoZyE1g",
      },
      {
        label: "Even more real sauce ( ͡° ͜ʖ ͡°)",
        value: "https://www.youtube.com/watch?v=VLhJOd_TFiI",
      },
    ],
  },
]

export const images: dataElem[] = [
  { label: "月泊", value: "wallpapers/yuebo.svg" },
  { label: "暮山", value: "wallpapers/mushan.svg" },
  { label: "松风", value: "wallpapers/songfeng.svg" },
  { label: "胭脂", value: "wallpapers/yanzhi.svg" },
  { label: "霜晨", value: "wallpapers/shuangchen.svg" },
  { label: "烟青", value: "wallpapers/yanqing.svg" },
]

// 搜索引擎接口 - 包含快捷键
export interface SearchEngine {
  label: string
  value: string
  shortcut: string // 快捷键，如 "g" 代表 Google
}

export const searchEngines: SearchEngine[] = [
  {
    label: "Google",
    value: `https://www.google.com/search?q=${queryToken}`,
    shortcut: "g",
  },
  {
    label: "百度",
    value: `https://www.baidu.com/s?wd=${queryToken}`,
    shortcut: "bd",
  },
  {
    label: "Bing",
    value: `https://www.bing.com/search?q=${queryToken}`,
    shortcut: "bi",
  },
  {
    label: "DuckDuckGo",
    value: `https://duckduckgo.com/?q=${queryToken}`,
    shortcut: "d",
  },
  {
    label: "Yandex",
    value: `https://yandex.com/search/?text=${queryToken}`,
    shortcut: "y",
  },
  {
    label: "Yahoo",
    value: `https://search.yahoo.com/search?p=${queryToken}`,
    shortcut: "yh",
  },
  {
    label: "Ecosia",
    value: `https://ecosia.org/search/?q=${queryToken}`,
    shortcut: "e",
  },
  {
    label: "Qwant",
    value: `https://qwant.com/?q=${queryToken}`,
    shortcut: "q",
  },
  {
    label: "搜狗",
    value: `https://www.sogou.com/web?query=${queryToken}`,
    shortcut: "sg",
  },
  {
    label: "知乎",
    value: `https://www.zhihu.com/search?type=content&q=${queryToken}`,
    shortcut: "zh",
  },
  {
    label: "GitHub",
    value: `https://github.com/search?q=${queryToken}`,
    shortcut: "gh",
  },
  {
    label: "YouTube",
    value: `https://www.youtube.com/results?search_query=${queryToken}`,
    shortcut: "yt",
  },
  {
    label: "Bilibili",
    value: `https://search.bilibili.com/all?keyword=${queryToken}`,
    shortcut: "bl",
  },
  {
    label: "Wikipedia",
    value: `https://en.wikipedia.org/wiki/Special:Search?search=${queryToken}`,
    shortcut: "w",
  },
]

// 根据快捷键查找搜索引擎
export const findEngineByShortcut = (
  shortcut: string,
  customEngines: SearchEngine[] = []
): SearchEngine[] => {
  const allEngines = [...searchEngines, ...customEngines]
  const lowerShortcut = shortcut.toLowerCase()
  return allEngines.filter(
    engine =>
      engine.shortcut.toLowerCase() === lowerShortcut ||
      engine.shortcut.toLowerCase().startsWith(lowerShortcut)
  )
}

export type FastForwards = Record<string, string>

export interface Search {
  engine: string
  placeholder?: string
  fastForward: FastForwards
  openInNewTab?: boolean // 是否在新标签页打开搜索结果
  customEngines?: SearchEngine[] // 用户自定义搜索引擎
}

export const searchSettings: Search = {
  engine: searchEngines[0].value,
  placeholder: "搜索标签、拼音或网页，@ 切换引擎",
  fastForward: {
    deepl: "https://deepl.com/",
    maps: "https://google.de/maps/",
    reddit: "https://reddit.com/",
    github: "https://github.com/",
    gitlab: "https://gitlab.com/",
    youtube: "https://youtube.com/",
  },
  customEngines: [],
  openInNewTab: false,
}

// 链接展示模式
export type LinkDisplayMode = "accordion" | "grid" | "command-palette"

export interface LinkDisplaySettings {
  mode: LinkDisplayMode
  openInNewTab: boolean // 链接是否在新标签页打开
  accordionHeight?: number // 手风琴自定义高度 (px)
  accordionContentWidth?: number // 手风琴展开内容自定义宽度 (px)
}

export const linkDisplaySettings: LinkDisplaySettings = {
  mode: "accordion", // 默认使用手风琴模式
  openInNewTab: false, // 默认在当前页面打开
  accordionHeight: undefined, // 默认自动计算
  accordionContentWidth: undefined, // 默认自动计算
}

// 壁纸来源类型
export type WallpaperSource =
  | "preset" // 预设图片
  | "custom-url" // 自定义 URL
  | "local" // 本地上传
  | "bing-daily" // Bing 每日壁纸

// 壁纸显示模式
export type WallpaperDisplayMode =
  | "fullscreen" // 全屏背景
  | "card" // 卡片内显示（现有行为）

// 卡片显示模式
export type CardDisplayMode =
  | "full" // 显示部件网格
  | "tools-only" // 历史值，等同 full
  | "hidden" // 完全隐藏

// 布局模式
export type LayoutMode =
  | "carousel" // 轮播图模式
  | "dashboard" // 仪表盘/网格模式

// Bing 壁纸地区
export type BingRegion = "cn" | "en-US" | "ja-JP" | "de-DE"

// 壁纸设置接口
export interface WallpaperSettings {
  source: WallpaperSource
  followTheme: boolean
  displayMode: WallpaperDisplayMode
  presetImage: string
  customUrl: string
  localImageData: string | null
  bingRegion: BingRegion
  // 全屏背景效果
  blur: number // 0-20
  brightness: number // 0.3-1.5
  overlay: boolean
  overlayOpacity: number // 0-0.8
}

// 卡片区域设置（部件网格）
export interface CardAreaSettings {
  displayMode: CardDisplayMode
}

// 壁纸设置默认值
export const defaultWallpaperSettings: WallpaperSettings = {
  source: "preset",
  followTheme: true,
  displayMode: "fullscreen",
  presetImage: "",
  customUrl: "",
  localImageData: null,
  bingRegion: "cn",
  blur: 0,
  brightness: 1,
  overlay: true,
  overlayOpacity: 0.3,
}

// 卡片区域设置默认值
export const defaultCardAreaSettings: CardAreaSettings = {
  displayMode: "full",
}

/**
 * 颜色系统 - 13 色，按用途严格分类
 *
 * 背景层（3色）- 页面层级背景
 * 文字层（3色）- 文字颜色
 * 边框层（2色）- 边框颜色
 * 强调层（3色）- 强调/交互颜色
 * 功能层（2色）- 特殊功能颜色
 */
export interface colorsType {
  [key: string]: string

  // ===== 背景层 =====
  "--bg-primary": string // 页面主背景
  "--bg-secondary": string // 卡片/面板/输入框背景
  "--bg-hover": string // 悬停状态背景

  // ===== 文字层 =====
  "--text-primary": string // 主要文字（标题、正文）
  "--text-secondary": string // 次要文字（说明、标签）
  "--text-muted": string // 弱化文字（占位符、禁用）

  // ===== 边框层 =====
  "--border-default": string // 普通边框（输入框、卡片）
  "--border-active": string // 激活边框（焦点、选中）

  // ===== 强调层 =====
  "--accent": string // 主强调色（按钮、链接、选中项）
  "--accent-hover": string // 强调色悬停状态
  "--accent-text": string // 强调色背景上的文字

  // ===== 功能层 =====
  "--success": string // 成功/完成状态
  "--glow": string // 阴影/发光效果
}

export interface Theme {
  name: string
  colors: colorsType
  image: string
}

export const themes: Theme[] = [
  {
    name: "月泊",
    image: "wallpapers/yuebo.svg",
    colors: {
      "--bg-primary": "#1C2230",
      "--bg-secondary": "#161B27",
      "--bg-hover": "#2A3245",
      "--text-primary": "#DFE6F2",
      "--text-secondary": "#9DA9BF",
      "--text-muted": "#5F6B80",
      "--border-default": "#333D52",
      "--border-active": "#8FB8E8",
      "--accent": "#8FB8E8",
      "--accent-hover": "#A9CBF2",
      "--accent-text": "#161D2B",
      "--success": "#9FE8C3",
      "--glow": "#8FB8E8",
    },
  },
  {
    name: "暮山",
    image: "wallpapers/mushan.svg",
    colors: {
      "--bg-primary": "#241E28",
      "--bg-secondary": "#1C171F",
      "--bg-hover": "#352C3A",
      "--text-primary": "#F0E7E0",
      "--text-secondary": "#B3A6A8",
      "--text-muted": "#6E6270",
      "--border-default": "#3E3542",
      "--border-active": "#E8B08F",
      "--accent": "#E8B08F",
      "--accent-hover": "#F2C4A9",
      "--accent-text": "#241E28",
      "--success": "#B5D9A8",
      "--glow": "#E8B08F",
    },
  },
  {
    name: "松风",
    image: "wallpapers/songfeng.svg",
    colors: {
      "--bg-primary": "#1E2420",
      "--bg-secondary": "#171C18",
      "--bg-hover": "#2C352E",
      "--text-primary": "#E2EAE2",
      "--text-secondary": "#A3B2A6",
      "--text-muted": "#657563",
      "--border-default": "#344038",
      "--border-active": "#A8CBA0",
      "--accent": "#A8CBA0",
      "--accent-hover": "#BCDCB4",
      "--accent-text": "#1E2420",
      "--success": "#8FD9B8",
      "--glow": "#A8CBA0",
    },
  },
  {
    name: "胭脂",
    image: "wallpapers/yanzhi.svg",
    colors: {
      "--bg-primary": "#262024",
      "--bg-secondary": "#1D181B",
      "--bg-hover": "#382E35",
      "--text-primary": "#F2E6EC",
      "--text-secondary": "#B8A6B0",
      "--text-muted": "#70616B",
      "--border-default": "#423540",
      "--border-active": "#E89FB8",
      "--accent": "#E89FB8",
      "--accent-hover": "#F2B4C9",
      "--accent-text": "#262024",
      "--success": "#A8D9C0",
      "--glow": "#E89FB8",
    },
  },
  {
    name: "霜晨",
    image: "wallpapers/shuangchen.svg",
    colors: {
      "--bg-primary": "#F4F1EC",
      "--bg-secondary": "#FBF9F6",
      "--bg-hover": "#E7E2D9",
      "--text-primary": "#2E3138",
      "--text-secondary": "#5C6270",
      "--text-muted": "#9BA0AB",
      "--border-default": "#D8D2C6",
      "--border-active": "#4A6B8F",
      "--accent": "#4A6B8F",
      "--accent-hover": "#3D5A7A",
      "--accent-text": "#F7F5F1",
      "--success": "#3E8E6A",
      "--glow": "#A9C4E0",
    },
  },
  {
    name: "烟青",
    image: "wallpapers/yanqing.svg",
    colors: {
      "--bg-primary": "#1B2426",
      "--bg-secondary": "#141C1E",
      "--bg-hover": "#29383B",
      "--text-primary": "#DEEAEA",
      "--text-secondary": "#9BB0B0",
      "--text-muted": "#5D7070",
      "--border-default": "#304042",
      "--border-active": "#8FD0CC",
      "--accent": "#8FD0CC",
      "--accent-hover": "#A9E0DC",
      "--accent-text": "#1B2426",
      "--success": "#A0E0B8",
      "--glow": "#8FD0CC",
    },
  },
]
