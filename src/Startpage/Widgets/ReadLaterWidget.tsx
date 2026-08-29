import { useEffect, useState } from "react"

import {
  faBookmark,
  faCheck,
  faClock,
  faRotateLeft,
  faTrash,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Modal } from "../../components/Modal"
import { WidgetCard } from "../../components/WidgetCard"
import { linkGroup } from "../../data/data"
import {
  completeLaterRead,
  LaterReadItem,
  listLaterRead,
  markLaterReadOpened,
  removeLaterRead,
  restoreLaterReadSnapshot,
  restoreLaterRead,
  snoozeLaterRead,
  subscribeLaterRead,
} from "../../services/readLater"
import { WidgetInstance } from "../../services/widgetRegistry"
import { navigateToLink } from "../../services/linkSearch"
import {
  DrawerBody,
  DrawerCard,
  DrawerClose,
  DrawerHeader,
  DrawerTitle,
  WidgetActionButton,
  WidgetActions,
  WidgetEmpty,
  WidgetIconButton,
  WidgetList,
  WidgetRow,
  WidgetRowButton,
  WidgetRowMeta,
  WidgetRowTitle,
} from "./shared"

interface ReadLaterWidgetProps {
  instance: WidgetInstance
  linkGroups: linkGroup[]
  onAddBookmark: (item: LaterReadItem, groupTitle: string) => void
  onUndoableAction: (message: string, undo: () => void) => void
}

const relativeTime = (at: number): string => {
  const minutes = Math.max(0, Math.floor((Date.now() - at) / 60_000))
  if (minutes < 1) return "刚刚加入"
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export const ReadLaterWidget = ({
  instance,
  linkGroups,
  onAddBookmark,
  onUndoableAction,
}: ReadLaterWidgetProps) => {
  const [items, setItems] = useState(() => listLaterRead())
  const [showDetails, setShowDetails] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [targetGroup, setTargetGroup] = useState(linkGroups[0]?.title ?? "收藏")

  useEffect(() => subscribeLaterRead(() => setItems(listLaterRead())), [])

  const configuredLimit = Math.max(1, Number(instance.config.itemLimit ?? 3))
  const limit =
    instance.size === "wide"
      ? 1
      : instance.size === "large"
        ? Math.min(3, configuredLimit)
        : Math.min(2, configuredLimit)
  const visible = items.slice(0, limit)
  const details = listLaterRead({
    includeCompleted: showCompleted,
    includeSnoozed: true,
  })

  const openItem = (item: LaterReadItem) => {
    markLaterReadOpened(item.id)
    navigateToLink(item.url, item.title, "稍后读", true)
  }

  const complete = (item: LaterReadItem) => {
    completeLaterRead(item.id)
    onUndoableAction("已完成稍后读", () => restoreLaterRead(item.id))
  }

  const snooze = (item: LaterReadItem) => {
    snoozeLaterRead(item.id)
    onUndoableAction("将在 7 天后再次出现", () => restoreLaterRead(item.id))
  }

  const remove = (item: LaterReadItem) => {
    removeLaterRead(item.id)
    onUndoableAction("已从稍后读移除", () => restoreLaterReadSnapshot(item))
  }

  return (
    <>
      <WidgetCard
        title="稍后读"
        symbol="◫"
        subtitle={items.length > 0 ? `${items.length} 项待处理` : "收件箱已清空"}
        onOpen={() => setShowDetails(true)}
      >
        {visible.length === 0 ? (
          <WidgetEmpty>
            <span>
              {instance.size === "wide"
                ? "在弹窗中收下当前页面"
                : "在拾光弹窗中点击“稍后读”，页面就会出现在这里。"}
            </span>
            {instance.size !== "wide" && (
              <WidgetActionButton type="button" onClick={() => setShowDetails(true)}>
                查看已完成
              </WidgetActionButton>
            )}
          </WidgetEmpty>
        ) : (
          <WidgetList>
            {visible.map(item => (
              <WidgetRow key={item.id} data-widget-row="true">
                <WidgetRowButton type="button" onClick={() => openItem(item)}>
                  <WidgetRowTitle>{item.title}</WidgetRowTitle>
                  <WidgetRowMeta>{relativeTime(item.createdAt)}</WidgetRowMeta>
                </WidgetRowButton>
                <WidgetActions>
                  <WidgetIconButton
                    type="button"
                    aria-label={`稍后提醒 ${item.title}`}
                    title="7 天后提醒"
                    onClick={() => snooze(item)}
                  >
                    <FontAwesomeIcon icon={faClock} />
                  </WidgetIconButton>
                  <WidgetIconButton
                    type="button"
                    aria-label={`完成 ${item.title}`}
                    title="标记完成"
                    onClick={() => complete(item)}
                  >
                    <FontAwesomeIcon icon={faCheck} />
                  </WidgetIconButton>
                </WidgetActions>
              </WidgetRow>
            ))}
          </WidgetList>
        )}
      </WidgetCard>

      {showDetails && (
        <Modal onClose={() => setShowDetails(false)} label="稍后读详情" overlay="dark">
          <DrawerCard>
            <DrawerHeader>
              <DrawerTitle>稍后读</DrawerTitle>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <WidgetActionButton
                  type="button"
                  onClick={() => setShowCompleted(value => !value)}
                >
                  {showCompleted ? "只看待处理" : "包含已完成"}
                </WidgetActionButton>
                <DrawerClose type="button" aria-label="关闭" onClick={() => setShowDetails(false)}>
                  ×
                </DrawerClose>
              </div>
            </DrawerHeader>
            <DrawerBody>
              <label style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <span style={{ color: "var(--text-secondary)" }}>收藏到</span>
                <select value={targetGroup} onChange={event => setTargetGroup(event.target.value)}>
                  {linkGroups.map(group => (
                    <option key={group.title} value={group.title}>{group.title}</option>
                  ))}
                </select>
              </label>
              <WidgetList style={{ overflow: "visible" }}>
                {details.map(item => (
                  <WidgetRow key={item.id} data-widget-row="true">
                    <WidgetRowButton type="button" onClick={() => openItem(item)}>
                      <WidgetRowTitle>{item.title}</WidgetRowTitle>
                      <WidgetRowMeta>{new URL(item.url).hostname} · {relativeTime(item.createdAt)}</WidgetRowMeta>
                    </WidgetRowButton>
                    <WidgetActions>
                      {item.completedAt ? (
                        <WidgetIconButton type="button" aria-label="恢复待处理" onClick={() => restoreLaterRead(item.id)}>
                          <FontAwesomeIcon icon={faRotateLeft} />
                        </WidgetIconButton>
                      ) : (
                        <>
                          <WidgetIconButton
                            type="button"
                            aria-label="收藏"
                            title="转为正式收藏"
                            onClick={() => {
                              onAddBookmark(item, targetGroup)
                              complete(item)
                            }}
                          >
                            <FontAwesomeIcon icon={faBookmark} />
                          </WidgetIconButton>
                          <WidgetIconButton type="button" aria-label="完成" onClick={() => complete(item)}>
                            <FontAwesomeIcon icon={faCheck} />
                          </WidgetIconButton>
                        </>
                      )}
                      <WidgetIconButton
                        type="button"
                        aria-label="从稍后读移除"
                        title="移除"
                        onClick={() => remove(item)}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </WidgetIconButton>
                    </WidgetActions>
                  </WidgetRow>
                ))}
              </WidgetList>
            </DrawerBody>
          </DrawerCard>
        </Modal>
      )}
    </>
  )
}
