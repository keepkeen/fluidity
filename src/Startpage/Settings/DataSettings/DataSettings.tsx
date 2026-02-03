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
  padding-right: 10px;
`

const Container = styled.div`
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 30px;
  padding-bottom: 20px;
`

const SettingsColumn = styled.div`
  flex: 1;
  min-width: 280px;
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
  flex: 1;
  min-width: 140px;
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

const HiddenInput = styled.input`
  display: none;
`

const TextInput = styled.input`
  width: 100%;
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
`

const StatusLabel = styled.span`
  font-size: 0.9rem;
  opacity: 0.9;
`

const StatusValue = styled.span`
  font-size: 0.85rem;
  opacity: 0.8;
  text-align: right;
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

export const DataSettings: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [includeApiKey, setIncludeApiKey] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const [token, setToken] = useState("")
  const [syncPassword, setSyncPassword] = useState("")
  const [rememberPassword, setRememberPassword] = useState(false)
  const [isSyncBusy, setIsSyncBusy] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [hasGist, setHasGist] = useState(false)
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
    }
    void load()
  }, [])

  useEffect(() => {
    setRuntimeStatus(getSyncRuntimeStatus())
    return subscribeSyncRuntimeStatus(setRuntimeStatus)
  }, [])

  const handleExport = () => {
    setIsExporting(true)
    void downloadBackup({ includeApiKey }).finally(() => {
      setTimeout(() => setIsExporting(false), 500)
    })
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
    try {
      await validateGitHubToken(token.trim())
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Token 验证失败")
    } finally {
      setIsSyncBusy(false)
    }
  }

  const handleConnect = async () => {
    setIsSyncBusy(true)
    setSyncError(null)
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

      if (pwd) {
        setSyncPasswordForSession(pwd)
        await pullNow()
        window.location.reload()
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "连接失败")
    } finally {
      setIsSyncBusy(false)
    }
  }

  const handleDisconnect = async () => {
    setIsSyncBusy(true)
    setSyncError(null)
    try {
      await disconnectGistSync()
      setSyncEnabled(false)
      setHasGist(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "断开失败")
    } finally {
      setIsSyncBusy(false)
    }
  }

  const handleUnlockAndPull = async () => {
    setIsSyncBusy(true)
    setSyncError(null)
    try {
      const pwd = syncPassword.trim()
      if (!pwd) {
        setSyncError("请输入同步密码")
        return
      }
      setSyncPasswordForSession(pwd)
      await pullNow()
      window.location.reload()
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "拉取失败")
    } finally {
      setIsSyncBusy(false)
    }
  }

  const handleForcePush = async () => {
    setIsSyncBusy(true)
    setSyncError(null)
    try {
      const pwd = syncPassword.trim()
      if (pwd) setSyncPasswordForSession(pwd)
      await pushNow({ force: true })
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "推送失败")
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
                {runtimeStatus.message ?? runtimeStatus.state}
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

            <Button
              variant="secondary"
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
              onClick={() => void handleConnect()}
              disabled={isSyncBusy || !token.trim()}
            >
              {syncEnabled ? "重新发现/连接" : "连接并自动发现"}
            </Button>

            <Button
              variant="secondary"
              onClick={() => void handleUnlockAndPull()}
              disabled={isSyncBusy || !hasGist}
            >
              解锁并拉取
            </Button>

            <Button
              variant="secondary"
              onClick={() => void handleForcePush()}
              disabled={isSyncBusy || !hasGist}
            >
              强制覆盖云端（推送）
            </Button>

            <Button
              variant="secondary"
              onClick={() => void handleDisconnect()}
              disabled={isSyncBusy}
            >
              断开云同步
            </Button>

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
