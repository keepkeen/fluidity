import styled from "@emotion/styled"
import {
  FontAwesomeIcon,
  FontAwesomeIconProps,
} from "@fortawesome/react-fontawesome"

const StyledIconButton = styled.button<{ inverted?: boolean }>`
  color: ${({ inverted }) =>
    inverted ? "var(--bg-primary)" : "var(--text-primary)"};
  background-color: transparent;
  min-width: 50px;
  font-size: 20px;
  border: none;
  opacity: 0.7;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: var(--radius-sm);
  transition: opacity var(--transition-fast), color var(--transition-fast);

  :enabled:hover {
    opacity: 1;
    color: ${({ inverted }) =>
      inverted ? "var(--bg-primary)" : "var(--accent)"};
  }
  :focus {
    outline: none;
  }
  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  :disabled {
    opacity: 0.2;
    cursor: default;
  }

  > span {
    padding-right: 10px;
  }
`
type props = Partial<Pick<FontAwesomeIconProps, "icon">> &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    text?: string
    inverted?: boolean
  }

export const IconButton = ({
  icon,
  text,
  children,
  type = "button",
  ...props
}: props) => {
  return (
    <StyledIconButton type={type} {...props}>
      {children}
      {text && <span>{text}</span>}
      {icon && <FontAwesomeIcon icon={icon}></FontAwesomeIcon>}
    </StyledIconButton>
  )
}
