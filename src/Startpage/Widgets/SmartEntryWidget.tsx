import { useMemo, useState } from "react"

import { faBan } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Favicon } from "../../components/Favicon"
import { Modal } from "../../components/Modal"
import { WidgetCard } from "../../components/WidgetCard"
import { linkGroup } from "../../data/data"
import { isLinkAnalyticsEnabled, LinkAnalytics } from "../../services/analytics"
import { navigateToLink } from "../../services/linkSearch"
import { rankSmartEntries } from "../../services/smartEntries"
import { WidgetInstance } from "../../services/widgetRegistry"
import {
  DrawerBody,
  DrawerCard,
  DrawerClose,
  DrawerHeader,
  DrawerTitle,
  CompactWidgetEmpty,
  WidgetActionButton,
  WidgetActions,
  WidgetIconButton,
  WidgetList,
  WidgetRow,
  WidgetRowButton,
  WidgetRowMeta,
  WidgetRowTitle,
} from "./shared"

interface SmartEntryWidgetProps {
  instance: WidgetInstance
  linkGroups: linkGroup[]
  visibleAppUrls: string[]
  onUpdate: (instance: WidgetInstance) => void
  onUndoableAction: (message: string, undo: () => void) => void
}

export const SmartEntryWidget = ({
  instance,
  linkGroups,
  visibleAppUrls,
  onUpdate,
  onUndoableAction,
}: SmartEntryWidgetProps) => {
  const [showDetails, setShowDetails] = useState(false)
  const analyticsEnabled = isLinkAnalyticsEnabled()
  const excludedUrls = useMemo(
    () =>
      Array.isArray(instance.config.excludedUrls)
        ? instance.config.excludedUrls.filter(
            (value): value is string => typeof value === "string"
          )
        : [],
    [instance.config.excludedUrls]
  )
  const entries = useMemo(
    () => {
      const analytics = LinkAnalytics.get()
      const options = {
        limit: 12,
        excludedUrls: [...excludedUrls, ...visibleAppUrls],
        analyticsEnabled,
        now: Math.floor(Date.now() / 1_800_000) * 1_800_000,
      }
      const ranked = rankSmartEntries(linkGroups, analytics, options)
      return ranked.length > 0
        ? ranked
        : rankSmartEntries(linkGroups, analytics, {
            ...options,
            excludedUrls,
          })
    },
    [analyticsEnabled, excludedUrls, linkGroups, visibleAppUrls]
  )
  const limit =
    instance.size === "small"
      ? 1
      : instance.size === "wide"
        ? 1
        : Math.min(3, Math.max(1, Number(instance.config.itemLimit ?? 4)))
  const visible = entries.slice(0, limit)

  const suppress = (url: string) => {
    const previous = excludedUrls
    onUpdate({
      ...instance,
      config: {
        ...instance.config,
        excludedUrls: [...new Set([...excludedUrls, url])],
      },
    })
    onUndoableAction("已减少这个入口的推荐", () =>
      onUpdate({
        ...instance,
        config: { ...instance.config, excludedUrls: previous },
      })
    )
  }

  const open = (entry: (typeof entries)[number]) =>
    navigateToLink(entry.url, entry.label, entry.groupTitle)

  return (
    <>
      <WidgetCard
        title="智能入口"
        symbol="✦"
        subtitle={analyticsEnabled ? "只在本地计算" : "行为统计已关闭"}
        onOpen={() => setShowDetails(true)}
      >
        {!analyticsEnabled ? (
          <CompactWidgetEmpty
            data-compact-action-only={
              instance.size === "small" ? "true" : undefined
            }
          >
            <span>智能入口尊重你的隐私设置。开启“链接点击统计”后才会生成推荐。</span>
            <WidgetActionButton
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("fluidity:open-settings", {
                    detail: { tab: "ai" },
                  })
                )
              }
            >
              {instance.size === "small" ? "设置" : "检查设置"}
            </WidgetActionButton>
          </CompactWidgetEmpty>
        ) : visible.length === 0 ? (
          <CompactWidgetEmpty>
            <span>
              {instance.size === "wide"
                ? "正常打开几次收藏后，这里会逐渐变聪明"
                : "还没有足够的本地使用记录。正常打开几次收藏后，这里会逐渐变聪明。"}
            </span>
          </CompactWidgetEmpty>
        ) : (
          <WidgetList>
            {visible.map(entry => (
              <WidgetRow key={entry.url} data-widget-row="true">
                <WidgetRowButton type="button" onClick={() => open(entry)}>
                  <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                    <Favicon
                      url={entry.url}
                      icon={entry.icon}
                      size={22}
                      sourceSize={64}
                      fallbackLabel={entry.label}
                      eager
                    />
                    <div style={{ minWidth: 0 }}>
                      <WidgetRowTitle>{entry.label}</WidgetRowTitle>
                      <WidgetRowMeta>{entry.reason}</WidgetRowMeta>
                    </div>
                  </div>
                </WidgetRowButton>
                {instance.size !== "small" && (
                  <WidgetActions>
                    <WidgetIconButton
                      type="button"
                      aria-label={`减少推荐 ${entry.label}`}
                      title="减少推荐"
                      onClick={() => suppress(entry.url)}
                    >
                      <FontAwesomeIcon icon={faBan} />
                    </WidgetIconButton>
                  </WidgetActions>
                )}
              </WidgetRow>
            ))}
          </WidgetList>
        )}
      </WidgetCard>

      {showDetails && (
        <Modal onClose={() => setShowDetails(false)} label="智能入口详情" overlay="dark">
          <DrawerCard>
            <DrawerHeader>
              <div>
                <DrawerTitle>智能入口</DrawerTitle>
                <WidgetRowMeta>依据近 30 天点击频率、当前时段、星期与最近使用计算；数据不会离开设备。</WidgetRowMeta>
              </div>
              <DrawerClose type="button" aria-label="关闭" onClick={() => setShowDetails(false)}>×</DrawerClose>
            </DrawerHeader>
            <DrawerBody>
              <WidgetList style={{ overflow: "visible" }}>
                {entries.map(entry => (
                  <WidgetRow key={entry.url} data-widget-row="true">
                    <WidgetRowButton type="button" onClick={() => open(entry)}>
                      <WidgetRowTitle>{entry.label}</WidgetRowTitle>
                      <WidgetRowMeta>{entry.groupTitle} · {entry.reason}</WidgetRowMeta>
                    </WidgetRowButton>
                    <WidgetIconButton type="button" aria-label="减少推荐" onClick={() => suppress(entry.url)}>
                      <FontAwesomeIcon icon={faBan} />
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
