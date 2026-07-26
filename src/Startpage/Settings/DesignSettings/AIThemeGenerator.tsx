import React, { useState } from "react"

import styled from "@emotion/styled"
import { faMagicWandSparkles, faSync } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Theme } from "../../../data/data"
import {
  generateTheme,
  AIGeneratedTheme,
} from "../../../services/themeGenerator"

const Container = styled.div`
  margin-top: 24px;
  padding: 16px;
  border: 2px solid var(--border-color);
`

const Title = styled.h3`
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`

const TitleIcon = styled.span`
  color: var(--accent);
`

const FormGroup = styled.div`
  margin-bottom: 16px;
`

const Label = styled.label`
  display: block;
  font-size: 0.9rem;
  margin-bottom: 8px;
  opacity: 0.9;
`

const TextArea = styled.textarea`
  width: 100%;
  min-height: 80px;
  padding: 10px 12px;
  background: transparent;
  border: 2px solid var(--border-color);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--border-active);
  }

  &::placeholder {
    color: var(--text-secondary);
  }
`

const CharCount = styled.span`
  font-size: 0.75rem;
  color: var(--text-secondary);
  float: right;
  margin-top: 4px;
`

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 2px solid var(--border-color);
  color: var(--text-primary);
  font-size: 0.9rem;
  cursor: pointer;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--border-active);
  }

  option {
    background: var(--bg-primary);
    color: var(--text-primary);
  }
`

const GenerateButton = styled.button`
  width: 100%;
  padding: 12px;
  background: var(--accent);
  border: 2px solid var(--text-primary);
  color: var(--accent-text);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const PreviewContainer = styled.div`
  margin-top: 16px;
  padding: 16px;
  border: 2px dashed var(--border-color);
`

const PreviewTitle = styled.div`
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 12px;
`

const ThemeName = styled.div`
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 16px;
`

const ColorSection = styled.div`
  margin-bottom: 16px;
`

const ColorSectionTitle = styled.div`
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color);
`

const ColorGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;

  @media screen and (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`

const ColorItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const ColorSwatch = styled.div<{ color: string }>`
  width: 28px;
  height: 28px;
  background: ${({ color }) => color};
  border: 2px solid var(--text-primary);
  flex-shrink: 0;
`

const ColorInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
`

const ColorLabel = styled.span`
  font-size: 0.7rem;
  color: var(--text-secondary);
`

const ColorValue = styled.span`
  font-size: 0.8rem;
  font-family: monospace;
`

const ButtonRow = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 16px;
`

const ActionButton = styled.button<{ variant?: "primary" | "secondary" }>`
  flex: 1;
  padding: 10px 16px;
  border: 2px solid var(--text-primary);
  background: ${({ variant }) =>
    variant === "primary" ? "var(--accent)" : "transparent"};
  color: ${({ variant }) =>
    variant === "primary" ? "var(--accent-text)" : "var(--text-primary)"};
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    background: ${({ variant }) =>
      variant === "primary" ? "var(--accent-hover)" : "var(--accent)"};
    color: var(--accent-text);
  }
`

const ErrorMessage = styled.div`
  margin-top: 12px;
  padding: 10px 12px;
  border: 2px solid var(--accent-hover);
  background: rgba(255, 100, 100, 0.1);
  font-size: 0.85rem;
  color: var(--accent-hover);
