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
  border: 2px solid var(--default-color);
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
  color: var(--accent-color);
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
  border: 2px solid var(--default-color);
  color: var(--default-color);
  font-size: 0.9rem;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  &::placeholder {
    color: var(--default-color);
    opacity: 0.5;
  }
`

const CharCount = styled.span`
  font-size: 0.75rem;
  opacity: 0.6;
  float: right;
  margin-top: 4px;
`

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-color);
  border: 2px solid var(--default-color);
  color: var(--default-color);
  font-size: 0.9rem;
  cursor: pointer;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  option {
    background: var(--bg-color);
    color: var(--default-color);
  }
`

const GenerateButton = styled.button`
  width: 100%;
  padding: 12px;
  background: var(--accent-color);
  border: 2px solid var(--default-color);
  color: var(--bg-color);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover:not(:disabled) {
    background: var(--accent-color2);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const PreviewContainer = styled.div`
  margin-top: 16px;
  padding: 16px;
  border: 2px dashed var(--default-color);
`

const PreviewTitle = styled.div`
  font-size: 0.85rem;
  opacity: 0.7;
  margin-bottom: 12px;
`

const ThemeName = styled.div`
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 16px;
`

const ColorGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`

const ColorItem = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const ColorSwatch = styled.div<{ color: string }>`
  width: 32px;
  height: 32px;
  background: ${({ color }) => color};
  border: 2px solid var(--default-color);
  flex-shrink: 0;
`

const ColorInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const ColorLabel = styled.span`
  font-size: 0.75rem;
  opacity: 0.7;
`

const ColorValue = styled.span`
  font-size: 0.85rem;
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
  border: 2px solid var(--default-color);
  background: ${({ variant }) =>
    variant === "primary" ? "var(--accent-color)" : "transparent"};
  color: ${({ variant }) =>
    variant === "primary" ? "var(--bg-color)" : "var(--default-color)"};
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    background: ${({ variant }) =>
      variant === "primary" ? "var(--accent-color2)" : "var(--accent-color)"};
    color: var(--bg-color);
  }
`

const ErrorMessage = styled.div`
  margin-top: 12px;
  padding: 10px 12px;
  border: 2px solid var(--accent-color2);
  background: rgba(255, 100, 100, 0.1);
  font-size: 0.85rem;
  color: var(--accent-color2);
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
      "--bg-color": aiTheme.bgColor,
      "--default-color": aiTheme.defaultColor,
      "--accent-color": aiTheme.accentColor,
      "--accent-color2": aiTheme.accentColor2,
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

          <ColorGrid>
            <ColorItem>
              <ColorSwatch color={generatedTheme.bgColor} />
              <ColorInfo>
                <ColorLabel>背景色</ColorLabel>
                <ColorValue>{generatedTheme.bgColor}</ColorValue>
              </ColorInfo>
            </ColorItem>

            <ColorItem>
              <ColorSwatch color={generatedTheme.defaultColor} />
              <ColorInfo>
                <ColorLabel>文字色</ColorLabel>
                <ColorValue>{generatedTheme.defaultColor}</ColorValue>
              </ColorInfo>
            </ColorItem>

            <ColorItem>
              <ColorSwatch color={generatedTheme.accentColor} />
              <ColorInfo>
                <ColorLabel>强调色 1</ColorLabel>
                <ColorValue>{generatedTheme.accentColor}</ColorValue>
              </ColorInfo>
            </ColorItem>

            <ColorItem>
              <ColorSwatch color={generatedTheme.accentColor2} />
              <ColorInfo>
                <ColorLabel>强调色 2</ColorLabel>
                <ColorValue>{generatedTheme.accentColor2}</ColorValue>
              </ColorInfo>
            </ColorItem>
          </ColorGrid>

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
