import { ReactNode, useEffect, useRef } from "react"

import styled from "@emotion/styled"

/**
 * 弹窗行为容器：dialog 语义、Escape 关闭、焦点陷阱、关闭后焦点归还。
 * 视觉样式由 children 自带，这里只负责行为与可选遮罩。
 */

const Overlay = styled.div<{ dim: "light" | "dark" }>`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 100;
  background-color: ${({ dim }) =>
    dim === "dark" ? "rgba(0, 0, 0, 0.6)" : "var(--bg-primary)"};
  opacity: ${({ dim }) => (dim === "light" ? 0.7 : 1)};
`

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ")

interface ModalProps {
  onClose: () => void
  /** 无障碍名称（aria-label） */
  label: string
  children: ReactNode
  /** 遮罩样式；"none" 表示 children 自带遮罩 */
  overlay?: "light" | "dark" | "none"
  closeOnOverlayClick?: boolean
}

export const Modal = ({
  onClose,
  label,
  children,
  overlay = "light",
  closeOnOverlayClick = true,
}: ModalProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    const getFocusable = (): HTMLElement[] => {
      if (!containerRef.current) return []
      return Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      )
    }

    const initial = getFocusable()[0] ?? containerRef.current
    initial?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== "Tab") return

      const items = getFocusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const inside = containerRef.current?.contains(active) ?? false

      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      previouslyFocused?.focus()
    }
  }, [])

  return (
    <>
      {overlay !== "none" && (
        <Overlay
          dim={overlay}
          onClick={closeOnOverlayClick ? () => onCloseRef.current() : undefined}
        />
      )}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>
    </>
  )
}
