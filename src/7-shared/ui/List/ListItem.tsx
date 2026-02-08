import React from 'react'
import styles from './ListItem.module.css'

type ListItemProps = {
  disabled?: boolean
  onClick?: React.MouseEventHandler
  children?: React.ReactNode
}

const ListItem: React.FC<ListItemProps> = (props) => {
  const {disabled=false, children='ListItem', onClick = ()=>{}, ...rest} = props

  return (
    <li className={styles.item} {...rest}
      onPointerDown={e => {
        if(!e.isPrimary) return
        createRipple(e)
      }}
      onPointerUp={e => {
        if(!e.isPrimary) return
        removeRipple(e)
      }}
      onClick={onClick}
      onPointerLeave={e=>{
        if(!e.isPrimary) return
        removeRipple(e)
      }}
      onPointerCancel={e=>{
        if(!e.isPrimary) return
        removeRipple(e)
      }}
    >{children}</li>
  )
}

export default ListItem

function createRipple(event: React.MouseEvent) {
  const tab = event.currentTarget as HTMLElement

  const rect = tab.getBoundingClientRect()
  const circle = document.createElement('span')
  const radius = Math.ceil(Math.hypot(tab.clientWidth, tab.clientHeight))

  circle.style.width = circle.style.height = `${2*radius}px`
  circle.style.left = `${event.clientX - rect.left - radius}px`
  circle.style.top = `${event.clientY - rect.top - radius}px`
  circle.classList.add(styles.ripple, styles.clicked)

  tab.appendChild(circle)
}

function removeRipple(event: React.MouseEvent) {
  const tab = event.currentTarget as HTMLElement
  const ripple = tab.getElementsByClassName(styles.clicked)[0]
  if(ripple) {
    ripple.classList.remove(styles.clicked)
    setTimeout(()=>{ ripple?.remove() }, 500)
  }
}
