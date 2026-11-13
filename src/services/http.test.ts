import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchWithTimeout } from "./http"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("fetchWithTimeout cancellation", () => {
  it("does not start a request when the caller signal is already aborted", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
    const controller = new AbortController()
    controller.abort()

    await expect(
      fetchWithTimeout("https://example.com", { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("aborts an active request without retrying it", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true }
          )
        })
      )
    const controller = new AbortController()
    const request = fetchWithTimeout(
      "https://example.com",
      { signal: controller.signal },
      { retries: 2 }
    )

    controller.abort()

    await expect(request).rejects.toMatchObject({ name: "AbortError" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("keeps caller cancellation connected while the response body streams", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(streamController) {
          init?.signal?.addEventListener(
            "abort",
            () =>
              streamController.error(
                new DOMException("cancelled", "AbortError")
              ),
            { once: true }
          )
        },
      })
      return Promise.resolve(new Response(stream))
    })
    const controller = new AbortController()
    const response = await fetchWithTimeout("https://example.com", {
      signal: controller.signal,
    })
    const body = response.text()

    controller.abort()

    await expect(body).rejects.toMatchObject({ name: "AbortError" })
  })

  it("keeps the timeout active until the response body finishes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(streamController) {
          init?.signal?.addEventListener(
            "abort",
            () =>
              streamController.error(
                new DOMException("timed out", "AbortError")
              ),
            { once: true }
          )
        },
      })
      return Promise.resolve(new Response(stream))
    })
    const response = await fetchWithTimeout(
      "https://example.com",
      {},
      { timeoutMs: 10, retries: 0 }
    )

    await expect(response.text()).rejects.toThrow("请求超时")
  })
})
