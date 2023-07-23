import React from 'react'
import styles from './Calendar.module.css'
import CalendarDay from "./CalendarDay"
import EventItem from './EventItem'
import DateTime from 'src/utils/datetime'
import {eventList} from 'src/model/data'
import Modal from './Modal'
import Button from './Button'
import EventForm from './EventForm'
import { observer } from 'mobx-react-lite'
import { weatherStore } from 'src/stores/Weather/WeatherStore'

const weekBuffer = 4

function calendar({onDayOpen = (timestamp: number) => {}}) {

  const [isModal,setModal] = React.useState(false)
  const [shift,setShift] = React.useState(weekBuffer)
  const scrollElement = React.useRef(null)
  const divElement = React.useRef(null)
  const [modalState,setModalState] = React.useState({})
  const currentWeekRef = React.useRef(null)
  const wrapperRef = React.useRef(null)
  
  const currentDay = DateTime.getBeginDayTimestamp(Date.now()/1000)
  let currentTimestamp = DateTime.getBegintWeekTimestamp(Date.now()/1000)
  const zeroPoint = currentTimestamp
  currentTimestamp -= shift*7*86400
  /*
  onOrientationChange = (e)=>{
    if(window.innerWidth<=480) {
      const t = scrollElement.current.scrollTop/scrollElement.current.scrollHeight
      document.body.style.fontSize = '10px'
    }
  }
  */
  React.useEffect(()=>{
    currentWeekRef.current.scrollIntoView(true)
    wrapperRef.current.scrollIntoView(true)
    /*window.addEventListener('orientationchange', onOrientationChange)
    return ()=>window.removeEventListener('orientationchange', onOrientationChange)*/
  }, [])

  const arrayOfDays = []
  for(let i=0;i<=20;i++) {
    arrayOfDays.push([])
    let stack = []
    for(let j=0;j<=6;j++) {
      arrayOfDays[i].push([])
      const weather = weatherStore.state === 'ready'? weatherStore.data1d.find(d => d.timestamp==currentTimestamp) : null;
      arrayOfDays[i][j] = {
        timestamp: currentTimestamp,
        weather,
        tasks: eventList.getEventsWithPlaceholders(currentTimestamp,stack),
        actualBalance: eventList.getActualBalance(currentTimestamp),
        lastActualBalanceDate: eventList.lastActualBalanceDate,
        plannedBalance: eventList.getPlannedBalance(currentTimestamp),
        plannedBalanceChange: eventList.getPlannedBalanceChange(currentTimestamp),
        firstPlannedEventDate: eventList.getFirstPlannedEventDate()
      }
      currentTimestamp += 86400
    }
  }
  const min = (a,b)=>a<b?a:b

  const onScrollHandle = (e)=>{
    const el=e.target
    const t = el.scrollTop
    const b = el.scrollHeight-el.scrollTop-el.clientHeight
    const avgDayHeight = el.scrollHeight/arrayOfDays.length
    const w = Math.ceil(t/avgDayHeight-shift)
    const d = new Date((zeroPoint+w*7*86400)*1000)
    divElement.current.innerText =d.getFullYear() + ' ' + DateTime.MONTHS_FULL[d.getMonth()] + ' '+w+' week'
    if(t<weekBuffer*avgDayHeight) setShift(s=>s+weekBuffer)
    else if(b<weekBuffer*avgDayHeight) setShift(s=>s-weekBuffer)
  }

  /////////////////////////////////////////////////////////////////////////////
  // Методы открывания формы
  const openNewEventForm = (timestamp, name) => {
    if(name==='') return
    setModalState({name, start: DateTime.getYYYYMMDD(timestamp)})
    setModal(true)
  }

  const openEventForm = compactEvent => {
    const {id, completed, start} = compactEvent
    const s = eventList.getEventData(id)
    setModalState({...s, completed, timestamp:start, id})
    setModal(true)
  }
  const dragStart = (e,id) => {
    e.dataTransfer.setData('event_item', JSON.stringify(id))
  }
  const dragDrop = (e, timestamp) => {
    e.preventDefault()
    const c = JSON.parse(e.dataTransfer.getData('event_item'))
    if(e.ctrlKey) eventList.copyToDate(c.id,timestamp)
    else eventList.shiftToDate(c.id,timestamp,c.start)
    setModalState(s=>({...s}))
  }

  console.log('draw calendar')
  return (
    <div className={styles.wrapper}>
    <div ref={wrapperRef} className={styles.header}>
      <Button>Today</Button>
      <span ref={divElement} className={styles.monthTitle}></span>
      <div className={styles.dayOfWeekLabels}>
        { DateTime.WEEKDAYS.map( (d,i) => <div key={i}>{d}</div> ) }
      </div>
    </div>
    <div className={styles.CalendarBody} onScroll={onScrollHandle} ref={scrollElement}>
      { arrayOfDays.map( week => (
        <div ref={week[0].timestamp==zeroPoint?currentWeekRef:null} className={styles.CalendarWeek} key={week[0].timestamp} style={{height:(week.reduce((a,d)=>d.tasks.length>a?d.tasks.length:a,7))*1.5+1.4+1.4+1.4+'em'}}> {
          week.map( (d,j) => (
            <CalendarDay data={d} key={d.timestamp} today={currentDay===d.timestamp} 
              weather={d.weather}
              onAddEvent={openNewEventForm}
              onDragDrop={e=>dragDrop(e,d.timestamp)}
              onDayOpen={onDayOpen}
              >
              { d.tasks.map((t,i)=>(<EventItem key={i} event={t} days={min(t.days,7-j)} timestamp={d.timestamp}
                onClick={openEventForm} onDragStart={e=>dragStart(e,t)}/>))}
            </CalendarDay>
          ))}
        </div>
      ))}
    </div>
    <Modal isOpen={isModal} onCancel={()=>setModal(false)}>
      <EventForm event={modalState} onExit={()=>setModal(false)}/>
    </Modal>
    </div>
  )
}

export const Calendar = observer(calendar);