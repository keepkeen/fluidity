import styled from "@emotion/styled"

import { HomeItem } from "../../services/homeLayout"
import { getHomeItemSpan, HomeGridMetrics } from "../../services/homePagination"

export const HomePager = styled.div`
  flex: 1;
  min-width: 0;
  width: min(1040px, 100%);
  max-width: 1040px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export const PageViewport = styled.div`
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

export const PageTrack = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  transform: translate3d(
    calc(var(--home-page-offset, 0%) + var(--home-page-drag-offset, 0px)),
    0,
    0
  );
  transition: var(--home-page-transition, none);
  will-change: transform;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

export const PageGrid = styled.div<{ columns: number; rows: number }>`
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

export const PageDots = styled.div`
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

export const MovePageNotice = styled.div`
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

export const PageDot = styled.button<{ active: boolean }>`
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

export const PagePosition = styled.span`
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

export const PageGap = styled.span`
  width: 8px;
  color: var(--text-muted);
  font-size: 0.72rem;
  line-height: 1;
  text-align: center;
`

export const PageEditButton = styled.button`
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

export const getAppTileHue = (url: string): number =>
  [...url].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 0)

export const cellSpan = (
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
export const ItemShell = styled.div<{
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

export const DragPreviewSlot = styled.div<{
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

export const DragPreview = styled.div`
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

export const JiggleBox = styled.div<{ jiggling: boolean; delayIndex: number }>`
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

export const AppEntry = styled.div`
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
`

export const AppTile = styled.button`
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

export const AppIconBox = styled.span`
  width: clamp(58px, 5vw, 66px);
  height: clamp(58px, 5vw, 66px);
  border-radius: 17px;
  /* 图标使用高分辨率源；底板只做静态主题混色，避免逐帧磨砂造成卡顿。 */
  background: linear-gradient(
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

export const AppLabel = styled.span`
  width: 72px;
  max-width: 100%;
  font-size: 0.74rem;
  color: var(--text-primary);
  opacity: 0.9;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: none;
`

export const DragAppGlyph = styled.span`
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-primary);
  text-transform: uppercase;
  user-select: none;
`

export const DragWidgetCard = styled.div`
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

export const DragWidgetHeader = styled.div`
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

export const DragWidgetBody = styled.div`
  flex: 1;
  min-height: 0;
  border-radius: calc(var(--radius-main) * 0.7);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--text-primary) 8%, transparent),
    color-mix(in srgb, var(--text-primary) 3%, transparent)
  );
`

export const WidgetShell = styled.div<{ dragging: boolean; editing: boolean }>`
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

export const WidgetEditDragSurface = styled.div`
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

export const RemoveBadge = styled.button`
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

export const MovePageControls = styled.div`
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

export const MovePageButton = styled.button`
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

export const WidgetEditControls = styled.div`
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

export const WidgetEditButton = styled.button`
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

export const EditToolbar = styled.div`
  position: fixed;
  top: 18px;
  right: 72px;
  z-index: 150;
  display: flex;
  gap: 8px;
`

export const DoneButton = styled.button`
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

export const EmptyHome = styled.div`
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

export const EmptyHomeAction = styled.button`
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

export const EditToolButton = styled(DoneButton)`
  padding: 8px 13px;
  background: var(--home-surface-strong);
  color: var(--text-primary);
  border-color: var(--home-stroke);
`

export const UndoToast = styled.div`
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

export const UndoButton = styled.button`
  padding: 5px 9px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
  cursor: pointer;
`

export const ConfirmCard = styled.div`
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

export const ConfirmTitle = styled.h3`
  margin: 0 0 8px;
  font-size: 1rem;
  color: var(--text-primary);
`

export const ConfirmText = styled.p`
  margin: 0 0 18px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.5;
`

export const ConfirmButtons = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
`

export const ConfirmButton = styled.button<{ danger?: boolean }>`
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
