import React from 'react'
import styles from './CalendarDay.module.css'
import DateTime from 'src/utils/datetime'
import { ForecastData1d } from 'src/stores/Weather/WeatherStore';

type CalendarDayProperties = {
  data: {
    timestamp: number,
    actualBalance: number,
    lastActualBalanceDate: number,
    plannedBalance: number,
    plannedBalanceChange: number,
    firstPlannedEventDate: number
  };
  today: boolean;
  weather: ForecastData1d;
  onAddEvent: (timestamp: number, name: string) => void;
  onDragDrop: (e) => void;
  onDayOpen: (timestamp: number) => void;
  children: any;
}

export default function CalendarDay({data, today=false, weather, onAddEvent=(t,s)=>{}, onDragDrop=e=>{}, onDayOpen=(timestamp)=>{}, children = null}: CalendarDayProperties) {
  const {timestamp, actualBalance, lastActualBalanceDate, plannedBalance, plannedBalanceChange, firstPlannedEventDate} = data
  const inputElementRef = React.useRef(null)
  const {day, month} = DateTime.getDayMonthWeekday(timestamp)

  function onClickHandle(e) {
    if(inputElementRef) inputElementRef.current.focus()
  }
  function onKeyDownHandle(e) {
    console.log('key',e.key)
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
  const minimize = d => (d/1000).toFixed(1)
  const plus = (d,n=1) => d>0?'+'+d.toFixed(1):d.toFixed(n)

  //console.log(firstPlannedEventDate)

  return (
    <div className={timestamp>=lastActualBalanceDate ?
        styles.day
        : firstPlannedEventDate!==0 && timestamp>=firstPlannedEventDate ? 
          styles.between_firstplanned_and_actual : styles.before_actual_date} 
      onClick={onClickHandle} onDrop={onDragDrop} onDragOver={dragOver}>
      <div className={today?styles.today:styles.header} onClick={e=>{onDayOpen(timestamp)}}>
        {day + (day==1?' '+DateTime.MONTHS[month]:'')}
        {weather ? <div className={styles.weather} title={
          'temperature: '+ formatT(weather.temperatureMax)+'/'+formatT(weather.temperatureMin)
          + '\nclouds: ' + weather.clouds.toFixed(0)
          + '\nprecipitation: ' + weather.pop.toFixed(2)
          + '\nrain: ' + weather.rain.toFixed(2)
          + '\nsnow: ' + weather.snow.toFixed(2)
          + '\ncount: ' + weather.count
          + (weather.isThunderstorm ? '\nThunderstorm' : '')
        }><sup>{'🌡️'+formatT(weather.temperatureMax)}</sup><sub>{formatT(weather.temperatureMin)}</sub><sup>{weather.emoji}</sup></div>: null}
      </div>
      <div className={styles.balance} title={'planned: '+plannedBalance.toFixed(2)+plus(plannedBalanceChange,2)+'\nactual: '+actualBalance.toFixed(2)}>{minimize(plannedBalance) + 
        (plannedBalanceChange==0?'k':plus(plannedBalanceChange/1000)+'k') +
        ' ' + minimize(actualBalance)}</div>
      {children}
      <div ref={inputElementRef} className={styles.input} contentEditable='true' suppressContentEditableWarning={true}
      onBlur={onBlurHandle} onKeyDown={onKeyDownHandle}></div>
    </div> 
  )
}

function formatT(t: number): string {
  return t<0 ? '-' : '+' + t.toFixed(0);
}