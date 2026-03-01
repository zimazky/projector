import React from 'react'

type SwgIconProps = {
  children: React.ReactNode
}

const SwgIcon:React.FC<SwgIconProps> = ({children}) => {
  return <svg focusable='false' viewBox='0 0 24 24'>{children}</svg>
}

// Compound icon wrapper for combining multiple icons with positioning
type CompoundIconProps = {
  children: React.ReactNode
  size?: number
}

export const CompoundIcon:React.FC<CompoundIconProps> = ({children, size = 24}) => {
  return (
    <span style={{position: 'relative', display: 'inline-flex', width: size, height: size}}>
      {children}
    </span>
  )
}

export default SwgIcon