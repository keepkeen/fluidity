import React, { useEffect, useMemo, useRef, useState } from "react"

import styled from "@emotion/styled"
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
  connectOrDiscover,
  disconnectGistSync,
  getGistSyncConfig,
  getTokenPrefillUrl,
  pullNow,
  pushNow,
  setSyncPasswordForSession,
} from "../../../services/gistSync"
import {
  getSyncRuntimeStatus,
  subscribeSyncRuntimeStatus,
  SyncRuntimeStatus,
} from "../../../services/syncRuntime"

// CSS 变量常量
const ACCENT_COLOR = "var(--accent-color)"
const ACCENT_COLOR2 = "var(--accent-color2)"
const BG_COLOR = "var(--bg-color)"
const VARIANT_PRIMARY = "primary"

const isPrimary = (variant?: string) => variant === VARIANT_PRIMARY

const ScrollContainer = styled.div`
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 10px;
  box-sizing: border-box;

  @media screen and (max-width: 600px) {
    padding-right: 0;
  }
`

const Container = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  align-items: start;
  gap: 24px;
  padding-bottom: 20px;
  box-sizing: border-box;

  @media screen and (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: 20px;
  }
`

const SettingsColumn = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const SectionTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  opacity: 0.9;
`

const Description = styled.p`
  font-size: 0.85rem;
  opacity: 0.7;
  margin: 0;
  line-height: 1.5;
`

const StatsCard = styled.div`
  padding: 16px;
  border: 2px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const StatsRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border-color);
  opacity: 0.8;

  &:last-child {
    border-bottom: none;
  }
`

const StatsLabel = styled.span`
  font-size: 0.85rem;
`

const StatsValue = styled.span`
  font-size: 0.85rem;
  font-weight: 600;
  color: ${ACCENT_COLOR};
`

const StatsSummary = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.1);
  font-weight: 600;
