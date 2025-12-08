![logo](https://github.com/PrettyCoffee/fluidity/blob/main/public/logo192.png)

# Fluidity - 优雅的手风琴式起始页

一款功能丰富的浏览器新标签页扩展，支持手风琴式链接管理、AI 智能助手、主题生成、待办事项等功能。

## 功能特性

### 核心功能
- **手风琴式链接** - 经典的水平展开链接分组，支持音效反馈
- **悬浮卡片模式** - 悬停显示链接卡片，简洁优雅
- **命令面板** - 按 `/` 键快速搜索链接，高效导航
- **快捷搜索** - 支持多搜索引擎，可配置快捷词跳转

### AI 智能功能
- **AI 问候语** - 根据你的使用习惯生成个性化问候
- **AI 主题生成** - 用自然语言描述，自动生成配色方案
- **AI 链接整理** - 智能分析和整理你的链接分组

### 个性化
- **13+ 预设主题** - 包括 Catppuccin、Gruvbox、Dark Souls 等
- **完全自定义** - 6 种颜色变量，支持自定义背景图
- **数据导入导出** - 轻松备份和迁移你的配置

### 效率工具
- **待办事项** - 简洁的任务管理，支持贡献图表
- **周报/月报** - 自动生成使用统计报告
- **快捷词跳转** - 输入关键词直接跳转到指定网站

## 安装方式

### 方式一：浏览器扩展商店（推荐）
- Chrome Web Store（即将上线）
- Edge Add-ons（即将上线）

### 方式二：手动安装
1. 下载最新的 `fluidity.zip` 发布包
2. 解压到本地文件夹
3. 打开浏览器扩展管理页面（`chrome://extensions` 或 `edge://extensions`）
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压后的文件夹

### 方式三：在线使用
访问 [Live Demo](https://prettycoffee.github.io/fluidity/) 体验在线版本。

## 快速开始

1. **首次使用** - 安装后打开新标签页，会看到引导教程
2. **添加链接** - 点击右下角设置图标 → 链接设置
3. **切换主题** - 设置 → 外观设置 → 选择预设主题
4. **启用 AI** - 设置 → AI 助手 → 配置 DeepSeek API Key

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `/` | 打开命令面板（命令面板模式下） |
| `Enter` | 搜索或跳转 |
| `Esc` | 关闭弹窗/面板 |

## 开发指南

### 环境要求
- Node.js 18+
- npm 或 yarn

### 本地开发
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 项目结构
```
src/
├── Startpage/          # 主页面组件
│   ├── LinkContainer/  # 链接容器（手风琴/悬浮卡片/命令面板）
│   ├── Settings/       # 设置面板
│   ├── Todo/           # 待办事项
│   └── Report/         # 周报/月报
├── components/         # 通用组件
├── services/           # 服务层（AI、数据备份等）
├── data/               # 数据定义
└── utils/              # 工具函数
```

## Docker 部署

```bash
# 构建镜像
docker build ./ -t fluidity

# 运行容器
docker run -d --name fluidity -p 8080:80 fluidity
```

访问 `http://localhost:8080` 即可使用。

## 致谢

- [Pictures - DeathAndMilk](https://www.instagram.com/deathandmilk_/)
- [Icons - FontAwesome](https://fontawesome.com/icons)
- [Text Flicker - CodeMyUI](https://codemyui.com/crt-screen-text-flicker-animation-in-pure-css/)
- [Wave Animation - mburakerman](https://codepen.io/mburakerman/pen/eRZZEv)

## 许可证

MIT License

---

如有问题或建议，欢迎 [提交 Issue](https://github.com/PrettyCoffee/fluidity/issues)！
