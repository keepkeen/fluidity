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

const requestGitHub = async <T>(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<T> => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
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
    files: Record<string, { content: string }>
  }
): Promise<GitHubGist> =>
  await requestGitHub<GitHubGist>(`/gists/${gistId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
