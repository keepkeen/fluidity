import React, { Suspense, useEffect, useMemo, useRef, useState } from "react"

import {
  faDownload,
  faUpload,
  faCheck,
  faExclamationTriangle,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import {
  downloadBackup,
  importFromFile,
  getDataStats,
  ImportResult,
} from "../../../services/dataBackup"
import {
  BrowserUsageSettings,
  DEFAULT_BROWSER_USAGE_SETTINGS,
  getBrowserUsageSettings,
  removeBrowserUsagePermissions,
  requestBrowserUsagePermissions,
  setBrowserUsageSettings,
} from "../../../services/browserUsageSettings"
import { validateGitHubToken } from "../../../services/gistApi"
import {
  ConflictCopy,
  connectOrDiscover,
  disconnectGistSync,
  getGistSyncConfig,
  getTokenPrefillUrl,
  hasRememberedSyncPassword,
  hasSessionSyncPassword,
  listConflictCopies,
  pullNow,
  pushNow,
  restoreConflictCopy,
  setSyncPasswordForSession,
} from "../../../services/gistSync"
import { ensureSyncPermissions } from "../../../services/optionalPermissions"
import { Toggle } from "../../../components/Toggle"
import { emitSettingsApplied } from "../../../services/settingsEvents"
import {
  getSyncRuntimeStatus,
  subscribeSyncRuntimeStatus,
  SyncRuntimeStatus,
} from "../../../services/syncRuntime"
import {
  Advanced,
  Button,
  Container,
  Description,
  HiddenInput,
  Link,
  ResultDetails,
  ResultIcon,
  ResultMessage,
  ScrollContainer,
  Section,
  SectionTitle,
  SettingsColumn,
  StatsCard,
  StatsLabel,
  StatsRow,
  StatsSummary,
  StatsValue,
  StatusDetail,
  StatusHeadline,
  StatusLabel,
  StatusRow,
  StatusValue,
  TextInput,
  WarningBox,
  WarningIcon,
} from "./DataSettings.styles"

const Changelog = React.lazy(() =>
  import("../Changelog/Changelog").then(module => ({
    default: module.Changelog,
  }))
)

const formatSyncError = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : ""
  const lower = message.toLowerCase()

  if (message.includes("401") || lower.includes("bad credentials")) {
    return "GitHub Token 无效或已过期，请重新生成带 gist 权限的 Token。"
  }
  if (message.includes("403")) {
    return "GitHub Token 权限不足或请求受限，请确认已授予 gist 权限。"
  }
  if (message.includes("404") || message === "GIST_NOT_FOUND") {
    return "未找到云端备份，请确认 Gist 是否仍存在。"
  }
  if (message === "DECRYPT_FAILED" || message.includes("解密失败")) {
    return "解密失败：同步密码不正确，无法拉取云端备份。"
  }
  if (message === "NEED_PASSWORD") {
    return "请输入同步密码后再推送云端备份。"
  }
  if (message === "CONFLICT") {
    return "检测到云端冲突，已避免覆盖主备份。"
  }
  if (message.includes("Missing password")) {
    return "未发现云端备份，请输入同步密码后创建新的加密备份。"
  }
  if (message.includes("请求超时") || lower.includes("network")) {
    return "网络请求失败，请检查连接后重试。"
  }

  return fallback
}

const getSyncStatusCopy = (options: {
  hasToken: boolean
  syncEnabled: boolean
  hasGist: boolean
  hasPassword: boolean
  runtimeStatus: SyncRuntimeStatus
  isSyncBusy: boolean
}): { headline: string; detail: string } => {
  if (options.isSyncBusy) {
    return {
      headline: "正在处理云同步",
      detail: options.runtimeStatus.message ?? "正在连接 GitHub Gist…",
    }
  }

  if (!options.hasToken && !options.syncEnabled) {
    return {
      headline: "未配置 Token",
      detail: "先粘贴带 gist 权限的 GitHub Token，然后连接或创建加密备份。",
    }
  }

  if (options.hasToken && !options.syncEnabled) {
    return {
      headline: "Token 待连接",
      detail: "Token 已输入但尚未连接；点击连接后会查找已有备份或创建新的私有 Gist。",
    }
  }

  if (options.syncEnabled && !options.hasGist) {
    return {
      headline: "等待创建云端备份",
      detail: "Token 已保存，但还没有 Gist；输入同步密码后会创建新的加密备份。",
    }
  }

  if (options.hasGist && !options.hasPassword) {
    return {
      headline: "已找到云端备份，等待同步密码",
      detail: "已有加密 Gist；必须输入创建备份时的同步密码后才能解锁和拉取。",
    }
  }

  if (options.runtimeStatus.state === "error") {
    return {
      headline: "云同步需要处理",
      detail: options.runtimeStatus.message ?? "请检查 Token、Gist 或同步密码。",
    }
  }

  return {
    headline: "云同步已连接",
    detail: options.runtimeStatus.message ?? "Token、Gist 和同步密码已就绪。",
  }
}

