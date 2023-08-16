import React from 'react'
import styles from './Button.module.css'

type ButtonProps = {
  active?: boolean
  disabled?: boolean
  onClick?: React.MouseEventHandler
  children?: React.ReactNode
}

const Button: React.FC<ButtonProps> = (props) => {
  const {active=false, disabled=false, children='Button', onClick = ()=>{}, ...rest} = props
  const [clicked, setClicked] = React.useState(false)

  return (
    <button className={styles.button + (active?' '+styles.active:'')} {...rest}
      tabIndex={-1}
      onMouseDown={e => {
        createRipple(e)
        setClicked(true)
      }}
      onMouseUp={e => {
        if(clicked) onClick(e)
        setClicked(false)
        removeRipple(e)
      }}
      onMouseLeave={e=>{
        setClicked(false)
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
    setTimeout(()=>{ ripple?.remove() }, 5000)
  }
}
