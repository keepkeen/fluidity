import React from "react"

import styled from "@emotion/styled"

import { CardDisplayMode } from "../../data/data"
import { RediscoveryCard } from "../Rediscovery/RediscoveryCard"
import { TodayScreenTime } from "../Usage/TodayScreenTime"

const DashboardContainer = styled.div`
  display: grid;
  /* 列数随分到的宽度自适应：装得下两列就两列，否则单列 */
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: clamp(10px, 1.2vw, 16px);
  /* 作为 flex 子项参与排布：不够宽时整体换行到下一行 */
  flex: 1 1 480px;
  min-width: 0;
  max-width: 800px;
  margin-bottom: clamp(12px, 2vh, 32px);
`

const StandardWidget = styled.div`
  height: clamp(210px, 28vh, 380px);
`

/*
 * Dashboard Grid Layout
 *
 * [ Screen Time ] [ Rediscovery ]
 */

interface DashboardLayoutProps {
  cardDisplayMode: CardDisplayMode
}

export const DashboardLayout = ({ cardDisplayMode }: DashboardLayoutProps) => {
  // If hidden, render nothing
  if (cardDisplayMode === "hidden") return null

  return (
    <DashboardContainer>
      <StandardWidget>
        <TodayScreenTime />
      </StandardWidget>

      <StandardWidget>
        <RediscoveryCard />
      </StandardWidget>
    </DashboardContainer>
  )
}
