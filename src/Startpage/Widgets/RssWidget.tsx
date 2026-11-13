import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  faCheckDouble,
  faCog,
  faRotate,
  faRotateLeft,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Modal } from "../../components/Modal"
import { WidgetCard } from "../../components/WidgetCard"
import { navigateToLink } from "../../services/linkSearch"
import {
  getRssWidgetData,
  listRssSubscriptions,
  refreshRssSubscriptions,
  RssItem,
  setRssItemRead,
  setRssItemsRead,
  subscribeRss,
} from "../../services/rss"
import { WidgetInstance } from "../../services/widgetRegistry"
import {
  ensureOriginPermissionsWithStatus,
  resolveRssPermissionOrigins,
} from "../../services/optionalPermissions"
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

type DisplayItem = RssItem & { feedTitle: string; read: boolean }

interface RssWidgetProps {
  instance: WidgetInstance
  active: boolean
  onConfigure: () => void
  onUndoableAction: (message: string, undo: () => void) => void
}

const relativeTime = (at: number): string => {
  const hours = Math.max(0, Math.floor((Date.now() - at) / 3_600_000))
  if (hours < 1) return "刚刚"
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export const RssWidget = ({
  instance,
  active,
  onConfigure,
  onUndoableAction,
}: RssWidgetProps) => {
  const subscriptionIds = useMemo(
    () =>
      Array.isArray(instance.config.subscriptionIds)
        ? instance.config.subscriptionIds.filter(
            (value): value is string => typeof value === "string"
          )
        : [],
    [instance.config.subscriptionIds]
  )
  const unreadOnly = instance.config.unreadOnly !== false
  const [items, setItems] = useState<DisplayItem[]>([])
  const [allItems, setAllItems] = useState<DisplayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState(0)
  const [showDetails, setShowDetails] = useState(false)
  const [detailsUnreadOnly, setDetailsUnreadOnly] = useState(unreadOnly)
  const mountedRef = useRef(false)
  const activeRef = useRef(active)
  const refreshControllerRef = useRef<AbortController | null>(null)
  const refreshPromiseRef = useRef<Promise<void> | null>(null)
  const refreshQueuedRef = useRef(false)
  const queuedRefreshForceRef = useRef(false)
  const queuedPermissionRef = useRef<Promise<boolean> | undefined>(undefined)
  const loadGenerationRef = useRef(0)
  activeRef.current = active

  const load = useCallback(async (signal?: AbortSignal) => {
    const generation = ++loadGenerationRef.current
    try {
      const data = await getRssWidgetData(subscriptionIds, { unreadOnly })
      if (
        !mountedRef.current ||
        signal?.aborted ||
        generation !== loadGenerationRef.current
      ) return
      setItems(data.items)
      setAllItems(data.allItems)
      const feeds = data.feeds
      setUpdatedAt(Math.max(0, ...feeds.map(feed => feed.fetchedAt)))
      const failed = feeds.find(feed => feed.error)
      setError(failed?.error ?? null)
    } catch (loadError) {
      if (
        !mountedRef.current ||
        signal?.aborted ||
        generation !== loadGenerationRef.current
      ) return
      setError(loadError instanceof Error ? loadError.message : "RSS 缓存读取失败")
    } finally {
      if (
        mountedRef.current &&
        !signal?.aborted &&
        generation === loadGenerationRef.current
      ) {
        setLoading(false)
      }
    }
  }, [subscriptionIds, unreadOnly])

  const cancelRefresh = useCallback(() => {
    refreshControllerRef.current?.abort()
    refreshQueuedRef.current = false
    queuedRefreshForceRef.current = false
    queuedPermissionRef.current = undefined
    if (mountedRef.current) setRefreshing(false)
  }, [])

  const refresh = useCallback(
    (force = false, permissionRequest?: Promise<boolean>): Promise<void> => {
      if (refreshPromiseRef.current) {
        refreshQueuedRef.current = true
        queuedRefreshForceRef.current ||= force
        if (force) queuedPermissionRef.current = permissionRequest
        return refreshPromiseRef.current
      }
      if (!active || document.visibilityState !== "visible") {
        return Promise.resolve()
      }

      const controller = new AbortController()
      refreshControllerRef.current = controller
      const { signal } = controller
      const request = (async () => {
        // Yield once so the shared in-flight promise is installed before any
        // synchronous early-return path reaches the cleanup block.
        await Promise.resolve()
        try {
          if (signal.aborted) return
          if (subscriptionIds.length === 0) {
            if (mountedRef.current) setLoading(false)
            return
          }
          if (!navigator.onLine) {
            if (mountedRef.current) {
              setError("当前离线，正在显示已缓存内容")
            }
            await load(signal)
            return
          }
          if (mountedRef.current) setRefreshing(true)
          if (force) {
            if (!permissionRequest || !(await permissionRequest)) {
              if (mountedRef.current && !signal.aborted) {
                setError("未授予订阅域名访问权限，无法刷新")
              }
              return
            }
            if (signal.aborted) return
          }
          await refreshRssSubscriptions(subscriptionIds, { force, signal })
          if (signal.aborted) return
          await load(signal)
        } catch (refreshError) {
          if (signal.aborted || !mountedRef.current) return
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : "RSS 刷新失败"
          )
        } finally {
          if (refreshControllerRef.current === controller) {
            refreshControllerRef.current = null
            refreshPromiseRef.current = null
            if (mountedRef.current) setRefreshing(false)
            const refreshQueued = refreshQueuedRef.current
            const queuedForce = queuedRefreshForceRef.current
            const queuedPermission = queuedPermissionRef.current
            refreshQueuedRef.current = false
            queuedRefreshForceRef.current = false
            queuedPermissionRef.current = undefined
            if (
              refreshQueued &&
              mountedRef.current &&
              activeRef.current &&
              document.visibilityState === "visible"
            ) {
              void refresh(queuedForce, queuedPermission)
            }
          }
        }
      })()
      refreshPromiseRef.current = request
      return request
    },
    [active, load, subscriptionIds]
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      refreshControllerRef.current?.abort()
      refreshControllerRef.current = null
      refreshPromiseRef.current = null
      refreshQueuedRef.current = false
      queuedRefreshForceRef.current = false
      queuedPermissionRef.current = undefined
      loadGenerationRef.current += 1
    }
  }, [])

  useEffect(() => subscribeRss(() => void load()), [load])

  useEffect(() => {
    void load()
    const onVisibilityChange = () => {
      if (!active || document.visibilityState !== "visible") {
        cancelRefresh()
        return
      }
      void refresh(false)
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    if (active && document.visibilityState === "visible") {
      void refresh(false)
    }
    const timer = active
      ? window.setInterval(() => {
          if (document.visibilityState === "visible") void refresh(false)
        }, 60_000)
      : null
    return () => {
      cancelRefresh()
      if (timer !== null) clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [active, cancelRefresh, load, refresh])

  const configuredLimit = Math.max(1, Number(instance.config.itemLimit ?? 4))
  const limit =
    instance.size === "medium"
      ? Math.min(2, configuredLimit)
      : Math.min(3, configuredLimit)
  const visible = items.slice(0, limit)
  // subscribeRss 会让订阅标题/启用状态变化触发重新渲染。这里不能只按
  // subscriptionIds 做 memo，否则停用订阅后标题和数量仍会停留在旧状态。
  const activeSubscriptions = listRssSubscriptions().filter(
    subscription =>
      subscription.enabled && subscriptionIds.includes(subscription.id)
  )

  const requestManualRefresh = useCallback(() => {
    let origins: string[]
    try {
      origins = resolveRssPermissionOrigins(
        activeSubscriptions.map(subscription => subscription.url)
      )
    } catch {
      setError("订阅地址无效，无法申请访问权限")
      return
    }
    // This call intentionally happens in the button's synchronous click stack:
    // Chrome may discard transient user activation after the first await.
    const permissionRequest = origins.length > 0
      ? ensureOriginPermissionsWithStatus(origins).then(result => result.granted)
      : Promise.resolve(true)
    void refresh(true, permissionRequest)
  }, [activeSubscriptions, refresh])

  const openItem = (item: DisplayItem) => {
    void setRssItemRead(item, true)
    navigateToLink(item.url, item.title, item.feedTitle, true)
  }

  const markAllRead = () => {
    const previous = allItems.filter(item => item.read)
    void setRssItemsRead(allItems, true)
    onUndoableAction("已将阅读流标为已读", () => {
      void setRssItemsRead(allItems, false).then(() =>
        setRssItemsRead(previous, true)
      )
    })
  }

  return (
    <>
      <WidgetCard
        title={String(instance.config.title || "阅读流")}
        symbol="◔"
        subtitle={
          error
            ? error
            : updatedAt
              ? `更新于 ${relativeTime(updatedAt)}`
              : `${activeSubscriptions.length} 个订阅源`
        }
        actions={
          <WidgetActions>
            <WidgetIconButton
              type="button"
              aria-label="刷新 RSS"
              title="刷新"
              disabled={refreshing}
              onClick={requestManualRefresh}
            >
              <FontAwesomeIcon icon={faRotate} spin={refreshing} />
            </WidgetIconButton>
            <WidgetIconButton type="button" aria-label="配置 RSS" title="配置" onClick={onConfigure}>
              <FontAwesomeIcon icon={faCog} />
            </WidgetIconButton>
          </WidgetActions>
        }
        onOpen={() => setShowDetails(true)}
      >
        {subscriptionIds.length === 0 ? (
          <WidgetEmpty>
            <span>添加一个 RSS 或 Atom 地址，建立只属于你的阅读流。</span>
            <WidgetActionButton type="button" onClick={onConfigure}>添加订阅</WidgetActionButton>
          </WidgetEmpty>
        ) : loading ? (
          <WidgetEmpty><span>正在读取订阅缓存…</span></WidgetEmpty>
        ) : visible.length === 0 ? (
          <WidgetEmpty>
            <span>{unreadOnly ? "没有未读文章" : "订阅暂时没有内容"}</span>
            <WidgetActionButton type="button" onClick={() => setShowDetails(true)}>查看全部</WidgetActionButton>
          </WidgetEmpty>
        ) : (
          <WidgetList>
            {visible.map(item => (
              <WidgetRow key={item.id} data-widget-row="true">
                <WidgetRowButton type="button" onClick={() => openItem(item)}>
                  <WidgetRowTitle>{item.title}</WidgetRowTitle>
                  <WidgetRowMeta>{item.feedTitle} · {relativeTime(item.publishedAt)}</WidgetRowMeta>
                </WidgetRowButton>
              </WidgetRow>
            ))}
          </WidgetList>
        )}
      </WidgetCard>

      {showDetails && (
        <Modal onClose={() => setShowDetails(false)} label="RSS 阅读流" overlay="dark">
          <DrawerCard>
            <DrawerHeader>
              <div>
                <DrawerTitle>{String(instance.config.title || "阅读流")}</DrawerTitle>
                <WidgetRowMeta>{activeSubscriptions.map(item => item.title).join(" · ")}</WidgetRowMeta>
              </div>
              <WidgetActions>
                <WidgetActionButton type="button" onClick={() => setDetailsUnreadOnly(value => !value)}>
                  {detailsUnreadOnly ? "显示全部" : "只看未读"}
                </WidgetActionButton>
                <WidgetIconButton type="button" aria-label="全部已读" title="全部标为已读" onClick={markAllRead}>
                  <FontAwesomeIcon icon={faCheckDouble} />
                </WidgetIconButton>
                <DrawerClose type="button" aria-label="关闭" onClick={() => setShowDetails(false)}>×</DrawerClose>
              </WidgetActions>
            </DrawerHeader>
            <DrawerBody>
              <WidgetList style={{ overflow: "visible" }}>
                {allItems.filter(item => !detailsUnreadOnly || !item.read).map(item => (
                  <WidgetRow
                    key={item.id}
                    data-widget-row="true"
                    style={{ opacity: item.read ? 0.62 : 1 }}
                  >
                    <WidgetRowButton type="button" onClick={() => openItem(item)}>
                      <WidgetRowTitle>{item.title}</WidgetRowTitle>
                      <WidgetRowMeta>{item.feedTitle} · {relativeTime(item.publishedAt)}{item.summary ? ` · ${item.summary}` : ""}</WidgetRowMeta>
                    </WidgetRowButton>
                    <WidgetIconButton
                      type="button"
                      aria-label={item.read ? "恢复未读" : "标为已读"}
                      onClick={() => void setRssItemRead(item, !item.read)}
                    >
                      <FontAwesomeIcon icon={item.read ? faRotateLeft : faCheckDouble} />
                    </WidgetIconButton>
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
