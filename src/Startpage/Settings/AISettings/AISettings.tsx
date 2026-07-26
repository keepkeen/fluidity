import React, { useState } from "react"

import styled from "@emotion/styled"
import {
  faEye,
  faEyeSlash,
  faSync,
  faTrash,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Button } from "../../../components/Button"
import { Toggle } from "../../../components/Toggle"
import {
  AISettings as AISettingsType,
  DEFAULT_AI_BASE_URL,
} from "../../../services/ai"
import { ensureAIPermissionsFor } from "../../../services/optionalPermissions"
import { emitSettingsApplied } from "../../../services/settingsEvents"
import {
  getAnalyticsSummary,
  LinkAnalytics,
  SearchHistory,
} from "../../../services/analytics"
import { SettingsLabel, SettingElement } from "../SettingsWindow"

// 外层滚动容器
const ScrollContainer = styled.div`
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding-right: 10px;
`

// 全宽布局容器，与其他设置页面保持一致
const GeneralSettingsContent = styled.div`
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 30px;
  padding-bottom: 20px;
`

const SettingsColumn = styled.div`
  flex: 1;
  min-width: 280px;
`

const SettingsGroup = styled.div`
  margin-bottom: 24px;
`

const GroupTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-default);
  opacity: 0.9;
`

const InputContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
`

const Input = styled.input`
  flex: 1;
  padding: 10px 12px;
  background: transparent;
  border: 2px solid var(--border-default);
  color: var(--text-primary);
  font-size: 0.9rem;
  transition: 0.2s;

  &:focus {
    outline: none;
    border-color: var(--accent);
  }

  &::placeholder {
    color: var(--text-primary);
    opacity: 0.5;
  }
`

const IconBtn = styled.button`
  padding: 10px;
  background: transparent;
  border: 2px solid var(--text-primary);
  color: var(--text-primary);
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    background: var(--accent);
    color: var(--bg-primary);
  }
`


const HelpText = styled.p`
  font-size: 0.8rem;
  opacity: 0.6;
  margin-top: 6px;
  line-height: 1.4;
`

const StatsCard = styled.div`
  padding: 16px;
  border: 2px solid var(--border-default);
  margin-top: 12px;
`

const StatRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border-default);
  opacity: 0.8;

  &:last-child {
    border-bottom: none;
  }
`

const StatLabel = styled.span`
  font-size: 0.85rem;
`

const StatValue = styled.span`
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent);
`

const ButtonRow = styled.div`
  display: flex;
  gap: 12px;
`

const TestResult = styled.div<{ error?: boolean }>`
  margin-top: 12px;
  padding: 12px;
  border: 2px solid
    ${({ error }) => (error ? "var(--accent-hover)" : "var(--accent)")};
  font-size: 0.9rem;
  line-height: 1.5;
  word-break: break-word;
