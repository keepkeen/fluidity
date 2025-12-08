/**
 * AI 报告生成服务
 * 生成周报/月报的 AI 点评
 */

import { getWeeklyAchievements, getMonthlyAchievements } from "./achievements"
import { AISettingsManager, callDeepSeekAPI } from "./ai"
import { getAnalyticsSummary } from "./analytics"
import { TodoContributions } from "./contributions"

const CACHE_KEY = "report-cache"

interface ReportCache {
  weeklyReport?: {
    weekId: string
    summary: string
    timestamp: number
  }
  monthlyReport?: {
    monthId: string
    summary: string
    timestamp: number
  }
}

interface WeeklyStats {
  todosCompleted: number
  prevWeekTodos: number
  linkClicks: number
  searches: number
  mostActiveDay: string
  activeDays: number
  topLink: string | null
  achievements: string[]
}

interface MonthlyStats {
  todosCompleted: number
  prevMonthTodos: number
  linkClicks: number
  searches: number
  mostActiveHour: string
  activeDays: number
  daysInMonth: number
  topLinks: string[]
  achievements: string[]
  monthName: string
}

/**
 * 缓存管理
 */
const ReportCache = {
  get(): ReportCache {
    try {
      const data = localStorage.getItem(CACHE_KEY)
      return data ? (JSON.parse(data) as ReportCache) : {}
    } catch {
      return {}
    }
  },

  set(cache: ReportCache): void {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  },

  getWeekly(weekId: string): string | null {
    const cache = this.get()
    if (cache.weeklyReport?.weekId === weekId) {
      return cache.weeklyReport.summary
    }
    return null
  },

  setWeekly(weekId: string, summary: string): void {
    const cache = this.get()
    cache.weeklyReport = { weekId, summary, timestamp: Date.now() }
    this.set(cache)
  },

  getMonthly(monthId: string): string | null {
    const cache = this.get()
    if (cache.monthlyReport?.monthId === monthId) {
      return cache.monthlyReport.summary
    }
    return null
  },

  setMonthly(monthId: string, summary: string): void {
    const cache = this.get()
    cache.monthlyReport = { monthId, summary, timestamp: Date.now() }
    this.set(cache)
  },
}

/**
 * 获取活跃时段描述
 */
const getActiveHourDescription = (hours: number[] | undefined): string => {
  if (!hours || hours.length === 0) return "暂无数据"

  const maxHour = hours.indexOf(Math.max(...hours))

  if (maxHour >= 5 && maxHour < 9) return "早晨 (5:00-9:00)"
  if (maxHour >= 9 && maxHour < 12) return "上午 (9:00-12:00)"
  if (maxHour >= 12 && maxHour < 14) return "中午 (12:00-14:00)"
  if (maxHour >= 14 && maxHour < 18) return "下午 (14:00-18:00)"
  if (maxHour >= 18 && maxHour < 22) return "晚上 (18:00-22:00)"
  return "深夜 (22:00-5:00)"
}

/**
 * 获取周报统计数据
 */
export const getWeeklyStats = (): WeeklyStats => {
  const summary = getAnalyticsSummary()
  const achievements = getWeeklyAchievements()
  const mostProductive = TodoContributions.getMostProductiveDay(-1)

  return {
    todosCompleted: TodoContributions.getLastWeekTotal(),
    prevWeekTodos: TodoContributions.getWeekBeforeLastTotal(),
    linkClicks: summary.totalClicks,
    searches: summary.totalSearches,
    mostActiveDay: mostProductive.weekday
      ? `周${mostProductive.weekday}`
      : "无",
    activeDays: TodoContributions.getActiveDaysInWeek(-1),
    topLink: summary.topLinks[0]?.label || null,
    achievements: achievements.map(a => `${a.icon} ${a.name}`),
  }
}

/**
 * 获取月报统计数据
 */
