import React from 'react'
import styles from './Calendar.module.css'
import CalendarDay from "./CalendarDay"
import EventItem from './EventItem'
import DateTime from 'src/utils/datetime'
import {calendarStore, eventsCache, eventsStore, mainStore, weatherStore} from 'src/stores/MainStore'
import Modal from './Modal'
import EventForm from './EventForm'
import { observer } from 'mobx-react-lite'
import { min } from 'src/utils/utils'

function calendar() {

  const [isModal,setModal] = React.useState(false)
  const [modalState,setModalState] = React.useState({})
  const currentWeekRef = React.useRef(null)
  
  const today = DateTime.getBeginDayTimestamp(Date.now()/1000)
  const currentDay = DateTime.getBeginDayTimestamp(mainStore.currentDay)
  const zeroPoint  = DateTime.getBegintWeekTimestamp(currentDay)
  let currentTimestamp = zeroPoint - calendarStore.shift*7*86400

  React.useEffect(()=>{ currentWeekRef.current.scrollIntoView(true) }, [])

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
        tasks: eventsCache.getEventsWithPlaceholders(currentTimestamp,stack),
        actualBalance: eventsCache.getActualBalance(currentTimestamp),
        lastActualBalanceDate: eventsCache.lastActualBalanceDate,
        plannedBalance: eventsCache.getPlannedBalance(currentTimestamp),
        plannedBalanceChange: eventsCache.getPlannedBalanceChange(currentTimestamp),
        firstPlannedEventDate: eventsCache.getFirstPlannedEventDate()
      }
      currentTimestamp += 86400
    }
  }
  const onScrollHandle = (e)=>{
    const el=e.target
    const t = el.scrollTop
    const b = el.scrollHeight-el.scrollTop-el.clientHeight
    const avgDayHeight = el.scrollHeight/arrayOfDays.length
    const w = Math.ceil(t/avgDayHeight-calendarStore.shift)
    const d = new Date((zeroPoint+w*7*86400)*1000)
    
    calendarStore.setMonthYear(d.getMonth(), d.getFullYear())
    calendarStore.correctShift(t/avgDayHeight, b/avgDayHeight)
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
    const s = eventsStore.getEventData(id)
    setModalState({...s, completed, timestamp:start, id})
    setModal(true)
  }
  const dragStart = (e,id) => {
    e.dataTransfer.setData('event_item', JSON.stringify(id))
  }
  const dragDrop = (e, timestamp) => {
    e.preventDefault()
    const c = JSON.parse(e.dataTransfer.getData('event_item'))
    if(e.ctrlKey) eventsStore.copyToDate(c.id,timestamp)
    else eventsStore.shiftToDate(c.id,timestamp,c.start)
    setModalState(s=>({...s}))
  }

  console.log('draw calendar')
  return (
    <div className={styles.wrapper}>
    <div className={styles.dayOfWeekLabels}>
      { DateTime.WEEKDAYS.map( (d,i) => <div key={i}>{d}</div> ) }
    </div>
    <div className={styles.CalendarBody} onScroll={onScrollHandle}>
      { arrayOfDays.map( week => (
        <div ref={week[0].timestamp==zeroPoint?currentWeekRef:null} className={styles.CalendarWeek} key={week[0].timestamp} style={{height:(week.reduce((a,d)=>d.tasks.length>a?d.tasks.length:a,7))*1.5+1.4+1.4+1.4+'em'}}> {
          week.map( (d,j) => (
            <CalendarDay data={d} key={d.timestamp} today={today===d.timestamp} 
              weather={d.weather}
              onAddEvent={openNewEventForm}
              onDragDrop={e=>dragDrop(e,d.timestamp)}
              onDayOpen={(t)=>mainStore.changeViewMode({mode: 'Day', timestamp: t})}
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