`

interface Props {
  aiSettings: AISettingsType
  setAISettings: React.Dispatch<React.SetStateAction<AISettingsType>>
}

const formatAIError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : ""
  const lower = message.toLowerCase()

  if (message.includes("401") || lower.includes("auth")) {
    return "API Key 无效或已过期，请检查 DeepSeek API Key。"
  }
  if (message.includes("402") || lower.includes("balance")) {
    return "DeepSeek 账户额度不可用，请检查余额或计费状态。"
  }
  if (message.includes("429") || lower.includes("rate")) {
    return "请求过于频繁，请稍后再试。"
  }
  if (message.includes("请求超时") || lower.includes("network")) {
    return "网络请求失败，请检查连接后重试。"
  }

  return "连接失败，请稍后重试。"
}

export const AISettings = ({ aiSettings, setAISettings }: Props) => {
  const [showApiKey, setShowApiKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    message: string
    error?: boolean
  } | null>(null)

  const summary = getAnalyticsSummary()

  const handleTestAPI = async () => {
    if (!aiSettings.apiKey) {
      setTestResult({ message: "请先输入 API Key", error: true })
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      const baseUrl = aiSettings.apiBaseUrl.trim() || DEFAULT_AI_BASE_URL
      if (!(await ensureAIPermissionsFor(baseUrl))) {
        setTestResult({
          message: "❌ 未授予 AI 接口访问权限，无法调用 AI",
          error: true,
        })
        return
      }
      const { callDeepSeekAPI } = await import("../../../services/ai")
      const result = await callDeepSeekAPI(
        aiSettings.apiKey,
        "请用一句话介绍你自己（不超过30字）",
        aiSettings.model
      )
      setTestResult({ message: `✅ 连接成功！AI 回复: "${result}"` })
    } catch (error) {
      setTestResult({
        message: `❌ ${formatAIError(error)}`,
        error: true,
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <ScrollContainer>
      <GeneralSettingsContent>
        {/* 左侧列：基础设置和数据统计 */}
        <SettingsColumn>
          <SettingsGroup>
            <GroupTitle>AI 智能助手</GroupTitle>

            <SettingElement>
              <Toggle
                label="启用 AI 提示"
                checked={aiSettings.enabled}
                onChange={enabling => {
                  setAISettings(prev => ({ ...prev, enabled: enabling }))
                  // 在用户手势中按需申请 AI 接口域名权限
                  if (enabling) {
                    void ensureAIPermissionsFor(
                      aiSettings.apiBaseUrl.trim() || DEFAULT_AI_BASE_URL
                    )
                  }
                }}
              />
              <HelpText>
                开启后，页面顶部会显示 AI 生成的个性化问候和提醒
              </HelpText>
            </SettingElement>

            <SettingElement>
              <SettingsLabel>API Key</SettingsLabel>
              <InputContainer>
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={aiSettings.apiKey}
                  onChange={e =>
                    setAISettings(prev => ({ ...prev, apiKey: e.target.value }))
                  }
                  placeholder="输入你的 DeepSeek API Key"
                />
                <IconBtn
                  type="button"
                  aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                  title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  <FontAwesomeIcon icon={showApiKey ? faEyeSlash : faEye} />
                </IconBtn>
              </InputContainer>
              <HelpText>
                在 platform.deepseek.com 获取 API Key，数据仅存储在本地
              </HelpText>
            </SettingElement>

            <SettingElement>
              <SettingsLabel>API 地址</SettingsLabel>
              <Input
                type="text"
                value={aiSettings.apiBaseUrl}
                onChange={e =>
                  setAISettings(prev => ({
                    ...prev,
                    apiBaseUrl: e.target.value,
                  }))
                }
                placeholder={DEFAULT_AI_BASE_URL}
                aria-label="AI 接口地址"
              />
              <HelpText>
                任意 OpenAI 兼容接口，如 https://api.openai.com/v1
                或本地 Ollama（http://localhost:11434/v1）。留空使用 DeepSeek
              </HelpText>
            </SettingElement>

            <SettingElement>
              <SettingsLabel>模型</SettingsLabel>
              <Input
                type="text"
                list="ai-model-presets"
                value={aiSettings.model}
                onChange={e =>
                  setAISettings(prev => ({ ...prev, model: e.target.value }))
                }
                aria-label="AI 模型名称"
                placeholder="deepseek-chat"
              />
              <datalist id="ai-model-presets">
                <option value="deepseek-chat">DeepSeek Chat (推荐)</option>
                <option value="deepseek-reasoner">DeepSeek Reasoner</option>
              </datalist>
              <HelpText>与所选服务商匹配的模型名称</HelpText>
            </SettingElement>

            <SettingElement>
              <SettingsLabel>缓存时间 (分钟)</SettingsLabel>
              <Input
                type="number"
                min="1"
                max="1440"
                value={aiSettings.cacheMinutes}
                onChange={e =>
                  setAISettings(prev => ({
                    ...prev,
                    cacheMinutes: Math.max(1, parseInt(e.target.value) || 60),
                  }))
                }
              />
              <HelpText>
                AI 提示会缓存指定时间，避免频繁调用 API。建议 30-120 分钟
              </HelpText>
            </SettingElement>

            <Button
              type="button"
              variant="primary"
              onClick={() => void handleTestAPI()}
              disabled={testing}
            >
              <FontAwesomeIcon icon={faSync} spin={testing} />
              {testing ? "测试中..." : "测试 API 连接"}
            </Button>

            {testResult && (
              <TestResult error={testResult.error}>
                {testResult.message}
              </TestResult>
            )}
          </SettingsGroup>

          <SettingsGroup>
            <GroupTitle>数据统计</GroupTitle>
            <HelpText style={{ marginTop: 0, marginBottom: 12 }}>
              AI 会基于以下数据生成个性化提示
            </HelpText>

            <StatsCard>
              <StatRow>
                <StatLabel>链接点击总数</StatLabel>
                <StatValue>{summary.totalClicks}</StatValue>
              </StatRow>
              <StatRow>
                <StatLabel>搜索记录数</StatLabel>
                <StatValue>{summary.totalSearches}</StatValue>
              </StatRow>
              <StatRow>
                <StatLabel>最常访问</StatLabel>
                <StatValue>
                  {summary.topLinks.length > 0
                    ? summary.topLinks[0].label
                    : "暂无数据"}
                </StatValue>
              </StatRow>
              <StatRow>
                <StatLabel>最近搜索</StatLabel>
                <StatValue>
                  {summary.recentSearches.length > 0
                    ? summary.recentSearches[0].slice(0, 10) +
                      (summary.recentSearches[0].length > 10 ? "..." : "")
                    : "暂无数据"}
                </StatValue>
              </StatRow>
            </StatsCard>

            <HelpText style={{ marginTop: 12 }}>
              多使用链接和搜索功能，AI 会更了解你的习惯
            </HelpText>
          </SettingsGroup>

          <SettingsGroup>
            <GroupTitle>清除数据</GroupTitle>
            <HelpText style={{ marginTop: 0, marginBottom: 12 }}>
              清除本地存储的行为数据
            </HelpText>

            <SettingElement>
              <ButtonRow>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    SearchHistory.clear()
                    emitSettingsApplied()
                  }}
                >
                  <FontAwesomeIcon icon={faTrash} />
                  清除搜索历史
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    LinkAnalytics.clear()
                    emitSettingsApplied()
                  }}
                >
                  <FontAwesomeIcon icon={faTrash} />
                  清除点击记录
                </Button>
              </ButtonRow>
            </SettingElement>

            <SettingElement>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  SearchHistory.clear()
                  LinkAnalytics.clear()
                  localStorage.removeItem("ai-cache")
                  emitSettingsApplied()
                }}
              >
                <FontAwesomeIcon icon={faTrash} />
                清除所有行为数据
              </Button>
            </SettingElement>

            <HelpText>
              清除后 AI 将无法基于历史数据生成个性化提示，但不会影响其他设置
            </HelpText>
          </SettingsGroup>
        </SettingsColumn>

        {/* 右侧列：隐私控制 */}
        <SettingsColumn>
          <SettingsGroup>
            <GroupTitle>数据收集</GroupTitle>
            <HelpText style={{ marginTop: 0, marginBottom: 12 }}>
              控制是否记录你的使用数据
            </HelpText>

            <SettingElement>
              <Toggle
                label="记录链接点击"
                checked={aiSettings.collectLinkClicks}
                onChange={checked =>
                  setAISettings(prev => ({
                    ...prev,
                    collectLinkClicks: checked,
                  }))
                }
              />
              <HelpText>记录你点击的链接，用于统计最常访问</HelpText>
            </SettingElement>

            <SettingElement>
              <Toggle
                label="记录搜索历史"
                checked={aiSettings.collectSearchHistory}
                onChange={checked =>
                  setAISettings(prev => ({
                    ...prev,
                    collectSearchHistory: checked,
                  }))
                }
              />
              <HelpText>记录你的搜索内容，用于统计搜索习惯</HelpText>
            </SettingElement>
          </SettingsGroup>

          <SettingsGroup>
            <GroupTitle>AI 数据共享</GroupTitle>
            <HelpText style={{ marginTop: 0, marginBottom: 12 }}>
              控制哪些数据发送给 AI 生成个性化提示
            </HelpText>

            <SettingElement>
              <Toggle
                label="发送使用习惯"
                checked={aiSettings.shareHabits}
                onChange={checked =>
                  setAISettings(prev => ({ ...prev, shareHabits: checked }))
                }
              />
              <HelpText>
                包含常用链接、最近搜索与点击/搜索统计
              </HelpText>
            </SettingElement>

            <SettingElement>
              <Toggle
                label="发送浏览记录"
                checked={aiSettings.shareBrowserUsage}
                onChange={checked =>
                  setAISettings(prev => ({
                    ...prev,
                    shareBrowserUsage: checked,
                  }))
                }
              />
              <HelpText>
                仅在你已启用浏览时长统计时有数据；默认不发送给 AI
              </HelpText>
            </SettingElement>
          </SettingsGroup>
        </SettingsColumn>
      </GeneralSettingsContent>
    </ScrollContainer>
  )
}
