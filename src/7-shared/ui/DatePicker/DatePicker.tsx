import React from 'react'

import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import Dialog from 'src/7-shared/ui/Dialog/Dialog'
import TextField from 'src/7-shared/ui/TextField/TextField'
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions'
import TextButton from 'src/7-shared/ui/Button/TextButton'
import IconButton from 'src/7-shared/ui/IconButton/IconButton'
import SwgIcon from 'src/7-shared/ui/Icons/SwgIcon'
import { ArrowBackIos, ArrowForwardIos, Calendar } from 'src/7-shared/ui/Icons/Icons'

import styles from './DatePicker.module.css'
import { fakeEvent } from './fakeEvent'
import DatePickerCalendar from './DatePickerCalendar'

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
  const {label, value = '', error, onChange = ()=>{}, ...rest} = props
  const [open, setOpen] = React.useState(false)
  //const rest = {...r, onSelect: ()=>{setOpen(true)}}

  const todayTS = DateTime.getBeginDayTimestamp(Date.now()/1000)
  const [state, setState] = React.useState<DatePickerState>(getDatePickerState(value, todayTS))
  const inputRef = React.useRef<HTMLInputElement|null>(null)

  const onChangeRef = React.useCallback((node: HTMLInputElement) => {
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

  return <>
  <TextField label={label} value={value} error={error} onChange={onChange}
    {...rest} ref={onChangeRef}>
      <IconButton onClick={()=>{setOpen(true)}}><SwgIcon><Calendar/></SwgIcon></IconButton>
  </TextField>
  <Dialog open={open} onClose={closeHandle}>
    <div className={styles.title}>
      <span>Select date</span>
      <h4>{DateTime.getWeekdayMonthDayString(state.selectedTS)}</h4>
    </div>
    <div className={styles.header}>
      <div className={styles.label}>{DateTime.getMonthNamesArray()[state.month] + ' ' + state.year}</div>
      <div className={styles.buttons}>
        <IconButton><SwgIcon><ArrowBackIos/></SwgIcon></IconButton>
        <IconButton><SwgIcon><ArrowForwardIos/></SwgIcon></IconButton>
      </div>
    </div>
    <div className={styles.weekdays}>
      {DateTime.getWeekdaysArray().map(d=><div className={styles.weekday} key={d}>{d[0]}</div>)}
    </div>
    <DatePickerCalendar {...state} onSelect={(timestamp)=>setState(s=>({...s, selectedTS:timestamp}))}/>
    <DialogActions>
      <TextButton onClick={closeHandle}>Cancel</TextButton>
      <TextButton onClick={clearHandle}>Clear</TextButton>
      <TextButton onClick={changeHandle}>Ok</TextButton>
    </DialogActions>
  </Dialog>
  </>
})

export default DatePicker