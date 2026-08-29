import { useState } from "react"

import styled from "@emotion/styled"

import { Modal } from "../../components/Modal"
import {
  addRssSubscription,
  listRssSubscriptions,
  removeRssSubscription,
  restoreRssSubscription,
  updateRssSubscription,
} from "../../services/rss"
import {
  getWidgetDefinition,
  WidgetDefinition,
  WidgetInstance,
  WIDGET_DEFINITIONS,
  WidgetSize,
  WIDGET_SIZE_LABELS,
  WidgetType,
} from "../../services/widgetRegistry"
import {
  DrawerBody,
  DrawerCard,
  DrawerClose,
  DrawerHeader,
  DrawerTitle,
  WidgetActionButton,
  WidgetRowMeta,
} from "./shared"

const GalleryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
`

const GalleryCard = styled.div`
  padding: 14px;
  border: 1px solid var(--home-stroke);
  border-radius: 17px;
  background: var(--home-surface);
`

const Preview = styled.div`
  height: 92px;
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 14px;
  background:
    radial-gradient(circle at 82% 15%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 45%),
    var(--home-surface-strong);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`

const PreviewSymbol = styled.div`
  color: var(--accent);
  font-size: 1.4rem;
`

const PreviewLines = styled.div`
  display: grid;
  gap: 5px;

  span {
    display: block;
    height: 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-primary) 22%, transparent);
  }

  span:nth-of-type(2) { width: 68%; }
`

const CardTitle = styled.h3`
  margin: 0;
  color: var(--text-primary);
  font-size: 0.9rem;
`

const CardDescription = styled.p`
  min-height: 42px;
  margin: 6px 0 10px;
  color: var(--text-secondary);
  font-size: 0.76rem;
  line-height: 1.45;
`

const TagRow = styled.div`
  min-height: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
`

const Tag = styled.span`
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text-secondary);
  font-size: 0.63rem;
`

const Field = styled.label`
  display: grid;
  gap: 6px;
  margin-bottom: 14px;
  color: var(--text-secondary);
  font-size: 0.78rem;

  input,
  select,
  textarea {
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--home-stroke);
    border-radius: 10px;
    background: var(--home-surface-strong);
    color: var(--text-primary);
    font: inherit;
  }
`

const SizeGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 16px;
`

const SizeButton = styled.button<{ active: boolean }>`
  padding: 7px 10px;
  border: 1px solid ${({ active }) => active ? "var(--accent)" : "var(--home-stroke)"};
  border-radius: 10px;
  background: ${({ active }) => active ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent"};
  color: ${({ active }) => active ? "var(--accent)" : "var(--text-primary)"};
  cursor: pointer;
`

const FooterActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  margin-top: 18px;
`

const DangerButton = styled(WidgetActionButton)`
  color: var(--accent-hover);
