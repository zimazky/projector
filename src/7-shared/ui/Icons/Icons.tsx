import React from 'react'
import { Icon, IconifyIcon } from '@iconify/react'

// Re-export Icon from Iconify for direct usage
export { Icon }

// Icon names constants for consistent usage across the app
export const ICONS = {
  menu: 'mdi:menu',
  arrowBack: 'mdi:chevron-left',
  arrowForward: 'mdi:chevron-right',
  save: 'mdi:content-save',
  download: 'mdi:download',
  upload: 'mdi:upload',
  fullscreen: 'mdi:fullscreen',
  fullscreenExit: 'mdi:fullscreen-exit',
  calendar: 'mdi:calendar',
  google: 'logos:google-icon',
  weather: 'wi:day-cloudy',
  weatherSunny: 'wi:day-sunny',
} as const

// Icon component with default size
type AppIconProps = {
  icon: IconifyIcon | string
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export const AppIcon: React.FC<AppIconProps> = ({ 
  icon, 
  size = 24, 
  color = 'currentColor',
  className,
  style
}) => {
  return (
    <Icon 
      icon={icon} 
      width={size} 
      height={size} 
      color={color}
      className={className}
      style={style}
    />
  )
}

// Legacy custom icon - kept for modified indicator with white outline
export const ModifiedAsterisk: React.FC = () => {
  return <>
    <path fill='none' d='M19 1v8m-3-7 6 6m-6 0 6-6m-7 3h8' stroke='white' strokeWidth='5' strokeLinecap='round'/>
    <path fill='none' d='M19 1v8m-3-7 6 6m-6 0 6-6m-7 3h8'/>
  </>
}