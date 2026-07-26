import { BROWSER_USAGE_STORAGE_KEY } from "./browserUsage"
import { BROWSER_USAGE_SETTINGS_KEY } from "./browserUsageSettings"
import { exportDataAsync, importDataAsync } from "./dataBackup"
import {
  getChromeLocal,
  getChromeSession,
  hasChromeSessionStorage,
  hasChromeStorage,
  removeChromeSession,
  setChromeLocal,
  setChromeSession,
} from "./extensionStore"
import {
  createGist,
  getGist,
  GitHubRateLimitError,
  listGists,
  updateGist,
  validateGitHubToken,
} from "./gistApi"
import {
  aesGcmDecryptFromBase64,
  aesGcmEncryptToBase64,
  deriveAesKeyFromPassword,
  randomBase64,
} from "./gistCrypto"
import { fetchWithTimeout } from "./http"
import {
  installLocalStorageEmitter,
  LocalStorageChange,
  onLocalStorageChange,
} from "./localStorageEmitter"
import { getSyncRuntimeStatus, setSyncRuntimeStatus } from "./syncRuntime"

export type SyncInitContext = "startpage" | "popup"

export type SyncErrorCode =
  | "NOT_CONFIGURED"
  | "NEED_PASSWORD"
  | "TOKEN_INVALID"
  | "GIST_NOT_FOUND"
  | "DECRYPT_FAILED"
  | "CONFLICT"
  | "NETWORK"

export interface FluiditySyncEnvelopeV1 {
  meta: {
    updatedAt: number
    clientVersion: string
    deviceId: string
  }
  encryption: {
    algo: "AES-GCM"
    kdf: "PBKDF2"
    iterations: number
    salt: string
    iv: string
  }
  ciphertext: string
}

export interface GistSyncConfigV1 {
  enabled: boolean
  token?: string
  gistId?: string
  lastKnownRevision?: string
  deviceId: string
  rememberPassword: boolean
  /**
   * @deprecated 明文密码不再持久化（密文与解密密码不能同盘存放）。
   * 该字段仅用于读取历史数据并迁移到会话存储。
   */
  rememberedPassword?: string
  filename: string
  description: string
  iterations: number
}

const CONFIG_KEY = "fluidity.gistSync.config.v1"
const PASSWORD_KEY = "fluidity.gistSync.password.v1"
const DEFAULT_FILENAME = "fluidity.sync.v1.json"
const DEFAULT_DESCRIPTION = "Fluidity Sync Store (encrypted)"
const DEFAULT_ITERATIONS = 200_000

const LEADER_KEY = "fluidity-sync.leader.v1"
const REQUEST_KEY = "fluidity-sync.request.v1"

const MAX_CONFLICT_COPIES = 3

const RUNTIME_IGNORE_PREFIXES = ["fluidity-sync.", "fluidity.gistSync."]

const SYNCED_LOCAL_STORAGE_KEYS = new Set<string>([
  // settings
  "search-settings",
  "themes",
  "link-groups",
  "design",
  "link-display-settings",
  "wallpaper-settings",
  "card-area-settings",
  // AI (no apiKey in ciphertext export by default)
  "ai-settings",
  "ai-cache",
  // analytics
  "link-analytics",
  "search-history",
  "fluidity.ai.dailyReview.v1",
  // reports
  "report-state",
  "report-cache",
  "todo-contributions",
  // todos
  "todos",
])

const getOrCreateDeviceId = (): string => {
  const existing = localStorage.getItem("fluidity.deviceId")
  if (existing) return existing
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `device_${Date.now()}_${Math.random().toString(16).slice(2)}`
  try {
    localStorage.setItem("fluidity.deviceId", id)
  } catch {
    // ignore
  }
  return id
}

