/**
 * 重逢：从收藏里重新浮现被遗忘的链接。
 *
 * "收藏了怕忘"的正解不是把所有名字同时平铺（会集体被无视），
 * 而是每天确定性地采样少量"从未点击或很久没点"的链接突出展示。
 */

import { LinkClickRecord } from "./analytics"
import { linkGroup } from "../data/data"

export const REDISCOVERY_STATE_KEY = "fluidity.rediscovery.v1"

const STALE_DAYS = 30
const SNOOZE_DAYS = 7
export const DAILY_PICK_COUNT = 2

export interface RediscoveryCandidate {
  label: string
  url: string
  groupTitle: string
  /** null 表示从未点击过 */
  lastClicked: number | null
}

export interface RediscoveryState {
  /** url -> 暂缓展示的截止时间戳 */
  snoozed: Record<string, number>
  /** url -> 用户明确选择“不再推荐”的时间戳 */
  hidden: Record<string, number>
  /** url -> 用户撤销“不再推荐”的时间戳，用于跨设备覆盖旧隐藏状态 */
  restored: Record<string, number>
}

/**
 * 找出"被遗忘"的链接：从未点击，或距上次点击超过 30 天
 */
export const findForgottenLinks = (
  groups: linkGroup[],
  analytics: Record<string, LinkClickRecord>,
  now: number
): RediscoveryCandidate[] => {
  const staleBefore = now - STALE_DAYS * 24 * 60 * 60 * 1000
  const result: RediscoveryCandidate[] = []

  for (const group of groups) {
    for (const link of group.links) {
      if (!link.value || !/^https?:\/\//i.test(link.value.trim())) continue
      const record = analytics[link.value]
      const lastClicked =
        typeof record?.lastClicked === "number" ? record.lastClicked : null
      if (lastClicked === null || lastClicked < staleBefore) {
        result.push({
          label: link.label || link.value,
          url: link.value,
          groupTitle: group.title,
          lastClicked,
        })
      }
    }
  }

  return result
}

// 确定性字符串哈希（djb2）：同一天同一链接得分固定，跨天变化
const hashString = (input: string): number => {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return hash >>> 0
}

/**
 * 从候选中为指定日期确定性采样：
 * 当天内多次打开新标签页结果稳定，第二天自动轮换。
 */
export const pickDailyRediscoveries = (
  candidates: RediscoveryCandidate[],
  day: string,
  snoozed: Record<string, number>,
  now: number,
  count = DAILY_PICK_COUNT
): RediscoveryCandidate[] => {
  return candidates
    .filter(c => !(snoozed[c.url] > now))
    .map(c => ({ candidate: c, score: hashString(`${day}|${c.url}`) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map(entry => entry.candidate)
}

export const readRediscoveryState = (): RediscoveryState => {
  try {
    const raw = localStorage.getItem(REDISCOVERY_STATE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RediscoveryState>
      if (parsed && typeof parsed.snoozed === "object" && parsed.snoozed) {
        return {
          snoozed: parsed.snoozed as Record<string, number>,
          hidden:
            parsed.hidden && typeof parsed.hidden === "object"
              ? (parsed.hidden as Record<string, number>)
              : {},
          restored:
            parsed.restored && typeof parsed.restored === "object"
              ? (parsed.restored as Record<string, number>)
              : {},
        }
      }
    }
  } catch {
    // ignore
  }
  return { snoozed: {}, hidden: {}, restored: {} }
}

export const isRediscoveryHidden = (
  state: RediscoveryState,
  url: string
): boolean => (state.hidden[url] ?? 0) > (state.restored[url] ?? 0)

export const snoozeRediscovery = (url: string, now: number): void => {
  const state = readRediscoveryState()
  // 顺带清理已过期的暂缓项，避免无限累积
  const snoozed = Object.fromEntries(
    Object.entries(state.snoozed).filter(([, until]) => until > now)
  )
  snoozed[url] = now + SNOOZE_DAYS * 24 * 60 * 60 * 1000
  try {
    localStorage.setItem(
      REDISCOVERY_STATE_KEY,
      JSON.stringify({ ...state, snoozed } satisfies RediscoveryState)
    )
  } catch {
    // ignore
  }
}

export const hideRediscovery = (url: string, now = Date.now()): void => {
  const state = readRediscoveryState()
  state.hidden[url] = now
  try {
    localStorage.setItem(REDISCOVERY_STATE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export const restoreRediscovery = (url: string, now = Date.now()): void => {
  const state = readRediscoveryState()
  state.restored[url] = now
  try {
    localStorage.setItem(REDISCOVERY_STATE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}
