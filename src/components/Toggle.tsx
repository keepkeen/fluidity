import styled from "@emotion/styled"

/**
 * 统一开关控件：设置页所有布尔项使用同一实现。
 * 布局约定：文字在左、开关在右（有 label 时占满整行）。
 */

const ToggleWrapper = styled.label<{ hasLabel: boolean; disabled?: boolean }>`
  display: ${({ hasLabel }) => (hasLabel ? "flex" : "inline-flex")};
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: ${({ hasLabel }) => (hasLabel ? "100%" : "auto")};
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
`

const ToggleLabel = styled.span`
  color: var(--text-primary);
  font-size: 0.95rem;
`

// 视觉隐藏但保持可聚焦，键盘/屏幕阅读器都能操作
const HiddenInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;

  :focus-visible + span {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
`

const SwitchTrack = styled.span<{ checked: boolean }>`
  flex: 0 0 auto;
  width: 44px;
  height: 24px;
  background: ${({ checked }) =>
    checked
      ? "var(--accent)"
      : "color-mix(in srgb, var(--text-primary) 18%, transparent)"};
  border: 1px solid var(--surface-border);
  border-radius: 999px;
  position: relative;
  transition: background var(--transition-fast);

  &::after {
    content: "";
    position: absolute;
    top: 3px;
    left: ${({ checked }) => (checked ? "21px" : "3px")};
    width: 16px;
    height: 16px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    border-radius: 50%;
    transition: left var(--transition-fast);
  }
`

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  /** 无可见 label 时必须提供无障碍名称 */
  ariaLabel?: string
  disabled?: boolean
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  label,
  ariaLabel,
  disabled,
}) => {
  return (
    <ToggleWrapper hasLabel={Boolean(label)} disabled={disabled}>
      {label && <ToggleLabel>{label}</ToggleLabel>}
      <HiddenInput
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel}
        onChange={e => onChange(e.target.checked)}
      />
      <SwitchTrack checked={checked} aria-hidden />
    </ToggleWrapper>
  )
}
