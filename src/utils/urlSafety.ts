/**
 * 链接 URL 安全校验
 *
 * 链接数据可能来自 AI 整理结果、备份导入或云同步，
 * 导航前必须拦截 javascript:/data: 等可执行 scheme，
 * 否则会在触发导航的页面 origin 下执行任意脚本。
 */

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "ftp:"])

export const isSafeLinkUrl = (url: string): boolean => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    // 无 scheme 的相对地址不会执行脚本，交给浏览器按相对路径处理
    return true
  }
  return SAFE_PROTOCOLS.has(parsed.protocol)
}
