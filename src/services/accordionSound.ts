/**
 * 手风琴音效服务
 * 根据手风琴高度播放对应音符
 */

// 音符频率映射（C4 到 B4 的音阶）
const NOTE_FREQUENCIES: Record<string, number> = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
}

const NOTES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]

// 存储键
const SOUND_ENABLED_KEY = "accordion-sound-enabled"

// AudioContext 单例
let audioContext: AudioContext | null = null

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  return audioContext
}

/**
 * 根据填充百分比获取对应的音符
 */
const getNoteForPercent = (percent: number): string => {
  // 将百分比映射到音符索引 (0-100% -> 0-7)
  const index = Math.min(
    Math.floor((percent / 100) * NOTES.length),
    NOTES.length - 1
  )
  return NOTES[index]
}

/**
 * 播放音符
 */
const playNote = (note: string, duration = 0.3): void => {
  try {
    const ctx = getAudioContext()
    const frequency = NOTE_FREQUENCIES[note]
    if (!frequency) return

    // 创建振荡器
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    // 设置音色（正弦波，类似手风琴的柔和音色）
    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)

    // 设置音量包络（淡入淡出）
    gainNode.gain.setValueAtTime(0, ctx.currentTime)
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05)
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration)

    // 播放
    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + duration)
  } catch {
    // 忽略音频播放错误
  }
}

/**
 * 手风琴音效服务
 */
export const AccordionSoundService = {
  /**
   * 检查音效是否启用
   * 默认开启，只有明确设置为 "false" 时才关闭
   */
  isEnabled(): boolean {
    try {
      const stored = localStorage.getItem(SOUND_ENABLED_KEY)
      // 默认开启：只有明确设置为 "false" 时才关闭
      return stored !== "false"
    } catch {
      return true
    }
  },

  /**
   * 设置音效启用状态
   */
  setEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(SOUND_ENABLED_KEY, String(enabled))
    } catch {
      // 忽略存储错误
    }
  },

  /**
   * 切换音效状态
   */
  toggle(): boolean {
    const newState = !this.isEnabled()
    this.setEnabled(newState)
    return newState
  },

  /**
   * 根据填充百分比播放音符
   */
  playForPercent(percent: number): void {
    if (!this.isEnabled()) return
    const note = getNoteForPercent(percent)
    playNote(note)
  },

  /**
   * 获取音符名称（用于动画显示）
   */
  getNoteForPercent(percent: number): string {
    return getNoteForPercent(percent)
  },
}