const getFallbackConfig = (): GistSyncConfigV1 => ({
  enabled: false,
  token: undefined,
  gistId: undefined,
  lastKnownRevision: undefined,
  deviceId: getOrCreateDeviceId(),
  rememberPassword: false,
  rememberedPassword: undefined,
  filename: DEFAULT_FILENAME,
  description: DEFAULT_DESCRIPTION,
  iterations: DEFAULT_ITERATIONS,
})

const normalizeConfig = (
  stored: Partial<GistSyncConfigV1> | undefined
): GistSyncConfigV1 => {
  const base = getFallbackConfig()
  const enabled = Boolean(stored?.enabled)
  const rememberPassword = Boolean(stored?.rememberPassword)
  const deviceId =
    stored?.deviceId && stored.deviceId.trim().length > 0
      ? stored.deviceId
      : base.deviceId
  const filename =
    stored?.filename && stored.filename.trim().length > 0
      ? stored.filename
      : base.filename
  const description =
    stored?.description && stored.description.trim().length > 0
      ? stored.description
      : base.description
  const iterations =
    typeof stored?.iterations === "number" ? stored.iterations : base.iterations

  return {
    ...base,
    ...stored,
    enabled,
    rememberPassword,
    deviceId,
    filename,
    description,
    iterations,
    rememberedPassword: undefined,
  }
}

// "记住密码"只写入会话级存储（chrome.storage.session / sessionStorage），
// 浏览器关闭即清除，避免密码与密文同盘明文存放
const storeRememberedPassword = async (
  password: string | null
): Promise<void> => {
  if (hasChromeSessionStorage()) {
    if (password === null) await removeChromeSession(PASSWORD_KEY)
    else await setChromeSession(PASSWORD_KEY, password)
    return
  }
  try {
    if (password === null) sessionStorage.removeItem(PASSWORD_KEY)
    else sessionStorage.setItem(PASSWORD_KEY, password)
  } catch {
    // ignore
  }
}

const readRememberedPassword = async (): Promise<string | null> => {
  if (hasChromeSessionStorage()) {
    return (await getChromeSession<string>(PASSWORD_KEY)) ?? null
  }
  try {
    return sessionStorage.getItem(PASSWORD_KEY)
  } catch {
    return null
  }
}

export const hasRememberedSyncPassword = async (): Promise<boolean> =>
  (await readRememberedPassword()) !== null

const getConfig = async (): Promise<GistSyncConfigV1> => {
  let stored: Partial<GistSyncConfigV1> | undefined
  if (hasChromeStorage()) {
    stored = await getChromeLocal<Partial<GistSyncConfigV1>>(CONFIG_KEY)
  } else {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return getFallbackConfig()
    try {
      stored = JSON.parse(raw) as Partial<GistSyncConfigV1>
    } catch {
      return getFallbackConfig()
    }
  }

  const config = normalizeConfig(stored)

  // 迁移：历史版本把明文密码写进了持久存储，搬到会话存储并从磁盘抹掉
  if (stored?.rememberedPassword) {
    await storeRememberedPassword(stored.rememberedPassword)
    await setConfig(config)
  }

  return config
}

const setConfig = async (config: GistSyncConfigV1): Promise<void> => {
  const normalized = normalizeConfig(config)
  if (hasChromeStorage()) {
    await setChromeLocal(CONFIG_KEY, normalized)
    return
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized))
}

let sessionPassword: string | null = null
let cachedKey: {
  salt: string
  iterations: number
  password: string
  key: CryptoKey
} | null = null

export const setSyncPasswordForSession = (password: string): void => {
  sessionPassword = password
  cachedKey = null
}

export const clearSyncPasswordForSession = (): void => {
  sessionPassword = null
  cachedKey = null
}

const getPassword = async (): Promise<string | null> => {
  if (sessionPassword) return sessionPassword
  const config = await getConfig()
  if (config.rememberPassword) {
    return await readRememberedPassword()
  }
  return null
}