`

interface WidgetGalleryProps {
  counts: Partial<Record<WidgetType, number>>
  onClose: () => void
  onAdd: (type: WidgetType, size: WidgetSize) => void
}

const GalleryEntry = ({
  definition,
  count,
  onAdd,
}: {
  definition: WidgetDefinition
  count: number
  onAdd: (size: WidgetSize) => void
}) => {
  const [size, setSize] = useState(definition.defaultSize)
  const full = count >= definition.maxInstances
  return (
    <GalleryCard>
      <Preview aria-hidden>
        <PreviewSymbol>{definition.symbol}</PreviewSymbol>
        <PreviewLines><span /><span /></PreviewLines>
      </Preview>
      <CardTitle>{definition.title}</CardTitle>
      <CardDescription>{definition.description}</CardDescription>
      <TagRow>
        <Tag>{definition.dataLabel}</Tag>
        {definition.permissionLabel && <Tag>{definition.permissionLabel}</Tag>}
      </TagRow>
      <Field>
        <span>初始尺寸</span>
        <select value={size} onChange={event => setSize(event.target.value as WidgetSize)}>
          {definition.allowedSizes.map(option => (
            <option key={option} value={option}>{WIDGET_SIZE_LABELS[option]}</option>
          ))}
        </select>
      </Field>
      <WidgetActionButton type="button" disabled={full} onClick={() => onAdd(size)}>
        {full ? "已添加" : "添加到主屏"}
      </WidgetActionButton>
    </GalleryCard>
  )
}

export const WidgetGallery = ({ counts, onClose, onAdd }: WidgetGalleryProps) => (
  <Modal onClose={onClose} label="小组件库" overlay="dark">
    <DrawerCard>
      <DrawerHeader>
        <div>
          <DrawerTitle>小组件库</DrawerTitle>
          <WidgetRowMeta>新增范围只包含稍后读、智能入口和 RSS；现有组件也可以在这里逐个恢复。</WidgetRowMeta>
        </div>
        <DrawerClose type="button" aria-label="关闭" onClick={onClose}>×</DrawerClose>
      </DrawerHeader>
      <DrawerBody>
        <GalleryGrid>
          {WIDGET_DEFINITIONS.map(definition => (
            <GalleryEntry
              key={definition.type}
              definition={definition}
              count={counts[definition.type] ?? 0}
              onAdd={size => onAdd(definition.type, size)}
            />
          ))}
        </GalleryGrid>
      </DrawerBody>
    </DrawerCard>
  </Modal>
)

interface WidgetSettingsProps {
  instance: WidgetInstance
  currentPage: number
  pageCount: number
  onClose: () => void
  onSave: (instance: WidgetInstance) => void
  onRemove: () => void
  onDuplicate: () => void
  onMovePage: (page: number) => void
  onUndoableAction: (message: string, undo: () => void) => void
}

export const WidgetSettings = ({
  instance,
  currentPage,
  pageCount,
  onClose,
  onSave,
  onRemove,
  onDuplicate,
  onMovePage,
  onUndoableAction,
}: WidgetSettingsProps) => {
  const definition = getWidgetDefinition(instance.type)
  const [draft, setDraft] = useState(instance)
  const [feedUrl, setFeedUrl] = useState("")
  const [feedStatus, setFeedStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const subscriptions = listRssSubscriptions()
  const selectedSubscriptionIds = Array.isArray(draft.config.subscriptionIds)
    ? draft.config.subscriptionIds.filter((value): value is string => typeof value === "string")
    : []

  const patchConfig = (patch: Record<string, unknown>) =>
    setDraft(value => ({ ...value, config: { ...value.config, ...patch } }))

  const addFeed = async () => {
    if (!feedUrl.trim()) return
    setBusy(true)
    setFeedStatus("正在检查订阅并请求对应域名权限…")
    try {
      const subscription = await addRssSubscription(feedUrl)
      patchConfig({
        subscriptionIds: [...new Set([...selectedSubscriptionIds, subscription.id])],
      })
      setFeedUrl("")
      setFeedStatus(`已添加「${subscription.title}」`)
    } catch (error) {
      setFeedStatus(error instanceof Error ? error.message : "添加订阅失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} label={`配置${definition.title}`} overlay="dark">
      <DrawerCard>
        <DrawerHeader>
          <div>
            <DrawerTitle>{definition.title}</DrawerTitle>
            <WidgetRowMeta>{definition.description}</WidgetRowMeta>
          </div>
          <DrawerClose type="button" aria-label="关闭" onClick={onClose}>×</DrawerClose>
        </DrawerHeader>
        <DrawerBody>
          <CardTitle>尺寸</CardTitle>
          <SizeGrid>
            {definition.allowedSizes.map(size => (
              <SizeButton
                key={size}
                type="button"
                active={draft.size === size}
                onClick={() => setDraft(value => ({ ...value, size }))}
              >
                {WIDGET_SIZE_LABELS[size]}
              </SizeButton>
            ))}
          </SizeGrid>

          {instance.type === "screen-time" && (
            <Field>
              <span>每日注意力预算（分钟）</span>
              <input
                type="number"
                min="15"
                max="1440"
                value={Number(draft.config.dailyGoalMinutes ?? 180)}
                onChange={event => patchConfig({ dailyGoalMinutes: Number(event.target.value) })}
              />
            </Field>
          )}

          {instance.type === "read-later" && (
            <Field>
              <span>卡片显示数量</span>
              <select value={Number(draft.config.itemLimit ?? 3)} onChange={event => patchConfig({ itemLimit: Number(event.target.value) })}>
                <option value="2">2 项</option>
                <option value="3">3 项</option>
                <option value="4">4 项</option>
              </select>
            </Field>
          )}

          {instance.type === "smart-entry" && (
            <>
              <Field>
                <span>卡片显示数量</span>
                <select value={Number(draft.config.itemLimit ?? 4)} onChange={event => patchConfig({ itemLimit: Number(event.target.value) })}>
                  <option value="2">2 个</option>
                  <option value="4">4 个</option>
                  <option value="6">6 个</option>
                </select>
              </Field>
              <WidgetActionButton type="button" onClick={() => patchConfig({ excludedUrls: [] })}>
                恢复已减少的推荐
              </WidgetActionButton>
            </>
          )}

          {instance.type === "rss" && (
            <>
              <Field>
                <span>组件标题</span>
                <input value={String(draft.config.title ?? "阅读流")} onChange={event => patchConfig({ title: event.target.value })} />
              </Field>
              <Field>
                <span>显示范围</span>
                <select value={draft.config.unreadOnly === false ? "all" : "unread"} onChange={event => patchConfig({ unreadOnly: event.target.value === "unread" })}>
                  <option value="unread">只显示未读</option>
                  <option value="all">显示全部</option>
                </select>
              </Field>
              <Field>
                <span>添加 RSS / Atom 地址</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ flex: 1 }} type="url" placeholder="https://example.com/feed.xml" value={feedUrl} onChange={event => setFeedUrl(event.target.value)} />
                  <WidgetActionButton type="button" disabled={busy} onClick={() => void addFeed()}>{busy ? "检查中" : "添加"}</WidgetActionButton>
                </div>
                {feedStatus && <WidgetRowMeta role="status">{feedStatus}</WidgetRowMeta>}
              </Field>
              {subscriptions.map(subscription => {
                const selected = selectedSubscriptionIds.includes(subscription.id)
                return (
                  <GalleryCard key={subscription.id} style={{ marginBottom: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={event => patchConfig({
                          subscriptionIds: event.target.checked
                            ? [...new Set([...selectedSubscriptionIds, subscription.id])]
                            : selectedSubscriptionIds.filter(id => id !== subscription.id),
                        })}
                      />
                      <strong style={{ color: "var(--text-primary)" }}>{subscription.title}</strong>
                    </label>
                    <WidgetRowMeta>{subscription.url}</WidgetRowMeta>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <select
                        aria-label={`${subscription.title}刷新间隔`}
                        value={subscription.refreshMinutes}
                        onChange={event => {
                          updateRssSubscription(subscription.id, { refreshMinutes: Number(event.target.value) })
                          setFeedStatus(`已更新 ${subscription.title}`)
                        }}
                      >
                        <option value="15">15 分钟</option>
                        <option value="30">30 分钟</option>
                        <option value="60">1 小时</option>
                        <option value="180">3 小时</option>
                        <option value="360">6 小时</option>
                      </select>
                      <DangerButton
                        type="button"
                        onClick={() => {
                          const removed = removeRssSubscription(subscription.id)
                          patchConfig({ subscriptionIds: selectedSubscriptionIds.filter(id => id !== subscription.id) })
                          setFeedStatus(`已移除 ${subscription.title}`)
                          if (removed) onUndoableAction("已移除订阅源", () => restoreRssSubscription(subscription.id))
                        }}
                      >
                        移除订阅
                      </DangerButton>
                    </div>
                  </GalleryCard>
                )
              })}
            </>
          )}

          {pageCount > 1 && (
            <>
              <CardTitle>移动到页面</CardTitle>
              <SizeGrid>
                {Array.from({ length: pageCount }, (_, index) => (
                  <SizeButton key={index} type="button" active={index === currentPage} onClick={() => onMovePage(index)}>
                    第 {index + 1} 页
                  </SizeButton>
                ))}
              </SizeGrid>
            </>
          )}

          <FooterActions>
            <div style={{ display: "flex", gap: 8 }}>
              <DangerButton type="button" onClick={onRemove}>从主屏移除</DangerButton>
              {definition.maxInstances > 1 && <WidgetActionButton type="button" onClick={onDuplicate}>复制组件</WidgetActionButton>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <WidgetActionButton type="button" onClick={onClose}>取消</WidgetActionButton>
              <WidgetActionButton type="button" onClick={() => { onSave(draft); onClose() }}>保存</WidgetActionButton>
            </div>
          </FooterActions>
        </DrawerBody>
      </DrawerCard>
    </Modal>
  )
}
