import { Component, ErrorInfo, ReactNode } from "react"

import styled from "@emotion/styled"

import { logger } from "../utils/logger"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 40px;
  text-align: center;
  color: var(--text-primary);
`

const ErrorTitle = styled.h2`
  font-size: 1.5rem;
  margin-bottom: 16px;
  color: var(--accent);
`

const ErrorMessage = styled.p`
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 24px;
  max-width: 400px;
`

const RetryButton = styled.button`
  padding: 10px 24px;
  border: 2px solid var(--accent);
  border-radius: 6px;
  background: transparent;
  color: var(--accent);
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--accent);
    color: var(--bg-primary);
  }
`

const ErrorDetails = styled.details`
  margin-top: 20px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-align: left;
  max-width: 500px;

  summary {
    cursor: pointer;
    margin-bottom: 8px;
  }

  pre {
    background: rgba(0, 0, 0, 0.3);
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
`

/**
 * Error Boundary 组件
 * 捕获子组件的 JavaScript 错误，显示降级 UI
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 可以在这里上报错误到日志服务
    logger.error("ErrorBoundary caught an error:", error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  handleCopyDetails = (): void => {
    const { error } = this.state
    if (!error) return
    const text = `${error.toString()}\n${error.stack ?? ""}`
    void navigator.clipboard?.writeText(text).catch(() => undefined)
  }

  render(): ReactNode {
    const { hasError, error } = this.state
    const { fallback, children } = this.props

    if (hasError) {
      if (fallback) {
        return fallback
      }

      return (
        <ErrorContainer>
          <ErrorTitle>出错了 😢</ErrorTitle>
          <ErrorMessage>
            页面遇到了一些问题，请尝试刷新页面或点击下方按钮重试。
          </ErrorMessage>
          <RetryButton onClick={this.handleRetry}>重试</RetryButton>
          {error && (
            <ErrorDetails>
              <summary>查看错误详情</summary>
              <pre>{error.toString()}</pre>
              <RetryButton type="button" onClick={this.handleCopyDetails}>
                复制调试信息
              </RetryButton>
            </ErrorDetails>
          )}
        </ErrorContainer>
      )
    }

    return children
  }
}

/**
 * 用于包裹可能出错的小组件的轻量级 Error Boundary
 */
const SmallErrorFallback = styled.div`
  padding: 12px;
  color: var(--text-secondary);
  font-size: 0.85rem;
  text-align: center;
`

interface SmallErrorBoundaryProps {
  children: ReactNode
  name?: string
}

interface SmallErrorBoundaryState {
  hasError: boolean
}

export class SmallErrorBoundary extends Component<
  SmallErrorBoundaryProps,
  SmallErrorBoundaryState
> {
  constructor(props: SmallErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): SmallErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { name } = this.props
    logger.error(`SmallErrorBoundary [${name ?? "unknown"}]:`, error, errorInfo)
  }

  render(): ReactNode {
    const { hasError } = this.state
    const { name, children } = this.props

    if (hasError) {
      return (
        <SmallErrorFallback>
          {name ? `${name} 加载失败` : "组件加载失败"}
        </SmallErrorFallback>
      )
    }
    return children
  }
}
