import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  DndContext,
  DragOverlay,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  PointerSensorOptions,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type {
  CollisionDetection,
  PointerActivationConstraint,
  PointerSensorProps,
  SensorProps,
  TouchSensorOptions,
} from "@dnd-kit/core"
import { SortableContext, useSortable } from "@dnd-kit/sortable"
import type { SortingStrategy } from "@dnd-kit/sortable"
import { CSS as DndCSS } from "@dnd-kit/utilities"
import styled from "@emotion/styled"
import {
  faCheck,
  faChevronLeft,
  faChevronRight,
  faEllipsis,
  faGrip,
  faPen,
  faPlus,
  faTableCellsLarge,
  faXmark,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Favicon } from "../../components/Favicon"
import { Modal } from "../../components/Modal"
import { linkGroup } from "../../data/data"
import { LinkAnalytics } from "../../services/analytics"
import {
  addWidgetInstance,
  buildHomeItems,
  getHomeLayoutFingerprint,
  HOME_LAYOUT_KEY,
  HomeItem,
  HomeLayoutState,
  removeWidgetInstance,
  readHomeLayout,
  saveHomeLayout,
  updateWidgetInstanceIfUnchanged,
  withHomeLayoutLock,
} from "../../services/homeLayout"
import {
  getHomeGridMetrics,
  getHomeItemSpan,
  getOrderForItemOnPage,
  getOrderForRelativeDropOnPage,
  getVisiblePageIndices,
  HomeDropPosition,
  HomeGridMetrics,
  paginateHomeItems,
} from "../../services/homePagination"
import { navigateToLink } from "../../services/linkSearch"
import { LaterReadItem } from "../../services/readLater"
import {
  getWidgetDefinition,
  WidgetInstance,
  WidgetSize,
  WidgetType,
} from "../../services/widgetRegistry"
import { CommandPalette } from "../LinkContainer/CommandPalette/CommandPalette"
import { Links } from "../Settings/settingsHandler"
import { HomeOverview } from "./HomeOverview"
import { WidgetGallery, WidgetSettings } from "../Widgets/WidgetControls"
import { WidgetRenderer } from "../Widgets/WidgetRenderer"

/**
 * iOS 风格主屏：小组件与应用图标同网格。
 * 长按进入抖动编辑模式：拖拽排序、✕ 删除；"完成"或 Escape 退出。
 */

const HomePager = styled.div`
  flex: 1;
  min-width: 0;
  width: min(1040px, 100%);
  max-width: 1040px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const PageViewport = styled.div`
  width: 100%;
  height: clamp(390px, calc(100vh - 270px), 650px);
  min-height: 0;
  overflow: hidden;
  border-radius: 26px;
  touch-action: pan-y;
  cursor: grab;
  user-select: none;

  &[data-page-dragging="true"] {
    cursor: grabbing;
  }

  @media screen and (max-width: 600px) {
    height: clamp(360px, calc(100vh - 250px), 540px);
    border-radius: 20px;
  }
`

const PageTrack = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  transform: translate3d(
    calc(
      var(--home-page-offset, 0%) +
        var(--home-page-drag-offset, 0px)
    ),
    0,
    0
  );
  transition: var(--home-page-transition, none);
  will-change: transform;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const PageGrid = styled.div<{ columns: number; rows: number }>`
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(${({ columns }) => columns}, minmax(0, 1fr));
  grid-template-rows: repeat(${({ rows }) => rows}, minmax(0, 1fr));
  grid-auto-flow: dense;
  gap: 14px;
  align-content: start;
  padding: 8px;
  box-sizing: border-box;
`

const PageDots = styled.div`
  position: relative;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;

  @media (pointer: coarse) and (max-width: 600px) {
    box-sizing: border-box;
    padding-inline: 44px;
  }
`

const MovePageNotice = styled.div`
  position: absolute;
  left: 50%;
  bottom: calc(100% + 4px);
  transform: translateX(-50%);
  width: max-content;
  max-width: min(360px, 90vw);
  padding: 6px 10px;
  border: 1px solid var(--home-stroke);
  border-radius: 999px;
  background: var(--home-surface-strong);
  box-shadow: var(--home-shadow);
  color: var(--text-secondary);
  font-size: 0.72rem;
  text-align: center;
  pointer-events: none;
`

const PageDot = styled.button<{ active: boolean }>`
  width: ${({ active }) => (active ? 32 : 24)}px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  display: grid;
  place-items: center;

  ::before {
    content: "";
    width: ${({ active }) => (active ? 20 : 6)}px;
    height: 6px;
    border-radius: 999px;
    background: ${({ active }) =>
      active
        ? "var(--accent)"
        : "color-mix(in srgb, var(--text-primary) 30%, transparent)"};
    box-shadow: ${({ active }) =>
      active
        ? "0 0 14px color-mix(in srgb, var(--accent) 45%, transparent)"
        : "none"};
    transition:
      width var(--transition-fast),
      background var(--transition-fast);
  }

  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  @media (pointer: coarse) {
    width: ${({ active }) => (active ? 44 : 40)}px;
    height: 40px;
  }

  @media (prefers-reduced-motion: reduce) {
    ::before {
      transition: none;
    }
  }
`

const PagePosition = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`

const PageGap = styled.span`
  width: 8px;
  color: var(--text-muted);
  font-size: 0.72rem;
  line-height: 1;
  text-align: center;
`

const PageEditButton = styled.button`
  position: absolute;
  right: 6px;
  width: 28px;
  height: 28px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  opacity: 0.62;
  cursor: pointer;
  font-size: 0.68rem;

  :hover,
  :focus-visible {
    opacity: 1;
    color: var(--accent);
    border-color: var(--home-stroke);
    background: var(--home-surface-strong);
    outline: none;
  }

  @media (pointer: coarse) {
    width: 40px;
    height: 40px;
  }
`

const getAppTileHue = (url: string): number =>
  [...url].reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) % 360,
    0
  )

const cellSpan = (
  item: HomeItem,
  metrics: HomeGridMetrics
): { col: number; row: number } => {
  const span = getHomeItemSpan(item, metrics)
  return { col: span.columns, row: span.rows }
}

/**
 * 外层承载 dnd-kit 的行内 transform 与交错入场动画；
 * 抖动动画放内层，避免 CSS animation 覆盖行内 transform。
 *
 * settled 后必须移除入场动画：重排会让 React 移动 DOM 节点，
 * 被移动节点的 CSS 动画会整体重启（掉落后全场闪一遍淡入）。
 */
const ItemShell = styled.div<{
  col: number
  row: number
  delayIndex: number
  settled: boolean
}>`
  grid-column: span ${({ col }) => col};
  grid-row: span ${({ row }) => row};
  position: relative;
  min-width: 0;
  min-height: 0;

  animation: ${({ settled }) =>
    settled ? "none" : "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards"};
  animation-delay: ${({ delayIndex }) => Math.min(delayIndex, 14) * 28}ms;

  &[data-home-drop-target="true"] {
    outline: 2px solid color-mix(in srgb, var(--accent) 78%, transparent);
    outline-offset: 3px;
    border-radius: var(--radius-main);
  }

  &[data-home-drop-position]::after {
    content: "";
    position: absolute;
    z-index: 30;
    top: 8%;
    bottom: 8%;
    width: 4px;
    border-radius: 999px;
    background: var(--accent);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--home-surface-strong) 90%, transparent),
      0 4px 14px color-mix(in srgb, var(--accent) 55%, transparent);
    pointer-events: none;
  }

  &[data-home-drop-position="before"]::after {
    left: -8px;
  }

  &[data-home-drop-position="after"]::after {
    right: -8px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    animation-delay: 0ms;
  }
`

const DragPreviewSlot = styled.div<{
  col: number
  row: number
  previewOrder: number
  kind: HomeItem["kind"]
}>`
  order: ${({ previewOrder }) => previewOrder};
  grid-column: span ${({ col }) => col};
  grid-row: span ${({ row }) => row};
  min-width: 0;
  min-height: 0;
  pointer-events: none;
  border: 1px dashed color-mix(in srgb, var(--accent) 52%, transparent);
  border-radius: ${({ kind }) =>
    kind === "app" ? "18px" : "var(--radius-main)"};
  background: color-mix(in srgb, var(--accent) 7%, transparent);
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--home-surface-strong) 55%, transparent);
  opacity: 0.68;
  display: flex;
  align-items: center;
  justify-content: center;

  &::after {
    content: "";
    width: ${({ kind }) => (kind === "app" ? "52px" : "72%")};
    height: ${({ kind }) => (kind === "app" ? "52px" : "58%")};
    border-radius: ${({ kind }) =>
      kind === "app" ? "15px" : "calc(var(--radius-main) * 0.65)"};
    background: color-mix(in srgb, var(--text-primary) 7%, transparent);
  }
`

const DragPreview = styled.div`
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  position: relative;
  pointer-events: none;
  filter: drop-shadow(0 18px 28px color-mix(in srgb, #000 34%, transparent));

  & > * {
    animation: none !important;
  }
`

const JiggleBox = styled.div<{ jiggling: boolean; delayIndex: number }>`
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  position: relative;
  transform-origin: 50% 50%;

  animation: ${({ jiggling }) =>
    jiggling ? "jiggle 0.28s ease-in-out infinite" : "none"};
  /* 负延迟：各条目从周期中段开始，立即错相 */
  animation-delay: ${({ delayIndex }) => -(delayIndex % 5) * 57}ms;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const AppEntry = styled.div`
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
`

const AppTile = styled.button`
  width: fit-content;
  height: auto;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  :focus-visible {
    outline: none;
  }
`

const AppIconBox = styled.span`
  width: clamp(58px, 5vw, 66px);
  height: clamp(58px, 5vw, 66px);
  border-radius: 17px;
  /* 图标使用高分辨率源；底板只做静态主题混色，避免逐帧磨砂造成卡顿。 */
  background:
    linear-gradient(
      145deg,
      color-mix(
        in srgb,
        hsl(var(--tile-hue) 50% 58%) 15%,
        var(--home-surface-strong)
      ),
      var(--home-surface-strong)
    );
  border: 1px solid var(--home-stroke);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 16%, transparent),
    var(--home-shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform var(--transition-fast),
    border-color var(--transition-fast);

  ${AppTile}:hover & {
    transform: var(--hover-transform);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  }

  ${AppTile}:active & {
    transform: scale(0.94);
  }

  ${AppTile}:focus-visible & {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const AppLabel = styled.span`
  width: 72px;
  max-width: 100%;
  font-size: 0.74rem;
  color: var(--text-primary);
  opacity: 0.9;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 4px
    color-mix(in srgb, var(--bg-primary) 72%, transparent);
`

const DragAppGlyph = styled.span`
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-primary);
  text-transform: uppercase;
  user-select: none;
`

const DragWidgetCard = styled.div`
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 18px;
  border: 1px solid var(--home-stroke);
  border-radius: var(--radius-main);
  background: var(--home-surface-strong);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
    var(--home-shadow);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
`

const DragWidgetHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.95rem;
  font-weight: 650;

  &::before {
    content: "✦";
    color: var(--accent);
  }
`

const DragWidgetBody = styled.div`
  flex: 1;
  min-height: 0;
  border-radius: calc(var(--radius-main) * 0.7);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--text-primary) 8%, transparent),
    color-mix(in srgb, var(--text-primary) 3%, transparent)
  );
`

const WidgetShell = styled.div<{ dragging: boolean; editing: boolean }>`
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  touch-action: ${({ dragging, editing }) =>
    dragging || editing ? "none" : "pan-y"};

  ${({ dragging }) =>
    dragging &&
    `
      & > * {
        transform: none !important;
        transition: none !important;
      }
    `}
`

const WidgetEditDragSurface = styled.div`
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: var(--radius-main);
  cursor: grab;
  touch-action: none;

  :active {
    cursor: grabbing;
  }
`

const RemoveBadge = styled.button`
  position: absolute;
  top: -6px;
  left: -6px;
  z-index: 5;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--surface-border-strong);
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
  color: var(--text-primary);
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-soft);
  animation: pop-in 0.2s ease both;

  :hover {
    color: var(--accent-hover);
    border-color: var(--accent-hover);
  }

  @media (pointer: coarse) {
    top: -10px;
    left: -10px;
    width: 40px;
    height: 40px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const MovePageControls = styled.div`
  position: absolute;
  top: -6px;
  right: -6px;
  z-index: 5;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--surface-border-strong);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
  box-shadow: var(--shadow-soft);
  animation: pop-in 0.2s ease both;

  @media (pointer: coarse) {
    top: 50%;
    right: -10px;
    flex-direction: column;
    transform: translateY(-50%);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const MovePageButton = styled.button`
  width: 24px;
  height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.65rem;

  :hover,
  :focus-visible {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }

  & + & {
    border-left: 1px solid var(--surface-border);
  }

  @media (pointer: coarse) {
    width: 40px;
    height: 40px;

    & + & {
      border-top: 1px solid var(--surface-border);
      border-left: 0;
    }
  }
`

const WidgetEditControls = styled.div`
  position: absolute;
  right: -6px;
  bottom: -6px;
  z-index: 6;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--surface-border-strong);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 94%, transparent);
  box-shadow: var(--shadow-soft);

  @media (pointer: coarse) {
    right: auto;
    bottom: -10px;
    left: -10px;
  }
