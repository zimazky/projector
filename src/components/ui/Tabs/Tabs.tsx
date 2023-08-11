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

const Tabs = (props: TabsProps) => {
  const {value = 0, labels, onChange = ()=>{}} = props
  const selectedTabRef = React.useRef<HTMLDivElement | null>(null)
  const [state, setState] = React.useState<TabPosition>({left: 0, width: 0})
  React.useEffect(() => {
    //console.log({left: selectedTabRef.current?.offsetLeft ?? 0, width: selectedTabRef.current?.clientWidth ?? 0})
    setState({left: selectedTabRef.current?.offsetLeft ?? 0, width: selectedTabRef.current?.clientWidth ?? 0})
  }, [])

  const changeTabHandler = (event: React.SyntheticEvent, tab: number) => {
    const node = event.currentTarget as HTMLDivElement
    //console.log({left: node.offsetLeft, width: node.clientWidth})
    setState({left: node.offsetLeft, width: node.clientWidth})
    onChange(event, tab)
  }

  return (
  <div className={styles.wrapper}>
    <div className={styles.container}>{
      labels.map((l,i) => (
        <div className={styles.tab + (value === i ? ' '+styles.selected : '')}
          ref={value === i ? selectedTabRef : undefined}
          key={i} onClick={e=>changeTabHandler(e,i)}>{l}</div>
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