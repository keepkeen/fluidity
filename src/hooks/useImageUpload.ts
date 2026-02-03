import { useState, useRef, useCallback } from "react"

import { LocalImageService } from "../services/localImage"

interface UseImageUploadOptions {
  onSuccess?: (result: { dataUrl: string; fileName: string }) => void
  onError?: (error: Error) => void
  maxSizeMB?: number
}

interface UseImageUploadReturn {
  fileInputRef: React.RefObject<HTMLInputElement>
  isUploading: boolean
  error: string | null
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  triggerFileSelect: () => void
  clearError: () => void
}

/**
 * 统一的图片上传 Hook
 * 处理文件选择、压缩、错误处理等逻辑
 */
export const useImageUpload = (
  options: UseImageUploadOptions = {}
): UseImageUploadReturn => {
  const { onSuccess, onError, maxSizeMB = 2 } = options

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const processFile = useCallback(
    async (file: File) => {
      // 验证文件类型
      if (!file.type.startsWith("image/")) {
        const err = new Error("请选择图片文件")
        setError(err.message)
        onError?.(err)
        return
      }

      // 验证文件大小（原始文件，压缩前）
      const maxBytes = maxSizeMB * 1024 * 1024 * 5
      if (file.size > maxBytes) {
        const sizeLimitMB = maxSizeMB * 5
        const err = new Error(`文件过大，请选择小于 ${sizeLimitMB}MB 的图片`)
        setError(err.message)
        onError?.(err)
        return
      }

      setIsUploading(true)
      setError(null)

      try {
        const result = await LocalImageService.processImage(file)
        onSuccess?.({ dataUrl: result.dataUrl, fileName: file.name })
      } catch (err) {
        const processError =
          err instanceof Error ? err : new Error("图片处理失败")
        setError(processError.message)
        onError?.(processError)
      } finally {
        setIsUploading(false)
        // 清空 input 以便重复选择同一文件
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
      }
    },
    [onSuccess, onError, maxSizeMB]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0]
      if (file) {
        void processFile(file)
      }
    },
    [processFile]
  )

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return {
    fileInputRef,
    isUploading,
    error,
    handleFileSelect,
    triggerFileSelect,
    clearError,
  }
}
