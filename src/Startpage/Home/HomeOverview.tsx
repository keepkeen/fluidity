import { useState } from "react"

import styled from "@emotion/styled"

import { Modal } from "../../components/Modal"
import { HomeItem } from "../../services/homeLayout"
import { getWidgetDefinition } from "../../services/widgetRegistry"
import {
  DrawerBody,
  DrawerCard,
  DrawerClose,
  DrawerHeader,
  DrawerTitle,
  WidgetActionButton,
  WidgetRowMeta,
} from "../Widgets/shared"

const PageGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;
`

const PageCard = styled.section<{ active: boolean; dropActive: boolean }>`
  min-height: 180px;
  padding: 12px;
  border: 1px solid
    ${({ active, dropActive }) =>
      dropActive ? "var(--accent)" : active ? "var(--border-active)" : "var(--home-stroke)"};
  border-radius: 18px;
  background: ${({ dropActive }) =>
    dropActive
      ? "color-mix(in srgb, var(--accent) 12%, var(--home-surface))"
      : "var(--home-surface)"};
`

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  color: var(--text-primary);
  font-size: 0.78rem;
  font-weight: 600;
`

const ItemGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
`

const ItemButton = styled.button<{ selected: boolean; widget: boolean }>`
  grid-column: span ${({ widget }) => (widget ? 2 : 1)};
  min-width: 0;
  height: ${({ widget }) => (widget ? 50 : 38)}px;
  padding: 4px;
  border: 1px solid ${({ selected }) => selected ? "var(--accent)" : "var(--home-stroke)"};
  border-radius: ${({ widget }) => (widget ? 10 : 9)}px;
  background: ${({ selected }) => selected ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "var(--home-surface-strong)"};
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.62rem;
  cursor: grab;
`

interface HomeOverviewProps {
  pages: HomeItem[][]
  currentPage: number
  onClose: () => void
  onNavigate: (page: number) => void
  onMoveItem: (itemId: string, targetPage: number) => boolean
}

const itemLabel = (item: HomeItem): string =>
  item.kind === "app" ? item.label : getWidgetDefinition(item.widget.type).title

export const HomeOverview = ({
  pages,
  currentPage,
  onClose,
  onNavigate,
  onMoveItem,
}: HomeOverviewProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropPage, setDropPage] = useState<number | null>(null)

  const move = (itemId: string, page: number) => {
    if (onMoveItem(itemId, page)) {
      setSelectedId(null)
      setDraggedId(null)
      setDropPage(null)
    }
  }

  return (
    <Modal onClose={onClose} label="主屏总览" overlay="dark">
      <DrawerCard style={{ width: "min(980px, calc(100vw - 32px))" }}>
        <DrawerHeader>
          <div>
            <DrawerTitle>主屏总览</DrawerTitle>
            <WidgetRowMeta>拖动条目到目标页；键盘用户可以先选择条目，再点击“移到这里”。</WidgetRowMeta>
          </div>
          <DrawerClose type="button" aria-label="关闭" onClick={onClose}>×</DrawerClose>
        </DrawerHeader>
        <DrawerBody>
          <PageGrid>
            {pages.map((items, pageIndex) => (
              <PageCard
                key={pageIndex}
                active={pageIndex === currentPage}
                dropActive={pageIndex === dropPage}
                onDragOver={event => {
                  event.preventDefault()
                  setDropPage(pageIndex)
                }}
                onDragLeave={() => setDropPage(value => value === pageIndex ? null : value)}
                onDrop={event => {
                  event.preventDefault()
                  const itemId = draggedId || event.dataTransfer.getData("text/plain")
                  if (itemId) move(itemId, pageIndex)
                }}
              >
                <PageHeader>
                  <button
                    type="button"
                    style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}
                    onClick={() => onNavigate(pageIndex)}
                  >
                    第 {pageIndex + 1} 页
                  </button>
                  {selectedId && (
                    <WidgetActionButton type="button" onClick={() => move(selectedId, pageIndex)}>
                      移到这里
                    </WidgetActionButton>
                  )}
                </PageHeader>
                <ItemGrid>
                  {items.map(item => (
                    <ItemButton
                      key={item.id}
                      type="button"
                      widget={item.kind === "widget"}
                      selected={selectedId === item.id}
                      draggable
                      title={itemLabel(item)}
                      onClick={() => setSelectedId(value => value === item.id ? null : item.id)}
                      onDragStart={event => {
                        setDraggedId(item.id)
                        event.dataTransfer.setData("text/plain", item.id)
                        event.dataTransfer.effectAllowed = "move"
                      }}
                      onDragEnd={() => {
                        setDraggedId(null)
                        setDropPage(null)
                      }}
                    >
                      {itemLabel(item)}
                    </ItemButton>
                  ))}
                </ItemGrid>
              </PageCard>
            ))}
          </PageGrid>
        </DrawerBody>
      </DrawerCard>
    </Modal>
  )
}
