import React, { useState, useCallback, useEffect } from "react"

import styled from "@emotion/styled"
import { faBookmark, faMagic, faSpinner } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { LinkGroupEditor } from "./LinkGroupEditor"
import { OptionTextArea } from "./OptionTextArea"
import { linkGroup } from "../../../data/data"
import { AISettingsManager } from "../../../services/ai"
import {
  importBookmarksAsLinkGroups,
  isBookmarkImportSupported,
} from "../../../services/bookmarkImport"
import {
  organizeLinksWithAI,
  getOrganizeStatus,
  subscribeOrganizeStatus,
} from "../../../services/linkOrganizer"
import { SettingsLabel } from "../SettingsWindow"

interface props {
  linkGroups: linkGroup[]
  setLinkGroups: (value: linkGroup[]) => void
}

export const GeneralSettingsContent = styled.div`
  width: 100%;
  position: relative;
`

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
`

const JsonModeToggle = styled.button`
  align-self: flex-start;
  margin-top: 8px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 0.8rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 4px 0;

  :hover {
    color: var(--accent);
  }
`

const HeaderButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const AIButton = styled.button<{ $loading?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: transparent;
  border: 2px solid var(--accent);
  color: var(--accent);
  cursor: ${({ $loading }) => ($loading ? "wait" : "pointer")};
  font-size: 0.85rem;
  transition: 0.2s;
  opacity: ${({ $loading }) => ($loading ? 0.7 : 1)};

  &:hover:not(:disabled) {
    background: var(--accent);
    color: var(--bg-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    ${({ $loading }) => $loading && "animation: spin 1s linear infinite;"}
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`

const CustomPromptOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`

const CustomPromptDialog = styled.div`
  background: var(--bg-primary);
  border: 2px solid var(--text-primary);
  padding: 24px;
  max-width: 500px;
  width: 90%;
`

const DialogTitle = styled.h3`
  margin: 0 0 16px 0;
  color: var(--accent);
  font-size: 1.1rem;
`

const DialogDescription = styled.p`
  margin: 0 0 16px 0;
  color: var(--text-primary);
  font-size: 0.85rem;
  opacity: 0.8;
  line-height: 1.5;
`

const CustomPromptInput = styled.textarea`
  width: 100%;
  min-height: 100px;
  padding: 12px;
  background: transparent;
  border: 2px solid var(--text-primary);
  color: var(--text-primary);
  font-size: 0.9rem;
  resize: vertical;
  margin-bottom: 16px;

  &::placeholder {
    color: var(--text-primary);
    opacity: 0.4;
  }

  &:focus {
    outline: none;
    border-color: var(--accent);
  }
`

const DialogButtons = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`

const ACCENT_COLOR = "var(--accent)"
const DEFAULT_COLOR = "var(--text-primary)"

const DialogButton = styled.button<{ primary?: boolean }>`
  padding: 8px 20px;
  border: 2px solid ${({ primary }) => (primary ? ACCENT_COLOR : DEFAULT_COLOR)};
  background: ${({ primary }) => (primary ? ACCENT_COLOR : "transparent")};
  color: ${({ primary }) => (primary ? "var(--bg-primary)" : DEFAULT_COLOR)};
  cursor: pointer;
  font-size: 0.9rem;
  transition: 0.2s;

  &:hover {
    opacity: 0.8;
  }
`

const NOTIFICATION_EVENT = "show-notification"

const showNotification = (
  type: "success" | "error",
  title: string,
  message: string
) => {
  window.dispatchEvent(
    new CustomEvent(NOTIFICATION_EVENT, {
      detail: { type, title, message },
    })
  )
}

