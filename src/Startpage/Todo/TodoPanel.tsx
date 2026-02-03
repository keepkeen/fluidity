import { useEffect, useMemo, useState } from "react"

import { css, keyframes } from "@emotion/react"
import styled from "@emotion/styled"
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { TodoContributions } from "../../services/contributions"
import { logger } from "../../utils/logger"

interface Todo {
  id: string
  text: string
  done: boolean
  createdAt: number
}

const STORAGE_KEY = "todos"

// 弹性动画
const bounceAnimation = keyframes`
  0% { transform: scale(1); }
  20% { transform: scale(1.08); }
  40% { transform: scale(0.95); }
  60% { transform: scale(1.03); }
  80% { transform: scale(0.98); }
  100% { transform: scale(1); }
`

// 礼花粒子动画
const confettiAnimation = keyframes`
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-60px) scale(0.5);
  }
`

const Panel = styled.div`
  width: 100%;
  height: 100%;
  padding: 10px;
  border: 2px solid var(--default-color);
  background: var(--bg-color);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;

  @media screen and (max-width: 600px) {
    padding: 6px;
  }
`

const PanelInner = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 12px;
  border: 1px solid var(--default-color);
  opacity: 0.9;
  position: relative;
  overflow: hidden;
`

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--default-color);
  font-weight: 600;
  letter-spacing: 1px;
`

const AddRow = styled.div`
  display: flex;
  gap: 8px;
`

const AddInput = styled.input`
  flex: 1;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0);
  color: var(--default-color);
  border: 2px solid var(--default-color);
  transition: 0.2s;
  ::placeholder {
    color: var(--default-color);
    opacity: 0.7;
  }
  :focus {
    outline: none;
    border-color: var(--accent-color2);
  }
`

const AddButton = styled.button`
  width: 44px;
  border: 2px solid var(--default-color);
  background: var(--accent-color);
  color: var(--bg-color);
  cursor: pointer;
  transition: 0.2s;
  :disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  :not(:disabled):hover {
    background: var(--accent-color2);
  }
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
`

const Item = styled.div<{
  done: boolean
  removing: boolean
  celebrating: boolean
}>`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 2px solid var(--default-color);
  background: ${({ done }) => (done ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0)")};
  color: var(--default-color);
  transition: 0.25s;
  opacity: ${({ removing }) => (removing ? 0 : 1)};
  transform: ${({ removing }) =>
    removing ? "translateY(8px) scale(0.98)" : "translateY(0)"};
  position: relative;

  ${({ celebrating }) =>
    celebrating &&
    css`
      animation: ${bounceAnimation} 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      border-color: var(--accent-color);
    `}
`

const Checkbox = styled.input`
  appearance: none;
  width: 18px;
  height: 18px;
  border: 2px solid var(--default-color);
  border-radius: 4px;
  cursor: pointer;
  position: relative;
  transition: 0.2s;
  :checked {
    background: var(--accent-color);
    border-color: var(--accent-color);
  }
  :checked::after {
    content: "✓";
    position: absolute;
    top: -2px;
    left: 3px;
    color: var(--bg-color);
    font-size: 14px;
    font-weight: 700;
  }
`

const Text = styled.div<{ done: boolean }>`
  word-break: break-word;
  text-decoration: ${({ done }) => (done ? "line-through" : "none")};
  opacity: ${({ done }) => (done ? 0.6 : 1)};
`

const DeleteButton = styled.button`
  border: none;
  background: rgba(0, 0, 0, 0);
  color: var(--default-color);
  cursor: pointer;
  transition: 0.2s;
  :hover {
    color: var(--accent-color2);
    transform: rotate(-6deg);
  }
  :focus {
    outline: none;
  }
`

const Empty = styled.div`
  text-align: center;
  color: var(--default-color);
  opacity: 0.6;
  padding: 20px 0;
`

// 礼花容器
const ConfettiContainer = styled.div`
  position: absolute;
  pointer-events: none;
  z-index: 100;
`

// 单个礼花粒子
const ConfettiParticle = styled.span<{
  color: string
  delay: number
  x: number
  rotation: number
}>`
  position: absolute;
  width: 8px;
  height: 8px;
  background: ${({ color }) => color};
  border-radius: 2px;
  animation: ${confettiAnimation} 0.8s ease-out forwards;
  animation-delay: ${({ delay }) => delay}ms;
  left: ${({ x }) => x}px;
  transform-origin: center;
  transform: rotate(${({ rotation }) => rotation}deg);
`

