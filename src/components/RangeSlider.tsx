import React from "react"

import styled from "@emotion/styled"

const SliderContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
`

const SliderHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const SliderLabel = styled.label`
  font-size: 14px;
  color: var(--default-color);
`

const SliderValue = styled.span`
  font-size: 12px;
  color: var(--secondary-color);
  min-width: 40px;
  text-align: right;
`

const StyledSlider = styled.input`
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border-color);
  outline: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent-color);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;

    &:hover {
      transform: scale(1.1);
      box-shadow: 0 0 8px var(--accent-color);
    }
  }

  &::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent-color);
    cursor: pointer;
    border: none;
    transition: transform 0.2s, box-shadow 0.2s;

    &:hover {
      transform: scale(1.1);
      box-shadow: 0 0 8px var(--accent-color);
    }
  }

  &::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 3px;
  }

  &::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: var(--border-color);
  }
`

interface RangeSliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  formatValue?: (value: number) => string
}

export const RangeSlider: React.FC<RangeSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
}) => {
  const displayValue = formatValue ? formatValue(value) : value.toString()

  return (
    <SliderContainer>
      <SliderHeader>
        <SliderLabel>{label}</SliderLabel>
        <SliderValue>{displayValue}</SliderValue>
      </SliderHeader>
      <StyledSlider
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
    </SliderContainer>
  )
}
