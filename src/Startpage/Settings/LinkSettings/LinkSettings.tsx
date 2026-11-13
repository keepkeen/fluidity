import React, { useState, useCallback, useEffect, useRef } from "react"

import styled from "@emotion/styled"
import { faBookmark, faMagic, faSpinner } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { LinkGroupEditor } from "./LinkGroupEditor"
import { OptionTextArea } from "./OptionTextArea"
import { Modal } from "../../../components/Modal"
import { linkGroup } from "../../../data/data"
import {
  AISettings,
  AISettingsManager,
} from "../../../services/ai"
import { LinkAnalytics } from "../../../services/analytics"
import {
  importBookmarksAsLinkGroups,
  isBookmarkImportSupported,
} from "../../../services/bookmarkImport"
import {
  organizeLinksWithAI,
  getOrganizeStatus,
  subscribeOrganizeStatus,
} from "../../../services/linkOrganizer"
import {
  organizeHomeOrderWithAI,
  sortAppOrderByUsage,
} from "../../../services/homeOrderOrganizer"
import { SettingsLabel } from "../SettingsWindow"

interface props {
  linkGroups: linkGroup[]
  setLinkGroups: (value: linkGroup[]) => void
  homeAppOrder: string[] | null
  setHomeAppOrder: (value: string[] | null) => void
  homeLayoutOrder: string[]
  aiSettings: AISettings
  appliedRevision: number
  onOrganizeBusyChange: (busy: boolean) => void
}

export const GeneralSettingsContent = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 8px;
  box-sizing: border-box;
`

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;

  @media (max-width: 600px) {
    align-items: flex-start;
    flex-direction: column;
  }
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
  flex-wrap: wrap;
`

const AIButton = styled.button<{ $loading?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--accent);
  color: var(--accent);
  cursor: ${({ $loading }) => ($loading ? "wait" : "pointer")};
  font-size: 0.85rem;
  transition: 0.2s;
  opacity: ${({ $loading }) => ($loading ? 0.7 : 1)};

  @media (pointer: coarse) {
    min-height: 40px;
  }

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

const CustomPromptPositioner = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none !important;
`

const CustomPromptDialog = styled.div`
  background: var(--bg-primary);
  border: 1px solid var(--surface-border-strong);
  padding: 24px;
  max-width: 620px;
  width: 90%;
  max-height: min(760px, calc(100vh - 56px));
  overflow-y: auto;
  box-sizing: border-box;
  pointer-events: auto;
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
  border: 1px solid var(--surface-border-strong);
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

const OrganizeOptions = styled.div`
  display: grid;
  gap: 10px;
  margin: 0 0 16px;
`

const OrganizeOption = styled.label<{ $disabled?: boolean }>`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 10px;
  align-items: start;
  padding: 10px 12px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.86rem;
  opacity: ${({ $disabled }) => ($disabled ? 0.52 : 1)};
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};

  input {
    margin-top: 2px;
    accent-color: var(--accent);
  }
`

const OrganizeOptionHint = styled.span`
  grid-column: 2;
  color: var(--text-secondary);
  font-size: 0.74rem;
  line-height: 1.45;
`

const PromptSuggestions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: -6px 0 16px;
`

const SuggestionButton = styled.button`
  border: 1px solid var(--surface-border);
  border-radius: 999px;
  padding: 5px 9px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.72rem;
  cursor: pointer;

  :hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  :disabled {
    opacity: 0.5;
    cursor: wait;
  }
`

const PreviewCard = styled.div`
  margin: 16px 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 48%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 7%, transparent);
`

const PreviewTitle = styled.strong`
  display: block;
  color: var(--text-primary);
  font-size: 0.88rem;
  margin-bottom: 8px;
`

const PreviewText = styled.p`
  margin: 5px 0;
  color: var(--text-secondary);
  font-size: 0.77rem;
  line-height: 1.5;
`

const PreviewDetails = styled.div`
  max-height: min(360px, 42vh);
  overflow-y: auto;
  margin-top: 10px;
  padding-right: 6px;
