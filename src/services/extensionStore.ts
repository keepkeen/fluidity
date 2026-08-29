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

const getRuntimeStorageError = (): Error | null => {
  try {
    const message = chrome.runtime?.lastError?.message
    return message ? new Error(message) : null
  } catch {
    return null
  }
}

export const getChromeLocal = async <T>(
  key: string
): Promise<T | undefined> => {
  if (!hasChromeStorage()) return undefined
  return await new Promise<T | undefined>((resolve, reject) => {
    chrome.storage.local.get([key], result => {
      const error = getRuntimeStorageError()
      if (error) {
        reject(error)
        return
      }
      resolve(result[key] as T)
    })
  })
}

export const setChromeLocal = async (
  key: string,
  value: unknown
): Promise<void> => {
  if (!hasChromeStorage()) return
  await new Promise<void>((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      const error = getRuntimeStorageError()
      if (error) reject(error)
      else resolve()
    })
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
  return await new Promise<T | undefined>((resolve, reject) => {
    chrome.storage.session.get([key], result => {
      const error = getRuntimeStorageError()
      if (error) {
        reject(error)
        return
      }
      resolve(result[key] as T)
    })
  })
}

export const setChromeSession = async (
  key: string,
  value: unknown
): Promise<void> => {
  if (!hasChromeSessionStorage()) return
  await new Promise<void>((resolve, reject) => {
    chrome.storage.session.set({ [key]: value }, () => {
      const error = getRuntimeStorageError()
      if (error) reject(error)
      else resolve()
    })
  })
}

export const removeChromeSession = async (key: string): Promise<void> => {
  if (!hasChromeSessionStorage()) return
  await new Promise<void>((resolve, reject) => {
    chrome.storage.session.remove(key, () => {
      const error = getRuntimeStorageError()
      if (error) reject(error)
      else resolve()
    })
  })
}
