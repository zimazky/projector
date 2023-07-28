import React from 'react'
import { observer } from 'mobx-react-lite'
import { max, min } from 'src/utils/utils'
import DateTime from 'src/utils/datetime'
import {calendarStore, eventFormStore, eventsStore, mainStore} from 'src/stores/MainStore'

import CalendarDay from "./CalendarDay"
import EventItem from 'src/components/EventItem/EventItem'
import Modal from 'src/components/Modal/Modal'
import EventForm from 'src/components/EventForm/EventForm'
import styles from './Calendar.module.css'

function calendar() {

  const [modalState,setModalState] = React.useState({})
  
  React.useEffect(()=>{
    const weekDiv = document.getElementById(mainStore.currentWeek.toString())
    weekDiv?.scrollIntoView(true)
  }, [mainStore.currentWeek, mainStore.mustForceUpdate])

  const today = DateTime.getBeginDayTimestamp(Date.now()/1000)
  const zeroPoint  = mainStore.currentWeek

  const calendarWeeks = calendarStore.getCalendarDataStructure(zeroPoint)
  
  const onScrollHandle = (e)=>{
    const el=e.target
    const t = el.scrollTop
    const b = el.scrollHeight-el.scrollTop-el.clientHeight
    // Общее число строк календаря (включая заголовки, баланс и строку ввода)
    const sumN = calendarWeeks.reduce((a,w) => a + max(w.maxCount+3, 7+3), 0)
    // Средняя высота строки календаря
    const hAvg = el.scrollHeight/sumN
    // Определение индекса первой недели отображаемой в видимой области
    for(var i=0, H = t; H>0; i++) { H -= hAvg*max(calendarWeeks[i].maxCount+3, 7+3)}
    const w = Math.ceil(i-calendarStore.shift)
    // Дата первой видимой недели
    const d = new Date((zeroPoint+w*7*86400)*1000)
    calendarStore.setMonthYear(d.getMonth(), d.getFullYear())
    // Средняя высота недели в календаре
    const avgDayHeight = el.scrollHeight/calendarWeeks.length
    calendarStore.correctShift(t/avgDayHeight, b/avgDayHeight)
  }

  /////////////////////////////////////////////////////////////////////////////
  // Методы открывания формы
  const openNewEventForm = (timestamp, name) => {
    if(name==='') return
    setModalState({name, start: DateTime.getYYYYMMDD(timestamp)})
    eventFormStore.show()
  }

  const openEventForm = compactEvent => {
    const {id, completed, start} = compactEvent
    const s = eventsStore.getEventData(id)
    setModalState({...s, completed, timestamp:start, id})
    eventFormStore.show()
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
        { calendarWeeks.map( week => (
          <div id={week.list[0].timestamp.toString()}
            className={styles.CalendarWeek}
            key={week.list[0].timestamp}
            style={{height: max(week.maxCount, 7)*1.5+1.6+1.6+1.6+'em'}}> {
            week.list.map( (d,j) => (
              <CalendarDay data={d}
                key={d.timestamp} today={today===d.timestamp} 
                onAddEvent={openNewEventForm}
                onDragDrop={e=>dragDrop(e,d.timestamp)}
                onDayOpen={(t)=>mainStore.changeViewMode({mode: 'Day', timestamp: t})}
                >
                { d.events.map((t,i)=>(<EventItem key={i} event={t} days={min(t.days,7-j)} timestamp={d.timestamp}
                  onClick={openEventForm} onDragStart={e=>dragStart(e,t)}/>))}
              </CalendarDay>
            ))}
          </div>
        ))}
      </div>
      { eventFormStore.isShow &&
      <Modal onCancel={eventFormStore.hide}>
        <EventForm event={modalState} onExit={eventFormStore.hide}/>
      </Modal>
      }
    </div>
  )
}

export const Calendar = observer(calendar);