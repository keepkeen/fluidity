import React, { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LinkGroupEditor } from "./LinkGroupEditor"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const groups = [
  {
    title: "开发",
    links: [
      { label: "GitHub", value: "https://github.com" },
      { label: "文档", value: "https://docs.example.com" },
    ],
  },
  {
    title: "阅读",
    links: [{ label: "Example", value: "https://example.com" }],
  },
]

const typeFilter = async (
  container: HTMLElement,
  value: string
): Promise<HTMLInputElement> => {
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="筛选链接"]'
  )
  if (!input) throw new Error("Filter input not found")
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set
    setValue?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  return input
}

describe("LinkGroupEditor", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root.render(<LinkGroupEditor linkGroups={groups} onChange={vi.fn()} />)
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    document.querySelectorAll('[data-fluidity-modal="true"]').forEach(node =>
      node.remove()
    )
  })

  it("filters large collections by label, group, or URL", async () => {
    await typeFilter(container, "docs.example")

    expect(container.textContent).toContain("1 组 · 1 条")
    expect(container.querySelector('input[value="文档"]')).not.toBeNull()
    expect(container.querySelector('input[value="GitHub"]')).toBeNull()
    expect(container.querySelector('input[value="Example"]')).toBeNull()
  })

  it("disables sorting while filtering and clears the filter when adding", async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(<LinkGroupEditor linkGroups={groups} onChange={onChange} />)
    })
    const collapse = container.querySelector<HTMLButtonElement>(
      'button[aria-label="收起分组 开发"]'
    )
    await act(async () => collapse?.click())
    const filter = await typeFilter(container, "开发")

    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="下移分组 开发"]'
      )?.disabled
    ).toBe(true)
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="下移链接 GitHub"]'
      )?.disabled
    ).toBe(true)
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="收起分组 开发"]'
      )?.disabled
    ).toBe(true)

    const addLink = [...container.querySelectorAll("button")].find(
      button => button.textContent?.trim() === "添加链接"
    )
    await act(async () => (addLink as HTMLButtonElement | undefined)?.click())

    expect(filter.value).toBe("")
    expect(container.querySelector('input[value="GitHub"]')).not.toBeNull()
    expect(
      container.querySelector('button[aria-label="收起分组 开发"]')
    ).not.toBeNull()
    expect(onChange).toHaveBeenLastCalledWith([
      { ...groups[0], links: [...groups[0].links, { label: "", value: "" }] },
      groups[1],
    ])

    await typeFilter(container, "不存在")
    const addGroup = [...container.querySelectorAll("button")].find(
      button => button.textContent?.trim() === "添加分组"
    )
    await act(async () => (addGroup as HTMLButtonElement | undefined)?.click())
    expect(filter.value).toBe("")
    expect(onChange).toHaveBeenLastCalledWith([
      ...groups,
      { title: "新分组", links: [] },
    ])
  })

  it("keeps collapse state attached to the group after reordering", async () => {
    const collapseReading = container.querySelector<HTMLButtonElement>(
      'button[aria-label="收起分组 阅读"]'
    )
    await act(async () => collapseReading?.click())
    await act(async () => {
      root.render(
        <LinkGroupEditor linkGroups={[groups[1], groups[0]]} onChange={vi.fn()} />
      )
    })

    expect(container.querySelector('input[value="Example"]')).toBeNull()
    expect(container.querySelector('input[value="GitHub"]')).not.toBeNull()
    expect(
      container.querySelector('button[aria-label="展开分组 阅读"]')
    ).not.toBeNull()
  })

  it("collapses a group without removing it from the draft", async () => {
    const collapse = container.querySelector<HTMLButtonElement>(
      'button[aria-label="收起分组 开发"]'
    )
    await act(async () => collapse?.click())

    expect(
      container.querySelector('button[aria-label="展开分组 开发"]')
    ).not.toBeNull()
    expect(container.querySelector('input[value="GitHub"]')).toBeNull()
    expect(container.querySelector('input[value="Example"]')).not.toBeNull()
  })

  it("uses an in-product confirmation and keeps deletion in the draft", async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(<LinkGroupEditor linkGroups={groups} onChange={onChange} />)
    })
    const remove = container.querySelector<HTMLButtonElement>(
      'button[aria-label="删除分组 开发"]'
    )
    await act(async () => remove?.click())
    expect(document.body.textContent).toContain("应用更改前仍可放弃本次修改")

    const confirm = [...document.body.querySelectorAll("button")].find(
      button => button.textContent?.trim() === "删除分组"
    ) as HTMLButtonElement | undefined
    await act(async () => confirm?.click())

    expect(onChange).toHaveBeenCalledWith([groups[1]])
  })
})