const getCryptoKey = async (options: {
  password: string
  saltB64: string
  iterations: number
}): Promise<CryptoKey> => {
  if (
    cachedKey &&
    cachedKey.password === options.password &&
    cachedKey.salt === options.saltB64 &&
    cachedKey.iterations === options.iterations
  ) {
    return cachedKey.key
  }
  const key = await deriveAesKeyFromPassword(options)
  cachedKey = {
    password: options.password,
    salt: options.saltB64,
    iterations: options.iterations,
    key,
  }
  return key
}

const parseEnvelope = (raw: string): FluiditySyncEnvelopeV1 => {
  const json = JSON.parse(raw) as unknown
  if (
    typeof json !== "object" ||
    json === null ||
    typeof (json as { ciphertext?: unknown }).ciphertext !== "string" ||
    typeof (json as { encryption?: unknown }).encryption !== "object" ||
    (json as { encryption?: unknown }).encryption === null
  ) {
    throw new Error("Invalid sync envelope")
  }

  const encryption = (json as { encryption: Record<string, unknown> })
    .encryption
  const salt = encryption.salt
  const iv = encryption.iv
  const iterations = encryption.iterations
  const algo = encryption.algo
  const kdf = encryption.kdf

  if (
    algo !== "AES-GCM" ||
    kdf !== "PBKDF2" ||
    typeof salt !== "string" ||
    typeof iv !== "string" ||
    typeof iterations !== "number" ||
    // 迭代次数来自远端密文，必须限定范围：过小是 KDF 降级攻击，
    // 过大会在本地造成拒绝服务
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 1_000_000
  ) {
    throw new Error("Invalid sync envelope")
  }

  return json as FluiditySyncEnvelopeV1
}

const getGistFileContent = async (
  gist: Awaited<ReturnType<typeof getGist>>,
  filename: string,
  token: string
): Promise<string | null> => {
  const file = gist.files[filename]
  if (!file) return null
  if (file.content) return file.content
  if (!file.raw_url) return null

  // raw_url 来自 API 响应，未校验就带 token 请求会把凭据发往任意主机
  try {
    const rawOrigin = new URL(file.raw_url).origin
    if (rawOrigin !== "https://gist.githubusercontent.com") return null
  } catch {
    return null
  }

  const response = await fetchWithTimeout(
    file.raw_url,
    {
      method: "GET",
      headers: {
        Accept: "application/vnd.github.raw",
        Authorization: `Bearer ${token}`,
      },
    },
    { timeoutMs: 20_000, retries: 1, retryDelayMs: 1000 }
  )
  if (!response.ok) return null
  return await response.text()
}

const buildEnvelope = async (options: {
  deviceId: string
  password: string
  saltB64: string
  iterations: number
  plaintext: string
}): Promise<FluiditySyncEnvelopeV1> => {
  const iv = randomBase64(12)
  const key = await getCryptoKey({
    password: options.password,
    saltB64: options.saltB64,
    iterations: options.iterations,
  })

  const ciphertext = await aesGcmEncryptToBase64({
    key,
    ivB64: iv,
    plaintext: options.plaintext,
  })

  return {
    meta: {
      updatedAt: Date.now(),
      clientVersion: "unknown",
      deviceId: options.deviceId,
    },
    encryption: {
      algo: "AES-GCM",
      kdf: "PBKDF2",
      iterations: options.iterations,
      salt: options.saltB64,
      iv,
    },
    ciphertext,
  }
}

const decryptEnvelope = async (options: {
  password: string
  envelope: FluiditySyncEnvelopeV1
}): Promise<string> => {
  const key = await getCryptoKey({
    password: options.password,
    saltB64: options.envelope.encryption.salt,
    iterations: options.envelope.encryption.iterations,
  })

  return await aesGcmDecryptFromBase64({
    key,
    ivB64: options.envelope.encryption.iv,
    ciphertextB64: options.envelope.ciphertext,
  })
}

export const getTokenPrefillUrl = (): string =>
  "https://github.com/settings/tokens/new?description=Fluidity%20Sync&scopes=gist"

