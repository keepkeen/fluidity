import React, { useCallback, useEffect, useState } from "react"

import { css, keyframes } from "@emotion/react"
import styled from "@emotion/styled"
import {
  faArrowRight,
  faCheck,
  faCog,
  faKeyboard,
  faMagicWandSparkles,
  faPalette,
  faRocket,
  faTimes,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

const ONBOARDING_KEY = "fluidity-onboarding-completed"

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`

const slideUp = keyframes`
  from {
    opacity: 0;
    transform: translate(-50%, -50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) translateY(0);
  }
`

const fadeOut = keyframes`
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
`

const Overlay = styled.div<{ closing: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 200;
  animation: ${({ closing }) =>
    closing
      ? css`
          ${fadeOut} 0.3s ease-out forwards
        `
      : css`
          ${fadeIn} 0.3s ease-out
        `};
`

const ModalContainer = styled.div<{ closing: boolean }>`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: calc(100% - 40px);
  max-width: 600px;
  max-height: calc(100vh - 40px);
  z-index: 201;
  animation: ${({ closing }) =>
    closing
      ? css`
          ${fadeOut} 0.3s ease-out forwards
        `
      : css`
          ${slideUp} 0.4s ease-out
        `};
`

const ModalContent = styled.div`
  background: var(--bg-color);
  border: 2px solid var(--default-color);
  box-shadow: 10px 10px 0px var(--accent-color);
  padding: 32px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;

  @media screen and (max-width: 600px) {
    padding: 20px;
    box-shadow: 5px 5px 0px var(--accent-color);
  }
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
`

const Title = styled.h1`
  margin: 0;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  gap: 12px;

  @media screen and (max-width: 600px) {
    font-size: 1.2rem;
  }
`

const TitleIcon = styled.span`
  color: var(--accent-color);
  font-size: 1.3rem;
`

const CloseButton = styled.button`
  background: transparent;
  border: 2px solid var(--border-color);
  color: var(--default-color);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    background: var(--accent-color2);
    color: var(--bg-color);
    border-color: var(--accent-color2);
  }
`

const StepIndicator = styled.div`
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
`

// eslint-disable-next-line sonarjs/no-duplicate-string
const ACCENT_COLOR_VAR = "var(--accent-color)"

const StepDot = styled.button<{ active: boolean; completed: boolean }>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--default-color);
  background: ${({ active, completed }) =>
    active
      ? ACCENT_COLOR_VAR
      : completed
      ? "var(--default-color)"
      : "transparent"};
  cursor: pointer;
  padding: 0;
  transition: 0.2s;

  &:hover {
    transform: scale(1.2);
  }
`

const StepContent = styled.div`
  min-height: 280px;
  display: flex;
  flex-direction: column;
`

const StepDescription = styled.p`
  font-size: 0.95rem;
  line-height: 1.6;
  margin: 0 0 20px 0;
  color: var(--secondary-color);
`

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 20px 0;
`

const FeatureItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px dashed var(--border-color);

  &:last-child {
    border-bottom: none;
  }
`

const FeatureIcon = styled.span`
  color: var(--accent-color);
  font-size: 1.1rem;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
`

const FeatureText = styled.div`
  flex: 1;
`

const FeatureTitle = styled.div`
  font-weight: 600;
  margin-bottom: 4px;
`

const FeatureDesc = styled.div`
  font-size: 0.85rem;
  color: var(--secondary-color);
`

const ButtonRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  padding-top: 20px;
`

const Button = styled.button<{ variant?: "primary" | "secondary" }>`
  padding: 12px 24px;
  border: 2px solid var(--default-color);
  background: ${({ variant }) =>
    variant === "primary" ? "var(--accent-color)" : "transparent"};
  color: ${({ variant }) =>
    variant === "primary" ? "var(--bg-color)" : "var(--default-color)"};
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    background: ${({ variant }) =>
      variant === "primary" ? "var(--accent-color2)" : "var(--accent-color)"};
    color: var(--bg-color);
  }
`

const SkipButton = styled.button`
  background: transparent;
  border: none;
  color: var(--secondary-color);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 8px;

  &:hover {
    color: var(--default-color);
    text-decoration: underline;
  }
`

