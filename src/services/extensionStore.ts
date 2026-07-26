export const hasChromeStorage = (): boolean => {
  try {
    return (
      typeof chrome !== "undefined" &&
      Boolean(
        (chrome as unknown as { storage?: { local?: unknown } }).storage?.local
      )
    )
  } catch {
    return false
  }
}

export const getChromeLocal = async <T>(
  key: string
): Promise<T | undefined> => {
  if (!hasChromeStorage()) return undefined
  return await new Promise<T | undefined>(resolve => {
    chrome.storage.local.get([key], result => resolve(result[key] as T))
  })
}

export const setChromeLocal = async (
  key: string,
  value: unknown
): Promise<void> => {
  if (!hasChromeStorage()) return
  await new Promise<void>(resolve => {
    chrome.storage.local.set({ [key]: value }, () => resolve())
  })
}
