import { useState } from "react"

import { useSortable } from "@dnd-kit/sortable"
import { CSS as DndCSS } from "@dnd-kit/utilities"
import {
  faChevronLeft,
  faChevronRight,
  faEllipsis,
  faGrip,
  faXmark,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Favicon } from "../../components/Favicon"
import { linkGroup } from "../../data/data"
import { HomeItem } from "../../services/homeLayout"
import {
  HomeDropPosition,
  HomeGridMetrics,
} from "../../services/homePagination"
import { LaterReadItem } from "../../services/readLater"
import {
  getWidgetDefinition,
  WidgetInstance,
} from "../../services/widgetRegistry"
import { WidgetRenderer } from "../Widgets/WidgetRenderer"

import {
  AppEntry,
  AppIconBox,
  AppLabel,
  AppTile,
  cellSpan,
  getAppTileHue,
  ItemShell,
  JiggleBox,
  MovePageButton,
  MovePageControls,
  RemoveBadge,
  WidgetEditButton,
  WidgetEditControls,
  WidgetEditDragSurface,
  WidgetShell,
} from "./HomeGrid.styles"
import { doNotAnimateHomeLayoutChange } from "./homeInteraction"
export const SortableItem = ({
  item,
  index,
  editMode,
  settled,
  gridMetrics,
  active,
  visibleAppUrls,
  onOpen,
  onRemove,
  onConfigure,
  onUpdateWidget,
  onAddBookmark,
  onUndoableAction,
  linkGroups,
  onRequestLinkRemoval,
  pageIndex,
  totalPages,
  onMovePage,
  dropPosition,
  previewOrder,
  previewHidden,
}: {
  item: HomeItem
  index: number
  editMode: boolean
  settled: boolean
  gridMetrics: HomeGridMetrics
  active: boolean
  visibleAppUrls: string[]
  onOpen: (item: Extract<HomeItem, { kind: "app" }>) => void
  onRemove: (item: HomeItem) => void
  onConfigure: (instance: WidgetInstance) => void
  onUpdateWidget: (
    instance: WidgetInstance,
    expected?: WidgetInstance
  ) => Promise<string | null>
  onAddBookmark: (item: LaterReadItem, groupTitle: string) => void
  onUndoableAction: (message: string, undo: () => void) => void
  linkGroups: linkGroup[]
  onRequestLinkRemoval: (url: string, label: string) => void
  pageIndex: number
  totalPages: number
  onMovePage: (item: HomeItem, direction: -1 | 1) => void
  dropPosition: HomeDropPosition | null
  previewOrder: number | null
  previewHidden: boolean
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: item.id,
    animateLayoutChanges: doNotAnimateHomeLayoutChange,
  })
  const span = cellSpan(item, gridMetrics)
  /* 固定挂载时的序号：animation-delay 若随重排变化会导致动画重启（闪烁） */
  const [entranceIndex] = useState(index)

  return (
    <ItemShell
      ref={setNodeRef}
      data-home-item-id={item.id}
      data-home-item-kind={item.kind}
      data-home-dragging={isDragging ? "true" : "false"}
      data-home-drop-target={isOver && !isDragging ? "true" : "false"}
      data-home-drop-position={dropPosition ?? undefined}
      data-home-preview-order={previewOrder ?? undefined}
      data-home-preview-hidden={previewHidden ? "true" : undefined}
      col={span.col}
      row={span.row}
      delayIndex={entranceIndex}
      settled={settled}
      style={{
        /* 去掉 scale：跨尺寸槽位（图标↔小组件）拖动时不做压缩预览，iOS 手感 */
        transform: DndCSS.Transform.toString(
          transform ? { ...transform, scaleX: 1, scaleY: 1 } : null
        ),
        transition: isDragging ? "none" : transition,
        willChange: isDragging ? "transform" : undefined,
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0 : 1,
        order: previewOrder ?? undefined,
        display: previewHidden ? "none" : undefined,
      }}
      {...(item.kind === "app" ? attributes : {})}
      {...listeners}
      onContextMenu={event => {
        if (item.kind !== "widget") return
        event.preventDefault()
        event.stopPropagation()
        onConfigure(item.widget)
      }}
      /* 容器不该是 button：内部有真实的交互元素（图标按钮/小组件） */
      role={undefined}
      tabIndex={-1}
    >
      <JiggleBox
        jiggling={editMode && !isDragging && item.kind === "app"}
        delayIndex={entranceIndex}
      >
        {editMode && (
          <>
            <RemoveBadge
              type="button"
              aria-label={
                item.kind === "app" ? `删除 ${item.label}` : "移除小组件"
              }
              onPointerDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation()
                onRemove(item)
              }}
            >
              <FontAwesomeIcon icon={faXmark} />
            </RemoveBadge>
            {totalPages > 1 && (
              <MovePageControls role="group" aria-label="移动到其他页面">
                {pageIndex > 0 && (
                  <MovePageButton
                    type="button"
                    aria-label="移至上一页"
                    title="移至上一页"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation()
                      onMovePage(item, -1)
                    }}
                  >
                    <FontAwesomeIcon icon={faChevronLeft} />
                  </MovePageButton>
                )}
                {pageIndex < totalPages - 1 && (
                  <MovePageButton
                    type="button"
                    aria-label="移至下一页"
                    title="移至下一页"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation()
                      onMovePage(item, 1)
                    }}
                  >
                    <FontAwesomeIcon icon={faChevronRight} />
                  </MovePageButton>
                )}
              </MovePageControls>
            )}
            {item.kind === "widget" && (
              <WidgetEditControls role="group" aria-label="小组件编辑操作">
                <WidgetEditButton
                  type="button"
                  aria-label={`配置${getWidgetDefinition(item.widget.type).title}`}
                  title="配置与调整尺寸"
                  onPointerDown={event => event.stopPropagation()}
                  onClick={event => {
                    event.stopPropagation()
                    onConfigure(item.widget)
                  }}
                >
                  <FontAwesomeIcon icon={faEllipsis} />
                </WidgetEditButton>
                <WidgetEditButton
                  ref={setActivatorNodeRef}
                  type="button"
                  data-home-drag-handle="true"
                  aria-label={`拖动${getWidgetDefinition(item.widget.type).title}`}
                  aria-keyshortcuts="Control+ArrowLeft Control+ArrowRight Meta+ArrowLeft Meta+ArrowRight"
                  title="拖动小组件"
                  {...attributes}
                >
                  <FontAwesomeIcon icon={faGrip} />
                </WidgetEditButton>
              </WidgetEditControls>
            )}
          </>
        )}

        {item.kind === "widget" ? (
          <>
            <WidgetShell
              data-home-widget-content="true"
              dragging={isDragging}
              editing={editMode}
              aria-hidden={editMode || undefined}
              {...(editMode ? { inert: "" } : {})}
            >
              <WidgetRenderer
                instance={item.widget}
                active={active}
                linkGroups={linkGroups}
                visibleAppUrls={visibleAppUrls}
                onUpdate={onUpdateWidget}
                onConfigure={() => onConfigure(item.widget)}
                onAddBookmark={onAddBookmark}
                onRequestLinkRemoval={onRequestLinkRemoval}
                onUndoableAction={onUndoableAction}
              />
            </WidgetShell>
            {editMode && (
              <WidgetEditDragSurface
                data-home-widget-edit-surface="true"
                aria-hidden="true"
              />
            )}
          </>
        ) : (
          <AppEntry>
            <AppTile
              type="button"
              data-home-app-tile="true"
              aria-label={item.label}
              aria-keyshortcuts={
                editMode
                  ? "Control+ArrowLeft Control+ArrowRight Meta+ArrowLeft Meta+ArrowRight"
                  : undefined
              }
              title={item.url}
              onClick={() => {
                if (!editMode) onOpen(item)
              }}
            >
              <AppIconBox
                style={
                  {
                    "--tile-hue": String(getAppTileHue(item.url)),
                  } as React.CSSProperties
                }
              >
                <Favicon
                  url={item.url}
                  icon={item.icon}
                  size={40}
                  sourceSize={128}
                  fallbackLabel={item.label}
                  eager
                />
              </AppIconBox>
            </AppTile>
            <AppLabel>{item.label}</AppLabel>
          </AppEntry>
        )}
      </JiggleBox>
    </ItemShell>
  )
}
