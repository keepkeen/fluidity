import styled from "@emotion/styled"

/**
 * 统一按钮控件：设置页所有按钮使用同一实现。
 * variant：primary（强调）/ secondary（默认）/ danger（破坏性）
 * size：md（整行）/ sm（内联小按钮）
 */

const variantColor = (variant?: string): string =>
  variant === "danger" ? "var(--accent-hover)" : "var(--text-primary)"

export const Button = styled.button<{
  variant?: "primary" | "secondary" | "danger"
  size?: "md" | "sm"
}>`
  width: ${({ size }) => (size === "sm" ? "auto" : "100%")};
  min-width: ${({ size }) => (size === "sm" ? "0" : "140px")};
  box-sizing: border-box;
  padding: ${({ size }) => (size === "sm" ? "6px 12px" : "12px 16px")};
  border: 2px solid ${({ variant }) => variantColor(variant)};
  background: ${({ variant }) =>
    variant === "primary" ? "var(--accent)" : "transparent"};
  color: ${({ variant }) =>
    variant === "primary" ? "var(--bg-primary)" : variantColor(variant)};
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover:not(:disabled) {
    background: ${({ variant }) =>
      variant === "primary" ? "var(--accent-hover)" : "var(--accent)"};
    border-color: ${({ variant }) =>
      variant === "danger" ? "var(--accent)" : undefined};
    color: var(--bg-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`