export const DataSettings: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [includeApiKey, setIncludeApiKey] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [usageSettings, setUsageSettingsState] =
    useState<BrowserUsageSettings>(DEFAULT_BROWSER_USAGE_SETTINGS)
  const [usageBusy, setUsageBusy] = useState(false)
  const [usageError, setUsageError] = useState<string | null>(null)

  const [token, setToken] = useState("")
  const [syncPassword, setSyncPassword] = useState("")
  const [rememberPassword, setRememberPassword] = useState(false)
  const [isSyncBusy, setIsSyncBusy] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null)
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [hasGist, setHasGist] = useState(false)
  const [hasRememberedPassword, setHasRememberedPassword] = useState(false)
  const [unlockedThisSession, setUnlockedThisSession] = useState(() =>
    hasSessionSyncPassword()
  )
  const [conflictCopies, setConflictCopies] = useState<ConflictCopy[] | null>(
    null
  )
  const [showChangelog, setShowChangelog] = useState(false)
  const [runtimeStatus, setRuntimeStatus] = useState<SyncRuntimeStatus>(() =>
    getSyncRuntimeStatus()
  )

  const stats = getDataStats()

  const tokenPrefillUrl = useMemo(() => getTokenPrefillUrl(), [])

  useEffect(() => {
    const load = async () => {
      const config = await getGistSyncConfig()
      setSyncEnabled(Boolean(config.enabled && config.token && config.gistId))
      setHasGist(Boolean(config.gistId))
      setToken(config.token ?? "")
      setRememberPassword(Boolean(config.rememberPassword))
      setHasRememberedPassword(
        Boolean(config.rememberPassword && (await hasRememberedSyncPassword()))
      )
    }
    void load()
  }, [])

  useEffect(() => {
    void getBrowserUsageSettings().then(setUsageSettingsState)
  }, [])

  useEffect(() => {
    setRuntimeStatus(getSyncRuntimeStatus())
    return subscribeSyncRuntimeStatus(setRuntimeStatus)
  }, [])

  const syncStatusCopy = useMemo(
    () =>
      getSyncStatusCopy({
        hasToken: Boolean(token.trim()),
        syncEnabled,
        hasGist,
        hasPassword: Boolean(syncPassword.trim()) || hasRememberedPassword,
        runtimeStatus,
        isSyncBusy,
      }),
    [
      hasGist,
      hasRememberedPassword,
      isSyncBusy,
      runtimeStatus,
      syncEnabled,
      syncPassword,
      token,
    ]
  )

  const syncStage: "setup" | "locked" | "ready" =
    !syncEnabled || !hasGist
      ? "setup"
      : hasRememberedPassword || unlockedThisSession
        ? "ready"
        : "locked"

  const handleExport = () => {
    setIsExporting(true)
    void downloadBackup({ includeApiKey }).finally(() => {
      setTimeout(() => setIsExporting(false), 500)
    })
  }

  const persistUsageSettings = async (
    nextSettings: BrowserUsageSettings
  ): Promise<void> => {
    setUsageBusy(true)
    setUsageError(null)
    try {
      await setBrowserUsageSettings(nextSettings)
      setUsageSettingsState(nextSettings)
    } catch (error) {
      setUsageError(
        error instanceof Error ? error.message : "浏览统计设置保存失败"
      )
    } finally {
      setUsageBusy(false)
    }
  }

  const handleUsageEnabledChange = async (enabled: boolean): Promise<void> => {
    if (enabled) {
      const granted = await requestBrowserUsagePermissions()
      if (!granted) {
        setUsageError("需要授予网站访问权限后才能统计浏览时长")
        return
      }
      await persistUsageSettings({ ...usageSettings, enabled: true })
      return
    }

    await persistUsageSettings({ ...usageSettings, enabled: false })
    void removeBrowserUsagePermissions()
  }

  const handleUsagePrivacyChange = async (
    key: "includePagePath" | "includePageTitle",
    checked: boolean
  ): Promise<void> => {
    await persistUsageSettings({ ...usageSettings, [key]: checked })
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setImportResult(null)

    try {
      const result = await importFromFile(file)
      setImportResult(result)

      if (result.success) {
        // 延迟刷新以显示结果
        setTimeout(() => {
          emitSettingsApplied()
        }, 2000)
      }
    } finally {
      setIsImporting(false)
      // 清空文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleValidateToken = async () => {
    setIsSyncBusy(true)
    setSyncError(null)
    setSyncSuccess(null)
    try {
      if (!(await ensureSyncPermissions())) {
        setSyncError("未授予 GitHub API 访问权限，无法使用云同步")
        return
      }
      await validateGitHubToken(token.trim())
      setSyncSuccess(
        "Token 验证成功。下一步点击连接并自动发现；有旧备份会提示输入同步密码，没有旧备份会创建新的私有加密 Gist。"
      )
    } catch (error) {
      setSyncError(formatSyncError(error, "Token 验证失败"))
    } finally {
      setIsSyncBusy(false)
    }
  }

  const handleConnect = async () => {
    setIsSyncBusy(true)
    setSyncError(null)
    setSyncSuccess(null)
    try {
      const t = token.trim()
      if (!t) {
        setSyncError("请先输入 GitHub Token")
        return
      }
      if (!(await ensureSyncPermissions())) {
        setSyncError("未授予 GitHub API 访问权限，无法使用云同步")
        return
      }

      const pwd = syncPassword.trim()
      const result = await connectOrDiscover({
        token: t,
        password: pwd || undefined,
        rememberPassword,
      })

      setHasGist(Boolean(result.gistId))
      setSyncEnabled(true)
      setSyncSuccess(
        result.foundExisting
          ? "已找到已有加密备份。输入创建备份时的同步密码后，点击解锁并拉取。"
          : "未发现旧备份，已创建新的私有加密 Gist。后续会使用同一个同步密码加密推送。"
      )
      setHasRememberedPassword(Boolean(rememberPassword && pwd))

      if (pwd) {
        setSyncPasswordForSession(pwd)
        setUnlockedThisSession(true)
        await pullNow()
        emitSettingsApplied()
      }
    } catch (error) {
      setSyncError(formatSyncError(error, "连接失败"))
    } finally {
      setIsSyncBusy(false)
    }
  }

  const handleDisconnect = async () => {
    setIsSyncBusy(true)
    setSyncError(null)
    setSyncSuccess(null)
    try {
      await disconnectGistSync()
      setSyncEnabled(false)
      setHasGist(false)
      setHasRememberedPassword(false)
    } catch (error) {
      setSyncError(formatSyncError(error, "断开失败"))
    } finally {
      setIsSyncBusy(false)
    }
  }

  const handlePullNow = async () => {
    setIsSyncBusy(true)
    setSyncError(null)
    setSyncSuccess(null)
    try {
      await pullNow()
      emitSettingsApplied()
    } catch (error) {
      setSyncError(formatSyncError(error, "拉取失败"))
    } finally {
      setIsSyncBusy(false)
    }
  }

  const handleListConflicts = async () => {
    setIsSyncBusy(true)
    setSyncError(null)
    setSyncSuccess(null)
    try {
      const copies = await listConflictCopies()
      setConflictCopies(copies)
      if (copies.length === 0) setSyncSuccess("云端没有冲突副本")
    } catch (error) {
      setSyncError(formatSyncError(error, "获取冲突副本失败"))
    } finally {
      setIsSyncBusy(false)
    }
  }

  const handleRestoreConflict = async (filename: string) => {
    const confirmed = window.confirm(
      "用该冲突副本覆盖本地数据？当前本地数据将被替换，且无法撤销。"
    )
    if (!confirmed) return
    setIsSyncBusy(true)
    setSyncError(null)
    try {
      await restoreConflictCopy(filename)
      emitSettingsApplied()
    } catch (error) {
      setSyncError(
        error instanceof Error && error.message === "NEED_PASSWORD"
          ? "需要先输入同步密码（解锁并拉取一次）"
          : formatSyncError(error, "恢复冲突副本失败")
      )
    } finally {
      setIsSyncBusy(false)
    }
  }

  const handleUnlockAndPull = async () => {
    setIsSyncBusy(true)
    setSyncError(null)
    setSyncSuccess(null)
    try {
      const pwd = syncPassword.trim()
      if (!pwd) {
        setSyncError("请输入同步密码")
        return
      }
      setSyncPasswordForSession(pwd)
      setUnlockedThisSession(true)
      setHasRememberedPassword(Boolean(rememberPassword))
      await pullNow()
      emitSettingsApplied()
    } catch (error) {
      setSyncError(formatSyncError(error, "拉取失败"))
    } finally {
      setIsSyncBusy(false)
    }
  }

  const handleForcePush = async () => {
    setIsSyncBusy(true)
    setSyncError(null)
    setSyncSuccess(null)
    try {
      const pwd = syncPassword.trim()
      if (pwd) setSyncPasswordForSession(pwd)
      await pushNow({ force: true })
      setSyncSuccess("已强制推送到云端备份。")
    } catch (error) {
      setSyncError(formatSyncError(error, "推送失败"))
    } finally {
      setIsSyncBusy(false)
    }
  }

  return (
    <ScrollContainer>
      <Container>
        {/* 左侧列：数据统计和导出 */}
        <SettingsColumn>
          {/* 数据统计 */}
          <Section>
            <SectionTitle>数据统计</SectionTitle>
            <Description>当前存储的数据概览</Description>

            <StatsCard>
              {stats.breakdown.map(item => (
                <StatsRow key={item.category}>
                  <StatsLabel>{item.category}</StatsLabel>
                  <StatsValue>
                    {item.keys} 项 / {item.size}
                  </StatsValue>
                </StatsRow>
              ))}
              <StatsSummary>
                <span>总计</span>
                <span>
                  {stats.totalKeys} 项 / {stats.totalSize}
                </span>
              </StatsSummary>
            </StatsCard>
          </Section>

          <Section>
            <SectionTitle>浏览时长统计</SectionTitle>
            <Description>
              默认关闭。启用后扩展会在已授权的网站上统计浏览时长；默认仅保存域名，不保存路径或标题。
            </Description>

            <Toggle
              label="启用浏览时长统计"
              checked={usageSettings.enabled}
              disabled={usageBusy}
              onChange={checked => void handleUsageEnabledChange(checked)}
            />

            <Toggle
              label="记录页面路径（默认仅记录域名）"
              checked={usageSettings.includePagePath}
              disabled={usageBusy || !usageSettings.enabled}
              onChange={checked =>
                void handleUsagePrivacyChange("includePagePath", checked)
              }
            />

            <Toggle
              label="记录页面标题（可能包含敏感信息）"
              checked={usageSettings.includePageTitle}
              disabled={usageBusy || !usageSettings.enabled}
              onChange={checked =>
                void handleUsagePrivacyChange("includePageTitle", checked)
              }
            />

            {(usageSettings.includePagePath ||
              usageSettings.includePageTitle) &&
              usageSettings.enabled && (
                <WarningBox>
                  <WarningIcon>
                    <FontAwesomeIcon icon={faExclamationTriangle} />
                  </WarningIcon>
                  <span>
                    路径和标题可能包含搜索词、文档名或私密上下文；只在确实需要更精细报告时启用。
                  </span>
                </WarningBox>
              )}

            {usageError && (
              <ResultMessage success={false}>
                <ResultIcon success={false}>
                  <FontAwesomeIcon icon={faExclamationTriangle} />
                </ResultIcon>
                <ResultDetails>
                  <strong>浏览统计设置错误</strong>
                  <span>{usageError}</span>
                </ResultDetails>
              </ResultMessage>
            )}
          </Section>

          {/* 导出数据 */}
          <Section>
            <SectionTitle>导出数据</SectionTitle>
            <Description>
              将所有设置和数据导出为 JSON 文件，可用于备份或迁移到其他设备
            </Description>

            <Toggle
              label="包含 API Key（不推荐，存在安全风险）"
              checked={includeApiKey}
              onChange={setIncludeApiKey}
            />

            {includeApiKey && (
              <WarningBox>
                <WarningIcon>
                  <FontAwesomeIcon icon={faExclamationTriangle} />
                </WarningIcon>
                <span>
                  导出的文件将包含你的 API
                  Key，请妥善保管备份文件，不要分享给他人
                </span>
              </WarningBox>
            )}

            <Button
              variant="primary"
              type="button"
              onClick={handleExport}
              disabled={isExporting}
            >
              <FontAwesomeIcon icon={faDownload} />
              {isExporting ? "导出中..." : "导出数据"}
            </Button>
          </Section>
        </SettingsColumn>

        {/* 右侧列：导入数据 */}
        <SettingsColumn>
          <Section>
            <SectionTitle>导入数据</SectionTitle>
            <Description>
              从备份文件恢复数据，导入后将覆盖当前设置（API Key 会保留当前值）
            </Description>

            <WarningBox>
              <WarningIcon>
                <FontAwesomeIcon icon={faExclamationTriangle} />
              </WarningIcon>
              <span>
                导入数据将覆盖当前所有设置，此操作不可撤销。建议先导出当前数据作为备份
              </span>
            </WarningBox>

            <HiddenInput
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={e => void handleFileChange(e)}
            />

            <Button
              variant="secondary"
              type="button"
              onClick={handleImportClick}
              disabled={isImporting}
            >
              <FontAwesomeIcon icon={faUpload} />
              {isImporting ? "导入中..." : "选择备份文件"}
            </Button>

            {importResult && (
              <ResultMessage success={importResult.success}>
                <ResultIcon success={importResult.success}>
                  <FontAwesomeIcon
                    icon={
                      importResult.success ? faCheck : faExclamationTriangle
                    }
                  />
                </ResultIcon>
                <ResultDetails>
                  {importResult.success ? (
                    <>
                      <strong>导入成功！</strong>
                      <span>
                        已导入 {importResult.importedKeys.length} 项数据
                      </span>
                      {importResult.skippedKeys.length > 0 && (
                        <span>跳过 {importResult.skippedKeys.length} 项</span>
                      )}
                      <span>页面将在 2 秒后刷新...</span>
                    </>
                  ) : (
                    <>
                      <strong>导入失败</strong>
                      {importResult.errors.map(error => (
                        <span key={error}>{error}</span>
                      ))}
                    </>
                  )}
                </ResultDetails>
              </ResultMessage>
            )}
          </Section>
        </SettingsColumn>

        {/* 云同步：GitHub Gist */}
        <SettingsColumn>
          <Section>
            <SectionTitle>云同步（GitHub Gist）</SectionTitle>
            <Description>
              使用私有 Gist 存储加密后的备份数据。默认自动拉取/防抖自动推送；
              发生冲突时不会覆盖主文件。
            </Description>

            <StatusRow>
              <StatusLabel>当前状态</StatusLabel>
              <StatusValue>
                <StatusHeadline>{syncStatusCopy.headline}</StatusHeadline>
                <StatusDetail>{syncStatusCopy.detail}</StatusDetail>
              </StatusValue>
            </StatusRow>

            {syncStage === "setup" && (
              <>
                <Description>
                  第一步：生成 Token（勾选 gist 权限）{" "}
                  <Link href={tokenPrefillUrl} target="_blank" rel="noreferrer">
                    Generate GitHub Token
                  </Link>
                </Description>

                <TextInput
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="粘贴 GitHub Personal Access Token (classic)"
                  type="password"
                  autoComplete="off"
                />

                <WarningBox>
                  <WarningIcon>
                    <FontAwesomeIcon icon={faExclamationTriangle} />
                  </WarningIcon>
                  <span>
                    Token 会保存在浏览器本地扩展存储中，用于自动同步；云端备份内容会加密，但
                    Token 本身不会写入云端备份文件。
                  </span>
                </WarningBox>

                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => void handleValidateToken()}
                  disabled={isSyncBusy || !token.trim()}
                >
                  验证 Token
                </Button>

                <Description>
                  第二步：设置同步密码（PBKDF2 派生 AES-256 密钥；云端只保存
                  salt/iv 和密文）
                </Description>

                <TextInput
                  value={syncPassword}
                  onChange={e => setSyncPassword(e.target.value)}
                  placeholder="同步密码（建议强密码）"
                  type="password"
                  autoComplete="off"
                />

                <Toggle
                  label="记住同步密码（不推荐）"
                  checked={rememberPassword}
                  onChange={setRememberPassword}
                />

                <Button
                  variant="primary"
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={isSyncBusy || !token.trim()}
                >
                  连接并自动发现
                </Button>
              </>
            )}

            {syncStage === "locked" && (
              <>
                <TextInput
                  value={syncPassword}
                  onChange={e => setSyncPassword(e.target.value)}
                  placeholder="输入创建备份时的同步密码"
                  type="password"
                  autoComplete="off"
                />

                <Toggle
                  label="记住同步密码（不推荐）"
                  checked={rememberPassword}
                  onChange={setRememberPassword}
                />

                <Button
                  variant="primary"
                  type="button"
                  onClick={() => void handleUnlockAndPull()}
                  disabled={isSyncBusy || !syncPassword.trim()}
                >
                  解锁并拉取
                </Button>

                <Advanced>
                  <summary>高级操作</summary>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void handleConnect()}
                    disabled={isSyncBusy || !token.trim()}
                  >
                    重新发现/连接
                  </Button>
                  <Button
                    variant="danger"
                    type="button"
                    onClick={() => void handleDisconnect()}
                    disabled={isSyncBusy}
                  >
                    断开云同步
                  </Button>
                </Advanced>
              </>
            )}

            {syncStage === "ready" && (
              <>
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => void handlePullNow()}
                  disabled={isSyncBusy}
                >
                  立即拉取云端数据
                </Button>

                <Advanced>
                  <summary>高级操作</summary>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void handleForcePush()}
                    disabled={isSyncBusy}
                  >
                    强制覆盖云端（推送）
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void handleListConflicts()}
                    disabled={isSyncBusy}
                  >
                    查看云端冲突副本
                  </Button>
                  {conflictCopies && conflictCopies.length > 0 && (
                    <>
                      <Description>
                        推送冲突时另存的加密快照（最多保留 3
                        份），可用其覆盖本地数据：
                      </Description>
                      {conflictCopies.map(copy => (
                        <Button
                          key={copy.filename}
                          variant="secondary"
                          type="button"
                          onClick={() =>
                            void handleRestoreConflict(copy.filename)
                          }
                          disabled={isSyncBusy}
                        >
                          恢复 {new Date(copy.timestamp).toLocaleString()}
                          （设备 {copy.deviceId.slice(0, 8)}）
                        </Button>
                      ))}
                    </>
                  )}
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void handleConnect()}
                    disabled={isSyncBusy || !token.trim()}
                  >
                    重新发现/连接
                  </Button>
                  <Button
                    variant="danger"
                    type="button"
                    onClick={() => void handleDisconnect()}
                    disabled={isSyncBusy}
                  >
                    断开云同步
                  </Button>
                </Advanced>
              </>
            )}

            {syncSuccess && (
              <ResultMessage success>
                <ResultIcon success>
                  <FontAwesomeIcon icon={faCheck} />
                </ResultIcon>
                <ResultDetails>
                  <strong>云同步状态</strong>
                  <span>{syncSuccess}</span>
                </ResultDetails>
              </ResultMessage>
            )}

            {syncError && (
              <ResultMessage success={false}>
                <ResultIcon success={false}>
                  <FontAwesomeIcon icon={faExclamationTriangle} />
                </ResultIcon>
                <ResultDetails>
                  <strong>云同步错误</strong>
                  <span>{syncError}</span>
                </ResultDetails>
              </ResultMessage>
            )}
          </Section>

          <Section>
            <SectionTitle>危险操作</SectionTitle>
            <Description>
              删除本机的全部设置与数据（链接、主题、待办、统计、同步配置），且无法恢复。
            </Description>
            <Button
              variant="danger"
              type="button"
              onClick={() => {
                const confirmed = window.confirm(
                  "确定要清除全部设置吗？链接、主题、待办和统计数据都会被删除，且无法恢复。"
                )
                if (!confirmed) return
                localStorage.clear()
                window.location.reload()
              }}
            >
              清除全部设置
            </Button>
          </Section>

          <Section>
            <SectionTitle>更新日志</SectionTitle>
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowChangelog(prev => !prev)}
            >
              {showChangelog ? "收起更新日志" : "查看更新日志"}
            </Button>
            {showChangelog && (
              <Suspense fallback={<Description>正在加载...</Description>}>
                <Changelog />
              </Suspense>
            )}
          </Section>
        </SettingsColumn>
      </Container>
    </ScrollContainer>
  )
}
