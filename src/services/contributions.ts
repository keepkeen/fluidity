/**
 * Todo 贡献统计服务
 * 记录每天完成的待办数量，用于展示贡献表
 */

const STORAGE_KEY = "todo-contributions"
const MAX_DAYS = 90 // 扩展到90天以支持月报

type DailyContributions = Record<string, number>

/**
 * 获取今天的日期字符串 (YYYY-MM-DD)
 */
const getTodayString = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * 获取指定天数前的日期字符串
 */
const getDateString = (daysAgo: number): string => {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * 获取星期几的中文名称
 */
const getWeekdayName = (dateStr: string): string => {
  const date = new Date(dateStr)
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"]
  return weekdays[date.getDay()]
}

export const TodoContributions = {
  /**
   * 获取所有贡献数据
   */
  get(): DailyContributions {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      return data ? (JSON.parse(data) as DailyContributions) : {}
    } catch {
      return {}
    }
  },

  /**
   * 记录一次完成
   */
  record(): void {
    const today = getTodayString()
    const contributions = this.get()
    contributions[today] = (contributions[today] || 0) + 1

    // 清理超过7天的数据
    this.cleanup(contributions)

    localStorage.setItem(STORAGE_KEY, JSON.stringify(contributions))
  },

  /**
   * 清理过期数据
   */
  cleanup(contributions: DailyContributions): void {
    const cutoffDate = getDateString(MAX_DAYS)
    Object.keys(contributions).forEach(date => {
      if (date < cutoffDate) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete contributions[date]
      }
    })
  },

  /**
   * 获取最近7天的数据
   */
  getLast7Days(): { date: string; weekday: string; count: number }[] {
    const contributions = this.get()
    const result = []

    for (let i = 6; i >= 0; i--) {
      const dateStr = getDateString(i)
      result.push({
        date: dateStr,
        weekday: getWeekdayName(dateStr),
        count: contributions[dateStr] || 0,
      })
    }

    return result
  },

  /**
   * 获取总完成数
   */
  getTotal(): number {
    const contributions = this.get()
    return Object.values(contributions).reduce((sum, count) => sum + count, 0)
  },

  /**
   * 清除所有数据
   */
  clear(): void {
    localStorage.removeItem(STORAGE_KEY)
  },

  /**
   * 获取指定周的数据 (weekOffset: 0=本周, -1=上周, -2=上上周...)
   */
  getWeekData(
    weekOffset = 0
  ): { date: string; weekday: string; count: number }[] {
    const contributions = this.get()
    const result = []

    // 计算目标周的周一
    const now = new Date()
    const dayOfWeek = now.getDay() || 7 // 周日为7
    const monday = new Date(now)
    monday.setDate(now.getDate() - dayOfWeek + 1 + weekOffset * 7)

    for (let i = 0; i < 7; i++) {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      const dateStr = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      result.push({
        date: dateStr,
        weekday: getWeekdayName(dateStr),
        count: contributions[dateStr] || 0,
      })
    }

    return result
  },

  /**
   * 获取指定月的数据
   */
  getMonthData(
    year: number,
    month: number
  ): { date: string; count: number; weekday: string }[] {
    const contributions = this.get()
    const result = []

    const daysInMonth = new Date(year, month, 0).getDate()

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`
      result.push({
        date: dateStr,
        weekday: getWeekdayName(dateStr),
        count: contributions[dateStr] || 0,
      })
    }

    return result
  },

  /**
   * 获取上周总完成数
   */
  getLastWeekTotal(): number {
    const weekData = this.getWeekData(-1)
    return weekData.reduce((sum, day) => sum + day.count, 0)
  },

  /**
   * 获取上上周总完成数
   */
  getWeekBeforeLastTotal(): number {
    const weekData = this.getWeekData(-2)
    return weekData.reduce((sum, day) => sum + day.count, 0)
  },

  /**
   * 获取指定月总完成数
   */
  getMonthTotal(year: number, month: number): number {
    const monthData = this.getMonthData(year, month)
    return monthData.reduce((sum, day) => sum + day.count, 0)
  },

  /**
   * 获取上月总完成数
   */
  getLastMonthTotal(): number {
    const now = new Date()
    const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth()
    const year =
      now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    return this.getMonthTotal(year, lastMonth)
  },

  /**
   * 获取上上月总完成数
   */
  getMonthBeforeLastTotal(): number {
    const now = new Date()
    let month = now.getMonth() - 1
    let year = now.getFullYear()
    if (month <= 0) {
      month = month <= 0 ? 12 + month : month
      year = month <= 0 ? year - 1 : year
    }
    if (month === 0) {
      month = 12
      year -= 1
    }
    return this.getMonthTotal(year, month)
  },

  /**
   * 获取周字符串 (YYYY-WXX)
   */
  getWeekString(date: Date): string {
    const year = date.getFullYear()
    const startOfYear = new Date(year, 0, 1)
    const days = Math.floor(
      (date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)
    )
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)
    return `${year}-W${String(weekNumber).padStart(2, "0")}`
  },

  /**
   * 获取月字符串 (YYYY-MM)
   */
  getMonthString(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}`
  },

  /**
   * 获取周内最高产的一天
   */
  getMostProductiveDay(weekOffset = -1): { weekday: string; count: number } {
    const weekData = this.getWeekData(weekOffset)
    let max = { weekday: "", count: 0 }
    weekData.forEach(day => {
      if (day.count > max.count) {
        max = { weekday: day.weekday, count: day.count }
      }
    })
    return max
  },

  /**
   * 获取连续活跃天数
   */
  getStreakDays(): number {
    const contributions = this.get()
    let streak = 0
    const today = new Date()

    for (let i = 0; i < MAX_DAYS; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() - i)
      const dateStr = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

      if (contributions[dateStr] && contributions[dateStr] > 0) {
        streak++
      } else if (i > 0) {
        // 今天可以没有完成，但之前的天数必须连续
        break
      }
    }

    return streak
  },

  /**
   * 获取周内活跃天数
   */
  getActiveDaysInWeek(weekOffset = -1): number {
    const weekData = this.getWeekData(weekOffset)
    return weekData.filter(day => day.count > 0).length
  },
}
