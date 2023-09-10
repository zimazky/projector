import React from 'react'

type SwgIconProps = {
  children: React.ReactNode
}

const SwgIcon:React.FC<SwgIconProps> = ({children}) => {
  return <svg focusable='false' viewBox='0 0 24 24'>{children}</svg>
}

export default SwgIcon