export const getMonthlyStats = (): MonthlyStats => {
  const summary = getAnalyticsSummary()
  const achievements = getMonthlyAchievements()

  const now = new Date()
  const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth()
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const monthData = TodoContributions.getMonthData(year, lastMonth)
  const daysInMonth = new Date(year, lastMonth, 0).getDate()

  const monthNames = [
    "1月",
    "2月",
    "3月",
    "4月",
    "5月",
    "6月",
    "7月",
    "8月",
    "9月",
    "10月",
    "11月",
    "12月",
  ]

  return {
    todosCompleted: TodoContributions.getLastMonthTotal(),
    prevMonthTodos: TodoContributions.getMonthBeforeLastTotal(),
    linkClicks: summary.totalClicks,
    searches: summary.totalSearches,
    mostActiveHour: getActiveHourDescription(summary.activeHours),
    activeDays: monthData.filter(d => d.count > 0).length,
    daysInMonth,
    topLinks: summary.topLinks.slice(0, 5).map(l => l.label),
    achievements: achievements.map(a => `${a.icon} ${a.name}`),
    monthName: monthNames[lastMonth - 1],
  }
}

/**
 * 生成周报 Prompt
 */
const generateWeeklyPrompt = (stats: WeeklyStats): string => {
  return `你是一个友好的个人助手。请根据以下用户上周的活动数据，生成一段简短、有趣、鼓励性的周报总结（不超过80字）：

上周数据：
- 完成待办: ${stats.todosCompleted} 个 (上上周: ${stats.prevWeekTodos} 个)
- 链接点击: ${stats.linkClicks} 次
- 搜索次数: ${stats.searches} 次
- 最活跃的一天: ${stats.mostActiveDay}
- 活跃天数: ${stats.activeDays}/7 天
- 最常访问: ${stats.topLink ?? "无"}
- 获得成就: ${stats.achievements.join(", ") || "无"}

要求：
1. 语气轻松友好，像朋友一样
2. 根据数据给出正面的评价或鼓励
3. 如果数据较少，鼓励用户多使用
4. 可以适当使用 emoji，但不要过多（最多2个）
5. 不要说"根据数据"之类的话，要自然
6. 如果有进步要表扬，如果下降要鼓励

只输出总结内容，不要有其他内容。`
}

/**
 * 生成月报 Prompt
 */
const generateMonthlyPrompt = (stats: MonthlyStats): string => {
  const diff = stats.todosCompleted - stats.prevMonthTodos
  const diffText =
    diff > 0
      ? `比上月多 ${diff} 个`
      : diff < 0
      ? `比上月少 ${-diff} 个`
      : "与上月持平"

  return `你是一个友好的个人助手。请根据以下用户上月的活动数据，生成一段简短、有趣、鼓励性的月报总结（不超过100字）：

${stats.monthName}数据：
- 完成待办: ${stats.todosCompleted} 个 (${diffText})
- 链接点击: ${stats.linkClicks} 次
- 搜索次数: ${stats.searches} 次
- 最活跃时段: ${stats.mostActiveHour}
- 活跃天数: ${stats.activeDays}/${stats.daysInMonth} 天
- 最常访问: ${stats.topLinks.join(", ") || "无"}
- 获得成就: ${stats.achievements.join(", ") || "无"}

要求：
1. 语气轻松友好，像朋友一样
2. 对比上月数据，给出正面的评价
3. 如果有进步，要表扬；如果下降，要鼓励
4. 可以适当使用 emoji，但不要过多（最多2个）
5. 展望新的一月，给出简短的期望
6. 不要说"根据数据"之类的话，要自然

只输出总结内容，不要有其他内容。`
}

/**
 * 默认周报总结（无 AI 时）
 */