export const LinkSettings = ({ linkGroups, setLinkGroups }: props) => {
  const [isLoading, setIsLoading] = useState(getOrganizeStatus() === "loading")
  const [jsonMode, setJsonMode] = useState(false)
  const [showPromptDialog, setShowPromptDialog] = useState(false)
  const [customPrompt, setCustomPrompt] = useState("")

  const aiSettings = AISettingsManager.get()
  const isAIConfigured = aiSettings.enabled && aiSettings.apiKey

  // 订阅全局状态变化
  useEffect(() => {
    return subscribeOrganizeStatus(result => {
      setIsLoading(result.status === "loading")

      // 当整理完成时，更新链接数据并显示通知
      if (result.status === "success" && result.data) {
        setLinkGroups(result.data)
        showNotification(
          "success",
          "整理完成",
          `已将链接整理为 ${result.data.length} 个群组`
        )
      } else if (result.status === "error") {
        showNotification("error", "整理失败", result.error ?? "未知错误")
      }
    })
  }, [setLinkGroups])

  const handleAIOrganize = useCallback(() => {
    if (!isAIConfigured) {
      showNotification(
        "error",
        "AI 未配置",
        "请先在 AI 设置中启用 AI 并配置 API Key"
      )
      return
    }
    setShowPromptDialog(true)
  }, [isAIConfigured])

  const handleConfirmOrganize = useCallback(async () => {
    setShowPromptDialog(false)

    try {
      await organizeLinksWithAI(linkGroups, customPrompt)
      // 结果通过订阅处理，不需要在这里处理
    } catch {
      // 错误通过订阅处理
    }
  }, [linkGroups, customPrompt])

  const handleImportBookmarks = useCallback(async () => {
    if (!isBookmarkImportSupported()) {
      showNotification("error", "无法导入", "仅扩展环境支持从浏览器书签导入")
      return
    }
    try {
      const imported = await importBookmarksAsLinkGroups()
      if (imported === null) {
        showNotification("error", "未授权", "需要书签读取权限才能导入")
        return
      }
      const existing = new Set(linkGroups.map(g => g.title))
      const fresh = imported.filter(g => !existing.has(g.title))
      if (fresh.length === 0) {
        showNotification(
          "success",
          "没有新的分组",
          "书签夹中没有找到可导入的新分组"
        )
        return
      }
      setLinkGroups([...linkGroups, ...fresh])
      showNotification(
        "success",
        "书签已导入",
        `新增 ${fresh.length} 个分组，点击"应用更改"后生效`
      )
    } catch {
      showNotification("error", "导入失败", "读取浏览器书签时出错")
    }
  }, [linkGroups, setLinkGroups])

  return (
    <GeneralSettingsContent>
      <HeaderRow>
        <SettingsLabel style={{ margin: 0 }}>链接</SettingsLabel>
        <HeaderButtons>
          <AIButton
            onClick={() => void handleImportBookmarks()}
            disabled={isLoading}
            $loading={false}
            title="从浏览器书签导入链接分组"
          >
            <FontAwesomeIcon icon={faBookmark} />
            导入书签
          </AIButton>
          <AIButton
            onClick={handleAIOrganize}
            disabled={isLoading}
            $loading={isLoading}
            title={isAIConfigured ? "AI 智能整理链接" : "请先配置 AI"}
          >
            <FontAwesomeIcon icon={isLoading ? faSpinner : faMagic} />
            {isLoading ? "整理中..." : "AI 整理"}
          </AIButton>
        </HeaderButtons>
      </HeaderRow>
      {jsonMode ? (
        <OptionTextArea onChange={setLinkGroups} initialValue={linkGroups} />
      ) : (
        <LinkGroupEditor linkGroups={linkGroups} onChange={setLinkGroups} />
      )}

      <JsonModeToggle
        type="button"
        onClick={() => setJsonMode(prev => !prev)}
      >
        {jsonMode ? "返回列表编辑" : "高级：JSON 批量编辑"}
      </JsonModeToggle>

      {showPromptDialog && (
        <CustomPromptOverlay onClick={() => setShowPromptDialog(false)}>
          <CustomPromptDialog onClick={e => e.stopPropagation()}>
            <DialogTitle>AI 智能整理</DialogTitle>
            <DialogDescription>
              AI 将分析您的链接并自动分类整理。您可以在下方输入自定义要求：
            </DialogDescription>
            <CustomPromptInput
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="例如：分成5个群组，按照工作/学习/娱乐分类，群组名称简短一些..."
            />
            <DialogButtons>
              <DialogButton onClick={() => setShowPromptDialog(false)}>
                取消
              </DialogButton>
              <DialogButton
                primary
                onClick={() => {
                  void handleConfirmOrganize()
                }}
              >
                开始整理
              </DialogButton>
            </DialogButtons>
          </CustomPromptDialog>
        </CustomPromptOverlay>
      )}
    </GeneralSettingsContent>
  )
}
