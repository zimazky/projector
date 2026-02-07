import React, { useContext } from 'react'

import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import { kilo, plus } from 'src/7-shared/helpers/utils'

import { StoreContext } from 'src/contexts/StoreContext'
import { CalendarDayStructure } from 'src/6-entities/stores/Calendar/CalendarStore'

import styles from './CalendarDay.module.css'

type CalendarDayProps = {
  /** Отображаемые данные календарного дня */
  data: CalendarDayStructure
  /** Признак сегодняшнего дня */
  isToday: boolean
  onDragDrop: (e: React.DragEvent<HTMLElement>) => void
  children: React.ReactNode
}

const CalendarDay: React.FC<CalendarDayProps> = (props) => {
  const { dayListStore, eventFormStore, uiStore } = useContext(StoreContext)
  const {data, isToday, onDragDrop, children = null} = props
  const {timestamp, weather, actualBalance, plannedBalance, plannedBalanceChange, style} = data
  const inputElementRef = React.useRef<HTMLDivElement>(null)
  const {day, month} = DateTime.getDayMonthWeekday(timestamp)

  const onDayOpen = (timestamp: timestamp) => {
    dayListStore.setDate(timestamp)
    uiStore.changeViewMode({mode: 'Day'})
  }

  const openEventFormWithNewEvent = (name: string) => {
    if(name==='') return
    eventFormStore.setEventDto({
      id: null, name, timestamp,
      start: DateTime.getYYYYMMDD(timestamp)
    })
    eventFormStore.showForm()
  }

  function onClickHandle(e: React.MouseEvent<HTMLElement>) {
    if(inputElementRef) inputElementRef.current?.focus()
  }

  function onKeyDownHandle(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key == 'Enter') e.currentTarget.blur()
  }

  function onBlurHandle(e: React.FocusEvent<HTMLElement>) {
    openEventFormWithNewEvent(e.target.innerText)
    e.target.innerText = ''
  } 

  const dragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    if(e.ctrlKey) e.dataTransfer.dropEffect = 'copy'
    else e.dataTransfer.dropEffect = 'move'
  }

  return (
    <div className={style==='normal' ? styles.day : (style==='uncompleted' ? styles.between_firstplanned_and_actual : styles.before_actual_date) } 
      onClick={onClickHandle} onDrop={onDragDrop} onDragOver={dragOver}>
      <div className={isToday?styles.today:styles.header} onClick={e=>{onDayOpen(timestamp)}}>
        {day + (day==1?' '+DateTime.getMonthShortNamesArray()[month]:'')}
        {weather ? <div className={styles.weather} title={
          'temperature: '+ plus(weather.temperatureMax)+'/'+plus(weather.temperatureMin)
          + '\nclouds: ' + weather.clouds.toFixed(0)
          + '\nprecipitation: ' + weather.pop.toFixed(2)
          + '\nrain: ' + weather.rain.toFixed(2)
          + '\nsnow: ' + weather.snow.toFixed(2)
          + '\ncount: ' + weather.count
          + (weather.isThunderstorm ? '\nThunderstorm' : '')
        }><sup>{'🌡️'+plus(weather.temperatureMax)}</sup><sub>{plus(weather.temperatureMin)}</sub><sup>{weather.emoji}</sup></div>: null}
      </div>
      <div className={styles.balance} title={'planned: '+plannedBalance.toFixed(2)+plus(plannedBalanceChange,2)+'\nactual: '+actualBalance.toFixed(2)}>{kilo(plannedBalance, 1) + 
        (plannedBalanceChange==0?'k':plus(plannedBalanceChange/1000, 1)+'k') +
        ' ' + kilo(actualBalance, 1)}</div>
      {children}
      <div ref={inputElementRef} className={styles.input} contentEditable='true' suppressContentEditableWarning={true}
      onBlur={onBlurHandle} onKeyDown={onKeyDownHandle}></div>
    </div> 
  )
}

export default CalendarDay