import React from 'react'
import styles from './Button.module.css'

type ButtonProps = {
  disabled?: boolean
  onClick?: React.MouseEventHandler
  children?: React.ReactNode
}

const Button: React.FC<ButtonProps> = (props) => {
  const {disabled=false, children='Button', onClick = ()=>{}, ...rest} = props

  return (
    <button className={styles.button} type='button' {...rest}
      tabIndex={-1}
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

export default Button

function createRipple(event: React.MouseEvent) {
  const tab = event.currentTarget as HTMLElement

  let offsetLeft = tab.offsetLeft
  let offsetTop = tab.offsetTop
  let parent: HTMLElement | null = tab.offsetParent as HTMLElement
  while(parent) {
    offsetLeft += parent.offsetLeft
    offsetTop += parent.offsetTop
    parent = parent.offsetParent as HTMLElement
  }
  const circle = document.createElement('span')
  const radius = Math.ceil(Math.hypot(tab.clientWidth, tab.clientHeight))

  circle.style.width = circle.style.height = `${2*radius}px`
  circle.style.left = `${event.clientX - offsetLeft - radius}px`
  circle.style.top = `${event.clientY - offsetTop - radius}px`
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
