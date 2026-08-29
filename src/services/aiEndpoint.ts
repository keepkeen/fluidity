export const DEFAULT_AI_BASE_URL = "https://api.deepseek.com"

// Chromium extension CSP rejects IPv6 literal host sources. Accepting ::1 here
// would let endpoint validation succeed and then make every real request fail.
const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1"])

const parseAIServiceUrl = (rawBaseUrl: string): URL => {
  const value = rawBaseUrl.trim() || DEFAULT_AI_BASE_URL

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("API 地址格式无效，请填写完整的 http(s):// 地址")
  }

  const isLocalHttp =
    url.protocol === "http:" &&
    LOCAL_HTTP_HOSTS.has(url.hostname.toLowerCase())
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new Error("API 地址必须使用 HTTPS；仅本机服务可使用 HTTP")
  }
  if (url.username || url.password) {
    throw new Error("API 地址不能包含用户名或密码")
  }

  return url
}

/**
 * 接受 OpenAI 兼容服务的 Base URL 或完整 chat/completions 端点。
 * 只修改 pathname，避免破坏 Azure 等服务使用的查询参数。
 */
export const resolveChatCompletionsUrl = (rawBaseUrl: string): string => {
  const url = parseAIServiceUrl(rawBaseUrl)
  const pathname = url.pathname.replace(/\/+$/, "")

  url.pathname = /\/chat\/completions$/i.test(pathname)
    ? pathname
    : `${pathname}/chat/completions`
  url.hash = ""

  return url.toString()
}

export const resolveAIServicePermissionOrigin = (
  rawBaseUrl: string
): string => `${parseAIServiceUrl(rawBaseUrl).origin}/*`
