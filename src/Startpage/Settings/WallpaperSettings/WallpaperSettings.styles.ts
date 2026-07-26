import styled from "@emotion/styled"

// CSS 变量常量
export const CSS_ACCENT_COLOR = "var(--accent)"
export const CSS_BORDER_COLOR = "var(--border-default)"
export const CSS_BG_COLOR = "var(--bg-primary)"
export const CSS_DEFAULT_COLOR = "var(--text-primary)"

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`

export const WallpaperPreview = styled.div`
  background-color: var(--bg-primary);
  display: flex;
  justify-content: center;
  align-items: center;
  border: 1px solid var(--accent);
  width: calc(100% - 400px);
  height: 100%;
  position: relative;
  overflow: hidden;
  min-width: 360px;
  ::after {
    content: "主页预览";
    color: var(--accent);
    position: absolute;
    top: 10px;
    right: 15px;
    font-size: 0.8rem;
    opacity: 0.9;
  }
`

export const PreviewStage = styled.div<{
  imageUrl: string
  fullscreen: boolean
  blur: number
  brightness: number
}>`
  position: absolute;
  inset: 0;
  background: var(--bg-primary);

  ::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: ${({ fullscreen, imageUrl }) =>
      fullscreen && imageUrl ? `url(${imageUrl})` : "none"};
    background-size: cover;
    background-position: center;
    filter: ${({ blur, brightness }) =>
      `blur(${Math.max(0, blur)}px) brightness(${brightness})`};
    transform: ${({ blur }) => (blur > 0 ? "scale(1.08)" : "scale(1.02)")};
    z-index: 0;
  }
`

export const PreviewOverlay = styled.div<{ visible: boolean; opacity: number }>`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, ${({ opacity }) => opacity});
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transition: opacity 0.2s;
  z-index: 1;
  pointer-events: none;
`

export const PreviewContent = styled.div`
  position: relative;
  z-index: 2;
  width: 86%;
  max-width: 720px;
  height: 78%;
  max-height: 520px;
  border-radius: 18px;
  border: 1px solid var(--border-default);
  background: rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(12px);
  overflow: hidden;
  display: grid;
  grid-template-columns: 300px 1fr;
`

export const PreviewLeftCard = styled.div<{ hidden: boolean }>`
  display: ${({ hidden }) => (hidden ? "none" : "flex")};
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  border-right: 1px solid var(--border-default);
`

export const PreviewCard = styled.div<{ imageUrl: string; visible: boolean }>`
  flex: 1;
  border-radius: 14px;
  border: 1px solid var(--border-default);
  overflow: hidden;
  position: relative;
  background: rgba(0, 0, 0, 0.18);

  ::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: ${({ imageUrl }) =>
      imageUrl ? `url(${imageUrl})` : "none"};
    background-size: cover;
    background-position: center;
    opacity: ${({ visible }) => (visible ? 1 : 0)};
    transition: opacity 0.2s;
  }
`

export const PreviewSearch = styled.div`
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--border-default);
  background: rgba(255, 255, 255, 0.06);
`

export const PreviewMain = styled.div`
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const PreviewHint = styled.div`
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
`

export const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-default);
`

export const OptionGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

export const OptionButton = styled.button<{ active: boolean }>`
  padding: 8px 16px;
  border: 1px solid
    ${({ active }) => (active ? CSS_ACCENT_COLOR : CSS_BORDER_COLOR)};
  border-radius: 8px;
  background: ${({ active }) => (active ? CSS_ACCENT_COLOR : "transparent")};
  color: ${({ active }) => (active ? CSS_BG_COLOR : CSS_DEFAULT_COLOR)};
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${CSS_ACCENT_COLOR};
    background: ${({ active }) =>
      active ? CSS_ACCENT_COLOR : `${CSS_ACCENT_COLOR}22`};
  }
`

export const ImageGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
`

export const ImageOption = styled.button<{ active: boolean }>`
  width: 100%;
  aspect-ratio: 1;
  border: 1px solid
    ${({ active }) => (active ? CSS_ACCENT_COLOR : CSS_BORDER_COLOR)};
  border-radius: 8px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${CSS_ACCENT_COLOR};
    transform: scale(1.05);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`

export const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${CSS_BORDER_COLOR};
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: ${CSS_ACCENT_COLOR};
  }

  &::placeholder {
    color: var(--text-secondary);
  }
`

export const UploadArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const UploadButton = styled.button`
  padding: 12px 20px;
  border: 1px dashed ${CSS_BORDER_COLOR};
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${CSS_ACCENT_COLOR};
    background: ${CSS_ACCENT_COLOR}11;
  }
`

export const UploadPreview = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border: 1px solid ${CSS_BORDER_COLOR};
  border-radius: 8px;

  img {
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 4px;
  }
`

export const UploadInfo = styled.div`
  flex: 1;
  font-size: 12px;
  color: var(--text-secondary);
`

export const RemoveButton = styled.button`
  padding: 6px 12px;
  border: 1px solid var(--accent-hover);
  border-radius: 4px;
  background: transparent;
  color: var(--accent-hover);
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: var(--accent-hover) 22;
  }
`

export const BingConfig = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const BingInfo = styled.div`
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
`

export const RefreshButton = styled.button`
  padding: 8px 16px;
  border: 1px solid ${CSS_ACCENT_COLOR};
  border-radius: 8px;
  background: transparent;
  color: ${CSS_ACCENT_COLOR};
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${CSS_ACCENT_COLOR};
    color: ${CSS_BG_COLOR};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

export const HiddenInput = styled.input`
  display: none;
`

// 轮播图片管理样式
