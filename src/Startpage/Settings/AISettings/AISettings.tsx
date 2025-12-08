import React, { useState } from "react"

import styled from "@emotion/styled"
import {
  faEye,
  faEyeSlash,
  faSync,
  faTrash,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { AISettings as AISettingsType } from "../../../services/ai"
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
  border-bottom: 1px solid var(--default-color);
  opacity: 0.9;
`

const ToggleContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
`

const Toggle = styled.button<{ active: boolean }>`
  width: 50px;
  height: 26px;
  border-radius: 13px;
  border: 2px solid var(--default-color);
  background: ${({ active }) =>
    active ? "var(--accent-color)" : "transparent"};
  cursor: pointer;
  position: relative;
  transition: 0.3s;

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: ${({ active }) => (active ? "24px" : "2px")};
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: ${({ active }) =>
      active ? "var(--bg-color)" : "var(--default-color)"};
    transition: 0.3s;
  }
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
  border: 2px solid var(--default-color);
  color: var(--default-color);
  font-size: 0.9rem;
  transition: 0.2s;

  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  &::placeholder {
    color: var(--default-color);
    opacity: 0.5;
  }
`

const IconBtn = styled.button`
  padding: 10px;
  background: transparent;
  border: 2px solid var(--default-color);
  color: var(--default-color);
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    background: var(--accent-color);
    color: var(--bg-color);
  }
`

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-color);
  border: 2px solid var(--default-color);
  color: var(--default-color);
  font-size: 0.9rem;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  option {
    background: var(--bg-color);
    color: var(--default-color);
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
  border: 2px solid var(--default-color);
  margin-top: 12px;
`

const StatRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px dashed var(--default-color);
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
  color: var(--accent-color);
`

const TestButton = styled.button`
  width: 100%;
  padding: 12px;
  margin-top: 12px;
  background: var(--accent-color);
  border: 2px solid var(--default-color);
  color: var(--bg-color);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover {
    background: var(--accent-color2);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const TestResult = styled.div<{ error?: boolean }>`
  margin-top: 12px;
  padding: 12px;
  border: 2px solid
    ${({ error }) => (error ? "var(--accent-color2)" : "var(--accent-color)")};
  font-size: 0.9rem;
  line-height: 1.5;
  word-break: break-word;
`

const PrivacyButtonRow = styled.div`
  display: flex;
  gap: 12px;
`

const PrivacyButton = styled.button`
  flex: 1;
  padding: 10px 12px;
  background: transparent;
  border: 2px solid var(--accent-color2);
  color: var(--accent-color2);
  font-size: 0.85rem;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover {
    background: var(--accent-color2);
    color: var(--bg-color);
  }
`

interface Props {
  aiSettings: AISettingsType
  setAISettings: React.Dispatch<React.SetStateAction<AISettingsType>>
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
      const { callDeepSeekAPI } = await import("../../../services/ai")
      const result = await callDeepSeekAPI(
        aiSettings.apiKey,
        "请用一句话介绍你自己（不超过30字）",
        aiSettings.model
      )
      setTestResult({ message: `✅ 连接成功！AI 回复: "${result}"` })
    } catch (error) {
      setTestResult({
        message: `❌ 连接失败: ${
          error instanceof Error ? error.message : "未知错误"
        }`,
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
              <ToggleContainer>
                <SettingsLabel style={{ padding: 0 }}>
                  启用 AI 提示
                </SettingsLabel>
                <Toggle
                  active={aiSettings.enabled}
                  onClick={() =>
                    setAISettings(prev => ({ ...prev, enabled: !prev.enabled }))
                  }
                />
              </ToggleContainer>
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
                <IconBtn onClick={() => setShowApiKey(!showApiKey)}>
                  <FontAwesomeIcon icon={showApiKey ? faEyeSlash : faEye} />
                </IconBtn>
              </InputContainer>
              <HelpText>
                在 platform.deepseek.com 获取 API Key，数据仅存储在本地
              </HelpText>
            </SettingElement>

            <SettingElement>
              <SettingsLabel>模型选择</SettingsLabel>
              <Select
                value={aiSettings.model}
                onChange={e =>
                  setAISettings(prev => ({ ...prev, model: e.target.value }))
                }
              >
                <option value="deepseek-chat">DeepSeek Chat (推荐)</option>
                <option value="deepseek-reasoner">DeepSeek Reasoner</option>
              </Select>
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

            <TestButton onClick={() => void handleTestAPI()} disabled={testing}>
              <FontAwesomeIcon icon={faSync} spin={testing} />
              {testing ? "测试中..." : "测试 API 连接"}
            </TestButton>

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
              <PrivacyButtonRow>
                <PrivacyButton
                  onClick={() => {
                    SearchHistory.clear()
                    window.location.reload()
                  }}
                >
                  <FontAwesomeIcon icon={faTrash} />
                  清除搜索历史
                </PrivacyButton>
                <PrivacyButton
                  onClick={() => {
                    LinkAnalytics.clear()
                    window.location.reload()
                  }}
                >
                  <FontAwesomeIcon icon={faTrash} />
                  清除点击记录
                </PrivacyButton>
              </PrivacyButtonRow>
            </SettingElement>

            <SettingElement>
              <PrivacyButton
                onClick={() => {
                  SearchHistory.clear()
                  LinkAnalytics.clear()
                  localStorage.removeItem("ai-cache")
                  window.location.reload()
                }}
                style={{ width: "100%" }}
              >
                <FontAwesomeIcon icon={faTrash} />
                清除所有行为数据
              </PrivacyButton>
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
              <ToggleContainer>
                <SettingsLabel style={{ padding: 0 }}>
                  记录链接点击
                </SettingsLabel>
                <Toggle
                  active={aiSettings.collectLinkClicks}
                  onClick={() =>
                    setAISettings(prev => ({
                      ...prev,
                      collectLinkClicks: !prev.collectLinkClicks,
                    }))
                  }
                />
              </ToggleContainer>
              <HelpText>记录你点击的链接，用于统计最常访问</HelpText>
            </SettingElement>

            <SettingElement>
              <ToggleContainer>
                <SettingsLabel style={{ padding: 0 }}>
                  记录搜索历史
                </SettingsLabel>
                <Toggle
                  active={aiSettings.collectSearchHistory}
                  onClick={() =>
                    setAISettings(prev => ({
                      ...prev,
                      collectSearchHistory: !prev.collectSearchHistory,
                    }))
                  }
                />
              </ToggleContainer>
              <HelpText>记录你的搜索内容，用于统计搜索习惯</HelpText>
            </SettingElement>
          </SettingsGroup>

          <SettingsGroup>
            <GroupTitle>AI 数据共享</GroupTitle>
            <HelpText style={{ marginTop: 0, marginBottom: 12 }}>
              控制哪些数据发送给 AI 生成个性化提示
            </HelpText>

            <SettingElement>
              <ToggleContainer>
                <SettingsLabel style={{ padding: 0 }}>
                  最常访问链接
                </SettingsLabel>
                <Toggle
                  active={aiSettings.shareTopLinks}
                  onClick={() =>
                    setAISettings(prev => ({
                      ...prev,
                      shareTopLinks: !prev.shareTopLinks,
                    }))
                  }
                />
              </ToggleContainer>
            </SettingElement>

            <SettingElement>
              <ToggleContainer>
                <SettingsLabel style={{ padding: 0 }}>
                  最近搜索记录
                </SettingsLabel>
                <Toggle
                  active={aiSettings.shareRecentSearches}
                  onClick={() =>
                    setAISettings(prev => ({
                      ...prev,
                      shareRecentSearches: !prev.shareRecentSearches,
                    }))
                  }
                />
              </ToggleContainer>
            </SettingElement>

            <SettingElement>
              <ToggleContainer>
                <SettingsLabel style={{ padding: 0 }}>待办事项</SettingsLabel>
                <Toggle
                  active={aiSettings.shareTodos}
                  onClick={() =>
                    setAISettings(prev => ({
                      ...prev,
                      shareTodos: !prev.shareTodos,
                    }))
                  }
                />
              </ToggleContainer>
            </SettingElement>

            <SettingElement>
              <ToggleContainer>
                <SettingsLabel style={{ padding: 0 }}>点击统计数</SettingsLabel>
                <Toggle
                  active={aiSettings.shareClickStats}
                  onClick={() =>
                    setAISettings(prev => ({
                      ...prev,
                      shareClickStats: !prev.shareClickStats,
                    }))
                  }
                />
              </ToggleContainer>
            </SettingElement>

            <SettingElement>
              <ToggleContainer>
                <SettingsLabel style={{ padding: 0 }}>搜索统计数</SettingsLabel>
                <Toggle
                  active={aiSettings.shareSearchStats}
                  onClick={() =>
                    setAISettings(prev => ({
                      ...prev,
                      shareSearchStats: !prev.shareSearchStats,
                    }))
                  }
                />
              </ToggleContainer>
            </SettingElement>
          </SettingsGroup>
        </SettingsColumn>
      </GeneralSettingsContent>
    </ScrollContainer>
  )
}
