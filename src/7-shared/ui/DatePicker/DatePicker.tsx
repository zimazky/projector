import React from 'react'

import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import Dialog from 'src/7-shared/ui/Dialog/Dialog'
import TextField from 'src/7-shared/ui/TextField/TextField'
import DialogContent from 'src/7-shared/ui/Dialog/DialogContent'
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions'
import TextButton from 'src/7-shared/ui/Button/TextButton'

import styles from './DatePicker.module.css'

type DatePickerProps = {
  label: string
  value?: string
  onChange?: () => void
}

const DatePicker: React.FC<DatePickerProps> = ({label, value, onChange = ()=>{}}) => {
  const [open, setOpen] = React.useState(false)
  const rest = {onSelect: ()=>{setOpen(true)}}

  const todayTS = DateTime.getBeginDayTimestamp(Date.now()/1000)
  const selectedTS = value!==undefined
    ? DateTime.YYYYMMDDToTimestamp(value) 
    : todayTS

  const monthStructure = getMonthStructure(selectedTS)
  return <>
  <TextField label={label} value={value} {...rest}></TextField>
  <Dialog open={open} onClose={()=>setOpen(false)}>
    <DialogContent>
      <div className={styles.weekdays}>
        {DateTime.getWeekdaysArray().map(d=><div className={styles.weekday} key={d}>{d[0]}</div>)}
      </div>
      {monthStructure.map((week,i)=>(
        <div key={i} className={styles.week}>
          {week.map((d,i)=>d.day
          ? <div key={d.timestamp} className={styles.day 
            + (d.timestamp===todayTS?' '+styles.today:'') 
            + (d.timestamp===selectedTS?' '+styles.selected:'')}>{d.day}</div>
          : <div key={i} className={styles.placeholder}></div>
          )}
        </div>
      ))}
    </DialogContent>
    <DialogActions>
      <TextButton onClick={()=>setOpen(false)}>Cancel</TextButton>
      <TextButton>Ok</TextButton>
    </DialogActions>
  </Dialog>
  </>
}

export default DatePicker

type DayStructure = {
  timestamp: number
  day: number
}

function getMonthStructure(timestamp: number): DayStructure[][] {
  const {year, month, day} = DateTime.getYearMonthDay(timestamp)
  const daysInMonth = DateTime.getDaysInMonth(year, month)
  const weekday = DateTime.getWeekday(timestamp)
  const firstWeekday = (43 + weekday - DateTime.startWeek - day)%7

  const dayStructures: DayStructure[] = []

  for(let i=0; i<firstWeekday; i++) dayStructures.push({timestamp:0, day:0})
  for(let i=1, t=timestamp+86400-day*86400; i<=daysInMonth; i++, t+=86400) dayStructures.push({timestamp:t, day:i})
  const monthStructure: DayStructure[][] = []
  for(let i=0; i<dayStructures.length; i+=7) monthStructure.push(dayStructures.slice(i, i+7))
  return monthStructure
}