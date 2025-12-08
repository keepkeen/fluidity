import React from "react"

import styled from "@emotion/styled"

const Link = styled.a`
  &,
  :visited {
    color: var(--accent-color);
  }
  :hover {
    text-decoration: underline;
  }
`

const RedditUser = ({ user }: { user: string }) => (
  <Link href={`https://www.reddit.com/user/${user}`}>u/{user}</Link>
)
const GithubUser = ({ user }: { user: string }) => (
  <Link href={`https://github.com/${user}`}>{user}</Link>
)

export interface ChangelogVersion {
  version: string
  description?: string
  changes?: (string | JSX.Element)[]
}

export const changelog: ChangelogVersion[] = [
  {
    version: "0.6.0",
    changes: [
      <>
        新增 catppuccin 主题，感谢 <GithubUser user="AndyReckt" /> 的贡献！
      </>,
    ],
  },
  {
    version: "0.5.0",
    changes: [
      "支持自定义搜索引擎",
      <>
        新增了一些主题，感谢 <RedditUser user="justanotherweirdteen" /> 的贡献！
      </>,
    ],
  },
  {
    version: "0.4.4",
    changes: [
      <>
        新增主题 “Tartarus”，感谢 <RedditUser user="AllJavi" /> 的贡献！ <br />
        <Link href="https://github.com/AllJavi/dotfiles">配套 Linux 桌面</Link>
      </>,
    ],
  },
  {
    version: "0.4.3",
    changes: [
      "在链接分组上按鼠标中键可一次性在新标签页打开所有链接",
      "新增 Dockerfile，方便本地部署",
    ],
  },
  {
    version: "0.4.2",
    changes: ["提升大屏响应式效果", "一些内部优化"],
  },
  {
    version: "0.4.1",
    changes: [
      "提高设置页稳定性（这次我很确定！）",
      "修复此前在链接编辑器里引入的一个问题",
    ],
  },
  {
    version: "0.4.0",
    changes: [
      "新增快速跳转搜索",
      "修复链接编辑器无法加载你数据的错误",
      "继续改进响应式体验",
      "补充更多默认数据",
    ],
  },
  {
    version: "0.3.0",
    description:
      "这次更新做主题花了超多时间，还重构了内部设计数据；之前数据不持久导致很多 bug，都修好了，希望你喜欢！",
    changes: ["新增主题管理"],
  },
  {
    version: "0.2.1",
    changes: ["优化键盘操作", "重构设置页"],
  },
  {
    version: "0.2.0",
    changes: [
      "新增当前的更新日志",
      "设置页加入多标签",
      "新增设计预览",
      "设置页增加“放弃更改”按钮",
      "加入项目 Logo",
      "调整设置页结构",
      "稳定性略有提升",
    ],
  },
  {
    version: "0.1.0",
    description: "项目的初始版本。",
  },
]
