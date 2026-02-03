import pic_1 from "./pictures/pic_1.jpg"
import pic_2 from "./pictures/pic_2.jpg"
import pic_3 from "./pictures/pic_3.jpg"
import pic_4 from "./pictures/pic_4.jpg"
import pic_5 from "./pictures/pic_5.jpg"
import pic_6 from "./pictures/pic_6.jpg"
import pic_7 from "./pictures/pic_7.jpg"
import pic_8 from "./pictures/pic_8.jpg"
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

/* eslint-disable */
/*
──────▄▌▐▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀​▀▀▀▀▀▀▌
───▄▄██▌█ BEEP BEEP
▄▄▄▌▐██▌█ GAY PORN DELIVERY
███████▌█▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄​▄▄▄▄▄▄▌
▀(@)▀▀▀▀▀▀▀(@)(@)▀▀▀▀▀▀▀▀▀▀▀▀▀​▀▀▀▀(@)▀
*/
/* eslint-enable */

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
  { label: "pic_1", value: pic_1 },
  { label: "pic_2", value: pic_2 },
  { label: "pic_3", value: pic_3 },
  { label: "pic_4", value: pic_4 },
  { label: "pic_5", value: pic_5 },
  { label: "pic_6", value: pic_6 },
  { label: "pic_7", value: pic_7 },
  { label: "pic_8", value: pic_8 },
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
  placeholder: "按 Enter 搜索，@ 切换引擎，/ 搜索链接",
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
export type LinkDisplayMode = "accordion" | "hover-card" | "command-palette"

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
  | "full" // 完整轮播：图片 + 待办 + 贡献图
  | "tools-only" // 仅工具：待办 + 贡献图
  | "hidden" // 完全隐藏

// Bing 壁纸地区
export type BingRegion = "cn" | "en-US" | "ja-JP" | "de-DE"

