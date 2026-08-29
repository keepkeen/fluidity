import styled from "@emotion/styled"

export const WidgetList = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
`

export const WidgetRow = styled.div`
  min-height: 30px;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 5px 7px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--home-surface-strong) 54%, transparent);
  border: 1px solid color-mix(in srgb, var(--home-stroke) 75%, transparent);
`

export const WidgetRowButton = styled.button`
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;

  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    border-radius: 6px;
  }
`

export const WidgetRowTitle = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  font-weight: 600;
`

export const WidgetRowMeta = styled.div`
  min-width: 0;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 0.65rem;

  @container (max-height: 110px) {
    display: none;
  }
`

export const WidgetActions = styled.div`
  display: flex;
  gap: 3px;
`

export const WidgetIconButton = styled.button`
  width: 25px;
  height: 25px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.7rem;

  :hover,
  :focus-visible {
    color: var(--accent);
    border-color: var(--home-stroke);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    outline: none;
  }
`

export const WidgetEmpty = styled.div`
  height: 100%;
  display: grid;
  place-content: center;
  gap: 7px;
  padding: 4px;
  color: var(--text-muted);
  font-size: 0.75rem;
  line-height: 1.45;
  text-align: center;
`

export const WidgetActionButton = styled.button`
  justify-self: center;
  padding: 5px 10px;
  border: 1px solid var(--home-stroke);
  border-radius: 999px;
  background: var(--home-surface-strong);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;

  :hover,
  :focus-visible {
    border-color: var(--accent);
    color: var(--accent);
    outline: none;
  }
`

export const CompactWidgetEmpty = styled(WidgetEmpty)`
  @container (max-height: 110px) {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0;
    text-align: left;
    overflow: hidden;

    > span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    > button {
      flex: 0 0 auto;
      max-width: 100%;
      padding: 4px 8px;
      white-space: nowrap;
    }

    &[data-compact-action-only="true"] > span {
      display: none;
    }
  }
`

export const DrawerCard = styled.div`
  position: fixed;
  z-index: 1001;
  top: 50%;
  left: 50%;
  width: min(720px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 32px));
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--home-stroke);
  border-radius: 24px;
  background: color-mix(in srgb, var(--bg-primary) 94%, transparent);
  box-shadow: var(--shadow-pop);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
`

export const DrawerHeader = styled.div`
  padding: 18px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--home-stroke);
`

export const DrawerTitle = styled.h2`
  margin: 0;
  color: var(--text-primary);
  font-size: 1.05rem;
`

export const DrawerBody = styled.div`
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 22px;
`

export const DrawerClose = styled.button`
  width: 32px;
  height: 32px;
  border: 1px solid var(--home-stroke);
  border-radius: 50%;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
`