export const connectOrDiscover = async (options: {
  token: string
  password?: string
  rememberPassword?: boolean
}): Promise<{
  foundExisting: boolean
  gistId: string
  lastKnownRevision?: string
}> => {
  setSyncRuntimeStatus({
    state: "syncing",
    updatedAt: Date.now(),
    message: "正在验证 GitHub Token…",
  })

  await validateGitHubToken(options.token)

  const config = await getConfig()
  const gists = await listGists(options.token)
  const matched = gists.find(
    g =>
      (g.description ?? "").includes(config.description) &&
      Boolean(g.files[config.filename])
  )

  if (matched) {
    const updated = await getGist(options.token, matched.id)
    const head = updated.history?.[0]?.version
    const newConfig: GistSyncConfigV1 = {
      ...config,
      enabled: true,
      token: options.token,
      gistId: matched.id,
      lastKnownRevision: head,
      rememberPassword: Boolean(options.rememberPassword),
      rememberedPassword: undefined,
    }
    await setConfig(newConfig)
    await storeRememberedPassword(
      options.rememberPassword && options.password ? options.password : null
    )
    if (options.password) setSyncPasswordForSession(options.password)
    setSyncRuntimeStatus({
      state: "ok",
      updatedAt: Date.now(),
      message: "已连接到云端备份",
    })
    return { foundExisting: true, gistId: matched.id, lastKnownRevision: head }
  }

  if (!options.password) {
    setSyncRuntimeStatus({
      state: "error",
      updatedAt: Date.now(),
      message: "未发现云端备份，请先设置同步密码以创建",
    })
    throw new Error("Missing password for new gist")
  }

  const salt = randomBase64(16)
  const plaintext = JSON.stringify(await exportDataAsync(), null, 2)
  const envelope = await buildEnvelope({
    deviceId: config.deviceId,
    password: options.password,
    saltB64: salt,
    iterations: config.iterations,
    plaintext,
  })

  setSyncRuntimeStatus({
    state: "syncing",
    updatedAt: Date.now(),
    message: "未发现云端备份，正在创建 Gist…",
  })

  const created = await createGist(options.token, {
    description: config.description,
    public: false,
    files: {
      [config.filename]: {
        content: JSON.stringify(envelope),
      },
    },
  })

  const head = created.history?.[0]?.version
  const newConfig: GistSyncConfigV1 = {
    ...config,
    enabled: true,
    token: options.token,
    gistId: created.id,
    lastKnownRevision: head,
    rememberPassword: Boolean(options.rememberPassword),
    rememberedPassword: undefined,
  }
  await setConfig(newConfig)
  await storeRememberedPassword(
    options.rememberPassword ? options.password : null
  )
  setSyncPasswordForSession(options.password)

  setSyncRuntimeStatus({
    state: "ok",
    updatedAt: Date.now(),
    message: "云端备份已创建",
  })

  return { foundExisting: false, gistId: created.id, lastKnownRevision: head }
}

export const disconnectGistSync = async (): Promise<void> => {
  const config = await getConfig()
  const next: GistSyncConfigV1 = {
    ...config,
    enabled: false,
    token: undefined,
    gistId: undefined,
    lastKnownRevision: undefined,
    rememberPassword: false,
    rememberedPassword: undefined,
  }
  await setConfig(next)
  await storeRememberedPassword(null)
  clearSyncPasswordForSession()
  setSyncRuntimeStatus({
    state: "disabled",
    updatedAt: Date.now(),
    message: "已断开云同步",
  })
}

let isApplyingRemote = false
let generalPushTimer: ReturnType<typeof setTimeout> | null = null
let usagePushTimer: ReturnType<typeof setTimeout> | null = null
let isPushing = false
let pushQueued = false
let lastSuccessfulPushAt = 0
let usageDirtyAt: number | null = null

const USAGE_PUSH_DEBOUNCE_MS = 2 * 60 * 1000
const USAGE_PUSH_MIN_INTERVAL_MS = 60 * 60 * 1000

