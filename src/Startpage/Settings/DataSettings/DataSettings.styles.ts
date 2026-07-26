import styled from "@emotion/styled"

// CSS 变量常量
const ACCENT_COLOR = "var(--accent)"
const ACCENT_COLOR2 = "var(--accent-hover)"

export const ScrollContainer = styled.div`
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 10px;
  box-sizing: border-box;

  @media screen and (max-width: 600px) {
    padding-right: 0;
  }
`

export const Container = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  align-items: start;
  gap: 24px;
  padding-bottom: 20px;
  box-sizing: border-box;

  @media screen and (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: 20px;
  }
`

export const SettingsColumn = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
`

export const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const SectionTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-default);
  opacity: 0.9;
`

export const Description = styled.p`
  font-size: 0.85rem;
  opacity: 0.7;
  margin: 0;
  line-height: 1.5;
`

export const StatsCard = styled.div`
  padding: 16px;
  border: 2px solid var(--border-default);
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const StatsRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border-default);
  opacity: 0.8;

  &:last-child {
    border-bottom: none;
  }
`

export const StatsLabel = styled.span`
  font-size: 0.85rem;
`

export const StatsValue = styled.span`
  font-size: 0.85rem;
  font-weight: 600;
  color: ${ACCENT_COLOR};
`

export const StatsSummary = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.1);
  font-weight: 600;
`

export { Button } from "../../../components/Button"

export const HiddenInput = styled.input`
  display: none;
`

export const TextInput = styled.input`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 2px solid var(--text-primary);
  background: transparent;
  color: var(--text-primary);
  font-size: 0.9rem;

  &:focus {
    outline: none;
    border-color: ${ACCENT_COLOR};
  }
`

export const Link = styled.a`
  color: ${ACCENT_COLOR};
  text-decoration: none;
  font-size: 0.9rem;

  &:hover {
    text-decoration: underline;
  }
`

export const StatusRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 2px solid var(--border-default);
  min-width: 0;

  @media screen and (max-width: 600px) {
    align-items: flex-start;
    flex-direction: column;
  }
`

export const StatusLabel = styled.span`
  font-size: 0.9rem;
  opacity: 0.9;
`

export const StatusValue = styled.div`
  font-size: 0.85rem;
  opacity: 0.8;
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;

  @media screen and (max-width: 600px) {
    text-align: left;
  }
`

export const StatusHeadline = styled.strong`
  font-size: 0.9rem;
  opacity: 1;
`

export const StatusDetail = styled.span`
  line-height: 1.4;
`

export const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 8px 0;

  &:hover {
    opacity: 0.8;
  }
`

export const ResultMessage = styled.div<{ success: boolean }>`
  padding: 12px 16px;
  border: 2px solid ${({ success }) => (success ? "#39d353" : ACCENT_COLOR2)};
  background: ${({ success }) =>
    success ? "rgba(57, 211, 83, 0.1)" : "rgba(255, 100, 100, 0.1)"};
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.85rem;
  line-height: 1.5;
`

export const ResultIcon = styled.span<{ success: boolean }>`
  color: ${({ success }) => (success ? "#39d353" : ACCENT_COLOR2)};
`

export const ResultDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const WarningBox = styled.div`
  padding: 12px 16px;
  border: 2px solid ${ACCENT_COLOR2};
  background: rgba(255, 100, 100, 0.1);
  font-size: 0.85rem;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 10px;
`

export const WarningIcon = styled.span`
  color: ${ACCENT_COLOR2};
`
