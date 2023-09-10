import React from 'react'

import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import Dialog from 'src/7-shared/ui/Dialog/Dialog'
import TextField from 'src/7-shared/ui/TextField/TextField'
import DialogContent from 'src/7-shared/ui/Dialog/DialogContent'
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions'
import TextButton from 'src/7-shared/ui/Button/TextButton'

import styles from './DatePicker.module.css'
import DayButton from './DayButton'
import { fakeEvent } from './fakeEvent'
import IconButton from '../IconButton/IconButton'

interface DatePickerProps extends React.HTMLProps<HTMLInputElement> {
  /** Ярлык */
  label: string
  /** Значение */
  value?: string
  /** Признак ошибки валидации */
  error?: boolean
}

type DatePickerState = {
  year: number
  month: number
  selectedTS: number
}

function getDatePickerState(s: string, todayTS: number): DatePickerState {
  const selectedTS = s!==''
    ? DateTime.YYYYMMDDToTimestamp(s) 
    : todayTS
  const {year, month} = DateTime.getYearMonthDay(selectedTS)
  return {year, month, selectedTS}
}

const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>((props, ref) => {
  const {label, value = '', error, onChange = ()=>{}, ...r} = props
  const [open, setOpen] = React.useState(false)
  const rest = {...r, onSelect: ()=>{setOpen(true)}}

  const todayTS = DateTime.getBeginDayTimestamp(Date.now()/1000)
  const [state, setState] = React.useState<DatePickerState>(getDatePickerState(value, todayTS))
  const inputRef = React.useRef<HTMLInputElement|null>(null)

  const onChangeRef = React.useCallback((node: HTMLInputElement) => {
    const orignode = node
    if(node !== null) {
      node = new Proxy<HTMLInputElement>(node, {
        set: (target: any, prop, value)=>{
          if(prop === 'value') setState(getDatePickerState(value, todayTS))
          target[prop] = value
          return true
        },
        get: (target: any, prop)=>{
          if(typeof target[prop] === 'function') return target[prop].bind(target)
          else return target[prop]
        }
      })
      inputRef.current = node
    }
    if(!ref) return
    if(typeof ref === 'function') ref(node)
    else ref.current = node
  }, [])

  const closeHandle = ()=>{
    if(inputRef.current !== null) setState(getDatePickerState(inputRef.current.value, todayTS))
    setOpen(false)
  }

  const clearHandle = ()=>{
    if(inputRef.current !== null) {
      inputRef.current.value = ''
//////////////////////////////////////
      onChange(fakeEvent(inputRef.current,'change'))
//////////////////////////////////////
    }
    setOpen(false)
  }

  const changeHandle: React.MouseEventHandler = (e)=>{
    
    if(inputRef.current !== null) {
      inputRef.current.value = DateTime.getYYYYMMDD(state.selectedTS)
//////////////////////////////////////
      onChange(fakeEvent(inputRef.current,'change'))
//////////////////////////////////////
    }
    setOpen(false)
  }

  const monthStructure = getMonthStructure(state.selectedTS)

  return <>
  <TextField label={label} value={value} error={error} //readOnly
    {...rest} ref={onChangeRef}></TextField>
  <Dialog open={open} onClose={closeHandle}>
    <div className={styles.title}>
      <span>Select date</span>
      <h4>{DateTime.getWeekdayMonthDayString(state.selectedTS)}</h4>
    </div>
    <div className={styles.header}>
      <div className={styles.label}>{DateTime.getMonthNamesArray()[state.month] + ' ' + state.year}</div>
      <div className={styles.buttons}>
        <IconButton>
          <svg focusable='false' viewBox='0 0 24 24'>
            <path d='M15 6 9 12 15 18' strokeWidth={2.5} fill='none'></path>
          </svg>
        </IconButton>
        <IconButton>
          <svg focusable='false' viewBox='0 0 24 24'>
            <path d='M9 6 15 12 9 18' strokeWidth={2.5} fill='none'></path>
          </svg>
        </IconButton>
      </div>
    </div>
    <div className={styles.calendar}>
      <div className={styles.weekdays}>
        {DateTime.getWeekdaysArray().map(d=><div className={styles.weekday} key={d}>{d[0]}</div>)}
      </div>
      {monthStructure.map((week,i)=>(
        <div key={i} className={styles.week}>
          {week.map((d,i)=>d.day
          ? <DayButton key={d.timestamp} today={d.timestamp===todayTS} selected={d.timestamp===state.selectedTS}
            onClick={()=>{
              //if(inputRef.current !== null) inputRef.current.value = DateTime.getYYYYMMDD(d.timestamp)
              setState(s=>{return {...s, selectedTS:d.timestamp}})
            }}>
            {d.day}</DayButton>
          : <div key={i} className={styles.placeholder}></div>
          )}
        </div>
      ))}
    </div>
    <DialogActions>
      <TextButton onClick={closeHandle}>Cancel</TextButton>
      <TextButton onClick={clearHandle}>Clear</TextButton>
      <TextButton onClick={changeHandle}>Ok</TextButton>
    </DialogActions>
  </Dialog>
  </>
})

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