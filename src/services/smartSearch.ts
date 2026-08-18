import { PINYIN_CHARACTER_GROUPS } from "./pinyinData"

export type SmartMatchKind = "literal" | "pinyin" | "initials" | "fuzzy"

export interface SmartMatch {
  score: number
  kind: SmartMatchKind
}

export interface SearchHistoryCandidate {
  query: string
  timestamp: number
}

const pinyinByCharacter = new Map<string, string[]>()

PINYIN_CHARACTER_GROUPS.forEach(([syllable, characters]) => {
  Array.from(characters).forEach(character => {
    pinyinByCharacter.set(character, [syllable])
  })
})

// Single-character transliteration cannot infer context. These common alternate
// readings keep searches such as "chongqing", "yinyue" and "yinhang" useful.
const alternateReadings: Record<string, readonly string[]> = {
  柏: ["bo"],
  薄: ["bo"],
  便: ["pian"],
  藏: ["zang"],
  曾: ["ceng"],
  差: ["chai", "ci"],
  查: ["zha"],
  朝: ["zhao"],
  传: ["zhuan"],
  单: ["shan", "chan"],
  都: ["du"],
  发: ["fa"],
  给: ["ji"],
  行: ["hang"],
  还: ["huan"],
  华: ["hua"],
  会: ["kuai"],
  降: ["xiang"],
  教: ["jiao"],
  觉: ["jiao"],
  空: ["kong"],
  乐: ["yue"],
  了: ["liao"],
  量: ["liang"],
  露: ["lou"],
  宁: ["ning"],
  强: ["jiang"],
  曲: ["qu"],
  厦: ["xia"],
  少: ["shao"],
  省: ["xing"],
  似: ["shi"],
  数: ["shuo"],
  说: ["shui"],
  汤: ["shang"],
  调: ["tiao"],
  系: ["ji"],
  校: ["jiao"],
  邪: ["ye"],
  兴: ["xing"],
  血: ["xie"],
  应: ["ying"],
  载: ["zai"],
  长: ["zhang"],
  着: ["zhao", "zhuo"],
  重: ["chong"],
  转: ["zhuan"],
}

Object.entries(alternateReadings).forEach(([character, readings]) => {
  const primary = pinyinByCharacter.get(character) ?? []
  pinyinByCharacter.set(character, [...new Set([...primary, ...readings])])
})

const pinyinCache = new Map<string, { full: string[]; initials: string[] }>()
const MAX_PINYIN_VARIANTS = 16

export const normalizeSearchText = (value: string): string =>
  value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")

const appendVariants = (
  current: string[],
  additions: readonly string[],
  takeInitial: boolean
): string[] => {
  const next = new Set<string>()
  current.forEach(prefix => {
    additions.forEach(addition => {
      next.add(prefix + (takeInitial ? addition[0] : addition))
    })
  })
  return Array.from(next).slice(0, MAX_PINYIN_VARIANTS)
}

const getPinyinForms = (
  value: string
): { full: string[]; initials: string[] } => {
  const cached = pinyinCache.get(value)
  if (cached) return cached

  let full = [""]
  let initials = [""]
  let hasChineseReading = false

  Array.from(value.normalize("NFKC")).forEach(character => {
    const readings = pinyinByCharacter.get(character)
    if (readings) {
      hasChineseReading = true
      full = appendVariants(full, readings, false)
      initials = appendVariants(initials, readings, true)
      return
    }

    const literal = normalizeSearchText(character)
    if (!literal) return
    full = full.map(prefix => prefix + literal)
    initials = initials.map(prefix => prefix + literal)
  })

  const forms = hasChineseReading
    ? {
        full: [...new Set(full)],
        initials: [...new Set(initials)],
      }
    : { full: [], initials: [] }
  pinyinCache.set(value, forms)
  return forms
}

const getLiteralCandidates = (value: string): string[] => {
  const tokens = value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .map(normalizeSearchText)
    .filter(Boolean)
  const compact = normalizeSearchText(value)
  const initials = tokens.map(token => token[0]).join("")
  return [...new Set([compact, ...tokens, initials].filter(Boolean))]
}

const boundedEditDistance = (left: string, right: string, limit: number) => {
  if (Math.abs(left.length - right.length) > limit) return limit + 1

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex]
    let rowMinimum = current[0]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitution =
        previous[rightIndex - 1] +
        (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        substitution
      )
      rowMinimum = Math.min(rowMinimum, current[rightIndex])
    }
    if (rowMinimum > limit) return limit + 1
    previous = current
  }
  return previous[right.length]
}

