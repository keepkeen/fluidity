import React, { useEffect, useState } from "react"

import styled from "@emotion/styled"
import { faAngleLeft, faAngleRight } from "@fortawesome/free-solid-svg-icons"

import { IconButton } from "./IconButton"

const SliderWrapper = styled.div`
  height: 20px;
  display: flex;
  flex-direction: row;
  padding: 5px 0;
  > span {
    min-width: 100px;
    display: flex;
    justify-content: center;
  }
`

interface props {
  values: { label: string; value: string }[]
  onChange: (value: string) => void
  currentValue: string
}

export const OptionSlider = ({ values, onChange, currentValue }: props) => {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const nextIndex = values.findIndex(val => val.value === currentValue)
    if (nextIndex !== -1 && nextIndex !== index) setIndex(nextIndex)
  }, [currentValue, values, index])

  const handleChange = (newIndex: number) => {
    setIndex(newIndex)
    onChange(values[newIndex]?.value)
  }

  return (
    <SliderWrapper>
      <IconButton
        disabled={index <= 0}
        onClick={() => {
          handleChange(index - 1)
        }}
        icon={faAngleLeft}
      />
      <span>{values[index]?.label}</span>

      <IconButton
        disabled={index >= values.length - 1}
        onClick={() => handleChange(index + 1)}
        icon={faAngleRight}
      />
    </SliderWrapper>
  )
}
