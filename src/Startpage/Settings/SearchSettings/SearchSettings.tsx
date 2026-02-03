import React, { useEffect, useState } from "react"

import styled from "@emotion/styled"

import { FastForwardSearch } from "./FastForwardSearch"
import { OptionSlider } from "../../../components/OptionSlider"
import { OptionTextInput } from "../../../components/OptionTextInput"
import { Toggle } from "../../../components/Toggle"
import { searchEngines, Search, SearchEngine } from "../../../data/data"
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

// 搜索引擎列表样式
const EngineList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
`

const EngineItem = styled.div<{ isBuiltin?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: ${({ isBuiltin }) =>
    isBuiltin ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.08)"};
  border: 1px solid var(--border-color);
  border-radius: 6px;
`

const EngineInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const EngineName = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: var(--default-color);
`

const EngineShortcut = styled.span`
  display: inline-block;
  padding: 2px 6px;
  margin-left: 8px;
  background: var(--accent-color);
  color: var(--bg-color);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
`

const EngineUrl = styled.div`
  font-size: 12px;
  color: var(--secondary-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const EngineActions = styled.div`
  display: flex;
  gap: 6px;
`

const SmallButton = styled.button`
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: var(--default-color);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
  }

  &.danger:hover {
    border-color: #ff6b6b;
    color: #ff6b6b;
  }

  &.primary {
    background: var(--accent-color);
    color: var(--bg-color);
    border-color: var(--accent-color);
  }
`

const AddEngineForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-top: 12px;
`

const FormRow = styled.div`
  display: flex;
  gap: 10px;
`

const FormInput = styled.input`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: var(--default-color);
  font-size: 13px;

  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  &::placeholder {
    color: var(--secondary-color);
  }
`

const ShortcutInput = styled(FormInput)`
  width: 80px;
  flex: none;
`

const HelpText = styled.div`
  font-size: 12px;
  color: var(--secondary-color);
  line-height: 1.5;
`

const SectionTitle = styled.div`
  font-size: 13px;
  color: var(--secondary-color);
  margin-top: 16px;
  margin-bottom: 8px;
`

export const SearchSettings = ({
  searchSettings,
  setSearchSettings,
}: props) => {
  const [commandShortcut, setCommandShortcut] = useState<string>("")

  // 新增引擎表单状态
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEngine, setNewEngine] = useState<SearchEngine>({
    label: "",
    value: "",
    shortcut: "",
  })

  const customEngines = searchSettings.customEngines ?? []

  const setEngine = (engine: string) => {
    setSearchSettings({ ...searchSettings, engine: engine })
  }
  const setPlaceholder = (placeholder: string) => {
    setSearchSettings({ ...searchSettings, placeholder })
  }
  const setOpenInNewTab = (openInNewTab: boolean) => {
    setSearchSettings({ ...searchSettings, openInNewTab })
  }

  useEffect(() => {
    try {
      if (typeof chrome === "undefined") return
      chrome.commands.getAll(commands => {
        const cmd = commands.find(
          c => c.name === "fluidity-open-command-palette"
        )
        setCommandShortcut(cmd?.shortcut ?? "")
      })
    } catch {
      // ignore
    }
  }, [])

  const openShortcutSettings = () => {
    try {
      if (typeof chrome === "undefined") return
      void chrome.tabs.create({ url: "chrome://extensions/shortcuts" })
    } catch {
      // ignore
    }
  }

  // 添加自定义引擎
  const handleAddEngine = () => {
    if (!newEngine.label || !newEngine.value || !newEngine.shortcut) {
      alert("请填写完整的引擎信息")
      return
    }
    // 检查快捷键是否重复
    const allEngines = [...searchEngines, ...customEngines]
    if (allEngines.some(e => e.shortcut === newEngine.shortcut)) {
      alert(`快捷键 "${newEngine.shortcut}" 已被使用，请换一个`)
      return
    }
    setSearchSettings({
      ...searchSettings,
      customEngines: [...customEngines, newEngine],
    })
    setNewEngine({ label: "", value: "", shortcut: "" })
    setShowAddForm(false)
  }

  // 删除自定义引擎
  const handleDeleteEngine = (shortcut: string) => {
    setSearchSettings({
      ...searchSettings,
      customEngines: customEngines.filter(e => e.shortcut !== shortcut),
    })
  }

  // 设置为默认引擎
  const handleSetDefault = (engineValue: string) => {
    setSearchSettings({ ...searchSettings, engine: engineValue })
  }

  return (
    <SearchSettingsContent>
      <SettingsLabel>默认搜索引擎</SettingsLabel>
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
            searchSettings.placeholder ??
            "按 Enter 搜索，@ 切换引擎，/ 搜索链接"
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

      <SettingsLabel>全局快捷键</SettingsLabel>
      <SettingElement>
        <Flex>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: "var(--default-color)" }}>
              在任意页面呼出「/ 搜索链接」面板
            </div>
            <div
              style={{
                fontSize: 12,
                opacity: 0.7,
                marginTop: 4,
                color: "var(--secondary-color)",
              }}
            >
              当前快捷键：
              {commandShortcut || "未设置（可在浏览器快捷键页面配置）"}
            </div>
          </div>
          <SmallButton className="primary" onClick={openShortcutSettings}>
            打开设置
          </SmallButton>
        </Flex>
      </SettingElement>

      {/* 搜索引擎列表 */}
      <SettingsLabel>搜索引擎列表</SettingsLabel>
      <HelpText>
        在搜索栏输入 <code>@</code> 可查看所有引擎，输入 <code>@快捷键</code>{" "}
        可快速切换引擎。
        <br />
        例如：<code>@g</code> 使用 Google，<code>@bd</code> 使用百度
      </HelpText>

      {/* 自定义引擎 */}
      {customEngines.length > 0 && (
        <>
          <SectionTitle>自定义引擎</SectionTitle>
          <EngineList>
            {customEngines.map(engine => (
              <EngineItem key={engine.shortcut}>
                <EngineInfo>
                  <EngineName>
                    {engine.label}
                    <EngineShortcut>@{engine.shortcut}</EngineShortcut>
                  </EngineName>
                  <EngineUrl>{engine.value}</EngineUrl>
                </EngineInfo>
                <EngineActions>
                  <SmallButton onClick={() => handleSetDefault(engine.value)}>
                    设为默认
                  </SmallButton>
                  <SmallButton
                    className="danger"
                    onClick={() => handleDeleteEngine(engine.shortcut)}
                  >
                    删除
                  </SmallButton>
                </EngineActions>
              </EngineItem>
            ))}
          </EngineList>
        </>
      )}

      {/* 添加引擎表单 */}
      {showAddForm ? (
        <AddEngineForm>
          <FormRow>
            <FormInput
              placeholder="引擎名称（如：必应）"
              value={newEngine.label}
              onChange={e =>
                setNewEngine({ ...newEngine, label: e.target.value })
              }
            />
            <ShortcutInput
              placeholder="快捷键"
              value={newEngine.shortcut}
              onChange={e =>
                setNewEngine({
                  ...newEngine,
                  shortcut: e.target.value.toLowerCase(),
                })
              }
            />
          </FormRow>
          <FormInput
            placeholder={`搜索地址（用 ${queryToken} 代替搜索词）`}
            value={newEngine.value}
            onChange={e =>
              setNewEngine({ ...newEngine, value: e.target.value })
            }
          />
          <FormRow>
            <SmallButton className="primary" onClick={handleAddEngine}>
              添加
            </SmallButton>
            <SmallButton onClick={() => setShowAddForm(false)}>
              取消
            </SmallButton>
          </FormRow>
        </AddEngineForm>
      ) : (
        <SmallButton
          style={{ marginTop: 12 }}
          onClick={() => setShowAddForm(true)}
        >
          + 添加自定义引擎
        </SmallButton>
      )}

      {/* 内置引擎列表 */}
      <SectionTitle>内置引擎（{searchEngines.length} 个）</SectionTitle>
      <EngineList>
        {searchEngines.map(engine => (
          <EngineItem key={engine.shortcut} isBuiltin>
            <EngineInfo>
              <EngineName>
                {engine.label}
                <EngineShortcut>@{engine.shortcut}</EngineShortcut>
              </EngineName>
              <EngineUrl>{engine.value}</EngineUrl>
            </EngineInfo>
            <EngineActions>
              <SmallButton onClick={() => handleSetDefault(engine.value)}>
                设为默认
              </SmallButton>
            </EngineActions>
          </EngineItem>
        ))}
      </EngineList>

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
