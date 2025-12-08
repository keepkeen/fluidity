import React from "react"

import styled from "@emotion/styled"

import { FastForwardSearch } from "./FastForwardSearch"
import { OptionSlider } from "../../../components/OptionSlider"
import { OptionTextInput } from "../../../components/OptionTextInput"
import { Toggle } from "../../../components/Toggle"
import { searchEngines, Search } from "../../../data/data"
import { queryToken } from "../../Searchbar/Searchbar"
import { SettingElement, SettingsLabel } from "../SettingsWindow"

interface props {
  searchSettings: Search
  setSearchSettings: (value: Search) => void
}
export const SearchSettingsContent = styled.div`
  width: 100%;
  overflow-y: auto;
`

const Flex = styled.div`
  display: flex;
  align-items: center;
  padding-right: 40px;
  gap: 12px;
`

const TextInput = styled(OptionTextInput)`
  width: 100%;
  height: 40px;
  padding-top: 0;
  padding-bottom: 0;
`

export const SearchSettings = ({
  searchSettings,
  setSearchSettings,
}: props) => {
  const setEngine = (engine: string) => {
    setSearchSettings({ ...searchSettings, engine: engine })
  }
  const setPlaceholder = (placeholder: string) => {
    setSearchSettings({ ...searchSettings, placeholder })
  }
  const setOpenInNewTab = (openInNewTab: boolean) => {
    setSearchSettings({ ...searchSettings, openInNewTab })
  }

  return (
    <SearchSettingsContent>
      <SettingsLabel>搜索栏</SettingsLabel>
      <SettingElement>
        <Flex>
          <OptionSlider
            currentValue={searchSettings.engine}
            values={searchEngines}
            onChange={setEngine}
          />
          <TextInput
            value={searchSettings.engine}
            onChange={setEngine}
            placeholder={`搜索引擎地址（用 ${queryToken} 占位查询词）`}
          />
        </Flex>
      </SettingElement>
      <SettingElement>
        <TextInput
          value={
            searchSettings.placeholder ?? "按 Enter 搜索，或直接输入快捷词"
          }
          onChange={setPlaceholder}
          placeholder={"搜索栏提示文案"}
        />
      </SettingElement>
      <SettingElement>
        <Toggle
          checked={searchSettings.openInNewTab ?? false}
          onChange={setOpenInNewTab}
          label="在新标签页打开搜索结果"
        />
      </SettingElement>
      <br />
      <SettingsLabel>快速跳转</SettingsLabel>
      <FastForwardSearch
        links={searchSettings.fastForward}
        onChange={fastForward =>
          setSearchSettings({ ...searchSettings, fastForward: fastForward })
        }
      />
    </SearchSettingsContent>
  )
}
