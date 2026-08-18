import { describe, expect, it } from "vitest"

import {
  deriveThemeColors,
  ensureContrast,
  getContrastRatio,
} from "./colorUtils"

const expectReadableTheme = (seed: {
  bgPrimary: string
  accent: string
  textPrimary?: string
}) => {
  const colors = deriveThemeColors(seed)
  const bg = colors["--bg-primary"]

  expect(getContrastRatio(colors["--text-primary"], bg)).toBeGreaterThanOrEqual(
    4.5
  )
  expect(
    getContrastRatio(colors["--text-secondary"], bg)
  ).toBeGreaterThanOrEqual(3)
  expect(getContrastRatio(colors["--text-muted"], bg)).toBeGreaterThanOrEqual(3)
  expect(
    getContrastRatio(colors["--accent-text"], colors["--accent"])
  ).toBeGreaterThanOrEqual(4.5)
  expect(getContrastRatio(colors["--success"], bg)).toBeGreaterThanOrEqual(3)
  expect(getContrastRatio(colors["--accent"], bg)).toBeGreaterThanOrEqual(2)
}

describe("deriveThemeColors", () => {
  it("produces readable colors from a normal dark seed", () => {
    expectReadableTheme({ bgPrimary: "#24273A", accent: "#C6A0F6" })
  })

  it("produces readable colors from a light seed", () => {
    expectReadableTheme({ bgPrimary: "#FAF4ED", accent: "#D7827E" })
  })

  it("fixes a hostile seed: text identical to background", () => {
    expectReadableTheme({
      bgPrimary: "#FFFFFF",
      accent: "#EEEEEE",
      textPrimary: "#FFFFFF",
    })
  })

  it("fixes a hostile seed: accent identical to background", () => {
    expectReadableTheme({ bgPrimary: "#101418", accent: "#101418" })
  })

  it("survives a mid-gray background", () => {
    expectReadableTheme({ bgPrimary: "#808080", accent: "#808080" })
  })

  it("returns all 13 color slots", () => {
    const colors = deriveThemeColors({ bgPrimary: "#111", accent: "#0af" })
    expect(Object.keys(colors)).toHaveLength(13)
    Object.values(colors).forEach(value =>
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/)
    )
  })
})

describe("ensureContrast", () => {
  it("keeps colors that already pass", () => {
    expect(ensureContrast("#ffffff", "#000000", 4.5)).toBe("#ffffff")
  })

  it("lightens foreground on dark backgrounds until it passes", () => {
    const fixed = ensureContrast("#222222", "#111111", 4.5)
    expect(getContrastRatio(fixed, "#111111")).toBeGreaterThanOrEqual(4.5)
  })

  it("darkens foreground on light backgrounds until it passes", () => {
    const fixed = ensureContrast("#eeeeee", "#ffffff", 4.5)
    expect(getContrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5)
  })
})