`

const WidgetEditButton = styled.button`
  width: 30px;
  height: 27px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  touch-action: none;

  :hover,
  :focus-visible {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    outline: none;
  }

  & + & {
    border-left: 1px solid var(--surface-border);
  }

  @media (pointer: coarse) {
    width: 40px;
    height: 40px;
  }
`

const EditToolbar = styled.div`
  position: fixed;
  top: 18px;
  right: 72px;
  z-index: 150;
  display: flex;
  gap: 8px;
`

const DoneButton = styled.button`
  padding: 8px 20px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  color: var(--accent);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  animation: pop-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;

  :hover {
    background: color-mix(in srgb, var(--accent) 30%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const EmptyHome = styled.div`
  grid-column: 1 / -1;
  grid-row: 1 / -1;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px;
  color: var(--text-secondary);
  text-align: center;

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: var(--text-primary);
    font-size: 1rem;
  }

  p {
    max-width: 360px;
    font-size: 0.82rem;
    line-height: 1.65;
  }
`

const EmptyHomeAction = styled.button`
  min-height: 40px;
  padding: 8px 16px;
  border: 1px solid color-mix(in srgb, var(--accent) 48%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  cursor: pointer;
  font: inherit;

  :hover,
  :focus-visible {
    background: color-mix(in srgb, var(--accent) 24%, transparent);
    outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
    outline-offset: 2px;
  }
`

const EditToolButton = styled(DoneButton)`
  padding: 8px 13px;
  background: var(--home-surface-strong);
  color: var(--text-primary);
  border-color: var(--home-stroke);
`

const UndoToast = styled.div`
  position: fixed;
  z-index: 1002;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  width: max-content;
  max-width: calc(100vw - 32px);
  padding: 10px 12px 10px 16px;
  border: 1px solid var(--home-stroke);
  border-radius: 999px;
  background: var(--home-surface-strong);
  box-shadow: var(--shadow-pop);
  color: var(--text-primary);
  font-size: 0.78rem;
`

const UndoButton = styled.button`
  padding: 5px 9px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
  cursor: pointer;
`

const ConfirmCard = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1001;
  width: min(320px, calc(100vw - 48px));
  padding: 22px;
  background: color-mix(in srgb, var(--bg-primary) 90%, transparent);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-main);
  box-shadow: var(--shadow-pop);
  text-align: center;
  animation: pop-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
`

const ConfirmTitle = styled.h3`
  margin: 0 0 8px;
  font-size: 1rem;
  color: var(--text-primary);
`

const ConfirmText = styled.p`
  margin: 0 0 18px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.5;
`

const ConfirmButtons = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
`

const ConfirmButton = styled.button<{ danger?: boolean }>`
  padding: 8px 22px;
  border-radius: 999px;
  border: 1px solid
    ${({ danger }) =>
      danger ? "var(--accent-hover)" : "var(--surface-border-strong)"};
  background: ${({ danger }) =>
    danger
      ? "color-mix(in srgb, var(--accent-hover) 18%, transparent)"
      : "transparent"};
  color: ${({ danger }) =>
    danger ? "var(--accent-hover)" : "var(--text-primary)"};
  font-size: 0.88rem;
  cursor: pointer;
  transition: background var(--transition-fast);

  :hover {
    background: ${({ danger }) =>
      danger
        ? "color-mix(in srgb, var(--accent-hover) 30%, transparent)"
        : "color-mix(in srgb, var(--text-primary) 8%, transparent)"};
  }
`

interface DeleteTarget {
  url: string
  label: string
  groupIndex?: number
  linkIndex?: number
}

interface PageDragState {
  pointerId: number
  startX: number
  startY: number
  startedAt: number
  axis: "pending" | "horizontal" | "vertical"
}

interface HomeDropIntent {
  overId: string
  position: HomeDropPosition
}

interface HomeDragSnapshot {
  id: string
  kind: HomeItem["kind"]
  label: string
  hue: number
}

const PAGE_SNAP_TRANSITION =
  "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)"
const EDGE_PAGE_DWELL_MS = 420
const EDGE_PAGE_TRANSITION_LOCK_MS = 280
const EDGE_PAGE_TARGET_GUTTER_PX = 20
const PAGE_DRAG_AXIS_THRESHOLD_PX = 10
const REORDER_INTENT_MS = 70
const REORDER_ANIMATION_MS = 180
const noHomeItemTransform: SortingStrategy = () => null
const doNotAnimateHomeLayoutChange = () => false

const sameHomeOrder = (
  left: string[] | null,
  right: string[] | null
): boolean =>
  left === right ||
  (!!left &&
    !!right &&
    left.length === right.length &&
    left.every((id, index) => id === right[index]))

export const saveHomeOrderIfUnchanged = (
  expectedCurrentLayout: HomeLayoutState,
  nextOrder: string[]
): ReturnType<typeof readHomeLayout> | null => {
  const latest = readHomeLayout()
  if (
    getHomeLayoutFingerprint(latest) !==
    getHomeLayoutFingerprint(expectedCurrentLayout)
  ) {
    return null
  }
  const next = { ...latest, order: [...new Set(nextOrder)] }
  saveHomeLayout(next)
  return next
}

export interface HomeDragPageFrame<T> {
  canonicalItems: readonly T[]
  previewItems: readonly T[] | null
}

/**
 * Keeps the canonical page containers mounted while a candidate order changes
 * the packed page count. A missing preview page is intentionally empty; null
 * is reserved for the non-dragging state where canonical content is visible.
 */
export const projectHomeDragPages = <T,>(
  canonicalPages: readonly (readonly T[])[],
  previewPages: readonly (readonly T[])[] | null
): { frames: HomeDragPageFrame<T>[]; navigationPageCount: number } => {
  const renderedPageCount = previewPages
    ? Math.max(canonicalPages.length, previewPages.length)
    : canonicalPages.length

  return {
    // A preview may temporarily collapse the last canonical page. Keep that
    // page reachable so the user can reverse the edge turn or cancel back to
    // the exact origin during the same drag session.
    navigationPageCount: renderedPageCount,
    frames: Array.from({ length: renderedPageCount }, (_, pageIndex) => ({
      canonicalItems: canonicalPages[pageIndex] ?? [],
      previewItems: previewPages ? (previewPages[pageIndex] ?? []) : null,
    })),
  }
}

const positionPageTrack = (
  track: HTMLDivElement | null,
  page: number,
  dragOffset: number,
  animate: boolean
): void => {
  if (!track) return
  track.style.setProperty("--home-page-offset", `${-page * 100}%`)
  track.style.setProperty("--home-page-drag-offset", `${dragOffset}px`)
  track.style.setProperty(
    "--home-page-transition",
    animate ? PAGE_SNAP_TRANSITION : "none"
  )
}

// ============ 可排序条目 ============

const HOME_GESTURE_INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, [contenteditable], [data-widget-interactive]"
const HOME_DRAG_ACTIVATOR_SELECTOR =
  '[data-home-app-tile="true"], [data-home-drag-handle="true"]'
const HOME_PAGE_GESTURE_EXCLUDED_SELECTOR =
  '[data-fluidity-modal="true"], [data-home-widget-edit-surface="true"], [data-home-drag-handle="true"]'
const HOME_PAGE_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ")

export const HOME_SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "使用指针按住并拖动应用图标；小组件请先长按进入编辑，再拖动其手柄。编辑模式下，可使用 Control 或 Command 加左右方向键在当前页调整顺序，也可使用移至上一页或移至下一页按钮跨页移动。",
}

/**
 * Business controls never start item DnD. They still participate in the
 * parent page gesture so a short press remains a click, a horizontal move
 * pages, and an intentional long press enters the shared home edit mode.
 * Explicit drag-only surfaces stay entirely under dnd-kit control.
 */
export const shouldCaptureHomeGestureFromTarget = (
  target: EventTarget | null,
  gesture: "item-drag" | "page"
): boolean => {
  if (!(target instanceof Element)) return true
  if (gesture === "page") {
    return !target.closest(HOME_PAGE_GESTURE_EXCLUDED_SELECTOR)
  }
  if (target.closest(HOME_DRAG_ACTIVATOR_SELECTOR)) return true
  return !target.closest(HOME_GESTURE_INTERACTIVE_SELECTOR)
}

const isVisibleHomePageFocusTarget = (element: HTMLElement): boolean =>
  !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
  element.getClientRects().length > 0

const homeCollisionDetection: CollisionDetection = args => {
  const activePageContainers = args.droppableContainers.filter(container => {
    const node = container.node.current
    return (
      container.id !== args.active.id &&
      !!node &&
      !node.closest('[aria-hidden="true"]')
    )
  })
  if (activePageContainers.length === 0) return []

  const activePageGrid = activePageContainers[0].node.current?.closest(
    '[data-home-page-grid="true"]'
  )
  if (activePageGrid && args.pointerCoordinates) {
    const bounds = activePageGrid.getBoundingClientRect()
    const { x, y } = args.pointerCoordinates
    if (
      x < bounds.left ||
      x > bounds.right ||
      y < bounds.top ||
      y > bounds.bottom
    ) {
      return []
    }
  }

  if (!args.pointerCoordinates) return []
  const { x, y } = args.pointerCoordinates
  const liveContainers = activePageContainers.flatMap(container => {
    const rect = container.node.current?.getBoundingClientRect()
    return rect ? [{ container, rect }] : []
  })
  const pointerHits = liveContainers
    .filter(
      ({ rect }) =>
        x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    )
    .sort((left, right) => {
      const leftDistance = Math.hypot(
        x - (left.rect.left + left.rect.width / 2),
        y - (left.rect.top + left.rect.height / 2)
      )
      const rightDistance = Math.hypot(
        x - (right.rect.left + right.rect.width / 2),
        y - (right.rect.top + right.rect.height / 2)
      )
      return leftDistance - rightDistance
    })
  const hit = pointerHits[0]
  return hit
    ? [
        {
          id: hit.container.id,
          data: { droppableContainer: hit.container, value: 0 },
        },
      ]
    : []
}

const getClientX = (event: Event): number | null => {
  if (!("clientX" in event)) return null
  const clientX = Number(event.clientX)
  return Number.isFinite(clientX) ? clientX : null
}

const getClientY = (event: Event): number | null => {
  if (!("clientY" in event)) return null
  const clientY = Number(event.clientY)
  return Number.isFinite(clientY) ? clientY : null
}

const resolveHomeDropPosition = (
  pointerX: number | null,
  targetRect: { left: number; width: number }
): HomeDropPosition =>
  (pointerX ?? targetRect.left + targetRect.width / 2) <
  targetRect.left + targetRect.width / 2
    ? "before"
    : "after"

const findHomeDropTargetAtPoint = (
  grid: HTMLElement | null | undefined,
  activeId: string,
  pointerX: number,
  pointerY: number
): { target: HTMLElement; rect: DOMRect } | null =>
  grid
    ? (Array.from(
        grid.querySelectorAll<HTMLElement>(":scope > [data-home-item-id]")
      )
        .filter(target => target.dataset.homeItemId !== activeId)
        .map(target => ({ target, rect: target.getBoundingClientRect() }))
        .filter(
          ({ rect }) =>
            pointerX >= rect.left &&
            pointerX <= rect.right &&
            pointerY >= rect.top &&
            pointerY <= rect.bottom
        )
        .sort((left, right) => {
          const leftDistance = Math.hypot(
            pointerX - (left.rect.left + left.rect.width / 2),
            pointerY - (left.rect.top + left.rect.height / 2)
          )
          const rightDistance = Math.hypot(
            pointerX - (right.rect.left + right.rect.width / 2),
            pointerY - (right.rect.top + right.rect.height / 2)
          )
          return leftDistance - rightDistance
        })[0] ?? null)
    : null

