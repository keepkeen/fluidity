import React, { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../services/linkSearch", () => ({
  navigateToLink: vi.fn(),
}))

vi.mock("../../services/optionalPermissions", () => ({
  ensureOriginPermissionsWithStatus: vi.fn(async () => ({
    granted: true,
    newlyGranted: false,
  })),
  resolveRssPermissionOrigins: vi.fn(() => ["https://feed.example/*"]),
}))

vi.mock("../../services/rss", () => ({
  getRssWidgetData: vi.fn(async () => ({
    items: [],
    allItems: [],
    feeds: [],
  })),
  listRssSubscriptions: vi.fn(() => [
    {
      id: "feed-one",
      url: "https://feed.example/rss",
      title: "Feed",
      enabled: true,
      refreshMinutes: 30,
      createdAt: 1,
      updatedAt: 1,
    },
  ]),
  refreshRssSubscriptions: vi.fn(async () => []),
  setRssItemRead: vi.fn(),
  setRssItemsRead: vi.fn(),
  subscribeRss: vi.fn(() => () => undefined),
}))

import { ensureOriginPermissionsWithStatus } from "../../services/optionalPermissions"
import { getRssWidgetData, refreshRssSubscriptions } from "../../services/rss"
import { WidgetInstance } from "../../services/widgetRegistry"
import { RssWidget } from "./RssWidget"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const instance: WidgetInstance = {
  instanceId: "widget:rss:test",
  type: "rss",
  size: "medium",
  config: {
    subscriptionIds: ["feed-one"],
    unreadOnly: true,
    itemLimit: 4,
  },
}

const setVisibility = (value: DocumentVisibilityState): void => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  })
}

describe("RssWidget refresh lifecycle", () => {
  let container: HTMLDivElement
  let root: Root
  let rootMounted: boolean

  beforeEach(() => {
    vi.mocked(refreshRssSubscriptions).mockReset()
    vi.mocked(refreshRssSubscriptions).mockResolvedValue([])
    vi.mocked(getRssWidgetData).mockReset()
    vi.mocked(getRssWidgetData).mockResolvedValue({
      items: [],
      allItems: [],
      feeds: [],
    })
    vi.mocked(ensureOriginPermissionsWithStatus).mockReset()
    vi.mocked(ensureOriginPermissionsWithStatus).mockResolvedValue({
      granted: true,
      newlyGranted: false,
    })
    setVisibility("visible")
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    rootMounted = true
  })

  afterEach(async () => {
    if (rootMounted) await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it("deduplicates automatic triggers and aborts the request when hidden", async () => {
    vi.useFakeTimers()
    let resolveRefresh: (() => void) | undefined
    vi.mocked(refreshRssSubscriptions).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRefresh = () => resolve([])
        })
    )

    await act(async () => {
      root.render(
        <RssWidget
          instance={instance}
          active
          onConfigure={vi.fn()}
          onUndoableAction={vi.fn()}
        />
      )
      await Promise.resolve()
    })
    expect(refreshRssSubscriptions).toHaveBeenCalledTimes(1)
    const signal = vi.mocked(refreshRssSubscriptions).mock.calls[0][1]?.signal

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(refreshRssSubscriptions).toHaveBeenCalledTimes(1)
    expect(ensureOriginPermissionsWithStatus).not.toHaveBeenCalled()

    setVisibility("hidden")
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(signal?.aborted).toBe(true)

    await act(async () => {
      resolveRefresh?.()
      await Promise.resolve()
    })
  })

  it("uses the same cancellable path for manual refresh and inactive pages", async () => {
    vi.mocked(refreshRssSubscriptions).mockResolvedValueOnce([])
    await act(async () => {
      root.render(
        <RssWidget
          instance={instance}
          active
          onConfigure={vi.fn()}
          onUndoableAction={vi.fn()}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    let resolveManual: (() => void) | undefined
    vi.mocked(refreshRssSubscriptions).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveManual = () => resolve([])
        })
    )
    const refreshButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="刷新 RSS"]'
    )
    await act(async () => {
      refreshButton?.click()
      expect(ensureOriginPermissionsWithStatus).toHaveBeenCalledTimes(1)
    })
    expect(refreshRssSubscriptions).toHaveBeenCalledTimes(2)
    const signal = vi.mocked(refreshRssSubscriptions).mock.calls[1][1]?.signal

    await act(async () => {
      root.render(
        <RssWidget
          instance={instance}
          active={false}
          onConfigure={vi.fn()}
          onUndoableAction={vi.fn()}
        />
      )
    })
    expect(signal?.aborted).toBe(true)

    await act(async () => {
      resolveManual?.()
      await Promise.resolve()
    })
  })

  it("aborts an automatic refresh when the widget unmounts", async () => {
    vi.mocked(refreshRssSubscriptions).mockImplementation(
      () => new Promise(() => undefined)
    )
    await act(async () => {
      root.render(
        <RssWidget
          instance={instance}
          active
          onConfigure={vi.fn()}
          onUndoableAction={vi.fn()}
        />
      )
      await Promise.resolve()
    })
    const signal = vi.mocked(refreshRssSubscriptions).mock.calls[0][1]?.signal

    await act(async () => root.unmount())
    rootMounted = false

    expect(signal?.aborted).toBe(true)
  })

  it("finishes loading and shows an error when reading cached data rejects", async () => {
    vi.mocked(getRssWidgetData).mockRejectedValue(new Error("缓存损坏"))

    await act(async () => {
      root.render(
        <RssWidget
          instance={instance}
          active={false}
          onConfigure={vi.fn()}
          onUndoableAction={vi.fn()}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("缓存损坏")
    expect(container.textContent).not.toContain("正在读取订阅缓存")
  })

  it("does not let an older cache load overwrite a newer configuration", async () => {
    let resolveOld: ((value: Awaited<ReturnType<typeof getRssWidgetData>>) => void) | undefined
    vi.mocked(getRssWidgetData)
      .mockImplementationOnce(
        () => new Promise(resolve => {
          resolveOld = resolve
        })
      )
      .mockResolvedValueOnce({
        items: [{
          id: "new-item",
          feedId: "feed-two",
          title: "新订阅内容",
          url: "https://feed.example/new",
          summary: "",
          publishedAt: 2,
          feedTitle: "新订阅",
          read: false,
        }],
        allItems: [],
        feeds: [],
      })

    await act(async () => {
      root.render(
        <RssWidget
          instance={instance}
          active={false}
          onConfigure={vi.fn()}
          onUndoableAction={vi.fn()}
        />
      )
      await Promise.resolve()
    })
    await act(async () => {
      root.render(
        <RssWidget
          instance={{
            ...instance,
            config: { ...instance.config, subscriptionIds: ["feed-two"] },
          }}
          active={false}
          onConfigure={vi.fn()}
          onUndoableAction={vi.fn()}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.textContent).toContain("新订阅内容")

    await act(async () => {
      resolveOld?.({ items: [], allItems: [], feeds: [] })
      await Promise.resolve()
    })
    expect(container.textContent).toContain("新订阅内容")
  })
})
