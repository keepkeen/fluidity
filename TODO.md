# Fluidity Browser Usage Analytics - TODO

目标：仅统计当前浏览器（安装本扩展的浏览器）的使用时长，参考 ActivityWatch 的“心跳 + AFK + flooding 合并”思路；把汇总数据接入 AI 提示语、周报/月报，并生成搜索栏默认推荐标签；同时纳入现有云同步/备份。

## 里程碑

### M1：采集与存储（Heartbeats → Segments → Daily aggregates）
- [x] MV3 添加 `background.service_worker` 与 `content_scripts`
- [x] content script：每 5s 发送心跳（url/title/ts/visible）
- [x] background：接收心跳 + `chrome.idle` AFK 判定 + flooding 合并
- [x] 按天聚合持久化：总时长、按域名、按页面、按小时（24h）
- [x] 数据保留策略：明细保留 N 天（默认 30）并清理
- [x] 精度优化：切换 tab/隐藏页面时发送 stop（参考 AW “payload 变化时刷新旧 heartbeat”）
- [x] 体验优化：聚合数据随心跳实时累加（不等 segment close），避免“今日屏幕时间”不更新的错觉

### M2：AI 提示语（最近 1 小时 + 今天汇总）
- [x] 新 prompt：包含最近 1 小时 + 今日汇总（并结合待办/点击/搜索）
- [x] 输出 1 句话；可提醒喝水/休息（但不唠叨）
- [ ] 隐私：页面级明细 TOP N 可配置（当前固定 top 8/10，且 URL 默认去 query/hash）

### M3：智能导航（AI 推荐标签 → 搜索栏默认建议）
- [x] 复用发送“今日汇总”的上下文，让 AI 生成 `tags[]`
- [x] 保存 `tags`（按天缓存）并在搜索栏空输入时优先展示
- [x] 增加全局快捷键设置入口（呼出 `/` 链接搜索面板）
- [x] 任意页面呼出：通过内容脚本注入 Shadow DOM + iframe 打开链接搜索面板（不再强制打开新标签页）

### M4：周报/月报增强
- [x] 周报：加入上周浏览器使用时长、TOP domains/pages
- [x] 月报：加入上月浏览器使用时长、TOP domains/pages、时段分布（基于时长）
- [x] AI 周报/月报 prompt 增补 usage 汇总（控制 token）
- [x] 主页轮播：新增“今日屏幕时间”卡片（Top 5 域名）

### M5：同步/备份
- [x] 云同步：把 usage 数据纳入现有 gist sync（监听 `chrome.storage` 变化触发 push）
- [x] 云同步：对高频 usage 变更做节流（首个变更 2 分钟后推送，之后最多每 1 小时推送一次）
- [x] 导入/导出：把 usage 数据纳入 DataSettings 的备份文件（包含 `chrome.storage.local`）

## 其他优化
- [x] Favicon：抓取结果缓存 + 持久化到 `link-groups`（避免每次打开都重新探测多个来源）

## 实施细节（需要确认/可选）
- [ ] 是否记录完整 URL（默认去掉 query/hash；可选关闭）
- [ ] 每日推荐标签数量（默认 6–10）
- [ ] 统计窗口定义：仅前台可见 tab 且非 idle（AFK 阈值默认 60s）
