import React from "react"

import styled from "@emotion/styled"

const ToggleWrapper = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
`

const ToggleSwitch = styled.div<{ checked: boolean }>`
  width: 44px;
  height: 24px;
  background: ${({ checked }) =>
    checked ? "var(--accent-color)" : "var(--border-color)"};
  border: 2px solid var(--default-color);
  border-radius: 12px;
  position: relative;
  transition: 0.2s;

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: ${({ checked }) => (checked ? "20px" : "2px")};
    width: 16px;
    height: 16px;
    background: var(--default-color);
    border-radius: 50%;
    transition: 0.2s;
  }
`

const ToggleLabel = styled.span`
  color: var(--default-color);
  font-size: 0.95rem;
`

const HiddenInput = styled.input`
  display: none;
`

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label }) => {
  return (
    <ToggleWrapper>
      <HiddenInput
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <ToggleSwitch checked={checked} />
      {label && <ToggleLabel>{label}</ToggleLabel>}
    </ToggleWrapper>
  )
}
