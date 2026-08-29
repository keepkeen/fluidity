import styled from "@emotion/styled"

import { DANGER_COLOR } from "../base/colorUtils"

// 样式组件
export const Container = styled.div`
  width: 380px;
  max-height: 600px;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary, var(--text-primary));
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text",
    "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  letter-spacing: 0.2px;
`

export const Scroll = styled.div`
  max-height: 600px;
  overflow-y: auto;
  padding: 10px 12px 12px 12px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.18);
    border-radius: 999px;
  }
`

export const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
  position: sticky;
  top: 0;
  background: rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(14px);
  z-index: 10;
`

export const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

export const Title = styled.h1`
  font-size: 13px;
  font-weight: 650;
  margin: 0;
  color: var(--text-primary, var(--text-primary));
`

export const IconButton = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: var(--text-secondary, var(--text-primary));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary, var(--text-primary));
  }

  &:active {
    transform: translateY(0.5px);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`

export const SearchBar = styled.div`
  padding: 8px 12px 0 12px;
`

export const SearchInput = styled.input`
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  color: var(--text-primary, var(--text-primary));
  font-size: 13px;

  &::placeholder {
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
  }

  &:focus {
    outline: none;
    border-color: rgba(138, 180, 255, 0.55);
    box-shadow: 0 0 0 3px rgba(138, 180, 255, 0.18);
  }
`

export const Section = styled.div`
  margin-top: 10px;
`

export const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px 8px 4px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
  font-size: 12px;
`

export const SectionTitle = styled.span`
  font-weight: 600;
`

export const Chip = styled.span`
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  font-size: 11px;
`

export const Card = styled.div`
  border-radius: 14px;
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  background: rgba(255, 255, 255, 0.04);
  overflow: hidden;
`

export const GroupContainer = styled.div`
  border-top: 1px solid var(--border-default, rgba(255, 255, 255, 0.08));

  &:first-of-type {
    border-top: none;
  }
`

export const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 12px 12px;
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
`

export const GroupHeaderButton = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  padding: 12px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -3px;
  }
`

export const GroupTitle = styled.span`
  flex: 1;
  font-weight: 650;
  color: var(--text-primary, var(--text-primary));
`

export const GroupIcon = styled.span`
  margin-right: 8px;
  font-size: 11px;
  opacity: 0.75;
  color: var(--text-secondary, var(--text-primary));
`

export const GroupMeta = styled.span`
  font-size: 11px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
`

export const ResultGroup = styled.span`
  font-size: 11px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  background: rgba(255, 255, 255, 0.04);
  white-space: nowrap;
`

export const LinkList = styled.div<{ expanded: boolean }>`
  max-height: ${({ expanded }) => (expanded ? "520px" : "0")};
  overflow: hidden;
  transition: max-height 0.28s ease;
`

export const LinkItem = styled.div<{ isAdded?: boolean }>`
  display: flex;
  align-items: center;
  padding: 10px 12px 10px 32px;
  cursor: pointer;
  transition: 0.2s;
  background: ${({ isAdded }) =>
    isAdded ? "rgba(138, 180, 255, 0.10)" : "transparent"};

  &:hover {
    background: ${({ isAdded }) =>
      isAdded ? "rgba(138, 180, 255, 0.14)" : "rgba(255, 255, 255, 0.06)"};
  }
`

export const LinkLabel = styled.button`
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary, var(--text-primary));

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`

export const LinkActions = styled.div`
  display: flex;
  gap: 4px;
`

const DEFAULT_BTN_COLOR = "var(--text-secondary, rgba(255, 255, 255, 0.7))"

export const ActionBtn = styled.button<{ danger?: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: ${({ danger }) => (danger ? DANGER_COLOR : DEFAULT_BTN_COLOR)};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: ${({ danger }) =>
      danger ? DANGER_COLOR : "var(--text-primary, var(--text-primary))"};
  }

  &:active {
    transform: translateY(0.5px);
  }

  &:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 1px;
  }
`

export const AddButton = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  padding: 10px 12px 10px 32px;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: 0.2s;
  font-size: 12px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.7));

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary, var(--text-primary));
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -3px;
  }
`

export const AddIcon = styled.span`
  margin-right: 8px;
  color: var(--accent, var(--accent));
`

// 弹窗样式
export const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`

export const ModalContent = styled.div`
  background: rgba(18, 18, 21, 0.86);
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
  padding: 14px;
  width: 304px;
  border-radius: 16px;
`

export const ModalTitle = styled.h3`
  margin: 0 0 12px 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary, var(--text-primary));
`

export const ModalSubtitle = styled.p`
  margin: -6px 0 12px 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
`

export const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  color: var(--text-primary, var(--text-primary));
  font-size: 13px;
  margin-bottom: 8px;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: rgba(138, 180, 255, 0.55);
    box-shadow: 0 0 0 3px rgba(138, 180, 255, 0.18);
  }

  &::placeholder {
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
  }
`

export const UrlDisplay = styled.div`
  font-size: 11px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
  margin-bottom: 12px;
  word-break: break-all;
`

export const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`

const ACCENT_COLOR = "var(--accent, var(--accent))"

export const Button = styled.button<{ primary?: boolean; danger?: boolean }>`
  padding: 8px 12px;
  border-radius: 12px;
  background: ${({ primary, danger }) => {
    if (danger) return "rgba(255, 100, 100, 0.12)"
    if (primary) return ACCENT_COLOR
    return "rgba(255, 255, 255, 0.06)"
  }};
  border: 1px solid
    ${({ primary, danger }) => {
      if (danger) return "rgba(255, 100, 100, 0.25)"
      if (primary) return "transparent"
      return "rgba(255, 255, 255, 0.12)"
    }};
  color: ${({ primary, danger }) => {
    if (danger) return DANGER_COLOR
    if (primary) return "rgba(18,18,21,0.95)"
    return "var(--text-primary, var(--text-primary))"
  }};
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    transform: translateY(-0.5px);
  }

  &:active {
    transform: translateY(0.5px);
  }


  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`

export const CheckIcon = styled.span`
  color: var(--accent, var(--accent));
  margin-right: 6px;
  font-size: 11px;
`
