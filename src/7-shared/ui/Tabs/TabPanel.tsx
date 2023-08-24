import React from 'react'

interface TabPanelProps {
  /** Выбранный таб */
  value: number
  /** Индекс панели */
  index: number
  /** Дочерний компонент */
  children?: React.ReactNode
}

const TabPanel: React.FC<TabPanelProps> = ({value, index, children}) => {
  return index === value ? <>{children}</> : null
}

export default TabPanel