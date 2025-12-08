/**
 * 报告状态管理服务
 * 管理周报/月报的显示和关闭状态
 */

const STORAGE_KEY = "report-state"

interface ReportStateData {
  dismissedWeeklyReport: string | null // "YYYY-WXX" 格式
  dismissedMonthlyReport: string | null // "YYYY-MM" 格式
}

const DEFAULT_STATE: ReportStateData = {
  dismissedWeeklyReport: null,
  dismissedMonthlyReport: null,
}

/**
 * 获取周字符串 (YYYY-WXX)
 */
const getWeekString = (date: Date): string => {
  const year = date.getFullYear()
  const startOfYear = new Date(year, 0, 1)
  const days = Math.floor(
    (date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)
  )
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)
  return `${year}-W${String(weekNumber).padStart(2, "0")}`
}

/**
 * 获取月字符串 (YYYY-MM)
 */
const getMonthString = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

export const ReportState = {
  /**
   * 获取报告状态
   */
  get(): ReportStateData {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      return data
        ? {
            ...DEFAULT_STATE,
            ...(JSON.parse(data) as Partial<ReportStateData>),
          }
        : DEFAULT_STATE
    } catch {
      return DEFAULT_STATE
    }
  },

  /**
   * 保存报告状态
   */
  set(state: Partial<ReportStateData>): void {
    const current = this.get()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...state }))
  },

  /**
   * 关闭周报（本周不再显示）
   */
  dismissWeekly(): void {
    const weekString = getWeekString(new Date())
    this.set({ dismissedWeeklyReport: weekString })
  },

  /**
   * 关闭月报（本月不再显示）
   */
  dismissMonthly(): void {
    const monthString = getMonthString(new Date())
    this.set({ dismissedMonthlyReport: monthString })
  },

  /**
   * 检查周报是否已被关闭
   */
  isWeeklyDismissed(): boolean {
    const state = this.get()
    const currentWeek = getWeekString(new Date())
    return state.dismissedWeeklyReport === currentWeek
  },

  /**
   * 检查月报是否已被关闭
   */
  isMonthlyDismissed(): boolean {
    const state = this.get()
    const currentMonth = getMonthString(new Date())
    return state.dismissedMonthlyReport === currentMonth
  },

  /**
   * 判断应该显示哪种报告
   * 返回 'weekly' | 'monthly' | null
   * 月报优先级高于周报
   */
  shouldShowReport(): "weekly" | "monthly" | null {
    const now = new Date()
    const dayOfWeek = now.getDay() // 0=周日, 1=周一
    const dayOfMonth = now.getDate()

    // 月初（1日）优先显示月报
    if (dayOfMonth === 1 && !this.isMonthlyDismissed()) {
      return "monthly"
    }

    // 周一显示周报
    if (dayOfWeek === 1 && !this.isWeeklyDismissed()) {
      return "weekly"
    }

    return null
  },

  /**
   * 清除所有状态
   */
  clear(): void {
    localStorage.removeItem(STORAGE_KEY)
  },
}
