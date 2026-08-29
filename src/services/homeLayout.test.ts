import { beforeEach, describe, expect, it } from "vitest"

import {
  addWidgetInstance,
  HOME_LAYOUT_KEY,
  LEGACY_HOME_LAYOUT_KEY,
  readHomeLayout,
  removeWidgetInstance,
  WIDGET_REDISCOVERY,
  WIDGET_SCREEN_TIME,
} from "./homeLayout"

beforeEach(() => localStorage.clear())

describe("home layout v2", () => {
  it("migrates the legacy order and hidden widgets without adding new widget types", () => {
    localStorage.setItem(
      LEGACY_HOME_LAYOUT_KEY,
      JSON.stringify({
        order: ["app:https://example.com", WIDGET_REDISCOVERY],
        hiddenWidgets: [WIDGET_SCREEN_TIME],
        pageShortcutModifier: "control",
      })
    )

    const layout = readHomeLayout()
    expect(layout.version).toBe(2)
    expect(layout.order).toEqual(["app:https://example.com", WIDGET_REDISCOVERY])
    expect(layout.widgets[WIDGET_SCREEN_TIME]).toBeUndefined()
    expect(Object.values(layout.widgets).map(widget => widget.type)).toEqual([
      "rediscovery",
    ])
    expect(localStorage.getItem(HOME_LAYOUT_KEY)).not.toBeNull()
  })

  it("adds and removes an opt-in widget while preserving its semantic size", () => {
    const initial = readHomeLayout()
    const added = addWidgetInstance(initial, "read-later", { size: "wide" })
    expect(added?.instance).toMatchObject({ type: "read-later", size: "wide" })
    expect(added && added.state.order.at(-1)).toBe(added?.instance.instanceId)

    const removed = removeWidgetInstance(
      added!.state,
      added!.instance.instanceId
    )
    expect(removed.widgets[added!.instance.instanceId]).toBeUndefined()
    expect(removed.order).not.toContain(added!.instance.instanceId)
  })

  it("enforces singleton and multi-instance limits from the registry", () => {
    const initial = readHomeLayout()
    expect(addWidgetInstance(initial, "screen-time")).toBeNull()

    let current = initial
    for (let index = 0; index < 8; index += 1) {
      const added = addWidgetInstance(current, "rss")
      expect(added).not.toBeNull()
      current = added!.state
    }
    expect(addWidgetInstance(current, "rss")).toBeNull()
  })
})