// 礼花颜色
const CONFETTI_COLORS = [
  "#39d353", // GitHub 绿
  "#26a641",
  "#006d32",
  "#FFD700", // 金色
  "#FF6B6B", // 红色
  "#4ECDC4", // 青色
  "#A78BFA", // 紫色
]

// 礼花组件
const Confetti: React.FC<{ x: number; y: number }> = ({ x, y }) => {
  const particles = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 100,
      x: (Math.random() - 0.5) * 80,
      rotation: Math.random() * 360,
    }))
  }, [])

  return (
    <ConfettiContainer style={{ left: x, top: y }}>
      {particles.map(p => (
        <ConfettiParticle
          key={p.id}
          color={p.color}
          delay={p.delay}
          x={p.x}
          rotation={p.rotation}
        />
      ))}
    </ConfettiContainer>
  )
}

export const TodoPanel = () => {
  const [todos, setTodos] = useState<Todo[]>([])
  const [input, setInput] = useState("")
  const [removing, setRemoving] = useState<Record<string, boolean>>({})
  const [celebrating, setCelebrating] = useState<Record<string, boolean>>({})
  const [confetti, setConfetti] = useState<{
    show: boolean
    x: number
    y: number
  } | null>(null)

  // load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Todo[]
        setTodos(parsed)
      }
    } catch (e) {
      logger.error("Failed to parse todos", e)
    }
  }, [])

  // save
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  }, [todos])

  const sortedTodos = useMemo(() => {
    return [...todos].sort(
      (a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt
    )
  }, [todos])

  const addTodo = () => {
    const value = input.trim()
    if (!value) return
    const hasUuid =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    const newTodo: Todo = {
      id: hasUuid ? crypto.randomUUID() : `${Date.now()}`,
      text: value,
      done: false,
      createdAt: Date.now(),
    }
    setTodos(prev => [newTodo, ...prev])
    setInput("")
  }

  const toggle = (id: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const todo = todos.find(t => t.id === id)
    const isCompleting = todo && !todo.done

    setTodos(prev => prev.map(t => (t.id === id ? { ...t, done: !t.done } : t)))

    if (isCompleting) {
      // 记录贡献
      TodoContributions.record()

      // 触发庆祝动画
      setCelebrating(prev => ({ ...prev, [id]: true }))

      // 显示礼花
      const rect = event.target.getBoundingClientRect()
      const container = event.target.closest("[data-panel]")
      if (container) {
        const containerRect = container.getBoundingClientRect()
        setConfetti({
          show: true,
          x: rect.left - containerRect.left + 10,
          y: rect.top - containerRect.top + 10,
        })
      }

      // 动画结束后清除状态
      setTimeout(() => {
        setCelebrating(prev => {
          const next = { ...prev }
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete next[id]
          return next
        })
        setConfetti(null)
      }, 800)
    }
  }

  const remove = (id: string) => {
    setRemoving(prev => ({ ...prev, [id]: true }))
    setTimeout(() => {
      setTodos(prev => prev.filter(t => t.id !== id))
      setRemoving(prev => {
        const next = { ...prev }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete next[id]
        return next
      })
    }, 180)
  }

  return (
    <Panel>
      <PanelInner data-panel>
        <PanelHeader>
          <span>待办</span>
          <span style={{ opacity: 0.6, fontSize: "0.85rem" }}>回车添加</span>
        </PanelHeader>
        <AddRow>
          <AddInput
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="记录一个想做的事..."
            onKeyUp={e => e.key === "Enter" && addTodo()}
          />
          <AddButton onClick={addTodo} disabled={!input.trim()}>
            <FontAwesomeIcon icon={faPlus} />
          </AddButton>
        </AddRow>
        <List>
          {sortedTodos.length === 0 && <Empty>今天还没有待办</Empty>}
          {sortedTodos.map(item => (
            <Item
              key={item.id}
              done={item.done}
              removing={!!removing[item.id]}
              celebrating={!!celebrating[item.id]}
            >
              <Checkbox
                type="checkbox"
                checked={item.done}
                onChange={e => toggle(item.id, e)}
                aria-label="完成"
              />
              <Text done={item.done}>{item.text}</Text>
              <DeleteButton onClick={() => remove(item.id)} aria-label="删除">
                <FontAwesomeIcon icon={faTrash} />
              </DeleteButton>
            </Item>
          ))}
        </List>
        {confetti?.show && <Confetti x={confetti.x} y={confetti.y} />}
      </PanelInner>
    </Panel>
  )
}
