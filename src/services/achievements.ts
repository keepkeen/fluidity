/**
 * 成就系统服务
 * 计算周报/月报中的成就徽章
 */

import { TodoContributions } from "./contributions"

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  unlocked: boolean
}

/**
 * 周报成就检测
 */
export const getWeeklyAchievements = (): Achievement[] => {
  const achievements: Achievement[] = []
  const weekData = TodoContributions.getWeekData(-1) // 上周数据
  const lastWeekTotal = TodoContributions.getLastWeekTotal()
  const weekBeforeTotal = TodoContributions.getWeekBeforeLastTotal()
  const activeDays = TodoContributions.getActiveDaysInWeek(-1)
  const streakDays = TodoContributions.getStreakDays()
  const mostProductive = TodoContributions.getMostProductiveDay(-1)

  // 连续活跃
  if (streakDays >= 3) {
    achievements.push({
      id: "streak",
      name: "连续活跃",
      description: `连续活跃 ${streakDays} 天`,
      icon: "🔥",
      unlocked: true,
    })
  }

  // 单日高产
  if (mostProductive.count >= 5) {
    achievements.push({
      id: "productive",
      name: "单日高产",
      description: `单日完成 ${mostProductive.count} 个待办`,
      icon: "⭐",
      unlocked: true,
    })
  }

  // 周目标达成
  if (lastWeekTotal >= weekBeforeTotal && weekBeforeTotal > 0) {
    const percentage = Math.round((lastWeekTotal / weekBeforeTotal) * 100)
    achievements.push({
      id: "weekly-goal",
      name: "周目标达成",
      description: `周目标达成 ${percentage}%`,
      icon: "🎯",
      unlocked: true,
    })
  }

  // 全勤周
  if (activeDays === 7) {
    achievements.push({
      id: "full-week",
      name: "全勤周",
      description: "一周7天都有完成待办",
      icon: "👑",
      unlocked: true,
    })
  }

  // 周末战士
  const weekendDays = weekData.filter(
    d => d.weekday === "六" || d.weekday === "日"
  )
  const weekendTotal = weekendDays.reduce((sum, d) => sum + d.count, 0)
  if (weekendTotal >= 3) {
    achievements.push({
      id: "weekend-warrior",
      name: "周末战士",
      description: `周末完成 ${weekendTotal} 个待办`,
      icon: "⚔️",
      unlocked: true,
    })
  }

  return achievements
}

/**
 * 月报成就检测
 */
export const getMonthlyAchievements = (): Achievement[] => {
  const achievements: Achievement[] = []
  const now = new Date()
  const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth()
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  const monthData = TodoContributions.getMonthData(year, lastMonth)
  const lastMonthTotal = TodoContributions.getLastMonthTotal()
  const monthBeforeTotal = TodoContributions.getMonthBeforeLastTotal()
  const activeDays = monthData.filter(d => d.count > 0).length
  const streakDays = TodoContributions.getStreakDays()

  // 效率之星
  if (lastMonthTotal >= 50) {
    achievements.push({
      id: "efficiency-star",
      name: "效率之星",
      description: `完成 ${lastMonthTotal} 个待办`,
      icon: "🌟",
      unlocked: true,
    })
  }

  // 燃烧吧
  if (streakDays >= 14) {
    achievements.push({
      id: "on-fire",
      name: "燃烧吧",
      description: `连续活跃 ${streakDays} 天`,
      icon: "🔥",
      unlocked: true,
    })
  }

  // 目标达人
  if (lastMonthTotal >= monthBeforeTotal && monthBeforeTotal > 0) {
    const percentage = Math.round((lastMonthTotal / monthBeforeTotal) * 100)
    achievements.push({
      id: "goal-master",
      name: "目标达人",
      description: `月目标达成 ${percentage}%`,
      icon: "🎯",
      unlocked: true,
    })
  }

  // 全勤王
  const daysInMonth = new Date(year, lastMonth, 0).getDate()
  if (activeDays >= 28 || activeDays >= daysInMonth - 3) {
    achievements.push({
      id: "full-attendance",
      name: "全勤王",
      description: `活跃 ${activeDays}/${daysInMonth} 天`,
      icon: "👑",
      unlocked: true,
    })
  }

  // 稳定输出
  const weeklyTotals: number[] = []
  for (let i = 0; i < 4; i++) {
    const weekStart = i * 7
    const weekEnd = Math.min((i + 1) * 7, monthData.length)
    const weekTotal = monthData
      .slice(weekStart, weekEnd)
      .reduce((sum, d) => sum + d.count, 0)
    weeklyTotals.push(weekTotal)
  }
  const avgWeekly =
    weeklyTotals.reduce((a, b) => a + b, 0) / weeklyTotals.length
  const isStable = weeklyTotals.every(
    w => w >= avgWeekly * 0.7 && w <= avgWeekly * 1.3
  )
  if (isStable && avgWeekly > 0) {
    achievements.push({
      id: "stable-output",
      name: "稳定输出",
      description: "每周完成数量稳定",
      icon: "📊",
      unlocked: true,
    })
  }

  return achievements
}

/**
 * 获取周内最高产的一周（用于月报）
 */
export const getMostProductiveWeek = (
  year: number,
  month: number
): { weekNum: number; count: number } => {
  const monthData = TodoContributions.getMonthData(year, month)
  let maxWeek = { weekNum: 1, count: 0 }

  for (let i = 0; i < 5; i++) {
    const weekStart = i * 7
    const weekEnd = Math.min((i + 1) * 7, monthData.length)
    if (weekStart >= monthData.length) break

    const weekTotal = monthData
      .slice(weekStart, weekEnd)
      .reduce((sum, d) => sum + d.count, 0)

    if (weekTotal > maxWeek.count) {
      maxWeek = { weekNum: i + 1, count: weekTotal }
    }
  }

  return maxWeek
}

/**
 * 获取月度周数据（用于月报趋势图）
 */
export const getMonthWeeklyData = (
  year: number,
  month: number
): { week: number; count: number }[] => {
  const monthData = TodoContributions.getMonthData(year, month)
  const result: { week: number; count: number }[] = []

  for (let i = 0; i < 5; i++) {
    const weekStart = i * 7
    const weekEnd = Math.min((i + 1) * 7, monthData.length)
    if (weekStart >= monthData.length) break

    const weekTotal = monthData
      .slice(weekStart, weekEnd)
      .reduce((sum, d) => sum + d.count, 0)

    result.push({ week: i + 1, count: weekTotal })
  }

  return result
}
