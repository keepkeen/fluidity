import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  changeHomePageShortcutDraft,
  createHomeLayoutResetDraft,
} from "./homeLayoutDraft"
import { getDefaultHomeLayout } from "../../../services/homeLayout"

const write = vi.fn()

beforeEach(() => {
  write.mockReset()
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: write,
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: () => null,
    length: 0,
  } satisfies Storage)
})

describe("home layout settings drafts", () => {
  it("changes shortcut and resets layout without writing live storage", () => {
    const saved = {
      ...getDefaultHomeLayout(),
      order: ["app:https://example.com"],
      pageShortcutModifier: "alt" as const,
    }

    const shortcutDraft = changeHomePageShortcutDraft(saved, "shift")
    const resetDraft = createHomeLayoutResetDraft()

    expect(shortcutDraft.pageShortcutModifier).toBe("shift")
    expect(saved.pageShortcutModifier).toBe("alt")
    expect(resetDraft.order).not.toContain("app:https://example.com")
    expect(write).not.toHaveBeenCalled()
  })
})