const scoreCandidate = (
  candidate: string,
  query: string
): { score: number; fuzzy: boolean } => {
  if (!candidate || !query) return { score: 0, fuzzy: false }
  if (candidate === query) return { score: 120, fuzzy: false }
  if (candidate.startsWith(query)) {
    return {
      score: 110 - Math.min(10, (candidate.length - query.length) / 2),
      fuzzy: false,
    }
  }

  const containsAt = candidate.indexOf(query)
  if (containsAt >= 0) {
    return { score: 96 - Math.min(12, containsAt), fuzzy: false }
  }

  if (query.length >= 2) {
    let queryIndex = 0
    let gaps = 0
    let previousMatch = -1
    for (
      let candidateIndex = 0;
      candidateIndex < candidate.length && queryIndex < query.length;
      candidateIndex++
    ) {
      if (candidate[candidateIndex] !== query[queryIndex]) continue
      if (previousMatch >= 0) gaps += candidateIndex - previousMatch - 1
      previousMatch = candidateIndex
      queryIndex++
    }
    if (queryIndex === query.length) {
      return {
        score: Math.max(58, 78 - gaps - (candidate.length - query.length) / 3),
        fuzzy: true,
      }
    }
  }

  if (query.length < 3) return { score: 0, fuzzy: false }
  const editLimit = query.length <= 4 ? 1 : Math.min(3, Math.ceil(query.length / 4))
  const distance = boundedEditDistance(candidate, query, editLimit)
  if (distance > editLimit) return { score: 0, fuzzy: false }
  return {
    score: 88 - distance * 9 - Math.abs(candidate.length - query.length),
    fuzzy: true,
  }
}

/**
 * Matches literal text first, then full pinyin and pinyin initials. The score is
 * stable across callers so links and history can share the same ranking rules.
 */
export const matchSearchText = (text: string, rawQuery: string): SmartMatch => {
  const query = normalizeSearchText(rawQuery)
  if (!query) return { score: 0, kind: "literal" }

  let best: SmartMatch = { score: 0, kind: "literal" }
  getLiteralCandidates(text).forEach(candidate => {
    const result = scoreCandidate(candidate, query)
    if (result.score > best.score) {
      best = {
        score: result.score,
        kind: result.fuzzy ? "fuzzy" : "literal",
      }
    }
  })

  const pinyin = getPinyinForms(text)
  pinyin.full.forEach(candidate => {
    const result = scoreCandidate(candidate, query)
    const score = result.score > 0 ? result.score - 3 : 0
    if (score > best.score) best = { score, kind: "pinyin" }
  })
  pinyin.initials.forEach(candidate => {
    const result = scoreCandidate(candidate, query)
    const score = result.score > 0 ? result.score - 7 : 0
    if (score > best.score) best = { score, kind: "initials" }
  })

  return best
}

/** Returns de-duplicated history ordered by relevance, frequency, then recency. */
export const rankSearchHistory = (
  records: SearchHistoryCandidate[],
  query: string,
  limit: number
): SearchHistoryCandidate[] => {
  const unique = new Map<
    string,
    SearchHistoryCandidate & { occurrences: number; matchScore: number }
  >()

  records.forEach(record => {
    const key = normalizeSearchText(record.query)
    if (!key) return
    const existing = unique.get(key)
    if (existing) {
      existing.occurrences += 1
      if (record.timestamp > existing.timestamp) {
        existing.query = record.query
        existing.timestamp = record.timestamp
      }
      return
    }
    unique.set(key, { ...record, occurrences: 1, matchScore: 0 })
  })

  const normalizedQuery = normalizeSearchText(query)
  return Array.from(unique.values())
    .map(record => ({
      ...record,
      matchScore: normalizedQuery
        ? matchSearchText(record.query, normalizedQuery).score
        : 1,
    }))
    .filter(record => record.matchScore > 0)
    .sort((left, right) => {
      const leftScore = left.matchScore + Math.min(8, left.occurrences * 2)
      const rightScore = right.matchScore + Math.min(8, right.occurrences * 2)
      return rightScore - leftScore || right.timestamp - left.timestamp
    })
    .slice(0, limit)
    .map(({ query: historyQuery, timestamp }) => ({
      query: historyQuery,
      timestamp,
    }))
}
