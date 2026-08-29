import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./http", () => ({
  fetchWithTimeout: vi.fn(),
}))

import {
  fetchRssSubscription,
  getRssItems,
  normalizeRssUrl,
  parseRssXml,
  readRssCache,
  removeRssSubscription,
  RSS_READ_STATE_KEY,
  setRssItemsRead,
  type RssSubscription,
  writeRssCache,
  writeRssSubscriptions,
} from "./rss"
import { fetchWithTimeout } from "./http"

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchWithTimeout).mockReset()
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

  it("writes bulk read markers in one state update", () => {
    setRssItemsRead(
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
    setRssItemsRead([{ id: "article", feedId: feed.id }], true, 3)

    removeRssSubscription(feed.id, 4)

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
