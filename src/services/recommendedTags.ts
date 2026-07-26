export const RECOMMENDED_TAGS_KEY = "fluidity.ai.recommendedSearchTags.v1"

export interface RecommendedSearchTagsV1 {
  version: 1
  day: string // YYYY-MM-DD (local)
  tags: string[]
  updatedAt: number
}

const pad2 = (n: number): string => String(n).padStart(2, "0")

export const getTodayStringLocal = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export const getRecommendedTagsForToday = (): string[] => {
  try {
    const raw = localStorage.getItem(RECOMMENDED_TAGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<RecommendedSearchTagsV1>
    if (parsed.version !== 1) return []
    if (parsed.day !== getTodayStringLocal()) return []
    if (!Array.isArray(parsed.tags)) return []
    return parsed.tags
      .filter((t): t is string => typeof t === "string")
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .slice(0, 12)
  } catch {
    return []
  }
}

export const setRecommendedTagsForToday = (tags: string[]): void => {
  const cleaned = tags
    .filter((t): t is string => typeof t === "string")
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .slice(0, 12)

  const payload: RecommendedSearchTagsV1 = {
    version: 1,
    day: getTodayStringLocal(),
    tags: cleaned,
    updatedAt: Date.now(),
  }
  try {
    localStorage.setItem(RECOMMENDED_TAGS_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}