// 壁纸设置接口
export interface WallpaperSettings {
  source: WallpaperSource
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

// 轮播图片项
export interface CarouselImage {
  id: string
  src: string // 图片 URL 或 base64
  name: string // 图片名称
}

// 卡片区域设置
export interface CardAreaSettings {
  displayMode: CardDisplayMode
  autoRotate: boolean
  rotateInterval: number
  useCustomImages: boolean // 是否使用自定义图片
  customImages: CarouselImage[] // 自定义图片列表
}

// 壁纸设置默认值
export const defaultWallpaperSettings: WallpaperSettings = {
  source: "preset",
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
  autoRotate: true,
  rotateInterval: 5000,
  useCustomImages: false,
  customImages: [],
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
    name: "Catppuccin",
    image:
      "https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/logos/exports/1544x1544_circle.png",
    colors: {
      "--bg-primary": "#24273A",
      "--bg-secondary": "#1E2030",
      "--bg-hover": "#363A4F",
      "--text-primary": "#CAD3F5",
      "--text-secondary": "#A5ADCE",
      "--text-muted": "#6E738D",
      "--border-default": "#3A3E54",
      "--border-active": "#C6A0F6",
      "--accent": "#C6A0F6",
      "--accent-hover": "#B48EE0",
      "--accent-text": "#24273A",
      "--success": "#A6DA95",
      "--glow": "#C6A0F6",
    },
  },
  {
    name: "DeathAndMilk",
    image: pic_1,
    colors: {
      "--bg-primary": "#2E2E2E",
      "--bg-secondary": "#252525",
      "--bg-hover": "#3A3A3A",
      "--text-primary": "#E6E6E6",
      "--text-secondary": "#A8A8A8",
      "--text-muted": "#6E6E6E",
      "--border-default": "#4A4A4A",
      "--border-active": "#FFB4E6",
      "--accent": "#FFB4E6",
      "--accent-hover": "#FF9AD8",
      "--accent-text": "#2E2E2E",
      "--success": "#B4FFE6",
      "--glow": "#FFB4E6",
    },
  },
  {
    name: "Pop!OS",
    image:
      "https://oswallpapers.com/wp-content/uploads/2019/04/kate-hazen-unleash-your-robot.jpg",
    colors: {
      "--bg-primary": "#333136",
      "--bg-secondary": "#2A2A2D",
      "--bg-hover": "#48484D",
      "--text-primary": "#F2F2F2",
      "--text-secondary": "#B8B8B8",
      "--text-muted": "#6E6E72",
      "--border-default": "#4A484D",
      "--border-active": "#FCD307",
      "--accent": "#FCD307",
      "--accent-hover": "#E5BF00",
      "--accent-text": "#333136",
      "--success": "#73C48F",
      "--glow": "#FCD307",
    },
  },
  {
    name: "Dark Souls",
    image:
      "https://i.pinimg.com/originals/16/74/db/1674dbae45cd38f3d3b4c00dc8616bd7.gif",
    colors: {
      "--bg-primary": "#32323C",
      "--bg-secondary": "#28282F",
      "--bg-hover": "#42424C",
      "--text-primary": "#A0A08C",
      "--text-secondary": "#787870",
      "--text-muted": "#505048",
      "--border-default": "#4A4A52",
      "--border-active": "#9A6650",
      "--accent": "#9A6650",
      "--accent-hover": "#8A5640",
      "--accent-text": "#E8E8D8",
      "--success": "#6B8E6B",
      "--glow": "#9A6650",
    },
  },
  {
    name: "S.E.Lain",
    image:
      "https://64.media.tumblr.com/54a945edd2641e20859d6f6537cd7423/tumblr_pwa4bogz4N1qze3hdo2_r1_500.gifv",
    colors: {
      "--bg-primary": "#0A1A25",
      "--bg-secondary": "#061218",
      "--bg-hover": "#152535",
      "--text-primary": "#A6B7AB",
      "--text-secondary": "#7A8A80",
      "--text-muted": "#4A5A50",
      "--border-default": "#1E2E39",
      "--border-active": "#94656B",
      "--accent": "#94656B",
      "--accent-hover": "#84555B",
      "--accent-text": "#E8E8E8",
      "--success": "#6B946B",
      "--glow": "#94656B",
    },
  },
  {
    name: "Kitties",
    image:
      "https://64.media.tumblr.com/5a232d5c0999d02388d78e5c1025f94f/0572516693bf4014-3d/s500x750/0306dc89b657093529aa3ce96e64b9c43572e901.gifv",
    colors: {
      "--bg-primary": "#495662",
      "--bg-secondary": "#3E4A55",
      "--bg-hover": "#5A6672",
      "--text-primary": "#D1F1FA",
      "--text-secondary": "#9BBCC4",
      "--text-muted": "#6A8A92",
      "--border-default": "#5E6B77",
      "--border-active": "#80AAD4",
      "--accent": "#80AAD4",
      "--accent-hover": "#6A9AC4",
      "--accent-text": "#2E3A45",
      "--success": "#A9D4A9",
      "--glow": "#80AAD4",
    },
  },
  {
    name: "pretty chill",
    image:
      "https://e4p7c9i3.stackpathcdn.com/wp-content/uploads/2019/05/tumblr_oymsnbT0111vjxiz1o1_1280.gif?iv=165",
    colors: {
      "--bg-primary": "#397D76",
      "--bg-secondary": "#2E6B65",
      "--bg-hover": "#4A8D86",
      "--text-primary": "#F1DABA",
      "--text-secondary": "#C4B49A",
      "--text-muted": "#8A7A5A",
      "--border-default": "#4E918A",
      "--border-active": "#C5BDB5",
      "--accent": "#C5BDB5",
      "--accent-hover": "#B5ADA5",
      "--accent-text": "#2E5A55",
      "--success": "#93A662",
      "--glow": "#C5BDB5",
    },
  },
  {
    name: "Tartarus",
    image:
      "https://64.media.tumblr.com/8de9e4d31a132f7617ecc05e6a0f8807/tumblr_nd048m6QFH1tqptlzo1_500.gifv",
    colors: {
      "--bg-primary": "#282828",
      "--bg-secondary": "#1D1D1D",
      "--bg-hover": "#3A3A3A",
      "--text-primary": "#D4BE98",
      "--text-secondary": "#A89878",
      "--text-muted": "#6A5A4A",
      "--border-default": "#3E3E3E",
      "--border-active": "#7DAEA3",
      "--accent": "#7DAEA3",
      "--accent-hover": "#6D9E93",
      "--accent-text": "#1D1D1D",
      "--success": "#A9B665",
      "--glow": "#7DAEA3",
    },
  },
  {
    name: "Pastel Aesthetic",
    image: "https://i.imgur.com/bZHurZn.jpeg",
    colors: {
      "--bg-primary": "#2E2E2E",
      "--bg-secondary": "#252525",
      "--bg-hover": "#3A3A3A",
      "--text-primary": "#F3C9CB",
      "--text-secondary": "#C4A0A2",
      "--text-muted": "#8A6A6C",
      "--border-default": "#4A4A4A",
      "--border-active": "#6D79BF",
      "--accent": "#6D79BF",
      "--accent-hover": "#5D69AF",
      "--accent-text": "#FBECEF",
      "--success": "#7DBF6D",
      "--glow": "#6D79BF",
    },
  },
  {
    name: "Bohemian",
    image: "https://i.imgur.com/gcZ6fmk.jpeg",
    colors: {
      "--bg-primary": "#2E2E2E",
      "--bg-secondary": "#252525",
      "--bg-hover": "#3A3A3A",
      "--text-primary": "#D6B29A",
      "--text-secondary": "#AA8E7A",
      "--text-muted": "#7A5E4A",
      "--border-default": "#4A4A4A",
      "--border-active": "#B35000",
      "--accent": "#B35000",
      "--accent-hover": "#A34000",
      "--accent-text": "#FBECEF",
      "--success": "#6B8E23",
      "--glow": "#B35000",
    },
  },
  {
    name: "Modern Boho",
    image: "https://i.imgur.com/HkEcwGl.jpeg",
    colors: {
      "--bg-primary": "#2E2E2E",
      "--bg-secondary": "#252525",
      "--bg-hover": "#3A3A3A",
      "--text-primary": "#E8C9A0",
      "--text-secondary": "#B8A080",
      "--text-muted": "#7A6A5A",
      "--border-default": "#4A4A4A",
      "--border-active": "#F6BC7C",
      "--accent": "#F6BC7C",
      "--accent-hover": "#E6AC6C",
      "--accent-text": "#2E2E2E",
      "--success": "#7C9A5C",
      "--glow": "#F6BC7C",
    },
  },
  {
    name: "Gruvbox Inspired Green",
    image: "https://i.imgur.com/ISjs7cg.jpeg",
    colors: {
      "--bg-primary": "#2E2E2E",
      "--bg-secondary": "#252525",
      "--bg-hover": "#3A3A3A",
      "--text-primary": "#EBDBB2",
      "--text-secondary": "#B8A882",
      "--text-muted": "#7A6A4A",
      "--border-default": "#4A4A4A",
      "--border-active": "#647D44",
      "--accent": "#647D44",
      "--accent-hover": "#546D34",
      "--accent-text": "#EBDBB2",
      "--success": "#98971A",
      "--glow": "#647D44",
    },
  },
  {
    name: "Beach",
    image: "https://i.imgur.com/gcW1jul.jpeg",
    colors: {
      "--bg-primary": "#2E2E2E",
      "--bg-secondary": "#252525",
      "--bg-hover": "#3A3A3A",
      "--text-primary": "#E3C9BC",
      "--text-secondary": "#B5A096",
      "--text-muted": "#7A6A5A",
      "--border-default": "#4A4A4A",
      "--border-active": "#91C6CC",
      "--accent": "#91C6CC",
      "--accent-hover": "#81B6BC",
      "--accent-text": "#2E2E2E",
      "--success": "#7CB891",
      "--glow": "#91C6CC",
    },
  },
]
