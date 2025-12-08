/**
 * 音符飘出动画组件
 */

import React, { useEffect, useState } from "react"

import { keyframes } from "@emotion/react"
import styled from "@emotion/styled"

const floatUp = keyframes`
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  50% {
    opacity: 0.8;
    transform: translateY(-30px) scale(1.2);
  }
  100% {
    opacity: 0;
    transform: translateY(-60px) scale(0.8);
  }
`

const NoteContainer = styled.div`
  position: absolute;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 10;
`

const Note = styled.span<{ delay: number }>`
  position: absolute;
  font-size: 1.5rem;
  color: var(--accent-color);
  animation: ${floatUp} 0.8s ease-out forwards;
  animation-delay: ${({ delay }) => delay}ms;
  text-shadow: 0 0 10px var(--accent-color);
`

interface NoteAnimationProps {
  show: boolean
  note: string
  onComplete?: () => void
}

const NOTE_SYMBOLS = ["♪", "♫", "♬", "♩"]

export const NoteAnimation: React.FC<NoteAnimationProps> = ({
  show,
  note,
  onComplete,
}) => {
  const [notes, setNotes] = useState<
    { id: number; symbol: string; x: number }[]
  >([])

  useEffect(() => {
    if (show) {
      // 生成 2-3 个随机音符
      const count = 2 + Math.floor(Math.random() * 2)
      const newNotes = Array.from({ length: count }, (_, i) => ({
        id: Date.now() + i,
        symbol: NOTE_SYMBOLS[Math.floor(Math.random() * NOTE_SYMBOLS.length)],
        x: -20 + Math.random() * 40, // -20px 到 +20px 的随机偏移
      }))
      setNotes(newNotes)

      // 动画结束后清除
      const timer = setTimeout(() => {
        setNotes([])
        onComplete?.()
      }, 1000)

      return () => clearTimeout(timer)
    }
  }, [show, onComplete])

  if (notes.length === 0) return null

  return (
    <NoteContainer>
      {notes.map((n, i) => (
        <Note
          key={n.id}
          delay={i * 100}
          style={{ left: `${n.x}px` }}
          title={note}
        >
          {n.symbol}
        </Note>
      ))}
    </NoteContainer>
  )
}
