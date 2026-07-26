/**
 * 本地图片处理服务
 * 处理图片上传、压缩和存储
 */

const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2MB (localStorage 限制约 5MB)
const MAX_DIMENSION = 1920 // 最大宽/高
const JPEG_QUALITY = 0.85

export interface ProcessedImage {
  dataUrl: string
  originalSize: number
  compressedSize: number
  width: number
  height: number
}

export const LocalImageService = {
  /**
   * 处理上传的图片文件
   * 自动压缩以适应 localStorage 限制
   */
  async processImage(file: File): Promise<ProcessedImage> {
    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      throw new Error("请选择图片文件")
    }

    const originalSize = file.size

    // 读取图片
    const dataUrl = await this.readFileAsDataUrl(file)

    // 加载到 Image 对象获取尺寸
    const img = await this.loadImage(dataUrl)

    // 如果图片足够小且尺寸合适，直接使用
    if (
      originalSize <= MAX_IMAGE_SIZE &&
      img.width <= MAX_DIMENSION &&
      img.height <= MAX_DIMENSION
    ) {
      return {
        dataUrl,
        originalSize,
        compressedSize: originalSize,
        width: img.width,
        height: img.height,
      }
    }

    // 需要压缩
    const compressed = this.compressImage(img)

    return {
      dataUrl: compressed.dataUrl,
      originalSize,
      compressedSize: compressed.size,
      width: compressed.width,
      height: compressed.height,
    }
  },

  /**
   * 读取文件为 Data URL
   */
  readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error("文件读取失败"))
      reader.readAsDataURL(file)
    })
  },

  /**
   * 加载图片
   */
  loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("图片加载失败"))
      img.src = src
    })
  },

  /**
   * 压缩图片
   */
  compressImage(img: HTMLImageElement): {
    dataUrl: string
    size: number
    width: number
    height: number
  } {
    // 计算新尺寸
    let { width, height } = img

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    // 创建 canvas 进行压缩
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      throw new Error("Canvas 上下文创建失败")
    }

    // 绘制图片
    ctx.drawImage(img, 0, 0, width, height)

    // 尝试不同质量级别直到满足大小限制
    let quality = JPEG_QUALITY
    let dataUrl = canvas.toDataURL("image/jpeg", quality)

    while (this.getDataUrlSize(dataUrl) > MAX_IMAGE_SIZE && quality > 0.3) {
      quality -= 0.1
      dataUrl = canvas.toDataURL("image/jpeg", quality)
    }

    return {
      dataUrl,
      size: this.getDataUrlSize(dataUrl),
      width,
      height,
    }
  },

  /**
   * 计算 Data URL 的大小（字节）
   */
  getDataUrlSize(dataUrl: string): number {
    // Data URL 格式: data:image/jpeg;base64,xxxxx
    const base64 = dataUrl.split(",")[1]
    return Math.round((base64.length * 3) / 4)
  },

  /**
   * 验证图片 URL 是否可访问
   */
  async validateImageUrl(url: string): Promise<boolean> {
    try {
      const img = await this.loadImage(url)
      return img.width > 0 && img.height > 0
    } catch {
      return false
    }
  },

  /**
   * 格式化文件大小
   */
  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  },
}
