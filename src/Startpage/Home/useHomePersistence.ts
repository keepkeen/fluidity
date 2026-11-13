import { useCallback, useEffect, useRef, useState } from "react"

import { LinkAnalytics } from "../../services/analytics"
import {
  buildHomeItems,
  getHomeLayoutFingerprint,
  HOME_LAYOUT_KEY,
  HomeLayoutState,
  readHomeLayout,
  saveHomeLayout,
  withHomeLayoutLock,
} from "../../services/homeLayout"
import { Links } from "../Settings/settingsHandler"

import type * as React from "react"
import { sameHomeOrder } from "./homeInteraction"

export const saveHomeOrderIfUnchanged = (
  expectedCurrentLayout: HomeLayoutState,
  nextOrder: string[]
): ReturnType<typeof readHomeLayout> | null => {
  const latest = readHomeLayout()
  if (
    getHomeLayoutFingerprint(latest) !==
    getHomeLayoutFingerprint(expectedCurrentLayout)
  ) {
    return null
  }
  const next = { ...latest, order: [...new Set(nextOrder)] }
  saveHomeLayout(next)
  return next
}

interface Options {
  itemDraggingRef: React.MutableRefObject<boolean>
}

export const useHomePersistence = ({ itemDraggingRef }: Options) => {
  const [linkGroups, setLinkGroups] = useState(() => Links.getWithFallback())

  const [layout, setLayout] = useState(() => readHomeLayout())

  const layoutRevisionRef = useRef(0)

  const externalLayoutPendingRef = useRef(false)

  // 设置、其他新标签页或同步写入的布局变更 → 即时刷新。拖动中只标记
  // revision，松手时放弃过期投影，再读取最新状态，避免覆盖另一页的修改。
  useEffect(() => {
    const refresh = () => {
      layoutRevisionRef.current += 1
      if (itemDraggingRef.current) {
        externalLayoutPendingRef.current = true
        return
      }
      externalLayoutPendingRef.current = false
      setLayout(readHomeLayout())
      setLinkGroups(Links.getWithFallback())
    }
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return
      if (
        event.key !== null &&
        event.key !== HOME_LAYOUT_KEY &&
        event.key !== "link-groups"
      ) {
        return
      }
      refresh()
    }
    window.addEventListener("fluidity-home-layout-changed", refresh)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("fluidity-home-layout-changed", refresh)
      window.removeEventListener("storage", onStorage)
    }
  }, [itemDraggingRef])

  const commitLayout = useCallback(
    async (
      updater: typeof layout | ((current: typeof layout) => typeof layout)
    ) => {
      return withHomeLayoutLock(() => {
        // Always base a partial update on the newest persisted value. This is
        // important when another start-page tab changed widgets or shortcuts.
        const latest = readHomeLayout()
        const next = typeof updater === "function" ? updater(latest) : updater
        saveHomeLayout(next)
        setLayout(next)
        return next
      })
    },
    []
  )

  const persistOrderIfUnchanged = useCallback(
    async (
      expectedCurrentLayout: HomeLayoutState,
      expectedItemIds: string[],
      nextOrder: string[]
    ) => {
      return withHomeLayoutLock(() => {
        const latest = readHomeLayout()
        if (
          getHomeLayoutFingerprint(latest) !==
          getHomeLayoutFingerprint(expectedCurrentLayout)
        ) {
          return null
        }
        const latestItemIds = buildHomeItems(
          Links.getWithFallback(),
          latest,
          LinkAnalytics.get(),
          Date.now()
        ).map(item => item.id)
        if (!sameHomeOrder(latestItemIds, expectedItemIds)) return null

        const next = saveHomeOrderIfUnchanged(expectedCurrentLayout, nextOrder)
        if (next) setLayout(next)
        return next
      })
    },
    []
  )

  return {
    linkGroups,
    layout,
    persistOrderIfUnchanged,
    setLayout,
    layoutRevisionRef,
    externalLayoutPendingRef,
    setLinkGroups,
    commitLayout,
  }
}