const KeyboardHint = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.85rem;
`

interface Step {
  title: string
  icon: typeof faRocket
  description: string
  features: {
    icon: typeof faCog
    title: string
    desc: string
  }[]
}

const steps: Step[] = [
  {
    title: "欢迎使用 Fluidity",
    icon: faRocket,
    description:
      "Fluidity 是一款优雅的浏览器起始页，让你的新标签页更加高效和美观。",
    features: [
      {
        icon: faPalette,
        title: "手风琴式链接",
        desc: "经典的水平展开设计，鼠标悬停即可展开链接分组，支持音效反馈",
      },
      {
        icon: faKeyboard,
        title: "快捷搜索",
        desc: "直接在搜索栏输入关键词搜索，支持多搜索引擎和快捷词跳转",
      },
      {
        icon: faMagicWandSparkles,
        title: "AI 智能助手",
        desc: "配置 API Key 后，可使用 AI 问候语、主题生成、链接整理等功能",
      },
    ],
  },
  {
    title: "个性化设置",
    icon: faPalette,
    description: "点击右下角的设置图标，可以自定义你的起始页。",
    features: [
      {
        icon: faPalette,
        title: "外观设置",
        desc: "选择 13+ 预设主题，或自定义 6 种颜色变量和背景图片",
      },
      {
        icon: faCog,
        title: "链接设置",
        desc: "编辑链接分组，支持 JSON 格式导入导出，AI 智能整理",
      },
      {
        icon: faMagicWandSparkles,
        title: "AI 助手设置",
        desc: "配置 DeepSeek API Key，控制数据收集和隐私选项",
      },
    ],
  },
  {
    title: "高效使用技巧",
    icon: faKeyboard,
    description: "掌握这些技巧，让你的浏览更加高效。",
    features: [
      {
        icon: faKeyboard,
        title: "快捷词跳转",
        desc: "在搜索栏输入预设的快捷词（如 github、youtube）直接跳转",
      },
      {
        icon: faCog,
        title: "待办事项",
        desc: "左侧轮播图可切换到待办事项面板，记录和管理你的任务",
      },
      {
        icon: faPalette,
        title: "数据备份",
        desc: "在数据设置中导出配置，轻松迁移到其他设备",
      },
    ],
  },
]

export const Onboarding: React.FC = () => {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_KEY)
    if (!completed) {
      setVisible(true)
    }
  }, [])

  const handleClose = useCallback(() => {
    setClosing(true)
    localStorage.setItem(ONBOARDING_KEY, "true")
    setTimeout(() => {
      setVisible(false)
    }, 300)
  }, [])

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleClose()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkip = () => {
    handleClose()
  }

  // ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && visible) {
        handleClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [visible, handleClose])

  if (!visible) {
    return null
  }

  const step = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1

  return (
    <>
      <Overlay closing={closing} onClick={handleSkip} />
      <ModalContainer closing={closing}>
        <ModalContent>
          <Header>
            <Title>
              <TitleIcon>
                <FontAwesomeIcon icon={step.icon} />
              </TitleIcon>
              {step.title}
            </Title>
            <CloseButton onClick={handleClose} aria-label="关闭">
              <FontAwesomeIcon icon={faTimes} />
            </CloseButton>
          </Header>

          <StepIndicator>
            {steps.map((s, index) => (
              <StepDot
                key={s.title}
                active={index === currentStep}
                completed={index < currentStep}
                onClick={() => setCurrentStep(index)}
                aria-label={`步骤 ${index + 1}`}
              />
            ))}
          </StepIndicator>

          <StepContent>
            <StepDescription>{step.description}</StepDescription>

            <FeatureList>
              {step.features.map(feature => (
                <FeatureItem key={feature.title}>
                  <FeatureIcon>
                    <FontAwesomeIcon icon={feature.icon} />
                  </FeatureIcon>
                  <FeatureText>
                    <FeatureTitle>{feature.title}</FeatureTitle>
                    <FeatureDesc>{feature.desc}</FeatureDesc>
                  </FeatureText>
                </FeatureItem>
              ))}
            </FeatureList>

            {currentStep === 2 && (
              <div style={{ marginTop: "auto" }}>
                <StepDescription style={{ marginBottom: "8px" }}>
                  提示：按 <KeyboardHint>Esc</KeyboardHint> 可随时关闭弹窗
                </StepDescription>
              </div>
            )}

            <ButtonRow>
              <div>
                {currentStep > 0 ? (
                  <Button onClick={handlePrev}>上一步</Button>
                ) : (
                  <SkipButton onClick={handleSkip}>跳过引导</SkipButton>
                )}
              </div>
              <Button variant="primary" onClick={handleNext}>
                {isLastStep ? (
                  <>
                    开始使用 <FontAwesomeIcon icon={faCheck} />
                  </>
                ) : (
                  <>
                    下一步 <FontAwesomeIcon icon={faArrowRight} />
                  </>
                )}
              </Button>
            </ButtonRow>
          </StepContent>
        </ModalContent>
      </ModalContainer>
    </>
  )
}