const writeLeader = (id: string, ttlMs: number) => {
  localStorage.setItem(
    LEADER_KEY,
    JSON.stringify({ id, expiresAt: Date.now() + ttlMs })
  )
}

const readLeader = (): { id: string; expiresAt: number } | null => {
  const raw = localStorage.getItem(LEADER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as { id: string; expiresAt: number }
  } catch {
    return null
  }
}

const isCurrentLeader = (id: string): boolean => {
  const leader = readLeader()
  if (!leader) return false
  if (leader.expiresAt < Date.now()) return false
  return leader.id === id
}

const tryBecomeLeader = (id: string): boolean => {
  const leader = readLeader()
  if (!leader || leader.expiresAt < Date.now()) {
    writeLeader(id, 6000)
    return isCurrentLeader(id)
  }
  return leader.id === id
}

const requestLeaderAction = (type: "pull" | "push"): void => {
  localStorage.setItem(
    REQUEST_KEY,
    JSON.stringify({
      type,
      id: `${Date.now()}_${Math.random()}`,
      at: Date.now(),
    })
  )
}

export const getGistSyncConfig = (): Promise<GistSyncConfigV1> => getConfig()

export const pullNow = async (): Promise<void> => {
  const config = await getConfig()
  if (!config.enabled || !config.token || !config.gistId) {
    setSyncRuntimeStatus({
      state: "disabled",
      updatedAt: Date.now(),
      message: "未配置云同步",
    })
    throw new Error("NOT_CONFIGURED")
  }

  setSyncRuntimeStatus({
    state: "syncing",
    updatedAt: Date.now(),
    message: "正在拉取…",
  })

  const gist = await getGist(config.token, config.gistId)
  const head = gist.history?.[0]?.version
  const file = await getGistFileContent(gist, config.filename, config.token)
  if (!file) {
    setSyncRuntimeStatus({
      state: "error",
      updatedAt: Date.now(),
      message: "云端文件缺失",
    })
    throw new Error("GIST_FILE_MISSING")
  }

  const envelope = parseEnvelope(file)
  const password = await getPassword()
  if (!password) {
    const next: GistSyncConfigV1 = { ...config, lastKnownRevision: head }
    await setConfig(next)
    setSyncRuntimeStatus({
      state: "error",
      updatedAt: Date.now(),
      message: "需要同步密码以解密",
    })
    return
  }

  try {
    const plaintext = await decryptEnvelope({ password, envelope })
    const backup = JSON.parse(plaintext) as Parameters<
      typeof importDataAsync
    >[0]

    isApplyingRemote = true
    await importDataAsync(backup, { overwrite: true, skipApiKey: true })
    isApplyingRemote = false

    const next: GistSyncConfigV1 = { ...config, lastKnownRevision: head }
    await setConfig(next)
    setSyncRuntimeStatus({
      state: "ok",
      updatedAt: Date.now(),
      message: "同步完成",
    })
  } catch {
    isApplyingRemote = false
    setSyncRuntimeStatus({
      state: "error",
      updatedAt: Date.now(),
      message: "解密失败：同步密码可能不正确",
    })
    throw new Error("DECRYPT_FAILED")
  }
}

export interface ConflictCopy {
  filename: string
  timestamp: number
  deviceId: string
}

const parseConflictName = (filename: string): ConflictCopy | null => {
  const match = /^conflict\.(\d+)\.(.+)\.json$/.exec(filename)
  if (!match) return null
  return {
    filename,
    timestamp: Number(match[1]),
    deviceId: match[2],
  }
}

/** 列出云端的冲突副本（推送冲突时另存的加密快照） */
export const listConflictCopies = async (): Promise<ConflictCopy[]> => {
  const config = await getConfig()
  if (!config.enabled || !config.token || !config.gistId) return []

  const gist = await getGist(config.token, config.gistId)
  return Object.keys(gist.files)
    .map(parseConflictName)
    .filter((c): c is ConflictCopy => c !== null)
    .sort((a, b) => b.timestamp - a.timestamp)
}