`

const Button = styled.button<{
  variant?: "primary" | "secondary"
}>`
  width: 100%;
  min-width: 140px;
  box-sizing: border-box;
  padding: 12px 16px;
  border: 2px solid var(--default-color);
  background: ${({ variant }) =>
    isPrimary(variant) ? ACCENT_COLOR : "transparent"};
  color: ${({ variant }) =>
    isPrimary(variant) ? BG_COLOR : "var(--default-color)"};
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover {
    background: ${({ variant }) =>
      isPrimary(variant) ? ACCENT_COLOR2 : ACCENT_COLOR};
    color: ${BG_COLOR};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

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

const HiddenInput = styled.input`
  display: none;
`

const TextInput = styled.input`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 2px solid var(--default-color);
  background: transparent;
  color: var(--default-color);
  font-size: 0.9rem;

  &:focus {
    outline: none;
    border-color: ${ACCENT_COLOR};
  }
`

const Link = styled.a`
  color: ${ACCENT_COLOR};
  text-decoration: none;
  font-size: 0.9rem;

  &:hover {
    text-decoration: underline;
  }
`

const StatusRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 2px solid var(--border-color);
  min-width: 0;

  @media screen and (max-width: 600px) {
    align-items: flex-start;
    flex-direction: column;
  }
`

const StatusLabel = styled.span`
  font-size: 0.9rem;
  opacity: 0.9;
`

const StatusValue = styled.div`
  font-size: 0.85rem;
  opacity: 0.8;
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;

  @media screen and (max-width: 600px) {
    text-align: left;
  }
`

const StatusHeadline = styled.strong`
  font-size: 0.9rem;
  opacity: 1;
`

const StatusDetail = styled.span`
  line-height: 1.4;
`

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 8px 0;

  &:hover {
    opacity: 0.8;
  }
`

const Checkbox = styled.input`
  appearance: none;
  width: 18px;
  height: 18px;
  border: 2px solid var(--default-color);
  border-radius: 4px;
  cursor: pointer;
  position: relative;
  transition: 0.2s;

  &:checked {
    background: ${ACCENT_COLOR};
    border-color: ${ACCENT_COLOR};
  }

  &:checked::after {
    content: "✓";
    position: absolute;
    top: -2px;
    left: 3px;
    color: ${BG_COLOR};
    font-size: 14px;
    font-weight: 700;
  }
`

const CheckboxLabel = styled.span`
  font-size: 0.9rem;
`

const ResultMessage = styled.div<{ success: boolean }>`
  padding: 12px 16px;
  border: 2px solid ${({ success }) => (success ? "#39d353" : ACCENT_COLOR2)};
  background: ${({ success }) =>
    success ? "rgba(57, 211, 83, 0.1)" : "rgba(255, 100, 100, 0.1)"};
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.85rem;
  line-height: 1.5;
`

const ResultIcon = styled.span<{ success: boolean }>`
  color: ${({ success }) => (success ? "#39d353" : ACCENT_COLOR2)};
`

const ResultDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const WarningBox = styled.div`
  padding: 12px 16px;
  border: 2px solid ${ACCENT_COLOR2};
  background: rgba(255, 100, 100, 0.1);
  font-size: 0.85rem;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 10px;
`

const WarningIcon = styled.span`
  color: ${ACCENT_COLOR2};
`

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
        Boolean(config.rememberPassword && config.rememberedPassword)
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
        // 延迟刷新页面以显示结果
        setTimeout(() => {
          window.location.reload()
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
        await pullNow()
        window.location.reload()
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
      setHasRememberedPassword(Boolean(rememberPassword))
      await pullNow()
      window.location.reload()
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

            <CheckboxRow>
              <Checkbox
                type="checkbox"
                checked={usageSettings.enabled}
                disabled={usageBusy}
                onChange={e =>
                  void handleUsageEnabledChange(e.target.checked)
                }
              />
              <CheckboxLabel>启用浏览时长统计</CheckboxLabel>
            </CheckboxRow>

            <CheckboxRow>
              <Checkbox
                type="checkbox"
                checked={usageSettings.includePagePath}
                disabled={usageBusy || !usageSettings.enabled}
                onChange={e =>
                  void handleUsagePrivacyChange(
                    "includePagePath",
                    e.target.checked
                  )
                }
              />
              <CheckboxLabel>记录页面路径（默认仅记录域名）</CheckboxLabel>
            </CheckboxRow>

            <CheckboxRow>
              <Checkbox
                type="checkbox"
                checked={usageSettings.includePageTitle}
                disabled={usageBusy || !usageSettings.enabled}
                onChange={e =>
                  void handleUsagePrivacyChange(
                    "includePageTitle",
                    e.target.checked
                  )
                }
              />
              <CheckboxLabel>记录页面标题（可能包含敏感信息）</CheckboxLabel>
            </CheckboxRow>

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

            <CheckboxRow>
              <Checkbox
                type="checkbox"
                checked={includeApiKey}
                onChange={e => setIncludeApiKey(e.target.checked)}
              />
              <CheckboxLabel>
                包含 API Key（不推荐，存在安全风险）
              </CheckboxLabel>
            </CheckboxRow>

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
              第二步：设置同步密码（PBKDF2 派生 AES-256 密钥；云端只保存 salt/iv
              和密文）
            </Description>

            <TextInput
              value={syncPassword}
              onChange={e => setSyncPassword(e.target.value)}
              placeholder="同步密码（建议强密码）"
              type="password"
              autoComplete="off"
            />

            <CheckboxRow>
              <Checkbox
                type="checkbox"
                checked={rememberPassword}
                onChange={e => setRememberPassword(e.target.checked)}
              />
              <CheckboxLabel>记住同步密码（不推荐）</CheckboxLabel>
            </CheckboxRow>

            {rememberPassword && (
              <WarningBox>
                <WarningIcon>
                  <FontAwesomeIcon icon={faExclamationTriangle} />
                </WarningIcon>
                <span>
                  同步密码将保存在浏览器本地存储中，可能被同机其他人获取。建议仅在个人设备启用。
                </span>
              </WarningBox>
            )}

            <Button
              variant="primary"
              type="button"
              onClick={() => void handleConnect()}
              disabled={isSyncBusy || !token.trim()}
            >
              {syncEnabled ? "重新发现/连接" : "连接并自动发现"}
            </Button>

            <Button
              variant="secondary"
              type="button"
              onClick={() => void handleUnlockAndPull()}
              disabled={isSyncBusy || !hasGist}
            >
              解锁并拉取
            </Button>

            <Button
              variant="secondary"
              type="button"
              onClick={() => void handleForcePush()}
              disabled={isSyncBusy || !hasGist}
            >
              强制覆盖云端（推送）
            </Button>

            <Button
              variant="secondary"
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={isSyncBusy}
            >
              断开云同步
            </Button>

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
        </SettingsColumn>
      </Container>
    </ScrollContainer>
  )
}
