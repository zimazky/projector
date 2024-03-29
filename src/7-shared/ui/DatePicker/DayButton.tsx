import React from 'react'
import styles from './DayButton.module.css'

type DayButtonProps = {
  today?: boolean
  selected?: boolean
  onClick?: React.MouseEventHandler
  children?: React.ReactNode
}

const DayButton: React.FC<DayButtonProps> = (props) => {
  const {today, selected, children, onClick = ()=>{}, ...rest} = props

  return (
    <button type='button' 
      className={styles.day + (today?' '+styles.today:'') + (selected?' '+styles.selected:'')}
      {...rest}
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
    >{children}</button>
  )
}

export default DayButton

function createRipple(event: React.MouseEvent) {
  const el = event.currentTarget as HTMLElement

  let offsetLeft = el.offsetLeft
  let offsetTop = el.offsetTop
  let parent: HTMLElement | null = el.offsetParent as HTMLElement
  while(parent) {
    offsetLeft += parent.offsetLeft
    offsetTop += parent.offsetTop
    parent = parent.offsetParent as HTMLElement
  }
  const circle = document.createElement('span')
  const radius = Math.ceil(Math.hypot(el.clientWidth, el.clientHeight))

  circle.style.width = circle.style.height = `${2*radius}px`
  circle.style.left = `${event.clientX - offsetLeft - radius}px`
  circle.style.top = `${event.clientY - offsetTop - radius}px`
  circle.classList.add(styles.ripple, styles.clicked)

  el.appendChild(circle)
}

function removeRipple(event: React.MouseEvent) {
  const el = event.currentTarget as HTMLElement
  const ripple = el.getElementsByClassName(styles.clicked)[0]
  if(ripple) {
    ripple.classList.remove(styles.clicked)
    setTimeout(()=>{ ripple?.remove() }, 500)
  }
}
