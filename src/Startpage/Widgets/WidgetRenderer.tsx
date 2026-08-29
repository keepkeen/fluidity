import { lazy, Suspense } from "react"

import { linkGroup } from "../../data/data"
import { LaterReadItem } from "../../services/readLater"
import { WidgetInstance } from "../../services/widgetRegistry"
import { SmallErrorBoundary } from "../../components/ErrorBoundary"
import { WidgetEmpty } from "./shared"

const TodayScreenTime = lazy(() =>
  import("../Usage/TodayScreenTime").then(module => ({
    default: module.TodayScreenTime,
  }))
)
const RediscoveryCard = lazy(() =>
  import("../Rediscovery/RediscoveryCard").then(module => ({
    default: module.RediscoveryCard,
  }))
)
const ReadLaterWidget = lazy(() =>
  import("./ReadLaterWidget").then(module => ({
    default: module.ReadLaterWidget,
  }))
)
const SmartEntryWidget = lazy(() =>
  import("./SmartEntryWidget").then(module => ({
    default: module.SmartEntryWidget,
  }))
)
const RssWidget = lazy(() =>
  import("./RssWidget").then(module => ({ default: module.RssWidget }))
)

interface WidgetRendererProps {
  instance: WidgetInstance
  active: boolean
  linkGroups: linkGroup[]
  visibleAppUrls: string[]
  onUpdate: (instance: WidgetInstance) => void
  onConfigure: () => void
  onAddBookmark: (item: LaterReadItem, groupTitle: string) => void
  onRequestLinkRemoval: (url: string, label: string) => void
  onUndoableAction: (message: string, undo: () => void) => void
}

export const WidgetRenderer = ({
  instance,
  active,
  linkGroups,
  visibleAppUrls,
  onUpdate,
  onConfigure,
  onAddBookmark,
  onRequestLinkRemoval,
  onUndoableAction,
}: WidgetRendererProps) => {
  let content
  switch (instance.type) {
    case "screen-time":
      content = (
        <TodayScreenTime
          active={active}
          size={instance.size}
          config={instance.config}
          onConfigChange={config => onUpdate({ ...instance, config })}
        />
      )
      break
    case "rediscovery":
      content = (
        <RediscoveryCard
          linkGroups={linkGroups}
          onRequestRemove={onRequestLinkRemoval}
          size={instance.size}
          onUndoableAction={onUndoableAction}
        />
      )
      break
    case "read-later":
      content = (
        <ReadLaterWidget
          instance={instance}
          linkGroups={linkGroups}
          onAddBookmark={onAddBookmark}
          onUndoableAction={onUndoableAction}
        />
      )
      break
    case "smart-entry":
      content = (
        <SmartEntryWidget
          instance={instance}
          linkGroups={linkGroups}
          visibleAppUrls={visibleAppUrls}
          onUpdate={onUpdate}
          onUndoableAction={onUndoableAction}
        />
      )
      break
    case "rss":
      content = (
        <RssWidget
          instance={instance}
          active={active}
          onConfigure={onConfigure}
          onUndoableAction={onUndoableAction}
        />
      )
      break
  }

  return (
    <SmallErrorBoundary name={instance.type}>
      <Suspense fallback={<WidgetEmpty>正在加载小组件…</WidgetEmpty>}>
        {content}
      </Suspense>
    </SmallErrorBoundary>
  )
}
