import React from 'react'
import styles from './Tabs.module.css'

interface TabsProps {
  /** Выбранный таб */
  value?: number
  /** Массив ярлыков */
  labels: Array<string|null>
  /** Колбэк-функция изменения таба */
  onChange?: (event: React.SyntheticEvent, newValue: number)=>void
}

const Tabs: React.FC<TabsProps> = (props) => {
  const {value = 0, labels, onChange = ()=>{}} = props
  const selectedTabRef = React.useRef<HTMLDivElement | null>(null)
  const [state, setState] = React.useState<TabPosition>({left: 0, width: 0})
  const [clicked, setClicked] = React.useState<number | null>(null)
  React.useEffect(() => {
    setState({left: selectedTabRef.current?.offsetLeft ?? 0, width: selectedTabRef.current?.clientWidth ?? 0})
  }, [])

  const changeTabHandler = (event: React.MouseEvent, tab: number) => {
    const node = event.currentTarget as HTMLDivElement
    if(clicked === tab) {
      const ripple = node.getElementsByClassName(styles.clicked)[0]
      ripple?.classList.add(styles.selected)
      setState({left: node.offsetLeft, width: node.clientWidth})
      onChange(event, tab)
    }
    setClicked(null)
    removeRipple(event)
  }

  return (
  <div className={styles.wrapper}>
    <div className={styles.container}>{
      labels.map((l,i) => ( l===null ? null :
        <div className={styles.tab + (value === i ? ' '+styles.selected : '')}
          ref={value === i ? selectedTabRef : undefined}
          key={i}
          onPointerDown={e=>{
            if(!e.isPrimary) return
            createRipple(e, value === i)
            setClicked(i)
          }}
          onPointerUp={e=>{
            if(e.isPrimary) changeTabHandler(e,i)
          }}
          onPointerLeave={e=>{
            if(e.isPrimary) removeRipple(e)
          }}
          onPointerCancel={e=>{
            if(e.isPrimary) removeRipple(e)
          }}
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
  const circle = document.createElement('span')
  const radius = Math.ceil(Math.hypot(tab.clientWidth, tab.clientHeight))

  circle.style.width = circle.style.height = `${2*radius}px`
  circle.style.left = `${event.clientX - offsetLeft - radius}px`
  circle.style.top = `${event.clientY - offsetTop - radius}px`
  circle.classList.add(styles.ripple, styles.clicked)
  if(isSelected) circle.classList.add(styles.selected)

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
