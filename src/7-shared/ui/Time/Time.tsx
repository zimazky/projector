import React from 'react'

import DateTime from 'src/7-shared/libs/DateTime/DateTime'

import styles from './Time.module.css'

type TimeProps = {
  onClick?: React.MouseEventHandler
}

const Time: React.FC<TimeProps> = ({onClick = ()=>{}}) => {
  const t = Date.now()/1000
  const s = 60 - t%60
  const [time, setTime] = React.useState(DateTime.getHHMM(t))
  React.useEffect(() => {
    setTimeout(()=>{
      setTime(DateTime.getHHMM(Date.now()/1000))
      setInterval(()=>{ setTime(DateTime.getHHMM(Date.now()/1000)) }, 60000)
    }, s*1000)
  }, [])

  return <span className={styles.time}
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
  >{time}</span>
}

export default Time

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