/** 用某份冲突副本覆盖本地数据（解密后走标准导入流程） */
export const restoreConflictCopy = async (filename: string): Promise<void> => {
  const config = await getConfig()
  if (!config.enabled || !config.token || !config.gistId) {
    throw new Error("NOT_CONFIGURED")
  }
  const password = await getPassword()
  if (!password) throw new Error("NEED_PASSWORD")

  const gist = await getGist(config.token, config.gistId)
  const file = await getGistFileContent(gist, filename, config.token)
  if (!file) throw new Error("GIST_FILE_MISSING")

  const envelope = parseEnvelope(file)
  let plaintext: string
  try {
    plaintext = await decryptEnvelope({ password, envelope })
  } catch {
    throw new Error("DECRYPT_FAILED")
  }
  const backup = JSON.parse(plaintext) as Parameters<typeof importDataAsync>[0]

  isApplyingRemote = true
  try {
    await importDataAsync(backup, { overwrite: true, skipApiKey: true })
  } finally {
    isApplyingRemote = false
  }
}

export const pushNow = async (
  options: { force?: boolean } = {}
): Promise<void> => {
  const config = await getConfig()
  if (!config.enabled || !config.token || !config.gistId) {
    setSyncRuntimeStatus({
      state: "disabled",
      updatedAt: Date.now(),
      message: "未配置云同步",
    })
    throw new Error("NOT_CONFIGURED")
  }

  const password = await getPassword()
  if (!password) {
    setSyncRuntimeStatus({
      state: "error",
      updatedAt: Date.now(),
      message: "需要同步密码以加密并推送",
    })
    throw new Error("NEED_PASSWORD")
  }

  setSyncRuntimeStatus({
    state: "syncing",
    updatedAt: Date.now(),
    message: "正在推送…",
  })

  const gist = await getGist(config.token, config.gistId)
  const head = gist.history?.[0]?.version
  const remoteFile = await getGistFileContent(
    gist,
    config.filename,
    config.token
  )

  let salt = randomBase64(16)
  let iterations = config.iterations

  if (remoteFile) {
    try {
      const remoteEnvelope = parseEnvelope(remoteFile)
      salt = remoteEnvelope.encryption.salt
      iterations = remoteEnvelope.encryption.iterations
    } catch {
      // keep generated salt
    }
  }

  if (
    !options.force &&
    config.lastKnownRevision &&
    head &&
    head !== config.lastKnownRevision
  ) {
    const plaintext = JSON.stringify(await exportDataAsync(), null, 2)
    const envelope = await buildEnvelope({
      deviceId: config.deviceId,
      password,
      saltB64: salt,
      iterations,
      plaintext,
    })

    const conflictName = `conflict.${Date.now()}.${config.deviceId}.json`
    // 冲突副本只保留最近几份，否则 gist 会无限膨胀
    const staleConflicts = Object.keys(gist.files)
      .filter(name => name.startsWith("conflict."))
      .sort()
      .reverse()
      .slice(MAX_CONFLICT_COPIES - 1)
    const files: Record<string, { content: string } | null> = {
      [conflictName]: { content: JSON.stringify(envelope) },
    }
    for (const name of staleConflicts) files[name] = null
    await updateGist(config.token, config.gistId, { files })

    setSyncRuntimeStatus({
      state: "error",
      updatedAt: Date.now(),
      message: "检测到冲突，已在云端另存副本",
    })
    throw new Error("CONFLICT")
  }

  const plaintext = JSON.stringify(await exportDataAsync(), null, 2)
  const envelope = await buildEnvelope({
    deviceId: config.deviceId,
    password,
    saltB64: salt,
    iterations,
    plaintext,
  })

  const updated = await updateGist(config.token, config.gistId, {
    files: {
      [config.filename]: { content: JSON.stringify(envelope) },
    },
  })

  const nextHead = updated.history?.[0]?.version ?? head
  const next: GistSyncConfigV1 = { ...config, lastKnownRevision: nextHead }
  await setConfig(next)

  setSyncRuntimeStatus({
    state: "ok",
    updatedAt: Date.now(),
    message: "同步完成",
  })
}