const isPointInsideElement = (
  element: Element | null | undefined,
  pointerX: number,
  pointerY: number
): boolean => {
  if (!(element instanceof HTMLElement)) return false
  const rect = element.getBoundingClientRect()
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    pointerX >= rect.left &&
    pointerX <= rect.right &&
    pointerY >= rect.top &&
    pointerY <= rect.bottom
  )
}

const isPointInsideActivePreviewSlot = (
  grid: HTMLElement | null | undefined,
  activeId: string,
  pointerX: number,
  pointerY: number
): boolean => {
  if (!grid) return false
  const escapedId = CSS.escape(activeId)
  return [
    grid.querySelector(`[data-home-item-id="${escapedId}"]`),
    grid.querySelector(`[data-home-preview-slot-id="${escapedId}"]`),
  ].some(element => isPointInsideElement(element, pointerX, pointerY))
}

const isPointerInEdgeTurnGutter = (
  pointerX: number,
  bounds: DOMRect,
  direction: -1 | 1
): boolean =>
  direction < 0
    ? pointerX < bounds.left + EDGE_PAGE_TARGET_GUTTER_PX
    : pointerX > bounds.right - EDGE_PAGE_TARGET_GUTTER_PX

export const getHomePointerActivationConstraint = (
  target: EventTarget | null,
  pointerType: string,
  editMode: boolean
): PointerActivationConstraint => {
  if (editMode) return { distance: 4 }
  if (
    pointerType !== "touch" &&
    target instanceof Element &&
    target.closest('[data-home-app-tile="true"]')
  ) {
    return { distance: 8 }
  }
  return { delay: 220, tolerance: 8 }
}

class HomePointerSensor extends PointerSensor {
  constructor(props: PointerSensorProps) {
    const target = props.event.target
    const pointerType =
      "pointerType" in props.event ? String(props.event.pointerType) : ""
    const editMode =
      target instanceof Element &&
      !!target.closest('[data-home-editing="true"]')
    super({
      ...props,
      options: {
        ...props.options,
        activationConstraint: getHomePointerActivationConstraint(
          target,
          pointerType,
          editMode
        ),
      },
    })
  }

  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (
        { nativeEvent: event }: React.PointerEvent,
        { onActivation }: PointerSensorOptions
      ) => {
        if (event.pointerType === "touch") return false
        if (!shouldActivateHomePointerDrag(event)) return false
        onActivation?.({ event })
        return true
      },
    },
  ]
}

class HomeTouchSensor extends TouchSensor {
  constructor(props: SensorProps<TouchSensorOptions>) {
    const target = props.event.target
    const editMode =
      target instanceof Element &&
      !!target.closest('[data-home-editing="true"]')
    super({
      ...props,
      options: {
        ...props.options,
        activationConstraint: getHomePointerActivationConstraint(
          target,
          "touch",
          editMode
        ),
      },
    })
  }

  static activators = [
    {
      eventName: "onTouchStart" as const,
      handler: (
        { nativeEvent: event }: React.TouchEvent,
        { onActivation }: PointerSensorOptions
      ) => {
        if (!shouldActivateHomeTouchDrag(event)) return false
        onActivation?.({ event })
        return true
      },
    },
  ]
}

interface HomePointerActivationEvent {
  isPrimary: boolean
  button: number
  pointerType: string
  target: EventTarget | null
}

export const shouldActivateHomePointerDrag = (
  event: HomePointerActivationEvent
): boolean => {
  if (!event.isPrimary || event.button !== 0) return false
  return shouldCaptureHomeGestureFromTarget(event.target, "item-drag")
}

export const shouldActivateHomeTouchDrag = (
  event: Pick<TouchEvent, "target" | "touches">
): boolean => {
  if (event.touches.length !== 1) return false
  return shouldCaptureHomeGestureFromTarget(event.target, "item-drag")
}

export const shouldReservePointerForHomeItemDrag = (
  target: EventTarget | null,
  pointerType: string,
  editMode: boolean
): boolean =>
  target instanceof Element &&
  (editMode
    ? !!target.closest('[data-home-item-kind="app"]')
    : pointerType !== "touch" &&
      !!target.closest('[data-home-app-tile="true"]'))

/**
 * Bare arrow keys are a home-page navigation shortcut, not a global browser
 * shortcut. Keep focused toolbar/settings controls in charge of their keys.
 */
export const shouldHandleHomePageArrowKey = (
  target: EventTarget | null,
  currentPage: number
): boolean => {
  if (!(target instanceof Element)) return true
  if (target === document.body || target === document.documentElement) return true
  const page = target.closest<HTMLElement>('[data-home-page-grid="true"]')
  return page?.dataset.homePageIndex === String(currentPage)
}

