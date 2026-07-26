import React from "react"

import styled from "@emotion/styled"

import { CardDisplayMode } from "../../data/data"
import { ContributionChart } from "../Todo/ContributionChart"
import { TodoPanel } from "../Todo/TodoPanel"
import { TodayScreenTime } from "../Usage/TodayScreenTime"

const DashboardContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, minmax(200px, 1fr));
  gap: 16px;
  width: 100%;
  max-width: 800px;
  margin-bottom: 32px;

  /* Mobile: Stack vertically */
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    grid-template-rows: auto;
  }
`

const LargeWidget = styled.div`
  grid-column: span 2;
  height: 240px;

  @media (max-width: 768px) {
    grid-column: span 1;
  }
`

const StandardWidget = styled.div`
  height: 380px;

  @media (max-width: 768px) {
    height: 340px;
  }
`

/*
 * Dashboard Grid Layout
 *
 * [ Contribution Chart (Wide) ]
 * [ Todo Panel ] [ Screen Time ]
 *
 */

interface DashboardLayoutProps {
  cardDisplayMode: CardDisplayMode
}

export const DashboardLayout = ({ cardDisplayMode }: DashboardLayoutProps) => {
  // If hidden, render nothing
  if (cardDisplayMode === "hidden") return null

  return (
    <DashboardContainer>
      {/* Top Row: Contribution Chart (Wide) */}
      <LargeWidget>
        <ContributionChart />
      </LargeWidget>

      {/* Bottom Row: Todo & Screen Time */}
      <StandardWidget>
        <TodoPanel />
      </StandardWidget>

      <StandardWidget>
        <TodayScreenTime />
      </StandardWidget>
    </DashboardContainer>
  )
}
