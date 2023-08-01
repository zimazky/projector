import React, { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import useUpdate from 'src/hooks/useUpdate'

import { max, min } from 'src/utils/utils'
import DateTime, { timestamp } from 'src/utils/datetime'
import {calendarStore, eventFormStore, eventsStore, mainStore} from 'src/stores/MainStore'

import CalendarDay from "./CalendarDay"
import Modal from 'src/components/Modal/Modal'
import EventForm from 'src/components/EventForm/EventForm'

import styles from './Calendar.module.css'
import CalendarEventItem from 'src/components/Calendar/CalendarEventItem'

const Calendar: React.FC = observer(function() {

  const forceUpdate = useUpdate()

  useEffect(()=>{
    const weekDiv = document.getElementById(mainStore.currentWeek.toString())
    weekDiv?.scrollIntoView(true)
  }, [mainStore.currentWeek, mainStore.mustForceUpdate])

  const today = DateTime.getBeginDayTimestamp(Date.now()/1000)
  const zeroPoint  = mainStore.currentWeek

  const calendarWeeks = calendarStore.getCalendarDataStructure(zeroPoint)
  
  const onScrollHandle = (e: React.UIEvent<HTMLElement>) => {
    const el=e.currentTarget
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

  const dragDrop = (e: React.DragEvent<HTMLElement>, timestamp: timestamp) => {
    e.preventDefault()
    console.log(e.dataTransfer)
    const c = JSON.parse(e.dataTransfer.getData('event_item'))
    if(e.ctrlKey) eventsStore.copyToDate(c.id,timestamp)
    else eventsStore.shiftToDate(c.id,timestamp,c.start)
    forceUpdate()
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
                key={d.timestamp} isToday={today===d.timestamp} 
                onDragDrop={e=>dragDrop(e,d.timestamp)}
                >
                { d.events.map((t,i)=>(<CalendarEventItem key={i} event={t} days={min(t.days,7-j)} timestamp={d.timestamp}/>))}
              </CalendarDay>
            ))}
          </div>
        ))}
      </div>
      { eventFormStore.isShow &&
      <Modal onCancel={eventFormStore.hideForm}>
        <EventForm/>
      </Modal>
      }
    </div>
  )
})

export default Calendar