const SortableItem = ({
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
                    "--tile-hue": String(
                      getAppTileHue(item.url)
                    ),
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

// ============ 主组件 ============

export const HomeGrid = () => {
  const [linkGroups, setLinkGroups] = useState(() => Links.getWithFallback())
  const [layout, setLayout] = useState(() => readHomeLayout())
  const [editMode, setEditMode] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [settled, setSettled] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [animatePage, setAnimatePage] = useState(true)
  const [isPageDragging, setIsPageDragging] = useState(false)
  const [movePageNotice, setMovePageNotice] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [settingsInstanceId, setSettingsInstanceId] = useState<string | null>(null)
  const [dropIntent, setDropIntent] = useState<HomeDropIntent | null>(null)
  const [dragSnapshot, setDragSnapshot] = useState<HomeDragSnapshot | null>(null)
  const [dragPreviewOrder, setDragPreviewOrder] = useState<string[] | null>(null)
  const [undoAction, setUndoAction] = useState<{
    message: string
    undo: () => void
  } | null>(null)
  const [gridMetrics, setGridMetrics] = useState<HomeGridMetrics>({
    columns: 9,
    rows: 5,
  })
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const pageTrackRef = useRef<HTMLDivElement | null>(null)
  const pageDragRef = useRef<PageDragState | null>(null)
  const pendingKeyboardPageFocusRef = useRef<number | null>(null)
  const pendingMovedItemFocusRef = useRef<{
    page: number
    itemId: string
  } | null>(null)
  const suppressNextPageClickRef = useRef(false)
  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastWheelAtRef = useRef(0)
  const edgePageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reorderTargetRef = useRef<string | null>(null)
  const dragOrderRef = useRef<string[] | null>(null)
  const dragPageOrderRef = useRef<string[] | null>(null)
  const dragPreviewOrderRef = useRef<string[] | null>(null)
  const dragPreviewIntentRef = useRef<HomeDropIntent | null>(null)
  const dragPreviewRectsRef = useRef<Map<
    string,
    { left: number; top: number }
  > | null>(null)
  const dropIntentRef = useRef<HomeDropIntent | null>(null)
  const dragPointerRevisionRef = useRef(0)
  const dropIntentRevisionRef = useRef(-1)
  const itemDraggingRef = useRef(false)
  const activeDragIdRef = useRef<string | null>(null)
  const dragPointerStartXRef = useRef<number | null>(null)
  const dragPointerStartYRef = useRef<number | null>(null)
  const dragPointerXRef = useRef<number | null>(null)
  const dragPointerYRef = useRef<number | null>(null)
  const dragDestinationPageRef = useRef<number | null>(null)
  const dragOriginPageRef = useRef<number | null>(null)
  const dragEscapeGuardRef = useRef(false)
  const edgePageDirectionRef = useRef<-1 | 0 | 1>(0)
  const edgePageTransitionUntilRef = useRef(0)
  const edgePageScheduleRef = useRef<(direction: -1 | 1) => void>(() => undefined)
  const currentPageRef = useRef(0)
  const pagesLengthRef = useRef(1)
  const itemsRef = useRef<HomeItem[]>([])
  const gridMetricsRef = useRef<HomeGridMetrics>({ columns: 9, rows: 5 })
  const layoutRevisionRef = useRef(0)
  const dragLayoutRevisionRef = useRef<number | null>(null)
  const dragPersistedLayoutRef = useRef<HomeLayoutState | null>(null)
  const dragPersistedItemIdsRef = useRef<string[] | null>(null)
  const externalLayoutPendingRef = useRef(false)

  // 入场动画结束后移除 animation，避免重排移动 DOM 时动画重启闪烁
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), 1100)
    return () => clearTimeout(timer)
  }, [])

  const layoutItems = useMemo(
    () => buildHomeItems(linkGroups, layout, LinkAnalytics.get(), Date.now()),
    [linkGroups, layout]
  )
  /*
   * 拖动时保持真实页面树不变。候选顺序通过 CSS grid order 与轻量跨页
   * 占位投影，避免 favicon/小组件重挂载；松手后才一次性提交真实顺序。
   */
  const items = layoutItems
  const pages = useMemo(
    () => paginateHomeItems(items, gridMetrics),
    [items, gridMetrics]
  )
  const dragPreviewPages = useMemo(() => {
    if (!dragPreviewOrder) return null
    const itemById = new Map(items.map(item => [item.id, item]))
    const seen = new Set<string>()
    const orderedItems = dragPreviewOrder.flatMap(id => {
      const item = itemById.get(id)
      if (!item || seen.has(id)) return []
      seen.add(id)
      return [item]
    })
    items.forEach(item => {
      if (!seen.has(item.id)) orderedItems.push(item)
    })
    return paginateHomeItems(orderedItems, gridMetrics)
  }, [dragPreviewOrder, gridMetrics, items])
  const dragPageProjection = useMemo(
    () => projectHomeDragPages(pages, dragPreviewPages),
    [dragPreviewPages, pages]
  )
  const navigationPageCount = dragPageProjection.navigationPageCount
  currentPageRef.current = currentPage
  pagesLengthRef.current = navigationPageCount
  itemsRef.current = items
  gridMetricsRef.current = gridMetrics
  const itemIndexById = useMemo(
    () => new Map(items.map((item, index) => [item.id, index])),
    [items]
  )
  const visibleAppUrlsByPage = useMemo(
    () =>
      pages.map(pageItems =>
        pageItems.flatMap(item => (item.kind === "app" ? [item.url] : []))
      ),
    [pages]
  )
  const [mountedPageIndices, setMountedPageIndices] = useState<Set<number>>(
    () => new Set([0, 1])
  )
  const visiblePageIndices = useMemo(
    () =>
      getVisiblePageIndices(
        navigationPageCount,
        currentPage,
        gridMetrics.columns <= 4 ? 5 : 7
      ),
    [currentPage, gridMetrics.columns, navigationPageCount]
  )
  const widgetCounts = useMemo(() => {
    const counts: Partial<Record<WidgetType, number>> = {}
    Object.values(layout.widgets).forEach(widget => {
      counts[widget.type] = (counts[widget.type] ?? 0) + 1
    })
    return counts
  }, [layout.widgets])
  const settingsInstance = settingsInstanceId
    ? layout.widgets[settingsInstanceId] ?? null
    : null

  const captureDragPreviewRects = useCallback(() => {
    const page = pageTrackRef.current?.querySelector<HTMLElement>(
      `[data-home-page-index="${currentPageRef.current}"]`
    )
    if (!page) {
      dragPreviewRectsRef.current = null
      return
    }
    dragPreviewRectsRef.current = new Map(
      Array.from(
        page.querySelectorAll<HTMLElement>(
          ":scope > [data-home-item-id]:not([data-home-preview-hidden='true'])"
        )
      ).flatMap(element => {
        const id = element.dataset.homeItemId
        const rect = element.getBoundingClientRect()
        return id && rect.width > 0 && rect.height > 0
          ? [[id, { left: rect.left, top: rect.top }] as const]
          : []
      })
    )
  }, [])

  const updateDragPreviewOrder = useCallback(
    (order: string[] | null) => {
      if (sameHomeOrder(dragPreviewOrderRef.current, order)) return
      captureDragPreviewRects()
      const next = order ? [...order] : null
      dragPreviewOrderRef.current = next
      setDragPreviewOrder(next)
    },
    [captureDragPreviewRects]
  )

  const restoreDragPagePreview = useCallback(() => {
    const pageOrder = dragPageOrderRef.current
    if (!pageOrder) return
    dragPreviewIntentRef.current = null
    dragOrderRef.current = pageOrder
    updateDragPreviewOrder(pageOrder)
  }, [updateDragPreviewOrder])

  useLayoutEffect(() => {
    const previousRects = dragPreviewRectsRef.current
    dragPreviewRectsRef.current = null
    if (!previousRects || previousRects.size === 0) return
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return
    }
    const page = pageTrackRef.current?.querySelector<HTMLElement>(
      `[data-home-page-index="${currentPage}"]`
    )
    if (!page) return
    const activeId = activeDragIdRef.current
    page
      .querySelectorAll<HTMLElement>(
        ":scope > [data-home-item-id]:not([data-home-preview-hidden='true'])"
      )
      .forEach(element => {
        const id = element.dataset.homeItemId
        const previous = id ? previousRects.get(id) : null
        if (!id || id === activeId || !previous || !element.animate) return
        const current = element.getBoundingClientRect()
        const deltaX = previous.left - current.left
        const deltaY = previous.top - current.top
        if (Math.hypot(deltaX, deltaY) < 1) return
        element.animate(
          [
            { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
            { transform: "translate3d(0, 0, 0)" },
          ],
          {
            duration: REORDER_ANIMATION_MS,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          }
        )
      })
  }, [currentPage, dragPreviewOrder])

  useEffect(() => {
    if (!undoAction) return
    const timer = setTimeout(() => setUndoAction(null), 6500)
    return () => clearTimeout(timer)
  }, [undoAction])

  useEffect(() => {
    if (!movePageNotice) return
    const timer = setTimeout(() => setMovePageNotice(null), 2200)
    return () => clearTimeout(timer)
  }, [movePageNotice])

  useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      if (!itemDraggingRef.current) return
      dragPointerXRef.current = event.clientX
      dragPointerYRef.current = event.clientY
      dragPointerRevisionRef.current += 1

      // PointerSensor can coalesce its React onDragMove callback while the
      // pointer is travelling quickly. Arm the first edge turn from the native
      // capture listener as well, then let the self-rescheduling edge state
      // machine handle a pointer that remains stationary at the gutter.
      const viewport = viewportRef.current
      if (!viewport) return
      const bounds = viewport.getBoundingClientRect()
      const withinViewportY =
        event.clientY >= bounds.top && event.clientY <= bounds.bottom
      const direction = !withinViewportY
        ? 0
        : event.clientX < bounds.left + EDGE_PAGE_TARGET_GUTTER_PX
          ? -1
          : event.clientX > bounds.right - EDGE_PAGE_TARGET_GUTTER_PX
            ? 1
            : 0
      if (direction === 0) {
        if (edgePageTimerRef.current) {
          clearTimeout(edgePageTimerRef.current)
          edgePageTimerRef.current = null
        }
        edgePageDirectionRef.current = 0
        return
      }
      if (
        edgePageTimerRef.current &&
        edgePageDirectionRef.current === direction
      ) {
        return
      }
      edgePageScheduleRef.current(direction)
    }
    document.addEventListener("pointermove", trackPointer, true)
    return () => document.removeEventListener("pointermove", trackPointer, true)
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const measure = () => {
      const rect = viewport.getBoundingClientRect()
      setGridMetrics(getHomeGridMetrics(rect.width, rect.height))
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const maximumPage = Math.max(0, navigationPageCount - 1)
    if (currentPage <= maximumPage) return
    currentPageRef.current = maximumPage
    setCurrentPage(maximumPage)
  }, [currentPage, navigationPageCount])

  useEffect(() => {
    setMountedPageIndices(previous => {
      const next = new Set(
        [...previous].filter(
          pageIndex => pageIndex < dragPageProjection.frames.length
        )
      )
      for (
        let pageIndex = Math.max(0, currentPage - 1);
        pageIndex <=
        Math.min(dragPageProjection.frames.length - 1, currentPage + 1);
        pageIndex += 1
      ) {
        next.add(pageIndex)
      }
      const unchanged =
        next.size === previous.size &&
        [...next].every(pageIndex => previous.has(pageIndex))
      return unchanged ? previous : next
    })
  }, [currentPage, dragPageProjection.frames.length])

  useLayoutEffect(() => {
    positionPageTrack(pageTrackRef.current, currentPage, 0, animatePage)
  }, [animatePage, currentPage])

  useLayoutEffect(() => {
    const pendingMovedItem = pendingMovedItemFocusRef.current
    if (
      pendingKeyboardPageFocusRef.current !== currentPage &&
      pendingMovedItem?.page !== currentPage
    ) {
      return
    }
    pendingKeyboardPageFocusRef.current = null
    pendingMovedItemFocusRef.current = null

    const page = pageTrackRef.current?.querySelector<HTMLElement>(
      `[data-home-page-index="${currentPage}"]`
    )
    const movedItem =
      page && pendingMovedItem
        ? page.querySelector<HTMLElement>(
            `[data-home-item-id="${CSS.escape(pendingMovedItem.itemId)}"]`
          )
        : null
    const movedItemControl = movedItem
      ? [
          movedItem.querySelector<HTMLElement>('[data-home-app-tile="true"]'),
          movedItem.querySelector<HTMLElement>('[data-home-drag-handle="true"]'),
          movedItem.querySelector<HTMLElement>('button[aria-label^="移至"]'),
        ].find(
          (control): control is HTMLElement =>
            control !== null && isVisibleHomePageFocusTarget(control)
        )
      : undefined
    const firstPageControl = page
      ? Array.from(
          page.querySelectorAll<HTMLElement>(HOME_PAGE_FOCUSABLE_SELECTOR)
        ).find(isVisibleHomePageFocusTarget)
      : undefined
    const fallbackPageDot = gridRef.current?.querySelector<HTMLElement>(
      `button[aria-label="转到第 ${currentPage + 1} 页"]`
    )

    const focusTarget = pendingMovedItem
      ? movedItemControl ?? fallbackPageDot
      : firstPageControl ?? fallbackPageDot
    focusTarget?.focus({ preventScroll: true })
  }, [currentPage])

  /* 图标按位移拖，小组件按长按拖；编辑模式内统一即拖即走。 */
  const sensors = useSensors(
    useSensor(HomePointerSensor),
    useSensor(HomeTouchSensor)
  )
  const detectHomeCollision = useCallback<CollisionDetection>(args => {
    const pointerCoordinates =
      dragPointerXRef.current !== null && dragPointerYRef.current !== null
        ? { x: dragPointerXRef.current, y: dragPointerYRef.current }
        : args.pointerCoordinates
    return homeCollisionDetection({ ...args, pointerCoordinates })
  }, [])

  // 长按进入编辑模式（iOS 式）；允许 10px 以内的指针抖动
  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
    pressOriginRef.current = null
  }, [])

  const changePage = useCallback(
    (direction: -1 | 1) => {
      setAnimatePage(true)
      setCurrentPage(page =>
        Math.min(navigationPageCount - 1, Math.max(0, page + direction))
      )
    },
    [navigationPageCount]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return
      const target = e.target
      if (!shouldCaptureHomeGestureFromTarget(target, "page")) return
      cancelLongPress()
      pressOriginRef.current = { x: e.clientX, y: e.clientY }
      pageDragRef.current = shouldReservePointerForHomeItemDrag(
        target,
        e.pointerType,
        editMode
      )
        ? null
        : {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startedAt: performance.now(),
            axis: "pending",
          }
      if (!editMode) {
        longPressRef.current = setTimeout(() => {
          suppressNextPageClickRef.current = true
          if (suppressClickTimerRef.current) {
            clearTimeout(suppressClickTimerRef.current)
          }
          suppressClickTimerRef.current = setTimeout(() => {
            suppressNextPageClickRef.current = false
            suppressClickTimerRef.current = null
          }, 800)
          setEditMode(true)
        }, 480)
      }
    },
    [cancelLongPress, editMode]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (itemDraggingRef.current) {
        dragPointerXRef.current = e.clientX
        dragPointerYRef.current = e.clientY
        return
      }

      const origin = pressOriginRef.current
      if (
        origin &&
        Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10
      ) {
        cancelLongPress()
      }

      const drag = pageDragRef.current
      if (!drag || drag.pointerId !== e.pointerId || itemDraggingRef.current) {
        return
      }
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY

      if (drag.axis === "pending") {
        // DnD's delayed long-press tolerance is 8px. Paging must not claim the
        // same 5–8px band and then hand the gesture to item dragging.
        if (
          Math.max(Math.abs(dx), Math.abs(dy)) <
          PAGE_DRAG_AXIS_THRESHOLD_PX
        ) {
          return
        }
        if (Math.abs(dy) > Math.abs(dx) * 1.15) {
          drag.axis = "vertical"
          return
        }
        drag.axis = "horizontal"
        cancelLongPress()
        suppressNextPageClickRef.current = true
        setIsPageDragging(true)
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Pointer capture is optional; document-level pointer events still work.
        }
      }

      if (drag.axis !== "horizontal") return
      e.preventDefault()
      const atLeadingEdge = currentPage === 0 && dx > 0
      const atTrailingEdge =
        currentPage === navigationPageCount - 1 && dx < 0
      positionPageTrack(
        pageTrackRef.current,
        currentPage,
        atLeadingEdge || atTrailingEdge ? Math.round(dx * 0.24) : dx,
        false
      )
    },
    [cancelLongPress, currentPage, navigationPageCount]
  )

  const finishPageDragAt = useCallback(
    (pointerId: number, clientX: number, cancelled = false) => {
      cancelLongPress()
      const drag = pageDragRef.current
      pageDragRef.current = null
      if (!drag || drag.pointerId !== pointerId) return

      if (drag.axis === "horizontal") {
        const dx = clientX - drag.startX
        const elapsed = Math.max(1, performance.now() - drag.startedAt)
        const velocity = dx / elapsed
        const viewportWidth = viewportRef.current?.clientWidth ?? 0
        const passedDistance =
          Math.abs(dx) >= Math.max(48, viewportWidth * 0.13)
        const passedFlick = Math.abs(dx) >= 20 && Math.abs(velocity) >= 0.45
        const canChange =
          dx < 0 ? currentPage < navigationPageCount - 1 : currentPage > 0

        const targetPage =
          !cancelled && canChange && (passedDistance || passedFlick)
            ? currentPage + (dx < 0 ? 1 : -1)
            : currentPage
        positionPageTrack(pageTrackRef.current, targetPage, 0, true)
        setAnimatePage(true)
        setIsPageDragging(false)
        setCurrentPage(targetPage)
        setTimeout(() => {
          suppressNextPageClickRef.current = false
        }, 0)
      } else {
        setIsPageDragging(false)
        positionPageTrack(pageTrackRef.current, currentPage, 0, true)
      }
    },
    [cancelLongPress, currentPage, navigationPageCount]
  )

  const finishPageDrag = useCallback(
    (e: React.PointerEvent, cancelled = false) => {
      finishPageDragAt(e.pointerId, e.clientX, cancelled)

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
      } catch {
        // ignore
      }
    },
    [finishPageDragAt]
  )

  // Pointer capture can be denied by the browser when a swipe starts on a
  // nested business control. Always settle a page gesture on document-level
  // release so dragging outside the viewport cannot leave it half-finished.
  useEffect(() => {
    const finish = (event: PointerEvent) => {
      finishPageDragAt(event.pointerId, event.clientX, event.type === "pointercancel")
    }
    document.addEventListener("pointerup", finish, true)
    document.addEventListener("pointercancel", finish, true)
    return () => {
      document.removeEventListener("pointerup", finish, true)
      document.removeEventListener("pointercancel", finish, true)
    }
  }, [finishPageDragAt])

  const handlePageClickCapture = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest('[data-fluidity-modal="true"]')
      ) {
        return
      }
      if (!suppressNextPageClickRef.current) return
      suppressNextPageClickRef.current = false
      if (suppressClickTimerRef.current) {
        clearTimeout(suppressClickTimerRef.current)
        suppressClickTimerRef.current = null
      }
      event.preventDefault()
      event.stopPropagation()
    },
    []
  )

  useEffect(
    () => () => {
      cancelLongPress()
      if (suppressClickTimerRef.current) {
        clearTimeout(suppressClickTimerRef.current)
      }
    },
    [cancelLongPress]
  )

  // 设置、其他新标签页或同步写入的布局变更 → 即时刷新。拖动中只标记
  // revision，松手时放弃过期投影，再读取最新状态，避免覆盖另一页的修改。
  useEffect(() => {
    const refresh = () => {
      layoutRevisionRef.current += 1
      if (itemDraggingRef.current) {
        externalLayoutPendingRef.current = true
        return
      }
      externalLayoutPendingRef.current = false
      setLayout(readHomeLayout())
      setLinkGroups(Links.getWithFallback())
    }
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return
      if (
        event.key !== null &&
        event.key !== HOME_LAYOUT_KEY &&
        event.key !== "link-groups"
      ) {
        return
      }
      refresh()
    }
    window.addEventListener("fluidity-home-layout-changed", refresh)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("fluidity-home-layout-changed", refresh)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  // iOS 式：点击网格空隙或网格外的壁纸区域退出编辑
  useEffect(() => {
    if (
      !editMode ||
      deleteTarget ||
      galleryOpen ||
      overviewOpen ||
      settingsInstanceId
    ) {
      return
    }
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      const grid = gridRef.current
      if (!grid) return
      if (
        target instanceof HTMLElement &&
        target.closest(
          "button, a, input, textarea, select, [role='dialog'], [data-home-edit-control], [data-widget-interactive]"
        )
      ) {
        return
      }
      const clickedPageGap =
        target instanceof HTMLElement &&
        target.dataset.homePageGrid === "true"
      if (target === grid || clickedPageGap || !grid.contains(target)) {
        setEditMode(false)
      }
    }
    window.addEventListener("click", onClick)
    return () => window.removeEventListener("click", onClick)
  }, [
    deleteTarget,
    editMode,
    galleryOpen,
    overviewOpen,
    settingsInstanceId,
  ])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest('[role="dialog"]')
      ) {
        return
      }
      const isEditable =
        target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable)
      if (
        isEditable ||
        editMode ||
        deleteTarget ||
        galleryOpen ||
        overviewOpen ||
        settingsInstanceId ||
        event.isComposing
      ) {
        return
      }

      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !shouldHandleHomePageArrowKey(target, currentPage)
      ) {
        return
      }

      if (event.key === "ArrowLeft" && currentPage > 0) {
        event.preventDefault()
        const activePage =
          document.activeElement instanceof HTMLElement
            ? document.activeElement.closest<HTMLElement>(
                '[data-home-page-grid="true"]'
              )
            : null
        pendingKeyboardPageFocusRef.current =
          activePage?.dataset.homePageIndex === String(currentPage)
            ? currentPage - 1
            : null
        setAnimatePage(true)
        setCurrentPage(page => page - 1)
        return
      }
      if (
        event.key === "ArrowRight" &&
        currentPage < navigationPageCount - 1
      ) {
        event.preventDefault()
        const activePage =
          document.activeElement instanceof HTMLElement
            ? document.activeElement.closest<HTMLElement>(
                '[data-home-page-grid="true"]'
              )
            : null
        pendingKeyboardPageFocusRef.current =
          activePage?.dataset.homePageIndex === String(currentPage)
            ? currentPage + 1
            : null
        setAnimatePage(true)
        setCurrentPage(page => page + 1)
        return
      }

      const match = event.code.match(/^Digit([1-9])$/)
      if (!match || layout.pageShortcutModifier === "disabled") return
      const modifierPressed =
        layout.pageShortcutModifier === "alt"
          ? event.altKey && !event.ctrlKey && !event.metaKey
          : layout.pageShortcutModifier === "control"
            ? event.ctrlKey && !event.altKey && !event.metaKey
            : event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
      if (!modifierPressed) return

      const page = Number(match[1]) - 1
      if (page < 0 || page >= navigationPageCount) return
      event.preventDefault()
      const activePage =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.closest<HTMLElement>(
              '[data-home-page-grid="true"]'
            )
          : null
      pendingKeyboardPageFocusRef.current =
        page !== currentPage &&
        activePage?.dataset.homePageIndex === String(currentPage)
          ? page
          : null
      setAnimatePage(Math.abs(page - currentPage) === 1)
      setCurrentPage(page)
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [
    currentPage,
    deleteTarget,
    editMode,
    galleryOpen,
    layout.pageShortcutModifier,
    overviewOpen,
    navigationPageCount,
    settingsInstanceId,
  ])

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[role="dialog"], [data-fluidity-modal="true"]')
      ) {
        return
      }
      if (editMode || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
      if (Math.abs(event.deltaX) < 24) return
      const now = Date.now()
      if (now - lastWheelAtRef.current < 320) return
      lastWheelAtRef.current = now
      event.preventDefault()
      changePage(event.deltaX > 0 ? 1 : -1)
    },
    [changePage, editMode]
  )

  // Escape 退出编辑
  useEffect(() => {
    if (!editMode) return
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !itemDraggingRef.current &&
        !dragEscapeGuardRef.current
      ) {
        setEditMode(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editMode])

  const commitLayout = useCallback(
    async (
      updater:
        | typeof layout
        | ((current: typeof layout) => typeof layout)
    ) => {
      return withHomeLayoutLock(() => {
        // Always base a partial update on the newest persisted value. This is
        // important when another start-page tab changed widgets or shortcuts.
        const latest = readHomeLayout()
        const next = typeof updater === "function" ? updater(latest) : updater
        saveHomeLayout(next)
        setLayout(next)
        return next
      })
    },
    []
  )

  const persistOrderIfUnchanged = useCallback(
    async (
      expectedCurrentLayout: HomeLayoutState,
      expectedItemIds: string[],
      nextOrder: string[]
    ) => {
      return withHomeLayoutLock(() => {
        const latest = readHomeLayout()
        if (
          getHomeLayoutFingerprint(latest) !==
          getHomeLayoutFingerprint(expectedCurrentLayout)
        ) {
          return null
        }
        const latestItemIds = buildHomeItems(
          Links.getWithFallback(),
          latest,
          LinkAnalytics.get(),
          Date.now()
        ).map(item => item.id)
        if (!sameHomeOrder(latestItemIds, expectedItemIds)) return null

        const next = saveHomeOrderIfUnchanged(expectedCurrentLayout, nextOrder)
        if (next) setLayout(next)
        return next
      })
    },
    []
  )

  const showUndo = useCallback((message: string, undo: () => void) => {
    setUndoAction({
      message,
      undo: () => {
        undo()
        setUndoAction(null)
      },
    })
  }, [])

  const restoreOrderSnapshot = useCallback(
    async (
      expectedCurrentLayout: HomeLayoutState,
      expectedItemIds: string[],
      previousOrder: string[],
      onRestored?: () => void
    ): Promise<boolean> => {
      if (
        !(await persistOrderIfUnchanged(
          expectedCurrentLayout,
          expectedItemIds,
          previousOrder
        ))
      ) {
        setMovePageNotice("布局已在其他页面更新，为避免覆盖新顺序，本次未撤销")
        return false
      }
      onRestored?.()
      return true
    },
    [persistOrderIfUnchanged]
  )

  const moveItemToPage = useCallback(
    async (itemId: string, targetPage: number): Promise<boolean> => {
      if (targetPage < 0 || targetPage >= pages.length) return false
      const sourcePage = pages.findIndex(pageItems =>
        pageItems.some(item => item.id === itemId)
      )
      const nextOrder = getOrderForItemOnPage(
        items,
        gridMetrics,
        itemId,
        targetPage
      )
      if (!nextOrder) {
        setMovePageNotice("当前自动布局没有可用位置，条目保持在原页")
        return false
      }
      setMovePageNotice(null)
      const previousOrder = items.map(item => item.id)
      const movedItem = items.find(item => item.id === itemId)
      const persistedLayout = await persistOrderIfUnchanged(
        layout,
        previousOrder,
        nextOrder
      )
      if (!persistedLayout) {
        setLayout(readHomeLayout())
        setMovePageNotice("布局已在其他页面更新，本次移动未保存")
        return false
      }
      setAnimatePage(true)
      setCurrentPage(targetPage)
      if (!sameHomeOrder(previousOrder, nextOrder)) {
        const label =
          movedItem?.kind === "app"
            ? movedItem.label
            : movedItem
              ? getWidgetDefinition(movedItem.widget.type).title
              : "条目"
        showUndo(`已移动${label}到第 ${targetPage + 1} 页`, () => {
          restoreOrderSnapshot(
            persistedLayout,
            previousOrder,
            previousOrder,
            () => {
              if (sourcePage >= 0) {
                setAnimatePage(true)
                setCurrentPage(sourcePage)
              }
            }
          )
        })
      }
      return true
    },
    [
      gridMetrics,
      items,
      layout,
      pages,
      persistOrderIfUnchanged,
      restoreOrderSnapshot,
      showUndo,
    ]
  )

  const handleMovePage = useCallback(
    async (item: HomeItem, direction: -1 | 1) => {
      const sourcePage = pages.findIndex(pageItems =>
        pageItems.some(candidate => candidate.id === item.id)
      )
      const targetPage = sourcePage + direction
      if (sourcePage < 0 || targetPage < 0 || targetPage >= pages.length) return

      const focusedItem =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.closest<HTMLElement>(
              `[data-home-item-id="${CSS.escape(item.id)}"]`
            )
          : null
      if (focusedItem) {
        pendingMovedItemFocusRef.current = {
          page: targetPage,
          itemId: item.id,
        }
      }
      if (!(await moveItemToPage(item.id, targetPage))) {
        pendingMovedItemFocusRef.current = null
      }
    },
    [moveItemToPage, pages]
  )

  const moveItemWithinPage = useCallback(
    async (itemId: string, direction: -1 | 1): Promise<boolean> => {
      const pageIndex = pages.findIndex(pageItems =>
        pageItems.some(item => item.id === itemId)
      )
      const pageItems = pages[pageIndex]
      if (!pageItems) return false
      const itemIndex = pageItems.findIndex(item => item.id === itemId)
      const adjacent = pageItems[itemIndex + direction]
      if (itemIndex < 0 || !adjacent) return false

      const previousOrder = items.map(item => item.id)
      const nextOrder = getOrderForRelativeDropOnPage(
        items,
        gridMetrics,
        itemId,
        adjacent.id,
        direction < 0 ? "before" : "after",
        pageIndex
      )
      if (!nextOrder) {
        setMovePageNotice("这个位置空间不足，请改用拖动调整")
        return false
      }

      const movedItem = items.find(item => item.id === itemId)
      const label =
        movedItem?.kind === "app"
          ? movedItem.label
          : movedItem
            ? getWidgetDefinition(movedItem.widget.type).title
            : "条目"
      const persistedLayout = await persistOrderIfUnchanged(
        layout,
        previousOrder,
        nextOrder
      )
      if (!persistedLayout) {
        setLayout(readHomeLayout())
        setMovePageNotice("布局已在其他页面更新，本次调整未保存")
        return false
      }
      setMovePageNotice(
        `${label}已${direction < 0 ? "前移" : "后移"}，可撤销`
      )
      showUndo(`已${direction < 0 ? "前移" : "后移"}${label}`, () => {
        restoreOrderSnapshot(persistedLayout, previousOrder, previousOrder)
      })
      return true
    },
    [
      gridMetrics,
      items,
      layout,
      pages,
      persistOrderIfUnchanged,
      restoreOrderSnapshot,
      showUndo,
    ]
  )

  // 编辑模式下为当前焦点条目提供不依赖指针的页内重排。
  useEffect(() => {
    if (!editMode) return
    const onKey = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        (!event.ctrlKey && !event.metaKey) ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      ) {
        return
      }
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.closest('[role="dialog"], [data-fluidity-modal="true"]')) {
        return
      }
      const item = target.closest<HTMLElement>("[data-home-item-id]")
      const itemId = item?.dataset.homeItemId
      if (!itemId) return
      event.preventDefault()
      event.stopPropagation()
      void moveItemWithinPage(itemId, event.key === "ArrowLeft" ? -1 : 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editMode, moveItemWithinPage])

  const getLatestDragOrder = useCallback((): string[] => {
    const currentIds = itemsRef.current.map(item => item.id)
    const currentIdSet = new Set(currentIds)
    const preview = dragOrderRef.current ?? currentIds
    const next = preview.filter(id => currentIdSet.has(id))
    const included = new Set(next)
    currentIds.forEach(id => {
      if (!included.has(id)) next.push(id)
    })
    return next
  }, [])

  const getValidDropOrder = useCallback(
    (
      order: string[],
      itemId: string,
      overId: string,
      position: HomeDropPosition
    ): string[] | null => {
      const requestedPage =
        dragDestinationPageRef.current ?? dragOriginPageRef.current
      if (requestedPage === null) return null

      const targetPage = Math.min(
        requestedPage,
        Math.max(0, pagesLengthRef.current - 1)
      )
      const currentItems = itemsRef.current
      const itemById = new Map(currentItems.map(item => [item.id, item]))
      const orderedIds = order.filter(id => itemById.has(id))
      const included = new Set(orderedIds)
      currentItems.forEach(item => {
        if (!included.has(item.id)) orderedIds.push(item.id)
      })
      const orderedItems = orderedIds.flatMap(id => {
        const item = itemById.get(id)
        return item ? [item] : []
      })
      return getOrderForRelativeDropOnPage(
        orderedItems,
        gridMetricsRef.current,
        itemId,
        overId,
        position,
        targetPage
      )
    },
    []
  )

  const previewDraggedItemOnPage = useCallback(
    (itemId: string, targetPage: number): boolean => {
      if (targetPage < 0 || targetPage >= pagesLengthRef.current) return false
      const order = getLatestDragOrder()
      const itemById = new Map(itemsRef.current.map(item => [item.id, item]))
      const orderedItems = order.flatMap(id => {
        const item = itemById.get(id)
        return item ? [item] : []
      })
      const nextOrder = getOrderForItemOnPage(
        orderedItems,
        gridMetricsRef.current,
        itemId,
        targetPage
      )
      if (!nextOrder) {
        setMovePageNotice("当前自动布局没有可用位置，条目保持在原页")
        return false
      }

      dragDestinationPageRef.current = targetPage
      dragPreviewIntentRef.current = null
      dragOrderRef.current = nextOrder
      dragPageOrderRef.current = nextOrder
      updateDragPreviewOrder(nextOrder)
      setMovePageNotice(null)
      setAnimatePage(true)
      edgePageTransitionUntilRef.current =
        performance.now() + EDGE_PAGE_TRANSITION_LOCK_MS
      currentPageRef.current = targetPage
      setCurrentPage(targetPage)
      return true
    },
    [getLatestDragOrder, updateDragPreviewOrder]
  )

  const clearEdgeTimer = useCallback(() => {
    if (edgePageTimerRef.current) clearTimeout(edgePageTimerRef.current)
    edgePageTimerRef.current = null
    edgePageDirectionRef.current = 0
  }, [])

  const clearReorderTimer = useCallback(() => {
    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current)
    reorderTimerRef.current = null
    reorderTargetRef.current = null
  }, [])

  const clearDropIntent = useCallback(() => {
    dropIntentRef.current = null
    dropIntentRevisionRef.current = -1
    setDropIntent(null)
  }, [])

  const settleEdgePageTransition = useCallback(() => {
    if (edgePageTransitionUntilRef.current <= 0) return
    edgePageTransitionUntilRef.current = 0
    positionPageTrack(
      pageTrackRef.current,
      currentPageRef.current,
      0,
      false
    )
  }, [])

  const scheduleEdgePageTurn = useCallback(
    (direction: -1 | 1) => {
      if (edgePageTimerRef.current) clearTimeout(edgePageTimerRef.current)
      edgePageDirectionRef.current = direction
      edgePageTimerRef.current = setTimeout(() => {
        edgePageTimerRef.current = null
        if (
          !itemDraggingRef.current ||
          edgePageDirectionRef.current !== direction
        ) {
          return
        }

        const viewport = viewportRef.current
        const pointerX = dragPointerXRef.current
        const pointerY = dragPointerYRef.current
        if (!viewport || pointerX === null || pointerY === null) {
          clearEdgeTimer()
          return
        }
        const bounds = viewport.getBoundingClientRect()
        const stillAtRequestedEdge =
          pointerY >= bounds.top &&
          pointerY <= bounds.bottom &&
          isPointerInEdgeTurnGutter(pointerX, bounds, direction)
        if (!stillAtRequestedEdge) {
          clearEdgeTimer()
          return
        }

        const activeId = activeDragIdRef.current
        const targetPage = currentPageRef.current + direction
        if (
          !activeId ||
          targetPage < 0 ||
          targetPage >= pagesLengthRef.current
        ) {
          edgePageDirectionRef.current = direction
          return
        }

        if (!previewDraggedItemOnPage(activeId, targetPage)) {
          clearEdgeTimer()
          return
        }

        setMovePageNotice(
          `已进入第 ${targetPage + 1} 页，移到目标位置后松开`
        )
        edgePageTimerRef.current = setTimeout(() => {
          edgePageTimerRef.current = null
          edgePageTransitionUntilRef.current = 0
          if (
            itemDraggingRef.current &&
            edgePageDirectionRef.current === direction
          ) {
            edgePageScheduleRef.current(direction)
          }
        }, EDGE_PAGE_TRANSITION_LOCK_MS)
      }, EDGE_PAGE_DWELL_MS)
    },
    [clearEdgeTimer, previewDraggedItemOnPage]
  )
  edgePageScheduleRef.current = scheduleEdgePageTurn

  useEffect(
    () => () => {
      clearEdgeTimer()
      clearReorderTimer()
      dropIntentRef.current = null
      dragPreviewIntentRef.current = null
      dropIntentRevisionRef.current = -1
      edgePageTransitionUntilRef.current = 0
    },
    [clearEdgeTimer, clearReorderTimer]
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      cancelLongPress()
      clearEdgeTimer()
      clearReorderTimer()
      clearDropIntent()
      updateDragPreviewOrder(null)
      dragPreviewIntentRef.current = null
      pageDragRef.current = null
      edgePageTransitionUntilRef.current = 0
      itemDraggingRef.current = true
      dragEscapeGuardRef.current = true
      const pointerX = getClientX(event.activatorEvent)
      const pointerY = getClientY(event.activatorEvent)
      dragPointerStartXRef.current = pointerX
      dragPointerStartYRef.current = pointerY
      dragPointerXRef.current = pointerX
      dragPointerYRef.current = pointerY
      dragDestinationPageRef.current = null
      dragOriginPageRef.current = currentPageRef.current
      suppressNextPageClickRef.current = true
      setIsPageDragging(false)
      positionPageTrack(pageTrackRef.current, currentPageRef.current, 0, false)
      const activeId = String(event.active.id)
      activeDragIdRef.current = activeId
      dragLayoutRevisionRef.current = layoutRevisionRef.current
      dragPersistedLayoutRef.current = layout
      dragPersistedItemIdsRef.current = items.map(item => item.id)
      const draggedItem = items.find(item => item.id === activeId)
      setDragSnapshot(
        draggedItem
          ? {
              id: activeId,
              kind: draggedItem.kind,
              label:
                draggedItem.kind === "app"
                  ? draggedItem.label
                  : getWidgetDefinition(draggedItem.widget.type).title,
              hue:
                draggedItem.kind === "app"
                  ? getAppTileHue(draggedItem.url)
                  : 0,
            }
          : null
      )
      const order = items.map(item => item.id)
      if (order.includes(activeId)) {
        dragOrderRef.current = order
        dragPageOrderRef.current = order
      }
      setMovePageNotice(null)
      setEditMode(true)
    },
    [
      cancelLongPress,
      clearDropIntent,
      clearEdgeTimer,
      clearReorderTimer,
      items,
      layout,
      updateDragPreviewOrder,
    ]
  )

  const handleDragOver = useCallback(
    ({ active, over }: DragOverEvent) => {
      const activeId = String(active.id)
      if (edgePageDirectionRef.current !== 0) {
        const viewport = viewportRef.current
        const pointerX = dragPointerXRef.current
        const direction = edgePageDirectionRef.current
        if (
          !viewport ||
          pointerX === null ||
          isPointerInEdgeTurnGutter(
            pointerX,
            viewport.getBoundingClientRect(),
            direction
          )
        ) {
          clearReorderTimer()
          clearDropIntent()
          return
        }
        settleEdgePageTransition()
        clearEdgeTimer()
      }
      const pointerX = dragPointerXRef.current
      const pointerY = dragPointerYRef.current
      const activePageGrid = pageTrackRef.current?.querySelector<HTMLElement>(
        '[data-home-page-grid="true"][aria-hidden="false"]'
      )
      const pointerTarget =
        pointerX !== null && pointerY !== null
          ? findHomeDropTargetAtPoint(
              activePageGrid,
              activeId,
              pointerX,
              pointerY
            )
          : null
      const pointerInsidePreviewSlot =
        pointerX !== null &&
        pointerY !== null &&
        isPointInsideActivePreviewSlot(
          activePageGrid,
          activeId,
          pointerX,
          pointerY
        )
      const overId =
        pointerX !== null && pointerY !== null
          ? pointerTarget?.target.dataset.homeItemId ?? null
          : over && active.id !== over.id
            ? String(over.id)
            : null
      // The active placeholder is the exact position currently previewed by
      // the grid. During the short FLIP animation a neighbour's visual rect
      // can cross that placeholder; do not let that transient overlap create
      // a new relative target underneath the pointer. Keeping the placeholder
      // sticky is what makes cross-page placement feel like an iOS home screen.
      if (pointerInsidePreviewSlot) {
        clearReorderTimer()
        const previewIntent = dragPreviewIntentRef.current
        const currentIntent = dropIntentRef.current
        if (
          previewIntent &&
          currentIntent?.overId === previewIntent.overId &&
          currentIntent.position === previewIntent.position
        ) {
          return
        }
        if (!previewIntent) {
          clearDropIntent()
          restoreDragPagePreview()
          return
        }
      }
      if (!overId) {
        clearReorderTimer()
        const previewIntent = dragPreviewIntentRef.current
        const currentIntent = dropIntentRef.current
        if (
          pointerInsidePreviewSlot &&
          previewIntent &&
          currentIntent?.overId === previewIntent.overId &&
          currentIntent.position === previewIntent.position
        ) {
          return
        }
        clearDropIntent()
        restoreDragPagePreview()
        return
      }
      const visibleTarget =
        pointerTarget?.target ??
        pageTrackRef.current?.querySelector<HTMLElement>(
          `[data-home-page-grid="true"][aria-hidden="false"] [data-home-item-id="${CSS.escape(overId)}"]`
        )
      const position = resolveHomeDropPosition(
        pointerX,
        visibleTarget?.getBoundingClientRect() ?? over?.rect ?? {
          left: pointerX ?? 0,
          width: 0,
        }
      )
      const nextOrder = getValidDropOrder(
        getLatestDragOrder(),
        activeId,
        overId,
        position
      )
      if (!nextOrder) {
        clearReorderTimer()
        clearDropIntent()
        restoreDragPagePreview()
        setMovePageNotice("这个位置空间不足，请换一侧或其他条目")
        return
      }
      setMovePageNotice(null)
      const intent = { overId, position }
      const previousIntent = dropIntentRef.current
      if (
        previousIntent &&
        (previousIntent.overId !== overId ||
          previousIntent.position !== position) &&
        dropIntentRevisionRef.current === dragPointerRevisionRef.current
      ) {
        return
      }
      if (
        previousIntent?.overId !== overId ||
        previousIntent.position !== position
      ) {
        dropIntentRef.current = intent
        dropIntentRevisionRef.current = dragPointerRevisionRef.current
        setDropIntent(intent)
      }
      const intentKey = `${overId}:${position}`
      if (
        reorderTimerRef.current &&
        reorderTargetRef.current === intentKey
      ) {
        return
      }
      if (
        !reorderTimerRef.current &&
        reorderTargetRef.current === intentKey
      ) {
        return
      }
      clearReorderTimer()
      reorderTargetRef.current = intentKey
      reorderTimerRef.current = setTimeout(() => {
        reorderTimerRef.current = null
        dragPreviewIntentRef.current = intent
        dragOrderRef.current = nextOrder
        updateDragPreviewOrder(nextOrder)
      }, REORDER_INTENT_MS)
    },
    [
      clearDropIntent,
      clearEdgeTimer,
      clearReorderTimer,
      getLatestDragOrder,
      getValidDropOrder,
      restoreDragPagePreview,
      settleEdgePageTransition,
      updateDragPreviewOrder,
    ]
  )

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const viewport = viewportRef.current
      const initial = event.active.rect.current.initial
      if (!viewport || !initial) return
      const bounds = viewport.getBoundingClientRect()
      const pointerX =
        dragPointerXRef.current ??
        (dragPointerStartXRef.current !== null
          ? dragPointerStartXRef.current + event.delta.x
          : initial.left + initial.width / 2 + event.delta.x)
      const pointerY =
        dragPointerYRef.current ??
        (dragPointerStartYRef.current !== null
          ? dragPointerStartYRef.current + event.delta.y
          : initial.top + initial.height / 2 + event.delta.y)
      dragPointerXRef.current = pointerX
      dragPointerYRef.current = pointerY
      if (pointerY < bounds.top || pointerY > bounds.bottom) {
        clearEdgeTimer()
        clearReorderTimer()
        clearDropIntent()
        restoreDragPagePreview()
        return
      }
      const direction =
        pointerX < bounds.left + EDGE_PAGE_TARGET_GUTTER_PX
          ? -1
          : pointerX > bounds.right - EDGE_PAGE_TARGET_GUTTER_PX
            ? 1
            : 0
      if (direction === 0) {
        settleEdgePageTransition()
        clearEdgeTimer()
        handleDragOver(event)
        return
      }
      clearReorderTimer()
      clearDropIntent()
      restoreDragPagePreview()
      const targetPage = currentPageRef.current + direction
      if (
        targetPage < 0 ||
        targetPage >= pagesLengthRef.current
      ) {
        if (edgePageTimerRef.current) clearTimeout(edgePageTimerRef.current)
        edgePageTimerRef.current = null
        edgePageDirectionRef.current = direction
        return
      }
      if (
        edgePageTimerRef.current &&
        edgePageDirectionRef.current === direction
      ) {
        return
      }
      scheduleEdgePageTurn(direction)
    },
    [
      clearDropIntent,
      clearEdgeTimer,
      clearReorderTimer,
      handleDragOver,
      restoreDragPagePreview,
      scheduleEdgePageTurn,
      settleEdgePageTransition,
    ]
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active } = event
      const activeId = String(active.id)
      const releaseIntent = dropIntentRef.current
      const releasePreviewIntent = dragPreviewIntentRef.current
      const pointerX =
        dragPointerXRef.current ??
        (dragPointerStartXRef.current !== null
          ? dragPointerStartXRef.current + event.delta.x
          : null)
      const pointerY =
        dragPointerYRef.current ??
        (dragPointerStartYRef.current !== null
          ? dragPointerStartYRef.current + event.delta.y
          : null)
      const activePageGrid = pageTrackRef.current?.querySelector<HTMLElement>(
        '[data-home-page-grid="true"][aria-hidden="false"]'
      )
      const gridBounds = viewportRef.current?.getBoundingClientRect()
      const insideActivePage =
        pointerX !== null && pointerY !== null && gridBounds
          ? pointerX >= gridBounds.left &&
            pointerX <= gridBounds.right &&
            pointerY >= gridBounds.top &&
            pointerY <= gridBounds.bottom
          : false
      const releaseTarget =
        insideActivePage && pointerX !== null && pointerY !== null && activePageGrid
          ? findHomeDropTargetAtPoint(
              activePageGrid,
              activeId,
              pointerX,
              pointerY
            )
          : null
      const releaseOnPreviewSlot =
        insideActivePage &&
        pointerX !== null &&
        pointerY !== null &&
        isPointInsideActivePreviewSlot(
          activePageGrid,
          activeId,
          pointerX,
          pointerY
        )
      const layoutChangedDuringDrag =
        dragLayoutRevisionRef.current !== layoutRevisionRef.current
      const persistedLayoutAtDragStart = dragPersistedLayoutRef.current
      const persistedItemIdsAtDragStart = dragPersistedItemIdsRef.current
      const originPage = dragOriginPageRef.current
      const destinationPage = dragDestinationPageRef.current
      const previousOrder = itemsRef.current.map(item => item.id)
      const movedItem = itemsRef.current.find(item => item.id === activeId)

      clearEdgeTimer()
      clearReorderTimer()
      clearDropIntent()
      updateDragPreviewOrder(null)
      dragPreviewIntentRef.current = null
      edgePageTransitionUntilRef.current = 0
      itemDraggingRef.current = false
      dragEscapeGuardRef.current = false
      activeDragIdRef.current = null
      dragLayoutRevisionRef.current = null
      dragPersistedLayoutRef.current = null
      dragPersistedItemIdsRef.current = null
      dragPointerStartXRef.current = null
      dragPointerStartYRef.current = null
      dragPointerXRef.current = null
      dragPointerYRef.current = null

      let finalOrder = getLatestDragOrder()
      let shouldCommit = false
      let invalidDrop = false
      const releasePosition = releaseTarget
        ? resolveHomeDropPosition(pointerX, releaseTarget.rect)
        : null
      const releaseMatchesIntentTarget =
        !!releaseIntent &&
        releaseTarget?.target.dataset.homeItemId === releaseIntent.overId &&
        releaseIntent.position === releasePosition
      const releaseMatchesCrossPageBase =
        !releaseIntent &&
        releaseOnPreviewSlot &&
        originPage !== null &&
        destinationPage !== null &&
        destinationPage !== originPage &&
        !!dragPageOrderRef.current
      if (!layoutChangedDuringDrag && releaseMatchesCrossPageBase) {
        dragOrderRef.current = dragPageOrderRef.current
        finalOrder = getLatestDragOrder()
        shouldCommit = finalOrder.includes(activeId)
      } else if (
        !layoutChangedDuringDrag &&
        releaseIntent &&
        (releaseMatchesIntentTarget ||
          (releaseOnPreviewSlot &&
            releasePreviewIntent?.overId === releaseIntent.overId &&
            releasePreviewIntent.position === releaseIntent.position))
      ) {
        const candidate = getValidDropOrder(
          finalOrder,
          activeId,
          releaseIntent.overId,
          releaseIntent.position
        )
        if (candidate) {
          finalOrder = candidate
          shouldCommit = true
        } else {
          invalidDrop = true
        }
      }

      dragDestinationPageRef.current = null
      dragOriginPageRef.current = null
      dragOrderRef.current = null
      dragPageOrderRef.current = null
      setDragSnapshot(null)
      setMovePageNotice(null)
      setEditMode(true)
      setTimeout(() => {
        suppressNextPageClickRef.current = false
      }, 0)

      if (!shouldCommit || !finalOrder.includes(activeId)) {
        if (destinationPage !== null && originPage !== null) {
          const restoredPage = Math.min(
            originPage,
            Math.max(0, pagesLengthRef.current - 1)
          )
          setAnimatePage(true)
          currentPageRef.current = restoredPage
          setCurrentPage(restoredPage)
        }
        if (layoutChangedDuringDrag) {
          externalLayoutPendingRef.current = false
          setLayout(readHomeLayout())
          setLinkGroups(Links.getWithFallback())
          setMovePageNotice("布局已在其他位置更新，本次拖动未保存")
        } else if (invalidDrop) {
          setMovePageNotice("这个位置空间不足，请换一侧或其他条目")
        }
        return
      }
      if (sameHomeOrder(previousOrder, finalOrder)) return
      if (!persistedLayoutAtDragStart || !persistedItemIdsAtDragStart) {
        externalLayoutPendingRef.current = false
        setLayout(readHomeLayout())
        setLinkGroups(Links.getWithFallback())
        setMovePageNotice("布局状态已变化，本次拖动未保存")
        return
      }
      const persistedLayout = await persistOrderIfUnchanged(
        persistedLayoutAtDragStart,
        persistedItemIdsAtDragStart,
        finalOrder
      )
      if (!persistedLayout) {
        externalLayoutPendingRef.current = false
        setLayout(readHomeLayout())
        setLinkGroups(Links.getWithFallback())
        setMovePageNotice("布局已在其他页面更新，本次拖动未保存")
        return
      }
      const label =
        movedItem?.kind === "app"
          ? movedItem.label
          : movedItem
            ? getWidgetDefinition(movedItem.widget.type).title
            : "条目"
      showUndo(`已移动${label}`, () => {
        restoreOrderSnapshot(
          persistedLayout,
          persistedItemIdsAtDragStart,
          previousOrder,
          () => {
            if (originPage !== null) {
              setAnimatePage(true)
              setCurrentPage(originPage)
            }
          }
        )
      })
    },
    [
      clearDropIntent,
      clearEdgeTimer,
      clearReorderTimer,
      getValidDropOrder,
      getLatestDragOrder,
      persistOrderIfUnchanged,
      restoreOrderSnapshot,
      showUndo,
      updateDragPreviewOrder,
    ]
  )

  const handleDragCancel = useCallback(() => {
    clearEdgeTimer()
    clearReorderTimer()
    clearDropIntent()
    updateDragPreviewOrder(null)
    dragPreviewIntentRef.current = null
    edgePageTransitionUntilRef.current = 0
    itemDraggingRef.current = false
    activeDragIdRef.current = null
    dragLayoutRevisionRef.current = null
    dragPersistedLayoutRef.current = null
    dragPersistedItemIdsRef.current = null
    dragPointerStartXRef.current = null
    dragPointerStartYRef.current = null
    dragPointerXRef.current = null
    dragPointerYRef.current = null

    const loadedExternalLayout = externalLayoutPendingRef.current
    if (loadedExternalLayout) {
      externalLayoutPendingRef.current = false
      setLayout(readHomeLayout())
      setLinkGroups(Links.getWithFallback())
      setMovePageNotice("已载入其他页面保存的最新布局")
    }

    if (dragOriginPageRef.current !== null) {
      const restoredPage = Math.min(
        dragOriginPageRef.current,
        Math.max(0, pagesLengthRef.current - 1)
      )
      setAnimatePage(true)
      currentPageRef.current = restoredPage
      setCurrentPage(restoredPage)
    }
    if (!loadedExternalLayout) setMovePageNotice(null)

    dragDestinationPageRef.current = null
    dragOriginPageRef.current = null
    dragOrderRef.current = null
    dragPageOrderRef.current = null
    setDragSnapshot(null)
    setTimeout(() => {
      dragEscapeGuardRef.current = false
      suppressNextPageClickRef.current = false
    }, 0)
  }, [
    clearDropIntent,
    clearEdgeTimer,
    clearReorderTimer,
    updateDragPreviewOrder,
  ])

  const handleOpen = useCallback(
    (item: Extract<HomeItem, { kind: "app" }>) => {
      navigateToLink(item.url, item.label, item.groupTitle)
    },
    []
  )

  const handleRemove = useCallback(
    async (item: HomeItem) => {
      if (item.kind === "widget") {
        const removal = await withHomeLayoutLock(() => {
          const latest = readHomeLayout()
          const removed = latest.widgets[item.id]
          if (!removed) {
            setLayout(latest)
            return null
          }
          const orderIndex = Math.max(0, latest.order.indexOf(item.id))
          const next = removeWidgetInstance(latest, item.id)
          saveHomeLayout(next)
          setLayout(next)
          return { removed, orderIndex }
        })
        if (!removal) {
          setMovePageNotice("组件已在其他页面被移除")
          setSettingsInstanceId(null)
          return
        }
        setSettingsInstanceId(null)
        showUndo(`已移除${getWidgetDefinition(removal.removed.type).title}`, () => {
          void commitLayout(current => {
            if (current.widgets[removal.removed.instanceId]) return current
            const order = [...current.order]
            order.splice(removal.orderIndex, 0, removal.removed.instanceId)
            return {
              ...current,
              widgets: {
                ...current.widgets,
                [removal.removed.instanceId]: removal.removed,
              },
              order: [...new Set(order)],
            }
          })
        })
        return
      }
      setDeleteTarget({ url: item.url, label: item.label })
    },
    [commitLayout, showUndo]
  )

  const handleAddWidget = useCallback(
    async (type: WidgetType, size: WidgetSize) => {
      const addedInstance = await withHomeLayoutLock(() => {
        const latest = readHomeLayout()
        const result = addWidgetInstance(latest, type, { size })
        if (!result) return null
        saveHomeLayout(result.state)
        setLayout(result.state)
        return result.instance
      })
      if (!addedInstance) return
      setGalleryOpen(false)
      setEditMode(true)
      setSettingsInstanceId(addedInstance.instanceId)
    },
    []
  )

  const handleUpdateWidget = useCallback(
    async (
      instance: WidgetInstance,
      expected: WidgetInstance
    ): Promise<string | null> => {
      try {
        return await withHomeLayoutLock(() => {
          const latest = readHomeLayout()
          const next = updateWidgetInstanceIfUnchanged(
            latest,
            expected,
            instance
          )
          if (!next) {
            setLayout(latest)
            return "组件已在其他页面被修改或移除，请重新打开后再编辑"
          }
          saveHomeLayout(next)
          setLayout(next)
          return null
        })
      } catch (error) {
        return error instanceof Error ? error.message : "保存组件失败"
      }
    },
    []
  )

  const handleDuplicateWidget = useCallback(
    (instance: WidgetInstance) => {
      void commitLayout(current => {
        const result = addWidgetInstance(current, instance.type, {
          size: instance.size,
          config: instance.config,
        })
        return result?.state ?? current
      })
      setSettingsInstanceId(null)
    },
    [commitLayout]
  )

  const handleAddBookmark = useCallback(
    (item: LaterReadItem, groupTitle: string) => {
      void withHomeLayoutLock(() => {
        const current = Links.getWithFallback()
        if (
          current.some(group =>
            group.links.some(link => link.value === item.url)
          )
        ) {
          setLinkGroups(current)
          return
        }
        const groupExists = current.some(group => group.title === groupTitle)
        const next = groupExists
          ? current.map(group =>
              group.title === groupTitle
                ? {
                    ...group,
                    links: [
                      ...group.links,
                      { label: item.title, value: item.url },
                    ],
                  }
                : group
            )
          : [
              ...current,
              {
                title: groupTitle || "稍后阅读",
                links: [{ label: item.title, value: item.url }],
              },
            ]
        Links.set(next)
        setLinkGroups(next)
      })
    },
    []
  )

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    void withHomeLayoutLock(() => {
      const previous = Links.getWithFallback()
      const groups = previous
        .map((group, groupIndex) => ({
          ...group,
          links:
            target.groupIndex === groupIndex &&
            target.linkIndex !== undefined &&
            group.links[target.linkIndex]?.value === target.url
              ? group.links.filter(
                  (_link, linkIndex) => linkIndex !== target.linkIndex
                )
              : target.groupIndex === undefined
                ? group.links.filter(link => link.value !== target.url)
                : group.links,
        }))
        .filter(group => group.links.length > 0)
      Links.set(groups)
      setLinkGroups(groups)
      return { previous, groups }
    }).then(({ previous, groups }) => {
      showUndo(`已删除${target.label}`, () => {
        void withHomeLayoutLock(() => {
          const current = Links.getWithFallback()
          if (JSON.stringify(current) !== JSON.stringify(groups)) {
            setLinkGroups(current)
            setMovePageNotice(
              "链接已在其他页面更新，为避免覆盖新内容，本次未撤销"
            )
            return
          }
          Links.set(previous)
          setLinkGroups(previous)
        })
      })
    })
  }, [deleteTarget, showUndo])

  const requestLinkRemoval = useCallback((url: string, label: string) => {
    setDeleteTarget({ url, label })
  }, [])

  // 命令面板删除入口复用同一确认
  const requestDeleteFromPalette = useCallback(
    (groupIndex: number, linkIndex: number) => {
      const target = linkGroups[groupIndex]?.links[linkIndex]
      if (
        target &&
        typeof target.value === "string" &&
        typeof target.label === "string"
      ) {
        setDeleteTarget({
          url: target.value,
          label: target.label,
          groupIndex,
          linkIndex,
        })
      }
    },
    [linkGroups]
  )

  return (
    <>
      <DndContext
        sensors={sensors}
        accessibility={{
          screenReaderInstructions: HOME_SCREEN_READER_INSTRUCTIONS,
        }}
        collisionDetection={detectHomeCollision}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={(pages[currentPage] ?? []).map(item => item.id)}
          strategy={noHomeItemTransform}
        >
          <HomePager
            ref={gridRef}
            data-home-editing={editMode ? "true" : "false"}
          >
            <PageViewport
              ref={viewportRef}
              role="region"
              aria-label="主页分页区域"
              data-page-dragging={isPageDragging ? "true" : "false"}
              onPointerDownCapture={handlePointerDown}
              onPointerUp={event => finishPageDrag(event)}
              onPointerCancel={event => finishPageDrag(event, true)}
              onPointerMove={handlePointerMove}
              onPointerLeave={event => {
                // Layout can shift while asynchronous widget data arrives.
                // Do not cancel a stationary long-press merely because the
                // viewport moved under the pointer; cancel only when the
                // pointer is actually outside its current bounds.
                const bounds = event.currentTarget.getBoundingClientRect()
                if (
                  event.clientX < bounds.left ||
                  event.clientX > bounds.right ||
                  event.clientY < bounds.top ||
                  event.clientY > bounds.bottom
                ) {
                  cancelLongPress()
                }
              }}
              onClickCapture={handlePageClickCapture}
              onDragStart={event => event.preventDefault()}
              onWheel={handleWheel}
            >
              <PageTrack ref={pageTrackRef} data-home-page-track="true">
                {dragPageProjection.frames.map(
                  ({ canonicalItems: pageItems, previewItems }, pageIndex) => {
                  const previewIndexById = previewItems
                    ? new Map(
                        previewItems.map((item, index) => [item.id, index])
                      )
                    : null
                  const canonicalIds = new Set(pageItems.map(item => item.id))
                  const previewSlots = previewItems
                    ? previewItems.filter(item => !canonicalIds.has(item.id))
                    : []
                  const mounted =
                    mountedPageIndices.has(pageIndex) ||
                    Math.abs(pageIndex - currentPage) <= 1

                  return (
                    <PageGrid
                      key={`page-${pageIndex}`}
                      columns={gridMetrics.columns}
                      rows={gridMetrics.rows}
                      data-home-page-grid="true"
                      data-home-page-index={pageIndex}
                      aria-hidden={pageIndex !== currentPage}
                      {...(pageIndex !== currentPage ? { inert: "" } : {})}
                    >
                      {mounted &&
                        pageIndex === currentPage &&
                        pageItems.length === 0 &&
                        (!previewItems || previewItems.length === 0) && (
                          <EmptyHome data-home-edit-control>
                            <h3>这一页还是空的</h3>
                            <p>
                              可以从右上角设置导入或添加标签，也可以先放入一个已有小组件。
                            </p>
                            <EmptyHomeAction
                              type="button"
                              onPointerDown={event => event.stopPropagation()}
                              onClick={() => setGalleryOpen(true)}
                            >
                              添加小组件
                            </EmptyHomeAction>
                          </EmptyHome>
                        )}
                      {mounted &&
                        pageItems.map(item => {
                          const index = itemIndexById.get(item.id) ?? 0
                          return (
                            <SortableItem
                              key={item.id}
                              item={item}
                              index={index}
                              editMode={editMode}
                              settled={settled}
                              gridMetrics={gridMetrics}
                              active={pageIndex === currentPage}
                              visibleAppUrls={
                                visibleAppUrlsByPage[pageIndex] ?? []
                              }
                              onOpen={handleOpen}
                              onRemove={handleRemove}
                              onConfigure={instance =>
                                setSettingsInstanceId(instance.instanceId)
                              }
                              onUpdateWidget={async (
                                instance,
                                expected
                              ) => {
                                if (item.kind !== "widget") {
                                  return "应用图标不能保存为小组件"
                                }
                                const error = await handleUpdateWidget(
                                  instance,
                                  expected ?? item.widget
                                )
                                if (error) setMovePageNotice(error)
                                return error
                              }}
                              onAddBookmark={handleAddBookmark}
                              onUndoableAction={showUndo}
                              linkGroups={linkGroups}
                              onRequestLinkRemoval={requestLinkRemoval}
                              pageIndex={pageIndex}
                              totalPages={navigationPageCount}
                              onMovePage={handleMovePage}
                              dropPosition={
                                dropIntent?.overId === item.id
                                  ? dropIntent.position
                                  : null
                              }
                              previewOrder={
                                previewIndexById?.get(item.id) ?? null
                              }
                              previewHidden={
                                !!previewIndexById &&
                                !previewIndexById.has(item.id)
                              }
                            />
                          )
                        })}
                      {mounted &&
                        previewSlots.map(item => {
                          const span = cellSpan(item, gridMetrics)
                          return (
                            <DragPreviewSlot
                              key={`preview-slot:${item.id}`}
                              data-home-preview-slot-id={item.id}
                              data-home-preview-slot-active={
                                activeDragIdRef.current === item.id
                                  ? "true"
                                  : undefined
                              }
                              col={span.col}
                              row={span.row}
                              previewOrder={previewIndexById?.get(item.id) ?? 0}
                              kind={item.kind}
                              aria-hidden="true"
                              {...{ inert: "" }}
                            />
                          )
                        })}
                    </PageGrid>
                    )
                  }
                )}
              </PageTrack>
            </PageViewport>

            <PageDots aria-label="主屏页面">
              {movePageNotice && (
                <MovePageNotice role="status">{movePageNotice}</MovePageNotice>
              )}
              {visiblePageIndices.map((pageIndex, position) => {
                const previous = visiblePageIndices[position - 1]
                return (
                  <Fragment key={pageIndex}>
                    {previous !== undefined && pageIndex - previous > 1 && (
                      <PageGap aria-hidden>…</PageGap>
                    )}
                    <PageDot
                      type="button"
                      active={pageIndex === currentPage}
                      aria-label={`转到第 ${pageIndex + 1} 页`}
                      aria-current={
                        pageIndex === currentPage ? "page" : undefined
                      }
                      onClick={() => {
                        setAnimatePage(Math.abs(pageIndex - currentPage) === 1)
                        setCurrentPage(pageIndex)
                      }}
                    />
                  </Fragment>
                )
              })}
              <PagePosition aria-live="polite">
                第 {currentPage + 1} 页，共 {navigationPageCount} 页
              </PagePosition>
              {!editMode && (
                <PageEditButton
                  type="button"
                  aria-label="编辑主页"
                  title="编辑主页"
                  data-home-edit-control
                  onClick={() => setEditMode(true)}
                >
                  <FontAwesomeIcon icon={faPen} />
                </PageEditButton>
              )}
            </PageDots>
          </HomePager>
        </SortableContext>
        <DragOverlay
          dropAnimation={null}
          zIndex={1000}
          style={{ pointerEvents: "none" }}
        >
          {dragSnapshot && (
            <DragPreview
              data-home-drag-overlay="true"
              data-home-drag-overlay-id={dragSnapshot.id}
              aria-hidden="true"
              {...{ inert: "" }}
            >
              {dragSnapshot.kind === "app" ? (
                <AppEntry>
                  <AppIconBox
                    style={
                      {
                        "--tile-hue": String(dragSnapshot.hue),
                      } as React.CSSProperties
                    }
                  >
                    <DragAppGlyph>
                      {Array.from(dragSnapshot.label.trim())[0] ?? "•"}
                    </DragAppGlyph>
                  </AppIconBox>
                  <AppLabel>{dragSnapshot.label}</AppLabel>
                </AppEntry>
              ) : (
                <DragWidgetCard>
                  <DragWidgetHeader>{dragSnapshot.label}</DragWidgetHeader>
                  <DragWidgetBody />
                </DragWidgetCard>
              )}
            </DragPreview>
          )}
        </DragOverlay>
      </DndContext>

      {editMode && (
        <EditToolbar data-home-edit-control>
          <EditToolButton
            type="button"
            onPointerDown={event => {
              event.stopPropagation()
              setGalleryOpen(true)
            }}
            onClick={() => setGalleryOpen(true)}
          >
            <FontAwesomeIcon icon={faPlus} />
            组件
          </EditToolButton>
          <EditToolButton
            type="button"
            onPointerDown={event => {
              event.stopPropagation()
              setOverviewOpen(true)
            }}
            onClick={() => setOverviewOpen(true)}
          >
            <FontAwesomeIcon icon={faTableCellsLarge} />
            总览
          </EditToolButton>
          <DoneButton type="button" onClick={() => setEditMode(false)}>
            <FontAwesomeIcon icon={faCheck} />
            完成
          </DoneButton>
        </EditToolbar>
      )}

      {galleryOpen && (
        <WidgetGallery
          counts={widgetCounts}
          onClose={() => setGalleryOpen(false)}
          onAdd={handleAddWidget}
        />
      )}

      {settingsInstance && (
        <WidgetSettings
          instance={settingsInstance}
          currentPage={Math.max(
            0,
            pages.findIndex(pageItems =>
              pageItems.some(item => item.id === settingsInstance.instanceId)
            )
          )}
          pageCount={pages.length}
          onClose={() => setSettingsInstanceId(null)}
          onSave={handleUpdateWidget}
          onRemove={() => {
            const item = items.find(
              candidate => candidate.id === settingsInstance.instanceId
            )
            if (item) handleRemove(item)
          }}
          onDuplicate={() => handleDuplicateWidget(settingsInstance)}
          onMovePage={page =>
            void moveItemToPage(settingsInstance.instanceId, page)
          }
          onUndoableAction={showUndo}
        />
      )}

      {overviewOpen && (
        <HomeOverview
          pages={pages}
          currentPage={currentPage}
          onClose={() => setOverviewOpen(false)}
          onNavigate={page => {
            setAnimatePage(false)
            setCurrentPage(page)
            setOverviewOpen(false)
          }}
          onMoveItem={moveItemToPage}
        />
      )}

      {undoAction && (
        <UndoToast role="status">
          <span>{undoAction.message}</span>
          <UndoButton type="button" onClick={undoAction.undo}>撤销</UndoButton>
        </UndoToast>
      )}

      <CommandPalette
        linkGroups={linkGroups}
        onDeleteLink={requestDeleteFromPalette}
      />

      {deleteTarget && (
        <Modal
          onClose={() => setDeleteTarget(null)}
          label="确认删除链接"
          overlay="dark"
        >
          <ConfirmCard>
            <ConfirmTitle>移除应用</ConfirmTitle>
            <ConfirmText>
              从收藏中删除&quot;{deleteTarget.label}&quot;？此操作立即生效。
            </ConfirmText>
            <ConfirmButtons>
              <ConfirmButton
                type="button"
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </ConfirmButton>
              <ConfirmButton type="button" danger onClick={confirmDelete}>
                删除
              </ConfirmButton>
            </ConfirmButtons>
          </ConfirmCard>
        </Modal>
      )}
    </>
  )
}
