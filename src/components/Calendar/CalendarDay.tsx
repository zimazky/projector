import React from 'react'
import styles from './CalendarDay.module.css'
import DateTime from 'src/utils/datetime'
import { ForecastData1d } from 'src/stores/Weather/WeatherStore'
import { plus } from 'src/utils/utils'

function minimize(d: number) { return (d/1000).toFixed(1) }

type CalendarDayProperties = {
  data: {
    timestamp: number,
    weather: ForecastData1d
    actualBalance: number,
    plannedBalance: number,
    plannedBalanceChange: number,
    style: 'normal' | 'uncompleted' | 'completed'
  };
  today: boolean;
  onAddEvent: (timestamp: number, name: string) => void;
  onDragDrop: (e) => void;
  onDayOpen: (timestamp: number) => void;
  children: any;
}

export default function CalendarDay({data, today=false, onAddEvent=(t,s)=>{}, onDragDrop=e=>{}, onDayOpen=(timestamp)=>{}, children = null}: CalendarDayProperties) {
  const {timestamp, weather, actualBalance, plannedBalance, plannedBalanceChange, style} = data
  const inputElementRef = React.useRef(null)
  const {day, month} = DateTime.getDayMonthWeekday(timestamp)

  function onClickHandle(e) {
    if(inputElementRef) inputElementRef.current.focus()
  }
  function onKeyDownHandle(e) {
    if (e.key == 'Enter') e.target.blur()
  }
  function onBlurHandle(e) {
    onAddEvent(timestamp, e.target.innerText)
    e.target.innerText = ''
  } 

  const dragOver = (e) => {
    e.preventDefault()
    if(e.ctrlKey) e.dataTransfer.dropEffect='copy'
    else e.dataTransfer.dropEffect='move'
  }

  return (
    <div className={style==='normal' ? styles.day : (style==='uncompleted' ? styles.between_firstplanned_and_actual : styles.before_actual_date) } 
      onClick={onClickHandle} onDrop={onDragDrop} onDragOver={dragOver}>
      <div className={today?styles.today:styles.header} onClick={e=>{onDayOpen(timestamp)}}>
        {day + (day==1?' '+DateTime.MONTHS[month]:'')}
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
      <div className={styles.balance} title={'planned: '+plannedBalance.toFixed(2)+plus(plannedBalanceChange,2)+'\nactual: '+actualBalance.toFixed(2)}>{minimize(plannedBalance) + 
        (plannedBalanceChange==0?'k':plus(plannedBalanceChange/1000, 1)+'k') +
        ' ' + minimize(actualBalance)}</div>
      {children}
      <div ref={inputElementRef} className={styles.input} contentEditable='true' suppressContentEditableWarning={true}
      onBlur={onBlurHandle} onKeyDown={onKeyDownHandle}></div>
    </div> 
  )
}