`

const PreviewGroup = styled.div`
  padding: 8px 0;
  border-top: 1px dashed var(--surface-border);
  color: var(--text-secondary);
  font-size: 0.76rem;
  line-height: 1.55;

  strong {
    color: var(--text-primary);
  }
`

const PreviewList = styled.ol`
  margin: 6px 0 0;
  padding-left: 22px;
  color: var(--text-secondary);
  font-size: 0.76rem;
  line-height: 1.55;
`

const DraftBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 0 4px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 44%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 7%, transparent);
  color: var(--text-secondary);
  font-size: 0.78rem;
`

const DraftUndoButton = styled.button`
  flex: none;
  border: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.78rem;
`

const DialogButtons = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;

  @media (max-width: 600px) {
    flex-wrap: wrap;

    > button {
      flex: 1 1 140px;
    }
  }
`

const ACCENT_COLOR = "var(--accent)"
const DEFAULT_COLOR = "var(--text-primary)"

const DialogButton = styled.button<{ primary?: boolean }>`
  padding: 8px 20px;
  border: 1px solid ${({ primary }) => (primary ? ACCENT_COLOR : DEFAULT_COLOR)};
  background: ${({ primary }) => (primary ? ACCENT_COLOR : "transparent")};
  color: ${({ primary }) => (primary ? "var(--bg-primary)" : DEFAULT_COLOR)};
  cursor: pointer;

  @media (pointer: coarse) {
    min-height: 40px;
  }
  font-size: 0.9rem;
  transition: 0.2s;

  &:hover {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: wait;
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

interface AIOrganizeDraft {
  groups: linkGroup[]
  groupsChanged: boolean
  orderedAppIds: string[] | null
  summary: string
  sourceFingerprint: string
}

interface AcceptedDraftSnapshot {
  groups: linkGroup[]
  homeAppOrder: string[] | null
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError"

export const LinkSettings = ({
  linkGroups,
  setLinkGroups,
  homeAppOrder,
  setHomeAppOrder,
  homeLayoutOrder,
  aiSettings,
  appliedRevision,
  onOrganizeBusyChange,
}: props) => {
  const [organizeStatus, setOrganizeStatus] = useState(getOrganizeStatus())
  const [requestLoading, setRequestLoading] = useState(false)
  const [jsonMode, setJsonMode] = useState(false)
  const [showPromptDialog, setShowPromptDialog] = useState(false)
  const [customPrompt, setCustomPrompt] = useState("")
  const [organizeGroups, setOrganizeGroups] = useState(true)
  const [organizeHome, setOrganizeHome] = useState(true)
  const [includeUsage, setIncludeUsage] = useState(true)
  const [organizeDraft, setOrganizeDraft] =
    useState<AIOrganizeDraft | null>(null)
  const [acceptedDraftSnapshot, setAcceptedDraftSnapshot] =
    useState<AcceptedDraftSnapshot | null>(null)
  const organizeJobRef = useRef<{
    id: number
    controller: AbortController
  } | null>(null)
  const nextOrganizeJobIdRef = useRef(1)

  const persistedAISettings = AISettingsManager.get()
  const hasUnappliedAIConnection =
    persistedAISettings.enabled !== aiSettings.enabled ||
    persistedAISettings.apiKey?.trim() !== aiSettings.apiKey.trim() ||
    persistedAISettings.apiBaseUrl?.trim() !== aiSettings.apiBaseUrl.trim() ||
    persistedAISettings.model?.trim() !== aiSettings.model.trim()
  const isAIConfigured =
    persistedAISettings.enabled &&
    Boolean(persistedAISettings.apiKey) &&
    !hasUnappliedAIConnection
  const canShareUsage =
    persistedAISettings.collectLinkClicks &&
    persistedAISettings.shareHabits &&
    aiSettings.collectLinkClicks &&
    aiSettings.shareHabits
  const currentMixedOrder = homeAppOrder ?? homeLayoutOrder
  const organizeSourceFingerprint = JSON.stringify({
    linkGroups,
    order: currentMixedOrder,
  })
  const organizeSourceFingerprintRef = useRef(organizeSourceFingerprint)
  organizeSourceFingerprintRef.current = organizeSourceFingerprint
  const isLoading = requestLoading || organizeStatus === "loading"

  useEffect(() => {
    onOrganizeBusyChange(isLoading)
    return () => onOrganizeBusyChange(false)
  }, [isLoading, onOrganizeBusyChange])

  useEffect(() => {
    if (appliedRevision > 0) setAcceptedDraftSnapshot(null)
  }, [appliedRevision])

  // 保留全局加载态，设置窗口关闭时仍可由全局指示器接管。
  useEffect(() => {
    return subscribeOrganizeStatus(result => {
      setOrganizeStatus(result.status)
    })
  }, [])

  useEffect(
    () => () => {
      organizeJobRef.current?.controller.abort()
      organizeJobRef.current = null
      nextOrganizeJobIdRef.current += 1
    },
    []
  )

  const handleAIOrganize = useCallback(() => {
    setOrganizeDraft(null)
    setIncludeUsage(canShareUsage)
    if (!isAIConfigured) {
      setOrganizeGroups(false)
      setOrganizeHome(true)
    }
    setShowPromptDialog(true)
  }, [canShareUsage, isAIConfigured])

  const handleConfirmOrganize = useCallback(async () => {
    if (!isAIConfigured) {
      showNotification(
        "error",
        hasUnappliedAIConnection ? "AI 配置尚未应用" : "AI 未配置",
        hasUnappliedAIConnection
          ? "请先点击设置窗口底部“应用更改”，再生成 AI 整理草稿"
          : "请先在 AI 设置中启用 AI 并配置 API Key；也可使用本地频率排序"
      )
      return
    }
    if (!organizeGroups && !organizeHome) {
      showNotification("error", "请选择整理内容", "至少选择链接分类或主页顺序")
      return
    }

    organizeJobRef.current?.controller.abort()
    const controller = new AbortController()
    const jobId = nextOrganizeJobIdRef.current++
    const sourceFingerprint = organizeSourceFingerprintRef.current
    organizeJobRef.current = { id: jobId, controller }
    setRequestLoading(true)
    setOrganizeDraft(null)
    try {
      const groupTask = organizeGroups
        ? organizeLinksWithAI(linkGroups, customPrompt, {
            signal: controller.signal,
          })
        : Promise.resolve(linkGroups)
      const orderTask = organizeHome
        ? organizeHomeOrderWithAI(
            linkGroups,
            currentMixedOrder,
            LinkAnalytics.get(),
            {
              instruction: customPrompt,
              includeUsage: includeUsage && canShareUsage,
              signal: controller.signal,
            }
          )
        : Promise.resolve(null)
      const [groups, orderResult] = await Promise.all([groupTask, orderTask])
      if (
        controller.signal.aborted ||
        organizeJobRef.current?.id !== jobId
      ) {
        return
      }
      if (organizeSourceFingerprintRef.current !== sourceFingerprint) {
        showNotification(
          "error",
          "整理结果已过期",
          "等待 AI 时链接或主页顺序发生了变化；为避免覆盖新编辑，请重新整理。"
        )
        return
      }
      setOrganizeDraft({
        groups,
        groupsChanged: organizeGroups,
        orderedAppIds: orderResult?.orderedAppIds ?? null,
        summary: orderResult?.summary ?? "链接分类草稿已生成",
        sourceFingerprint,
      })
    } catch (error) {
      controller.abort()
      if (
        organizeJobRef.current?.id === jobId &&
        !isAbortError(error)
      ) {
        showNotification(
          "error",
          "整理失败",
          error instanceof Error ? error.message : "未知错误"
        )
      }
    } finally {
      if (organizeJobRef.current?.id === jobId) {
        organizeJobRef.current = null
        setRequestLoading(false)
      }
    }
  }, [
    canShareUsage,
    currentMixedOrder,
    customPrompt,
    includeUsage,
    linkGroups,
    organizeGroups,
    organizeHome,
    isAIConfigured,
    hasUnappliedAIConnection,
  ])

  const cancelOrganizeRequest = useCallback(() => {
    const job = organizeJobRef.current
    if (job) {
      job.controller.abort()
      organizeJobRef.current = null
      nextOrganizeJobIdRef.current += 1
    }
    setRequestLoading(false)
    setOrganizeDraft(null)
    setShowPromptDialog(false)
  }, [])

  const handleLocalUsageSort = useCallback(() => {
    const orderedAppIds = sortAppOrderByUsage(
      linkGroups,
      currentMixedOrder,
      LinkAnalytics.get()
    )
    setOrganizeDraft({
      groups: linkGroups,
      groupsChanged: false,
      orderedAppIds,
      summary: "已在本地按近期使用频率排序，不会发送点击数据，也不会消耗 API。",
      sourceFingerprint: organizeSourceFingerprint,
    })
  }, [currentMixedOrder, linkGroups, organizeSourceFingerprint])

  const acceptOrganizeDraft = useCallback(() => {
    if (!organizeDraft) return
    if (organizeDraft.sourceFingerprint !== organizeSourceFingerprint) {
      setOrganizeDraft(null)
      showNotification(
        "error",
        "整理草稿已过期",
        "链接或主页顺序已发生变化，请重新生成，避免覆盖刚完成的编辑。"
      )
      return
    }
    setAcceptedDraftSnapshot({ groups: linkGroups, homeAppOrder })
    if (organizeDraft.groupsChanged) setLinkGroups(organizeDraft.groups)
    if (organizeDraft.orderedAppIds) {
      setHomeAppOrder(organizeDraft.orderedAppIds)
    }
    const changeCount = [
      organizeDraft.groupsChanged,
      !!organizeDraft.orderedAppIds,
    ].filter(Boolean).length
    setOrganizeDraft(null)
    setShowPromptDialog(false)
    showNotification(
      "success",
      "AI 草稿已暂存",
      `${changeCount} 项整理结果将在点击“应用更改”后生效`
    )
  }, [
    homeAppOrder,
    linkGroups,
    organizeDraft,
    organizeSourceFingerprint,
    setHomeAppOrder,
    setLinkGroups,
  ])

  const undoAcceptedDraft = useCallback(() => {
    if (!acceptedDraftSnapshot) return
    setLinkGroups(acceptedDraftSnapshot.groups)
    setHomeAppOrder(acceptedDraftSnapshot.homeAppOrder)
    setAcceptedDraftSnapshot(null)
  }, [acceptedDraftSnapshot, setHomeAppOrder, setLinkGroups])

  const updateLinkGroups = useCallback(
    (groups: linkGroup[]) => {
      setAcceptedDraftSnapshot(null)
      setLinkGroups(groups)
    },
    [setLinkGroups]
  )

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
      updateLinkGroups([...linkGroups, ...fresh])
      showNotification(
        "success",
        "书签已导入",
        `新增 ${fresh.length} 个分组，点击"应用更改"后生效`
      )
    } catch {
      showNotification("error", "导入失败", "读取浏览器书签时出错")
    }
  }, [linkGroups, updateLinkGroups])

  const previewLabelById = new Map<string, string>(
    (organizeDraft?.groups ?? linkGroups).flatMap(group =>
      group.links.map(link => [`app:${link.value}`, link.label || link.value] as const)
    )
  )
  const previewOrderLabels = (organizeDraft?.orderedAppIds ?? [])
    .map(id => previewLabelById.get(id) ?? id.replace(/^app:/, ""))
  const originalGroupByUrl = new Map(
    linkGroups.flatMap(group =>
      group.links.map(link => [link.value, group.title] as const)
    )
  )
  const groupMoves = organizeDraft?.groupsChanged
    ? organizeDraft.groups.flatMap(group =>
        group.links.flatMap(link => {
          const from = originalGroupByUrl.get(link.value)
          return from && from !== group.title
            ? [{ label: link.label, from, to: group.title }]
            : []
        })
      )
    : []
  const currentAppPosition = new Map(
    currentMixedOrder
      .filter(id => id.startsWith("app:"))
      .map((id, index) => [id, index] as const)
  )
  const orderMoves = (organizeDraft?.orderedAppIds ?? []).flatMap(
    (id, index) => {
      const before = currentAppPosition.get(id)
      return before !== undefined && before !== index
        ? [
            {
              label: previewLabelById.get(id) ?? id.replace(/^app:/, ""),
              before: before + 1,
              after: index + 1,
            },
          ]
        : []
    }
  )

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
            title={
              isAIConfigured
                ? "AI 整理链接与主页顺序"
                : "可使用本地频率排序；配置 AI 后可自然语言整理"
            }
          >
            <FontAwesomeIcon icon={isLoading ? faSpinner : faMagic} />
            {isLoading ? "整理中..." : "AI 整理与排序"}
          </AIButton>
        </HeaderButtons>
      </HeaderRow>
      {jsonMode ? (
        <OptionTextArea onChange={updateLinkGroups} initialValue={linkGroups} />
      ) : (
        <LinkGroupEditor linkGroups={linkGroups} onChange={updateLinkGroups} />
      )}

      {acceptedDraftSnapshot && (
        <DraftBanner role="status">
          <span>AI 整理草稿已暂存，点击底部“应用更改”后写入主页。</span>
          <DraftUndoButton type="button" onClick={undoAcceptedDraft}>
            撤销草稿
          </DraftUndoButton>
        </DraftBanner>
      )}

      <JsonModeToggle
        type="button"
        onClick={() => setJsonMode(prev => !prev)}
      >
        {jsonMode ? "返回列表编辑" : "高级：JSON 批量编辑"}
      </JsonModeToggle>

      {showPromptDialog && (
        <Modal
          onClose={() => {
            if (!isLoading) setShowPromptDialog(false)
          }}
          label="AI 整理链接与主页顺序"
          overlay="dark"
          closeOnOverlayClick={!isLoading}
        >
          <CustomPromptPositioner>
            <CustomPromptDialog>
            <DialogTitle>AI 整理链接与主页顺序</DialogTitle>
            <DialogDescription>
              先生成可检查的草稿；确认后仍需点击设置窗口底部的“应用更改”才会写入。
              {!isAIConfigured &&
                (hasUnappliedAIConnection
                  ? " 当前 AI 连接配置尚未应用；请先保存设置，仍可使用完全本地的频率排序。"
                  : " 当前尚未配置 AI，但仍可使用完全本地的频率排序。")}
            </DialogDescription>
            {!organizeDraft && (
              <>
                <OrganizeOptions>
                  <OrganizeOption>
                    <input
                      type="checkbox"
                      checked={organizeGroups}
                      disabled={isLoading}
                      onChange={event => setOrganizeGroups(event.target.checked)}
                    />
                    <span>重新整理链接分类</span>
                    <OrganizeOptionHint>
                      调整分组、组名及组内次序，不会增删链接。
                    </OrganizeOptionHint>
                  </OrganizeOption>
                  <OrganizeOption>
                    <input
                      type="checkbox"
                      checked={organizeHome}
                      disabled={isLoading}
                      onChange={event => setOrganizeHome(event.target.checked)}
                    />
                    <span>同时调整主页图标顺序</span>
                    <OrganizeOptionHint>
                      只重排图标，小组件的位置和相对顺序保持不变。
                    </OrganizeOptionHint>
                  </OrganizeOption>
                  <OrganizeOption $disabled={!canShareUsage || !organizeHome}>
                    <input
                      type="checkbox"
                      checked={includeUsage && canShareUsage && organizeHome}
                      disabled={!canShareUsage || !organizeHome || isLoading}
                      onChange={event => setIncludeUsage(event.target.checked)}
                    />
                    <span>让 AI 使用图标点击统计</span>
                    <OrganizeOptionHint>
                      {canShareUsage
                        ? "仅发送累计点击次数、近 30 天次数和近期权重；不发送点击时间明细、完整网址路径或 API Key。"
                        : "需在 AI 设置中同时开启“记录链接点击”和“发送使用习惯”；也可使用下方完全本地的频率排序。"}
                    </OrganizeOptionHint>
                  </OrganizeOption>
                </OrganizeOptions>
                <CustomPromptInput
                  value={customPrompt}
                  disabled={isLoading}
                  onChange={e => setCustomPrompt(e.target.value)}
                  placeholder="例如：工作工具放第一页，同类应用相邻；组内按使用频率从高到低排列..."
                />
                <PromptSuggestions>
                  {["按最近常用优先", "工作优先，娱乐靠后", "同类图标相邻"].map(
                    suggestion => (
                      <SuggestionButton
                        key={suggestion}
                        type="button"
                        disabled={isLoading}
                        onClick={() => setCustomPrompt(suggestion)}
                      >
                        {suggestion}
                      </SuggestionButton>
                    )
                  )}
                </PromptSuggestions>
              </>
            )}

            {organizeDraft && (
              <PreviewCard data-ai-organize-preview="true">
                <PreviewTitle>整理草稿预览</PreviewTitle>
                <PreviewText>{organizeDraft.summary}</PreviewText>
                {organizeDraft.groupsChanged && (
                  <>
                    <PreviewText>
                      链接分类：将整理为 {organizeDraft.groups.length} 个分组；
                      {groupMoves.length} 个链接跨分组移动。
                    </PreviewText>
                    <PreviewDetails aria-label="完整分类草稿">
                      {groupMoves.length > 0 && (
                        <PreviewGroup>
                          <strong>跨分组变更</strong>
                          {groupMoves.map((move, index) => (
                            <div key={`${move.label}-${index}`}>
                              {move.label}：{move.from} → {move.to}
                            </div>
                          ))}
                        </PreviewGroup>
                      )}
                      {organizeDraft.groups.map((group, index) => (
                        <PreviewGroup key={`${group.title}-${index}`}>
                          <strong>{group.title}</strong>
                          <div>{group.links.map(link => link.label).join("、")}</div>
                        </PreviewGroup>
                      ))}
                    </PreviewDetails>
                  </>
                )}
                {organizeDraft.orderedAppIds && (
                  <>
                    <PreviewText>
                      主页顺序：共 {previewOrderLabels.length} 个图标，
                      {orderMoves.length} 个位置发生变化。
                    </PreviewText>
                    <PreviewDetails aria-label="完整主页顺序草稿">
                      {orderMoves.length > 0 && (
                        <PreviewGroup>
                          <strong>位置变更</strong>
                          {orderMoves.map((move, index) => (
                            <div key={`${move.label}-${index}`}>
                              {move.label}：第 {move.before} 位 → 第 {move.after} 位
                            </div>
                          ))}
                        </PreviewGroup>
                      )}
                      <PreviewList>
                        {previewOrderLabels.map((label, index) => (
                          <li key={`${label}-${index}`}>{label}</li>
                        ))}
                      </PreviewList>
                    </PreviewDetails>
                  </>
                )}
              </PreviewCard>
            )}

            <DialogButtons>
              <DialogButton
                onClick={() => {
                  if (isLoading) {
                    cancelOrganizeRequest()
                    return
                  }
                  setOrganizeDraft(null)
                  setShowPromptDialog(false)
                }}
              >
                {isLoading
                  ? "取消整理"
                  : organizeDraft
                    ? "放弃草稿"
                    : "取消"}
              </DialogButton>
              {organizeDraft ? (
                <DialogButton primary onClick={acceptOrganizeDraft}>
                  暂存到设置
                </DialogButton>
              ) : (
                <>
                  {organizeHome && (
                    <DialogButton
                      disabled={isLoading}
                      onClick={handleLocalUsageSort}
                      title="完全在本地按近期使用频率排序，不调用 AI"
                    >
                      本地按频率排序
                    </DialogButton>
                  )}
                  <DialogButton
                    primary
                    disabled={
                      !isAIConfigured ||
                      isLoading ||
                      (!organizeGroups && !organizeHome)
                    }
                    onClick={() => {
                      void handleConfirmOrganize()
                    }}
                  >
                    {isLoading ? "正在生成..." : "生成整理草稿"}
                  </DialogButton>
                </>
              )}
            </DialogButtons>
            </CustomPromptDialog>
          </CustomPromptPositioner>
        </Modal>
      )}
    </GeneralSettingsContent>
  )
}