const getDefaultWeeklySummary = (stats: WeeklyStats): string => {
  const diff = stats.todosCompleted - stats.prevWeekTodos

  if (stats.todosCompleted === 0) {
    return "上周还没有完成待办，新的一周加油！💪"
  }

  if (diff > 0) {
    return `上周完成了 ${stats.todosCompleted} 个待办，比上上周多 ${diff} 个，太棒了！✨`
  }

  if (diff < 0) {
    return `上周完成了 ${stats.todosCompleted} 个待办，新的一周继续努力！💪`
  }

  return `上周完成了 ${stats.todosCompleted} 个待办，保持稳定输出！✨`
}

/**
 * 默认月报总结（无 AI 时）
 */
const getDefaultMonthlySummary = (stats: MonthlyStats): string => {
  const diff = stats.todosCompleted - stats.prevMonthTodos

  if (stats.todosCompleted === 0) {
    return `${stats.monthName}还没有完成待办，新的一月加油！💪`
  }

  if (diff > 0) {
    return `${stats.monthName}完成 ${stats.todosCompleted} 个待办，比上月多 ${diff} 个，太棒了！🎉`
  }

  if (diff < 0) {
    return `${stats.monthName}完成 ${stats.todosCompleted} 个待办，新的一月继续加油！💪`
  }

  return `${stats.monthName}完成 ${stats.todosCompleted} 个待办，保持稳定！✨`
}

/**
 * 生成周报 AI 点评
 */
export const generateWeeklyReport = async (): Promise<{
  summary: string
  fromAI: boolean
}> => {
  const weekId = TodoContributions.getWeekString(new Date())

  // 检查缓存
  const cached = ReportCache.getWeekly(weekId)
  if (cached) {
    return { summary: cached, fromAI: true }
  }

  const stats = getWeeklyStats()
  const settings = AISettingsManager.get()

  // 如果 AI 未配置，返回默认总结
  if (!settings.enabled || !settings.apiKey) {
    return { summary: getDefaultWeeklySummary(stats), fromAI: false }
  }

  // 调用 AI
  try {
    const prompt = generateWeeklyPrompt(stats)
    const summary = await callDeepSeekAPI(
      settings.apiKey,
      prompt,
      settings.model
    )

    // 缓存结果
    ReportCache.setWeekly(weekId, summary)

    return { summary, fromAI: true }
  } catch (error) {
    console.error("生成周报失败:", error)
    return { summary: getDefaultWeeklySummary(stats), fromAI: false }
  }
}

/**
 * 生成月报 AI 点评
 */
export const generateMonthlyReport = async (): Promise<{
  summary: string
  forecast: string
  fromAI: boolean
}> => {
  const monthId = TodoContributions.getMonthString(new Date())

  // 检查缓存
  const cached = ReportCache.getMonthly(monthId)
  if (cached) {
    const [summary, forecast] = cached.split("|||")
    return { summary, forecast: forecast || "", fromAI: true }
  }

  const stats = getMonthlyStats()
  const settings = AISettingsManager.get()

  // 计算预测
  const avgDaily = stats.todosCompleted / stats.daysInMonth
  const currentMonthDays = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0
  ).getDate()
  const forecast = Math.round(avgDaily * currentMonthDays)
  const forecastText = `按你的节奏，本月预计可以完成 ${forecast}+ 个待办，冲鸭！🚀`

  // 如果 AI 未配置，返回默认总结
  if (!settings.enabled || !settings.apiKey) {
    return {
      summary: getDefaultMonthlySummary(stats),
      forecast: forecastText,
      fromAI: false,
    }
  }

  // 调用 AI
  try {
    const prompt = generateMonthlyPrompt(stats)
    const summary = await callDeepSeekAPI(
      settings.apiKey,
      prompt,
      settings.model
    )

    // 缓存结果
    ReportCache.setMonthly(monthId, `${summary}|||${forecastText}`)

    return { summary, forecast: forecastText, fromAI: true }
  } catch (error) {
    console.error("生成月报失败:", error)
    return {
      summary: getDefaultMonthlySummary(stats),
      forecast: forecastText,
      fromAI: false,
    }
  }
}
