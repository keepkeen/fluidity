import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./http", () => ({
  fetchWithTimeout: vi.fn(),
}))

import {
  addRssSubscription,
  fetchRssSubscription,
  getRssItems,
  listRssSubscriptions,
  normalizeRssUrl,
  parseRssXml,
  readRssCache,
  readRssSubscriptions,
  refreshRssSubscriptions,
  removeRssSubscription,
  restoreRssSubscription,
  RSS_READ_STATE_KEY,
  setRssItemsRead,
  type RssSubscription,
  updateRssSubscription,
  writeRssCache,
  writeRssSubscriptions,
} from "./rss"
import { fetchWithTimeout } from "./http"

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchWithTimeout).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const subscription = (id: string, url: string): RssSubscription => ({
  id,
  url,
  title: id,
  enabled: true,
  refreshMinutes: 30,
  createdAt: 1,
  updatedAt: 1,
})

const rssResponse = (title: string, itemUrl: string): Response =>
  new Response(
    `<rss version="2.0"><channel><title>${title}</title><item><title>文章</title><link>${itemUrl}</link></item></channel></rss>`,
    { status: 200, headers: { "content-type": "application/rss+xml" } }
  )

describe("RSS parsing and local state", () => {
  it("parses RSS safely, resolves relative links, and strips summary markup", () => {
    const parsed = parseRssXml(
      `<?xml version="1.0"?>
       <rss version="2.0"><channel><title>示例流</title>
       <item><title>第一篇</title><link>/posts/1</link>
       <description><![CDATA[<b>摘要</b> 内容]]></description>
       <pubDate>Wed, 19 Aug 2026 01:00:00 GMT</pubDate></item>
       </channel></rss>`,
      "https://feed.example.com/rss.xml",
      "feed-1",
      1_800_000_000_000
    )

    expect(parsed.title).toBe("示例流")
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]).toMatchObject({
      title: "第一篇",
      url: "https://feed.example.com/posts/1",
      summary: "摘要 内容",
    })
  })

  it("parses Atom namespaced elements without rendering remote HTML", () => {
    const parsed = parseRssXml(
      `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom 流</title>
       <entry><title>更新</title><link href="https://example.com/a" />
       <content type="html">&lt;img src=x&gt;正文</content>
       <updated>2026-08-19T01:00:00Z</updated></entry></feed>`,
      "https://example.com/feed",
      "feed-2"
    )
    expect(parsed.items[0].summary).toBe("正文")
    expect(parsed.items[0].summary).not.toContain("img")
  })

  it("accepts secure URLs, rejects insecure remote URLs and credentials", () => {
    expect(normalizeRssUrl("https://example.com/feed#top")).toBe(
      "https://example.com/feed"
    )
    expect(normalizeRssUrl("http://localhost:3000/feed")).toBe(
      "http://localhost:3000/feed"
    )
    expect(() => normalizeRssUrl("http://[::1]:3000/feed")).toThrow("HTTPS")
    expect(() => normalizeRssUrl("http://example.com/feed")).toThrow("HTTPS")
    expect(() => normalizeRssUrl("https://user:pass@example.com/feed")).toThrow(
      "账号或密码"
    )
  })

  it("writes bulk read markers in one state update", async () => {
    await setRssItemsRead(
      [
        { id: "one", feedId: "feed" },
        { id: "two", feedId: "feed" },
      ],
      true,
      123
    )
    expect(JSON.parse(localStorage.getItem(RSS_READ_STATE_KEY) ?? "{}"))
      .toEqual({
        one: { read: true, updatedAt: 123, feedId: "feed" },
        two: { read: true, updatedAt: 123, feedId: "feed" },
      })
  })

  it("keeps both feed updates when different subscriptions refresh concurrently", async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(rssResponse("订阅一", "https://one.example/article"))
      .mockResolvedValueOnce(rssResponse("订阅二", "https://two.example/article"))

    const first = subscription("feed-one", "https://one.example/rss")
    const second = subscription("feed-two", "https://two.example/rss")
    await Promise.all([
      fetchRssSubscription(first, { force: true, now: 100 }),
      fetchRssSubscription(second, { force: true, now: 100 }),
    ])

    const cache = await readRssCache()
    expect(Object.keys(cache.feeds).sort()).toEqual(["feed-one", "feed-two"])
    expect(cache.feeds["feed-one"].title).toBe("订阅一")
    expect(cache.feeds["feed-two"].title).toBe("订阅二")
  })

  it("serializes interleaved read-state and cache read-modify-writes with Web Locks", async () => {
    const lockTails = new Map<string, Promise<unknown>>()
    const request = vi.fn(
      <T,>(name: string, operation: () => T | Promise<T>): Promise<T> => {
        const previous = lockTails.get(name) ?? Promise.resolve()
        const current = previous.then(operation, operation)
        lockTails.set(name, current.catch(() => undefined))
        return current
      }
    )
    vi.stubGlobal("navigator", { locks: { request } })
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(rssResponse("订阅一", "https://one.example/article"))
      .mockResolvedValueOnce(rssResponse("订阅二", "https://two.example/article"))

    await Promise.all([
      setRssItemsRead([{ id: "item-one", feedId: "feed-one" }], true, 10),
      setRssItemsRead([{ id: "item-two", feedId: "feed-two" }], true, 11),
      fetchRssSubscription(subscription("feed-one", "https://one.example/rss"), {
        force: true,
        now: 10,
      }),
      fetchRssSubscription(subscription("feed-two", "https://two.example/rss"), {
        force: true,
        now: 11,
      }),
    ])

    expect(Object.keys(JSON.parse(
      localStorage.getItem(RSS_READ_STATE_KEY) ?? "{}"
    )).sort()).toEqual(["item-one", "item-two"])
    expect(Object.keys((await readRssCache()).feeds).sort()).toEqual([
      "feed-one",
      "feed-two",
    ])
    expect(request.mock.calls.filter(([name]) => name === "fluidity:rss-read-state"))
      .toHaveLength(2)
    expect(request.mock.calls.filter(([name]) => name === "fluidity:rss-cache"))
      .toHaveLength(2)
  })

  it("re-reads the latest subscription store when two feeds are added concurrently", async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(rssResponse("订阅一", "https://one.example/article"))
      .mockResolvedValueOnce(rssResponse("订阅二", "https://two.example/article"))

    const [first, second] = await Promise.all([
      addRssSubscription("https://one.example/rss", 100),
      addRssSubscription("https://two.example/rss", 101),
    ])

    const subscriptions = readRssSubscriptions().subscriptions
    expect(Object.keys(subscriptions).sort()).toEqual(
      [first.id, second.id].sort()
    )
    expect(subscriptions[first.id].title).toBe("订阅一")
    expect(subscriptions[second.id].title).toBe("订阅二")
  })

  it("uses the same Web Lock for every subscription read-modify-write", async () => {
    const request = vi.fn(
      async <T,>(_name: string, operation: () => T | Promise<T>): Promise<T> =>
        operation()
    )
    vi.stubGlobal("navigator", { locks: { request } })
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      rssResponse("订阅", "https://lock.example/article")
    )

    const added = await addRssSubscription("https://lock.example/rss", 100)
    await updateRssSubscription(added.id, { refreshMinutes: 60 }, 101)
    await removeRssSubscription(added.id, 102)
    await restoreRssSubscription(added.id, 103)

    expect(request.mock.calls.map(([name]) => name).filter(
      name => name === "fluidity:rss-subscriptions"
    )).toEqual(
      Array(4).fill("fluidity:rss-subscriptions")
    )
    expect(request).toHaveBeenCalledWith(
      "fluidity:rss-read-state",
      expect.any(Function)
    )
    expect(request).toHaveBeenCalledWith(
      "fluidity:rss-cache",
      expect.any(Function)
    )
  })

  it("rolls back a newly granted host permission when feed validation fails", async () => {
    const contains = vi.fn().mockResolvedValue(false)
    const request = vi.fn().mockResolvedValue(true)
    const remove = vi.fn().mockResolvedValue(true)
    vi.stubGlobal("chrome", {
      runtime: { id: "extension-id" },
      permissions: { contains, request, remove },
    })
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      new Response("not an rss feed", { status: 200 })
    )

    await expect(
      addRssSubscription("https://broken.example/rss", 100)
    ).rejects.toThrow("无法解析")

    expect(remove).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith({
      origins: ["https://broken.example/*"],
    })
    expect(listRssSubscriptions()).toEqual([])
  })

  it("reports when a newly granted permission cannot be rolled back", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "extension-id" },
      permissions: {
        contains: vi.fn().mockResolvedValue(false),
        request: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(false),
      },
    })
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      new Response("not an rss feed", { status: 200 })
    )

    await expect(
      addRssSubscription("https://rollback-fails.example/rss", 100)
    ).rejects.toThrow("域名权限未能撤回")
  })

  it("never removes a pre-existing host permission after validation fails", async () => {
    const contains = vi.fn().mockResolvedValue(true)
    const request = vi.fn().mockResolvedValue(true)
    const remove = vi.fn().mockResolvedValue(true)
    vi.stubGlobal("chrome", {
      runtime: { id: "extension-id" },
      permissions: { contains, request, remove },
    })
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      new Response("not an rss feed", { status: 200 })
    )

    await expect(
      addRssSubscription("https://existing.example/rss", 100)
    ).rejects.toThrow("无法解析")

    expect(request).toHaveBeenCalledOnce()
    expect(remove).not.toHaveBeenCalled()
  })

  it("keeps a newly granted host permission needed by another subscription", async () => {
    const contains = vi.fn().mockResolvedValue(false)
    const request = vi.fn().mockResolvedValue(true)
    const remove = vi.fn().mockResolvedValue(true)
    vi.stubGlobal("chrome", {
      runtime: { id: "extension-id" },
      permissions: { contains, request, remove },
    })
    const existing = subscription(
      "existing-same-origin",
      "https://shared.example/working.xml"
    )
    writeRssSubscriptions({
      version: 1,
      subscriptions: { [existing.id]: existing },
    })
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      new Response("not an rss feed", { status: 200 })
    )

    await expect(
      addRssSubscription("https://shared.example/broken.xml", 100)
    ).rejects.toThrow("无法解析")

    expect(remove).not.toHaveBeenCalled()
    expect(listRssSubscriptions().map(item => item.id)).toEqual([existing.id])
  })

  it("keeps a host permission while another active feed still uses its origin", async () => {
    const remove = vi.fn().mockResolvedValue(true)
    vi.stubGlobal("chrome", {
      runtime: { id: "extension-id" },
      permissions: { remove },
    })
    const first = subscription("same-origin-one", "https://same.example/one.xml")
    const second = subscription("same-origin-two", "https://same.example/two.xml")
    writeRssSubscriptions({
      version: 1,
      subscriptions: { [first.id]: first, [second.id]: second },
    })

    await removeRssSubscription(first.id, 100)
    expect(remove).not.toHaveBeenCalled()
    expect(listRssSubscriptions().map(item => item.id)).toEqual([second.id])

    await removeRssSubscription(second.id, 101)
    expect(remove).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith({
      origins: ["https://same.example/*"],
    })
  })

  it("reports a failed permission removal after completing subscription cleanup", async () => {
    const remove = vi.fn().mockResolvedValue(false)
    vi.stubGlobal("chrome", {
      runtime: { id: "extension-id" },
      permissions: { remove },
    })
    const feed = subscription("remove-fails", "https://remove-fails.example/rss")
    writeRssSubscriptions({ version: 1, subscriptions: { [feed.id]: feed } })

    await expect(removeRssSubscription(feed.id, 100)).rejects.toThrow(
      "订阅已移除，但域名访问权限未能撤回"
    )
    expect(listRssSubscriptions()).toEqual([])
  })

  it("rolls back a restore grant only when no same-origin subscription uses it", async () => {
    const contains = vi.fn().mockResolvedValue(false)
    const requestPermission = vi.fn().mockResolvedValue(true)
    const remove = vi.fn().mockResolvedValue(true)
    vi.stubGlobal("chrome", {
      runtime: { id: "extension-id" },
      permissions: { contains, request: requestPermission, remove },
    })
    const deleted = {
      ...subscription("restore-race", "https://restore.example/deleted.xml"),
      enabled: false,
      deletedAt: 10,
    }
    const originalSetItem = Storage.prototype.setItem
    let failNextSubscriptionWrite = false
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value
    ) {
      if (failNextSubscriptionWrite && key === "fluidity.rss.subscriptions.v1") {
        failNextSubscriptionWrite = false
        throw new Error("subscription write failed")
      }
      return originalSetItem.call(this, key, value)
    })
    writeRssSubscriptions(
      { version: 1, subscriptions: { [deleted.id]: deleted } },
      50
    )

    failNextSubscriptionWrite = true
    await expect(restoreRssSubscription(deleted.id, 100)).rejects.toThrow(
      "subscription write failed"
    )
    expect(remove).toHaveBeenCalledWith({
      origins: ["https://restore.example/*"],
    })

    const active = subscription("same-origin-active", "https://restore.example/active.xml")
    writeRssSubscriptions({
      version: 1,
      subscriptions: { [deleted.id]: deleted, [active.id]: active },
    }, 51)
    failNextSubscriptionWrite = true
    await expect(restoreRssSubscription(deleted.id, 101)).rejects.toThrow(
      "subscription write failed"
    )
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it("limits bulk refresh concurrency and persists the cache once", async () => {
    const feeds = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => {
        const feed = subscription(
          `feed-${index}`,
          `https://feed-${index}.example/rss`
        )
        return [feed.id, feed]
      })
    )
    writeRssSubscriptions({ version: 1, subscriptions: feeds })
    let active = 0
    let maximum = 0
    vi.mocked(fetchWithTimeout).mockImplementation(async input => {
      active += 1
      maximum = Math.max(maximum, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active -= 1
      return rssResponse("订阅", String(input).replace("/rss", "/item"))
    })
    const setItem = vi.spyOn(Storage.prototype, "setItem")

    await refreshRssSubscriptions(Object.keys(feeds), { force: true })

    expect(maximum).toBeLessThanOrEqual(4)
    const cacheWrites = setItem.mock.calls.filter(
      ([key]) => key === "fluidity.rss.cache.v1.web"
    )
    expect(cacheWrites).toHaveLength(1)
  })

  it("never lets retained tombstones displace live subscriptions", () => {
    const live = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => {
        const feed = subscription(
          `live-${index}`,
          `https://live-${index}.example/rss`
        )
        return [feed.id, feed]
      })
    )
    const tombstones = Object.fromEntries(
      Array.from({ length: 80 }, (_, index) => {
        const deletedAt = 10_000 + index
        const feed = {
          ...subscription(
            `deleted-${index}`,
            `https://deleted-${index}.example/rss`
          ),
          enabled: false,
          deletedAt,
          updatedAt: deletedAt,
        }
        return [feed.id, feed]
      })
    )

    writeRssSubscriptions(
      { version: 1, subscriptions: { ...live, ...tombstones } },
      20_000
    )

    const persisted = readRssSubscriptions().subscriptions
    expect(Object.keys(persisted)).toHaveLength(80)
    expect(Object.keys(live).every(id => persisted[id] && !persisted[id].deletedAt))
      .toBe(true)
  })

  it("removes device cache and read markers when a subscription is deleted", async () => {
    const feed = subscription("feed-delete", "https://delete.example/rss")
    writeRssSubscriptions({ version: 1, subscriptions: { [feed.id]: feed } })
    await writeRssCache({
      version: 1,
      feeds: {
        [feed.id]: {
          feedId: feed.id,
          title: feed.title,
          fetchedAt: 1,
          nextRefreshAt: 2,
          failureCount: 0,
          items: [],
        },
      },
    })
    await setRssItemsRead([{ id: "article", feedId: feed.id }], true, 3)

    await removeRssSubscription(feed.id, 4)

    await vi.waitFor(async () => {
      expect((await readRssCache()).feeds[feed.id]).toBeUndefined()
    })
    expect(JSON.parse(localStorage.getItem(RSS_READ_STATE_KEY) ?? "{}"))
      .toEqual({})
  })

  it("does not surface cached items from disabled subscriptions", async () => {
    const enabled = subscription("feed-enabled", "https://enabled.example/rss")
    const disabled = {
      ...subscription("feed-disabled", "https://disabled.example/rss"),
      enabled: false,
    }
    writeRssSubscriptions({
      version: 1,
      subscriptions: { [enabled.id]: enabled, [disabled.id]: disabled },
    })
    await writeRssCache({
      version: 1,
      feeds: {
        [enabled.id]: {
          feedId: enabled.id,
          title: enabled.title,
          fetchedAt: 1,
          nextRefreshAt: 2,
          failureCount: 0,
          items: [
            {
              id: "enabled-item",
              feedId: enabled.id,
              title: "保留",
              url: "https://enabled.example/item",
              summary: "",
              publishedAt: 2,
            },
          ],
        },
        [disabled.id]: {
          feedId: disabled.id,
          title: disabled.title,
          fetchedAt: 1,
          nextRefreshAt: 2,
          failureCount: 0,
          items: [
            {
              id: "disabled-item",
              feedId: disabled.id,
              title: "不应显示",
              url: "https://disabled.example/item",
              summary: "",
              publishedAt: 3,
            },
          ],
        },
      },
    })

    const items = await getRssItems([enabled.id, disabled.id], {
      unreadOnly: false,
    })
    expect(items.map(item => item.id)).toEqual(["enabled-item"])
  })

  it("cancels a chunked response as soon as it exceeds 2 MB", async () => {
    const cancel = vi.fn()
    const oversizedChunk = new Uint8Array(2 * 1024 * 1024 + 1)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversizedChunk)
      },
      cancel,
    })
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      })
    )

    const result = await fetchRssSubscription(
      subscription("feed-large", "https://large.example/rss"),
      { force: true, now: 100 }
    )

    expect(cancel).toHaveBeenCalledOnce()
    expect(result.items).toEqual([])
    expect(result.error).toContain("超过 2 MB")
  })
})
