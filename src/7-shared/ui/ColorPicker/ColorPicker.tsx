import React from 'react'
import styles from './ColorPicker.module.css'

type ColorPickerProps = {
  value: string
  onChange?: () => void
}

const ColorPicker: React.FC<ColorPickerProps> = ({value, onChange = ()=>{}}) => {

  return null
}

export default ColorPicker