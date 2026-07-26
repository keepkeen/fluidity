import styled from "@emotion/styled"

// CSS 变量常量
export const CSS_ACCENT_COLOR = "var(--accent-color)"
export const CSS_BORDER_COLOR = "var(--border-color)"
export const CSS_BG_COLOR = "var(--bg-color)"
export const CSS_DEFAULT_COLOR = "var(--default-color)"

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`

export const WallpaperPreview = styled.div`
  background-color: var(--bg-color);
  display: flex;
  justify-content: center;
  align-items: center;
  border: 2px solid var(--accent-color);
  width: calc(100% - 400px);
  height: 100%;
  position: relative;
  overflow: hidden;
  min-width: 360px;
  ::after {
    content: "主页预览";
    color: var(--accent-color);
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
  background: var(--bg-color);

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
  border: 1px solid var(--border-color);
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
  border-right: 1px solid var(--border-color);
`

export const PreviewCard = styled.div<{ imageUrl: string; visible: boolean }>`
  flex: 1;
  border-radius: 14px;
  border: 1px solid var(--border-color);
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
  border: 1px solid var(--border-color);
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
  color: var(--secondary-color);
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
  color: var(--accent-color);
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
`

export const OptionGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

export const OptionButton = styled.button<{ active: boolean }>`
  padding: 8px 16px;
  border: 2px solid
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
  border: 3px solid
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
  border: 2px solid ${CSS_BORDER_COLOR};
  border-radius: 8px;
  background: transparent;
  color: var(--default-color);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: ${CSS_ACCENT_COLOR};
  }

  &::placeholder {
    color: var(--secondary-color);
  }
`

export const UploadArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const UploadButton = styled.button`
  padding: 12px 20px;
  border: 2px dashed ${CSS_BORDER_COLOR};
  border-radius: 8px;
  background: transparent;
  color: var(--default-color);
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
  color: var(--secondary-color);
`

export const RemoveButton = styled.button`
  padding: 6px 12px;
  border: 1px solid var(--accent-color2);
  border-radius: 4px;
  background: transparent;
  color: var(--accent-color2);
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: var(--accent-color2) 22;
  }
`

export const BingConfig = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const BingInfo = styled.div`
  font-size: 12px;
  color: var(--secondary-color);
  line-height: 1.5;
`

export const RefreshButton = styled.button`
  padding: 8px 16px;
  border: 2px solid ${CSS_ACCENT_COLOR};
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

export const Toggle = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
`

export const ToggleSwitch = styled.div<{ checked: boolean }>`
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background: ${({ checked }) =>
    checked ? CSS_ACCENT_COLOR : CSS_BORDER_COLOR};
  position: relative;
  transition: background 0.2s;

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: ${({ checked }) => (checked ? "22px" : "2px")};
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--default-color);
    transition: left 0.2s;
  }
`

export const ToggleLabel = styled.span`
  font-size: 14px;
  color: var(--default-color);
`

export const HiddenInput = styled.input`
  display: none;
`

// 轮播图片管理样式
export const CarouselImageList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
`

export const CarouselImageItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border: 1px solid ${CSS_BORDER_COLOR};
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.1);

  img {
    width: 50px;
    height: 50px;
    object-fit: cover;
    border-radius: 4px;
  }
`

export const CarouselImageInfo = styled.div`
  flex: 1;
  font-size: 13px;
  color: var(--default-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const CarouselImageActions = styled.div`
  display: flex;
  gap: 4px;
`

export const SmallButton = styled.button`
  padding: 4px 8px;
  border: 1px solid ${CSS_BORDER_COLOR};
  border-radius: 4px;
  background: transparent;
  color: var(--default-color);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${CSS_ACCENT_COLOR};
    color: ${CSS_ACCENT_COLOR};
  }

  &.danger:hover {
    border-color: #ff6b6b;
    color: #ff6b6b;
  }
`

export const AddImageButtons = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

export const EmptyState = styled.div`
  padding: 20px;
  text-align: center;
  color: var(--secondary-color);
  font-size: 13px;
  border: 2px dashed ${CSS_BORDER_COLOR};
  border-radius: 8px;
`