// 需要用户介入的错误重试没有意义
const NO_RETRY_ERRORS = new Set([
  "NOT_CONFIGURED",
  "NEED_PASSWORD",
  "CONFLICT",
  "DECRYPT_FAILED",
])

const PUSH_RETRY_DELAYS_MS = [30_000, 120_000, 600_000]
let pushRetryCount = 0
let pushRetryTimer: ReturnType<typeof setTimeout> | null = null

const schedulePushRetry = (error: unknown): void => {
  if (error instanceof Error && NO_RETRY_ERRORS.has(error.message)) return
  if (pushRetryTimer) return

  // 命中 GitHub 限流时按服务端要求的时间等待，否则指数退避
  const delay =
    error instanceof GitHubRateLimitError
      ? Math.max(error.retryAfterMs, 30_000)
      : PUSH_RETRY_DELAYS_MS[
          Math.min(pushRetryCount, PUSH_RETRY_DELAYS_MS.length - 1)
        ]
  if (pushRetryCount >= PUSH_RETRY_DELAYS_MS.length) return
  pushRetryCount += 1

  pushRetryTimer = setTimeout(() => {
    pushRetryTimer = null
    runPush()
  }, delay)
}

function runPush(): void {
  if (isPushing) {
    pushQueued = true
    return
  }

  isPushing = true
  void pushNow()
    .then(() => {
      lastSuccessfulPushAt = Date.now()
      usageDirtyAt = null
      pushRetryCount = 0
      if (pushRetryTimer) clearTimeout(pushRetryTimer)
      pushRetryTimer = null
      if (usagePushTimer) clearTimeout(usagePushTimer)
      usagePushTimer = null
    })
    .catch(error => {
      // 网络类失败不再依赖"下一次本地改动"才重试
      schedulePushRetry(error)
    })
    .finally(() => {
      isPushing = false
      if (pushQueued) {
        pushQueued = false
        runPush()
      }
    })
}

function scheduleUsagePush(): void {
  if (usageDirtyAt === null) return
  if (usagePushTimer) return

  const now = Date.now()
  const minByDebounce = usageDirtyAt + USAGE_PUSH_DEBOUNCE_MS
  const minByInterval =
    lastSuccessfulPushAt > 0
      ? lastSuccessfulPushAt + USAGE_PUSH_MIN_INTERVAL_MS
      : 0
  const dueAt = Math.max(minByDebounce, minByInterval)
  const delay = Math.max(0, dueAt - now)

  usagePushTimer = setTimeout(() => {
    usagePushTimer = null
    runPush()
  }, delay)
}

function markUsageDirtyAndSchedule(): void {
  if (usageDirtyAt === null) usageDirtyAt = Date.now()
  scheduleUsagePush()
}

function scheduleGeneralPush(): void {
  if (generalPushTimer) clearTimeout(generalPushTimer)
  generalPushTimer = setTimeout(() => {
    generalPushTimer = null
    runPush()
  }, 4000)
}

const createLeaderController = (instanceId: string) => {
  let renewTimer: ReturnType<typeof setInterval> | null = null

  const isLeader = (): boolean => isCurrentLeader(instanceId)

  const becomeLeader = (): boolean => {
    const ok = tryBecomeLeader(instanceId)
    if (!ok) return false

    if (!renewTimer) {
      renewTimer = setInterval(() => {
        if (isLeader()) writeLeader(instanceId, 6000)
      }, 2000)
    }

    return true
  }

  const ensureLeaderOrRequestPull = () => {
    if (becomeLeader()) return
    requestLeaderAction("pull")
  }

  const stop = () => {
    if (renewTimer) clearInterval(renewTimer)
    renewTimer = null
  }

  return { isLeader, ensureLeaderOrRequestPull, stop }
}

