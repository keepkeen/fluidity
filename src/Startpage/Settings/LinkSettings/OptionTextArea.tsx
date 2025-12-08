import React, { useState } from "react"

import styled from "@emotion/styled"

import { linkGroup } from "../../../data/data"
import * as Settings from "../settingsHandler"

const StyledOptionTextArea = styled.div<{ error?: string }>`
  position: relative;
  border: 2px solid var(--default-color);
  display: flex;
  padding: 10px 0 10px 20px;
  height: calc(100% - 40px);
  ${({ error }) =>
    error &&
    `
        ::after{
            content: "${error}";
            color: var(--accent-color);
            position: absolute;
            top: 10px;
            right: 15px;
            font-size: 0.8rem;
        }
    `}
`

const StyledTextArea = styled.textarea`
  background-color: var(--bg-color);
  color: var(--default-color);
  border: none;
  height: 100%;
  width: 100%;
  outline: none;
  resize: none;
`

const placeholder = JSON.stringify(
  [
    {
      title: "示例分组",
      links: [
        {
          label: "示例标签",
          value: "https://example.com",
        },
        {
          label: "示例标签2",
          value: "https://example.com/2",
        },
        {
          label: "示例标签3",
          value: "https://example.com/3",
        },
      ],
    },
  ],
  null,
  2
)

interface props {
  initialValue: linkGroup[]
  onChange: (value: linkGroup[]) => void
}

const getLinksAsString = (): string => {
  // try to do usual parse
  try {
    const parseLinks = localStorage.getItem("link-groups")
    if (parseLinks)
      return JSON.stringify(Settings.Links.parse(parseLinks), null, 2)
    // eslint-disable-next-line no-empty
  } catch {}

  // try to parse broken json
  const links = Settings.Links.getRaw()
  if (links) {
    return links
      .replaceAll(":[{", ":[\n      {\n")
      .replaceAll('[{"', '[\n  {\n"')
      .replaceAll("}]}]", "}]\n  }\n]")
      .replaceAll("]},{", "\n  },\n  {\n")
      .replaceAll("},{", "\n      },\n      {\n")
      .replaceAll('"}]', '"\n      }\n    ]')
      .replaceAll('"title":', '    "title":')
      .replaceAll('"links":', '\n    "links":')
      .replaceAll('"label":', '        "label":')
      .replaceAll('"value":', '\n        "value":')
  }

  //Last possible option
  return JSON.stringify(Settings.Links.getWithFallback(), null, 2)
}

export const OptionTextArea = ({ onChange }: props) => {
  const [error, setError] = useState<string | undefined>(undefined)
  const [value, setValue] = useState(getLinksAsString())

  const tryOnChangeEvent = (linkGroups: string) => {
    setValue(linkGroups)
    try {
      const parsedData = Settings.Links.parse(linkGroups)
      setError(undefined)
      onChange(parsedData)
    } catch {
      setError("链接数据无法解析，可能是 JSON 语法错误。")
    }
  }

  return (
    <StyledOptionTextArea error={error}>
      <StyledTextArea
        onChange={e => tryOnChangeEvent(e.currentTarget.value)}
        placeholder={placeholder}
        value={value}
      />
    </StyledOptionTextArea>
  )
}
