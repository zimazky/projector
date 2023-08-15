import React from 'react'
import styles from './Tabs.module.css'

interface TabsProps {
  /** Выбранный таб */
  value?: number
  /** Массив ярлыков */
  labels: string[]
  /** Колбэк-функция изменения таба */
  onChange?: (event: React.SyntheticEvent, newValue: number)=>void
}

function createRipple(event: React.MouseEvent, isSelected: boolean) {
  const tab = event.currentTarget as HTMLElement

  let offsetLeft = tab.offsetLeft
  let offsetTop = tab.offsetTop
  let parent: HTMLElement | null = tab.offsetParent as HTMLElement
  while(parent) {
    offsetLeft += parent.offsetLeft
    offsetTop += parent.offsetTop
    parent = parent.offsetParent as HTMLElement
  }

  const circle = document.createElement("span")
  const diameter = Math.max(tab.clientWidth, tab.clientHeight)
  const radius = diameter / 2

  circle.style.width = circle.style.height = `${diameter}px`
  circle.style.left = `${event.clientX - offsetLeft - radius}px`
  circle.style.top = `${event.clientY - offsetTop - radius}px`
  circle.classList.add(styles.ripple, styles.click)
  if(isSelected) circle.classList.add(styles.selected)

  const ripple = tab.getElementsByClassName(styles.ripple)[0]
  if(ripple) ripple.remove()

  tab.appendChild(circle)
}

function removeRipple(event: React.MouseEvent) {
  const tab = event.currentTarget as HTMLElement
  const ripple = tab.getElementsByClassName(styles.ripple)[0]
  if(ripple) {
    ripple.classList.replace(styles.click, styles.release)
    setTimeout(()=>{ if(ripple) ripple.remove() }, 5000)
  }
}

const Tabs = (props: TabsProps) => {
  const {value = 0, labels, onChange = ()=>{}} = props
  const selectedTabRef = React.useRef<HTMLDivElement | null>(null)
  const [state, setState] = React.useState<TabPosition>({left: 0, width: 0})
  const [clicked, setClicked] = React.useState<number | null>(null)
  React.useEffect(() => {
    setState({left: selectedTabRef.current?.offsetLeft ?? 0, width: selectedTabRef.current?.clientWidth ?? 0})
  }, [])

  const changeTabHandler = (event: React.SyntheticEvent, tab: number) => {
    const node = event.currentTarget as HTMLDivElement
    if(clicked === tab) {
      const ripple = node.getElementsByClassName(styles.ripple)[0]
      ripple?.classList.add(styles.selected)
      setState({left: node.offsetLeft, width: node.clientWidth})
      onChange(event, tab)
    }
    setClicked(null)
  }

  return (
  <div className={styles.wrapper}>
    <div className={styles.container}>{
      labels.map((l,i) => (
        <div className={styles.tab + (value === i ? ' '+styles.selected : '')}
          ref={value === i ? selectedTabRef : undefined}
          key={i}
          onMouseDown={e=>{
            createRipple(e, value === i)
            setClicked(i)
          }}
          onMouseUp={e=>{
            changeTabHandler(e,i)
            removeRipple(e)
          }}
          onMouseLeave={removeRipple}
          >{l}</div>
      ))}
    </div>
    <span className={styles.indicator} style={{left:state.left+'px', width:state.width+'px'}}></span>
  </div>)
}

export default Tabs

type TabPosition = {
  left: number
  width: number
}