const createRequestHandler =
  (isLeader: () => boolean) =>
  (e: StorageEvent): void => {
    if (e.key !== REQUEST_KEY) return
    if (!isLeader()) return
    if (!e.newValue) return

    try {
      const req = JSON.parse(e.newValue) as { type: "pull" | "push" }
      if (req.type === "pull") void pullNow().catch(() => undefined)
      if (req.type === "push") scheduleGeneralPush()
    } catch {
      // ignore
    }
  }

const createLocalChangeHandler =
  (isLeader: () => boolean) =>
  (change: LocalStorageChange): void => {
    if (isApplyingRemote) return

    if (change.op === "clear") {
      if (isLeader()) scheduleGeneralPush()
      else requestLeaderAction("push")
      return
    }

    const key = change.key
    if (!key) return
    if (RUNTIME_IGNORE_PREFIXES.some(prefix => key.startsWith(prefix))) return
    if (!SYNCED_LOCAL_STORAGE_KEYS.has(key)) return

    if (isLeader()) scheduleGeneralPush()
    else requestLeaderAction("push")
  }

const createOnlineHandler = (isLeader: () => boolean) => (): void => {
  if (isLeader()) void pullNow().catch(() => undefined)
  else requestLeaderAction("pull")
}

const createChromeStorageChangedHandler =
  (isLeader: () => boolean) =>
  (
    changes: Partial<Record<string, chrome.storage.StorageChange>>,
    areaName: string
  ) => {
    if (isApplyingRemote) return
    if (areaName !== "local") return
    if (!changes[BROWSER_USAGE_STORAGE_KEY] && !changes[BROWSER_USAGE_SETTINGS_KEY]) {
      return
    }
    if (isLeader()) markUsageDirtyAndSchedule()
    else requestLeaderAction("push")
  }

const bindChromeStorageChangedListener = (
  handler: (
    changes: Partial<Record<string, chrome.storage.StorageChange>>,
    areaName: string
  ) => void
): (() => void) => {
  if (!hasChromeStorage()) return () => undefined
  chrome.storage.onChanged.addListener(handler)
  return () => chrome.storage.onChanged.removeListener(handler)
}

const pullIfLeader = (isLeader: () => boolean): void => {
  if (!isLeader()) return
  const current = getSyncRuntimeStatus()
  setSyncRuntimeStatus({
    ...current,
    state: "syncing",
    message: "正在拉取…",
  })
  void pullNow().catch(() => undefined)
}

export const startGistAutoSync = (context: SyncInitContext): (() => void) => {
  installLocalStorageEmitter()

  const instanceId = `${context}_${Date.now()}_${Math.random()
    .toString(16)
    .slice(2)}`
  const leader = createLeaderController(instanceId)

  leader.ensureLeaderOrRequestPull()

  const onRequest = createRequestHandler(leader.isLeader)
  const offLocal = onLocalStorageChange(
    createLocalChangeHandler(leader.isLeader)
  )
  const onOnline = createOnlineHandler(leader.isLeader)
  const offChrome = bindChromeStorageChangedListener(
    createChromeStorageChangedHandler(leader.isLeader)
  )

  window.addEventListener("storage", onRequest)
  window.addEventListener("online", onOnline)
  pullIfLeader(leader.isLeader)

  return () => {
    offLocal()
    window.removeEventListener("storage", onRequest)
    window.removeEventListener("online", onOnline)
    offChrome()
    leader.stop()
    if (generalPushTimer) clearTimeout(generalPushTimer)
    generalPushTimer = null
    if (usagePushTimer) clearTimeout(usagePushTimer)
    usagePushTimer = null
    usageDirtyAt = null
    pushQueued = false
    isPushing = false
  }
}
