/**
 * 浏览器书签导入
 *
 * 把书签文件夹映射为链接分组。bookmarks 是可选权限，
 * 只在用户点击导入时（用户手势中）申请。
 */

import { linkGroup } from "../data/data"
import { isSafeLinkUrl } from "../utils/urlSafety"

const MAX_GROUPS = 30
const MAX_LINKS_PER_GROUP = 50

export const isBookmarkImportSupported = (): boolean => {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.permissions)
  } catch {
    return false
  }
}

const requestBookmarksPermission = async (): Promise<boolean> => {
  try {
    return await chrome.permissions.request({ permissions: ["bookmarks"] })
  } catch {
    return false
  }
}

type BookmarkNode = chrome.bookmarks.BookmarkTreeNode

const collectGroups = (
  node: BookmarkNode,
  groups: linkGroup[],
  fallbackTitle: string
): void => {
  if (groups.length >= MAX_GROUPS) return
  const children = node.children ?? []

  const directLinks = children
    .filter(child => typeof child.url === "string")
    .filter(child => isSafeLinkUrl(child.url as string))
    .slice(0, MAX_LINKS_PER_GROUP)
    .map(child => ({
      label: child.title || (child.url as string),
      value: child.url as string,
    }))

  if (directLinks.length > 0) {
    groups.push({
      title: node.title || fallbackTitle,
      links: directLinks,
    })
  }

  for (const child of children) {
    if (!child.url) collectGroups(child, groups, fallbackTitle)
  }
}

/**
 * 申请权限并把书签树转换为链接分组。
 * 返回 null 表示用户拒绝了权限申请。
 */
export const importBookmarksAsLinkGroups = async (): Promise<
  linkGroup[] | null
> => {
  if (!(await requestBookmarksPermission())) return null

  const tree = await chrome.bookmarks.getTree()
  const groups: linkGroup[] = []
  for (const root of tree) {
    collectGroups(root, groups, "书签")
  }
  return groups
}
