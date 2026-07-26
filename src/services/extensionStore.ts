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

export const hasChromeSessionStorage = (): boolean => {
  try {
    return (
      typeof chrome !== "undefined" &&
      Boolean(
        (chrome as unknown as { storage?: { session?: unknown } }).storage
          ?.session
      )
    )
  } catch {
    return false
  }
}

export const getChromeSession = async <T>(
  key: string
): Promise<T | undefined> => {
  if (!hasChromeSessionStorage()) return undefined
  return await new Promise<T | undefined>(resolve => {
    chrome.storage.session.get([key], result => resolve(result[key] as T))
  })
}

export const setChromeSession = async (
  key: string,
  value: unknown
): Promise<void> => {
  if (!hasChromeSessionStorage()) return
  await new Promise<void>(resolve => {
    chrome.storage.session.set({ [key]: value }, () => resolve())
  })
}

export const removeChromeSession = async (key: string): Promise<void> => {
  if (!hasChromeSessionStorage()) return
  await new Promise<void>(resolve => {
    chrome.storage.session.remove(key, () => resolve())
  })
}
