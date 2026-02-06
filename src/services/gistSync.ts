import { BROWSER_USAGE_STORAGE_KEY } from "./browserUsage"
import { exportDataAsync, importDataAsync } from "./dataBackup"
import {
  getChromeLocal,
  hasChromeStorage,
  setChromeLocal,
} from "./extensionStore"
import {
  createGist,
  getGist,
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
  rememberedPassword?: string
  filename: string
  description: string
  iterations: number
}

const CONFIG_KEY = "fluidity.gistSync.config.v1"
const DEFAULT_FILENAME = "fluidity.sync.v1.json"
const DEFAULT_DESCRIPTION = "Fluidity Sync Store (encrypted)"
const DEFAULT_ITERATIONS = 200_000

const LEADER_KEY = "fluidity-sync.leader.v1"
const REQUEST_KEY = "fluidity-sync.request.v1"

const RUNTIME_IGNORE_PREFIXES = ["fluidity-sync.", "fluidity.gistSync."]

const SYNCED_LOCAL_STORAGE_KEYS = new Set<string>([
  // settings
  "search-settings",
  "themes",
  "link-groups",
  "design",
  "link-display-settings",
  // AI (no apiKey in ciphertext export by default)
  "ai-settings",
  "ai-cache",
  // analytics
  "link-analytics",
  "search-history",
  "fluidity.ai.recommendedSearchTags.v1",
  "fluidity.ai.recommendedQuickSearches.v1",
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
    rememberedPassword: rememberPassword
      ? stored?.rememberedPassword
      : undefined,
  }
}

const getConfig = async (): Promise<GistSyncConfigV1> => {
  if (hasChromeStorage()) {
    const stored = await getChromeLocal<Partial<GistSyncConfigV1>>(CONFIG_KEY)
    return normalizeConfig(stored)
  }

  const raw = localStorage.getItem(CONFIG_KEY)
  if (!raw) return getFallbackConfig()
  try {
    return normalizeConfig(JSON.parse(raw) as Partial<GistSyncConfigV1>)
  } catch {
    return getFallbackConfig()
  }
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
  const config = await getConfig()
  if (config.rememberPassword && config.rememberedPassword) {
    return config.rememberedPassword
  }
  return sessionPassword
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
    typeof iterations !== "number"
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

  const response = await fetch(file.raw_url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github.raw",
      Authorization: `Bearer ${token}`,
    },
  })
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
      rememberedPassword: options.rememberPassword
        ? options.password
        : undefined,
    }
    await setConfig(newConfig)
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
    rememberedPassword: options.rememberPassword ? options.password : undefined,
  }
  await setConfig(newConfig)
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
  clearSyncPasswordForSession()
  setSyncRuntimeStatus({
    state: "error",
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
      state: "error",
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

export const pushNow = async (
  options: { force?: boolean } = {}
): Promise<void> => {
  const config = await getConfig()
  if (!config.enabled || !config.token || !config.gistId) {
    setSyncRuntimeStatus({
      state: "error",
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
    await updateGist(config.token, config.gistId, {
      files: {
        [conflictName]: { content: JSON.stringify(envelope) },
      },
    })

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
      if (usagePushTimer) clearTimeout(usagePushTimer)
      usagePushTimer = null
    })
    .catch(() => {
      // Keep usageDirtyAt so we can retry on the next trigger.
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
    if (!changes[BROWSER_USAGE_STORAGE_KEY]) return
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
