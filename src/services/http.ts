export interface FetchWithTimeoutOptions {
  timeoutMs?: number
  retries?: number
  retryDelayMs?: number
  retryStatuses?: number[]
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RETRIES = 1
const DEFAULT_RETRY_DELAY_MS = 800
const DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504]

const createAbortError = (): DOMException =>
  new DOMException("请求已取消", "AbortError")

const delay = (ms: number, signal?: AbortSignal | null): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError())
      return
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort)
      resolve()
    }, ms)
    const handleAbort = () => {
      clearTimeout(timer)
      reject(createAbortError())
    }
    signal?.addEventListener("abort", handleAbort, { once: true })
  })

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError"

const keepResponseBodyAbortable = (
  response: Response,
  cleanup: () => void,
  timeoutError: () => Error | null
): Response => {
  if (!response.body) {
    cleanup()
    return response
  }

  const reader = response.body.getReader()
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    cleanup()
  }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (chunk.done) {
          finish()
          controller.close()
          return
        }
        controller.enqueue(chunk.value)
      } catch (error) {
        const timeout = timeoutError()
        finish()
        controller.error(timeout ?? error)
      }
    },
    async cancel(reason) {
      finish()
      await reader.cancel(reason)
    },
  })

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchWithTimeoutOptions = {}
): Promise<Response> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = options.retries ?? DEFAULT_RETRIES
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const retryStatuses = options.retryStatuses ?? DEFAULT_RETRY_STATUSES

  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (init.signal?.aborted) throw createAbortError()

    const controller = new AbortController()
    const canCombineSignals = typeof AbortSignal.any === "function"
    const handleExternalAbort = canCombineSignals
      ? null
      : () => controller.abort()
    if (handleExternalAbort) {
      init.signal?.addEventListener("abort", handleExternalAbort, {
        once: true,
      })
    }
    const requestSignal = init.signal
      ? canCombineSignals
        ? AbortSignal.any([controller.signal, init.signal])
        : controller.signal
      : controller.signal
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    let responseReturned = false
    const cleanup = () => {
      clearTimeout(timer)
      if (handleExternalAbort) {
        init.signal?.removeEventListener("abort", handleExternalAbort)
      }
    }

    try {
      const response = await fetch(input, {
        ...init,
        signal: requestSignal,
      })

      if (
        !response.ok &&
        attempt < retries &&
        retryStatuses.includes(response.status)
      ) {
        await response.body?.cancel().catch(() => undefined)
        await delay(retryDelayMs * (attempt + 1), init.signal)
        continue
      }

      // Keep the caller signal connected to the response body. fetch resolves
      // after headers, while response.json()/text() may still be streaming.
      responseReturned = true
      return keepResponseBodyAbortable(
        response,
        cleanup,
        () =>
          timedOut ? new Error(`请求超时（>${timeoutMs}ms）`) : null
      )
    } catch (error) {
      lastError = error
      if (init.signal?.aborted) throw createAbortError()
      if (attempt >= retries) break
      await delay(retryDelayMs * (attempt + 1), init.signal)
    } finally {
      if (!responseReturned) cleanup()
    }
  }

  if (isAbortError(lastError)) {
    throw new Error(`请求超时（>${timeoutMs}ms）`)
  }

  throw lastError instanceof Error ? lastError : new Error("网络请求失败")
}
