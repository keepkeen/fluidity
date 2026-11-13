export interface SanitizeAIPromptTextOptions {
  maxLength?: number
  secrets?: readonly string[]
}

const DEFAULT_MAX_LENGTH = 120
const REDACTED = "[已脱敏]"
const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const trimUrlPunctuation = (value: string): {
  url: string
  suffix: string
} => {
  const match = value.match(/[),.;!?\]}]+$/)
  if (!match) return { url: value, suffix: "" }
  return {
    url: value.slice(0, -match[0].length),
    suffix: match[0],
  }
}

const hostnameFor = (value: string): string | null => {
  const { url } = trimUrlPunctuation(value)
  try {
    return new URL(
      /^(?:https?|ftp):\/\//i.test(url) ? url : `https://${url}`
    ).hostname || null
  } catch {
    return null
  }
}

/**
 * Removes navigation details and credential-like values before user-controlled
 * text is added to an AI prompt. This is intentionally independent from any
 * specific organizer so every AI feature can share the same privacy boundary.
 */
export const sanitizeAIPromptText = (
  input: string,
  options: SanitizeAIPromptTextOptions = {}
): string => {
  let value = String(input ?? "")

  for (const secret of options.secrets ?? []) {
    const normalized = secret.trim()
    if (normalized.length >= 4) {
      value = value.replace(
        new RegExp(escapeRegExp(normalized), "gi"),
        REDACTED
      )
    }
  }

  // Absolute and www-prefixed URLs: retain only the hostname.
  value = value.replace(
    /\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"'`，。；！？、]+/gi,
    match => {
      const { suffix } = trimUrlPunctuation(match)
      return `${hostnameFor(match) ?? "[链接]"}${suffix}`
    }
  )

  // Scheme-less URL-like text such as example.com/private?q=1.
  value = value.replace(
    /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s<>"'`，。；！？、]*)?/gi,
    match => {
      const { suffix } = trimUrlPunctuation(match)
      return `${hostnameFor(match) ?? "[链接]"}${suffix}`
    }
  )

  value = value
    .replace(
      /\bauthorization\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi,
      `Authorization: ${REDACTED}`
    )
    .replace(/\bbearer\s+[^\s,;]+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b(api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|token|secret|password|passwd)\b\s*[:=]\s*["']?[^\s,"';]+["']?/gi,
      (_match, key: string) => `${key}=${REDACTED}`
    )
    .replace(/\*{3,}[a-z0-9_-]{3,}\b/gi, REDACTED)
    .replace(/\bsk-[a-z0-9_-]+\b/gi, REDACTED)
    .replace(/\s+/g, " ")
    .trim()

  const maxLength = Math.max(1, options.maxLength ?? DEFAULT_MAX_LENGTH)
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}