`

interface Props {
  currentImage: string
  onApply: (theme: Theme) => void
  onSave: (theme: Theme) => void
}

export const AIThemeGenerator: React.FC<Props> = ({
  currentImage,
  onApply,
  onSave,
}) => {
  const [description, setDescription] = useState("")
  const [model, setModel] = useState("deepseek-chat")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedTheme, setGeneratedTheme] = useState<AIGeneratedTheme | null>(
    null
  )

  const maxLength = 200

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    setGeneratedTheme(null)

    const result = await generateTheme(description, model)

    if (result.theme) {
      setGeneratedTheme(result.theme)
    } else {
      setError(result.error ?? "生成失败")
    }

    setLoading(false)
  }

  const convertToTheme = (aiTheme: AIGeneratedTheme): Theme => ({
    name: aiTheme.name,
    image: currentImage,
    colors: {
      "--bg-primary": aiTheme.bgPrimary,
      "--bg-secondary": aiTheme.bgSecondary,
      "--bg-hover": aiTheme.bgHover,
      "--text-primary": aiTheme.textPrimary,
      "--text-secondary": aiTheme.textSecondary,
      "--text-muted": aiTheme.textMuted,
      "--border-default": aiTheme.borderDefault,
      "--border-active": aiTheme.borderActive,
      "--accent": aiTheme.accent,
      "--accent-hover": aiTheme.accentHover,
      "--accent-text": aiTheme.accentText,
      "--success": aiTheme.success,
      "--glow": aiTheme.glow,
    },
  })

  const handleApply = () => {
    if (generatedTheme) {
      onApply(convertToTheme(generatedTheme))
    }
  }

  const handleSave = () => {
    if (generatedTheme) {
      onSave(convertToTheme(generatedTheme))
    }
  }

  return (
    <Container>
      <Title>
        <TitleIcon>
          <FontAwesomeIcon icon={faMagicWandSparkles} />
        </TitleIcon>
        AI 生成主题
      </Title>

      <FormGroup>
        <Label>描述你想要的主题风格：</Label>
        <TextArea
          value={description}
          onChange={e => setDescription(e.target.value.slice(0, maxLength))}
          placeholder="例如：赛博朋克风格、温暖的日落、森林清新、极简黑白..."
        />
        <CharCount>
          {description.length}/{maxLength}
        </CharCount>
      </FormGroup>

      <FormGroup>
        <Label>选择 AI 模型：</Label>
        <Select value={model} onChange={e => setModel(e.target.value)}>
          <option value="deepseek-chat">DeepSeek Chat (推荐)</option>
          <option value="deepseek-reasoner">DeepSeek Reasoner</option>
        </Select>
      </FormGroup>

      <GenerateButton
        onClick={() => void handleGenerate()}
        disabled={loading || !description.trim()}
      >
        <FontAwesomeIcon
          icon={loading ? faSync : faMagicWandSparkles}
          spin={loading}
        />
        {loading ? "生成中..." : "生成配色"}
      </GenerateButton>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {generatedTheme && (
        <PreviewContainer>
          <PreviewTitle>预览</PreviewTitle>
          <ThemeName>{generatedTheme.name}</ThemeName>

          {/* 背景层 */}
          <ColorSection>
            <ColorSectionTitle>背景层</ColorSectionTitle>
            <ColorGrid>
              <ColorItem>
                <ColorSwatch color={generatedTheme.bgPrimary} />
                <ColorInfo>
                  <ColorLabel>页面背景</ColorLabel>
                  <ColorValue>{generatedTheme.bgPrimary}</ColorValue>
                </ColorInfo>
              </ColorItem>
              <ColorItem>
                <ColorSwatch color={generatedTheme.bgSecondary} />
                <ColorInfo>
                  <ColorLabel>卡片背景</ColorLabel>
                  <ColorValue>{generatedTheme.bgSecondary}</ColorValue>
                </ColorInfo>
              </ColorItem>
              <ColorItem>
                <ColorSwatch color={generatedTheme.bgHover} />
                <ColorInfo>
                  <ColorLabel>悬停背景</ColorLabel>
                  <ColorValue>{generatedTheme.bgHover}</ColorValue>
                </ColorInfo>
              </ColorItem>
            </ColorGrid>
          </ColorSection>

          {/* 文字层 */}
          <ColorSection>
            <ColorSectionTitle>文字层</ColorSectionTitle>
            <ColorGrid>
              <ColorItem>
                <ColorSwatch color={generatedTheme.textPrimary} />
                <ColorInfo>
                  <ColorLabel>主文字</ColorLabel>
                  <ColorValue>{generatedTheme.textPrimary}</ColorValue>
                </ColorInfo>
              </ColorItem>
              <ColorItem>
                <ColorSwatch color={generatedTheme.textSecondary} />
                <ColorInfo>
                  <ColorLabel>次文字</ColorLabel>
                  <ColorValue>{generatedTheme.textSecondary}</ColorValue>
                </ColorInfo>
              </ColorItem>
              <ColorItem>
                <ColorSwatch color={generatedTheme.textMuted} />
                <ColorInfo>
                  <ColorLabel>弱化文字</ColorLabel>
                  <ColorValue>{generatedTheme.textMuted}</ColorValue>
                </ColorInfo>
              </ColorItem>
            </ColorGrid>
          </ColorSection>

          {/* 强调层 */}
          <ColorSection>
            <ColorSectionTitle>强调层</ColorSectionTitle>
            <ColorGrid>
              <ColorItem>
                <ColorSwatch color={generatedTheme.accent} />
                <ColorInfo>
                  <ColorLabel>强调色</ColorLabel>
                  <ColorValue>{generatedTheme.accent}</ColorValue>
                </ColorInfo>
              </ColorItem>
              <ColorItem>
                <ColorSwatch color={generatedTheme.accentHover} />
                <ColorInfo>
                  <ColorLabel>强调悬停</ColorLabel>
                  <ColorValue>{generatedTheme.accentHover}</ColorValue>
                </ColorInfo>
              </ColorItem>
              <ColorItem>
                <ColorSwatch color={generatedTheme.accentText} />
                <ColorInfo>
                  <ColorLabel>强调上文字</ColorLabel>
                  <ColorValue>{generatedTheme.accentText}</ColorValue>
                </ColorInfo>
              </ColorItem>
            </ColorGrid>
          </ColorSection>

          {/* 边框和功能层 */}
          <ColorSection>
            <ColorSectionTitle>边框和功能</ColorSectionTitle>
            <ColorGrid>
              <ColorItem>
                <ColorSwatch color={generatedTheme.borderDefault} />
                <ColorInfo>
                  <ColorLabel>普通边框</ColorLabel>
                  <ColorValue>{generatedTheme.borderDefault}</ColorValue>
                </ColorInfo>
              </ColorItem>
              <ColorItem>
                <ColorSwatch color={generatedTheme.borderActive} />
                <ColorInfo>
                  <ColorLabel>激活边框</ColorLabel>
                  <ColorValue>{generatedTheme.borderActive}</ColorValue>
                </ColorInfo>
              </ColorItem>
              <ColorItem>
                <ColorSwatch color={generatedTheme.success} />
                <ColorInfo>
                  <ColorLabel>成功色</ColorLabel>
                  <ColorValue>{generatedTheme.success}</ColorValue>
                </ColorInfo>
              </ColorItem>
              <ColorItem>
                <ColorSwatch color={generatedTheme.glow} />
                <ColorInfo>
                  <ColorLabel>发光色</ColorLabel>
                  <ColorValue>{generatedTheme.glow}</ColorValue>
                </ColorInfo>
              </ColorItem>
            </ColorGrid>
          </ColorSection>

          <ButtonRow>
            <ActionButton variant="primary" onClick={handleApply}>
              应用配色
            </ActionButton>
            <ActionButton variant="secondary" onClick={handleSave}>
              保存主题
            </ActionButton>
          </ButtonRow>
        </PreviewContainer>
      )}
    </Container>
  )
}
