import { fetchWithTimeout } from "./http"

export interface GitHubUser {
  login: string
  id: number
}

export interface GitHubGistFile {
  filename?: string
  type?: string
  language?: string
  raw_url?: string
  size?: number
  truncated?: boolean
  content?: string
}

export interface GitHubGist {
  id: string
  description: string | null
  files: Record<string, GitHubGistFile | undefined>
  updated_at?: string
  history?: { version: string }[]
}

const API_VERSION = "2022-11-28"

export class GitHubRateLimitError extends Error {
  retryAfterMs: number

  constructor(retryAfterMs: number) {
    super("GitHub API rate limited")
    this.name = "GitHubRateLimitError"
    this.retryAfterMs = retryAfterMs
  }
}

const parseRateLimitDelay = (response: Response): number | null => {
  const retryAfter = Number(response.headers.get("retry-after"))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000

  const remaining = response.headers.get("x-ratelimit-remaining")
  const reset = Number(response.headers.get("x-ratelimit-reset"))
  if (remaining === "0" && Number.isFinite(reset) && reset > 0) {
    return Math.max(0, reset * 1000 - Date.now())
  }
  return null
}

const requestGitHub = async <T>(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<T> => {
  const response = await fetchWithTimeout(
    `https://api.github.com${path}`,
    {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    },
    { timeoutMs: 20_000, retries: 1, retryDelayMs: 1000 }
  )

  if (!response.ok) {
    // 限流时反复撞墙只会延长封禁；把等待时间抛给上层调度
    if (response.status === 403 || response.status === 429) {
      const delay = parseRateLimitDelay(response)
      if (delay !== null) throw new GitHubRateLimitError(delay)
    }
    const text = await response.text().catch(() => "")
    const suffix = text ? `: ${text}` : ""
    throw new Error(
      `GitHub API ${response.status} ${response.statusText}${suffix}`
    )
  }

  return (await response.json()) as T
}

export const validateGitHubToken = async (token: string): Promise<GitHubUser> =>
  await requestGitHub<GitHubUser>("/user", token, { method: "GET" })

export const listGists = async (token: string): Promise<GitHubGist[]> =>
  await requestGitHub<GitHubGist[]>("/gists?per_page=100", token, {
    method: "GET",
  })

export const getGist = async (
  token: string,
  gistId: string
): Promise<GitHubGist> =>
  await requestGitHub<GitHubGist>(`/gists/${gistId}`, token, { method: "GET" })

export const createGist = async (
  token: string,
  input: {
    description: string
    public: boolean
    files: Record<string, { content: string }>
  }
): Promise<GitHubGist> =>
  await requestGitHub<GitHubGist>("/gists", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

export const updateGist = async (
  token: string,
  gistId: string,
  input: {
    description?: string
    // 传 null 表示删除该文件（GitHub API 语义）
    files: Record<string, { content: string } | null>
  }
): Promise<GitHubGist> =>
  await requestGitHub<GitHubGist>(`/gists/${gistId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
