import React from 'react'
import { useForm } from 'react-hook-form'
import { eventFormStore, eventsCache, eventsStore, projectsStore } from 'src/stores/MainStore'
import Button from 'src/components/Common/Button'
import styles from './EventForm.module.css'
import Calc from 'src/utils/Calc'
import TextField from 'src/components/ui/TextField/TextField'
import ZCron from 'src/utils/ZCron'
import Select from 'src/components/ui/Select/Select'
import { EventData } from 'src/stores/Events/EventData'

interface Fields {
  name: string
  comment: string
  project: string
  repeat: string
  start: string
  time: string
  duration: string
  end: string
  credit: string
  debit: string
}

export default function EventForm(): React.JSX.Element {

  const {register, watch, formState: {errors}} = useForm<Fields>({mode: 'onChange'})

  //const submit: SubmitHandler<Fields> = (data)=>{console.log(data)}

  const isNew = eventFormStore.eventData.id !== null ? false : true

  const onCompleteHandle = (isCompleted?: boolean) => {
    if(isCompleted===undefined) return
    const e = watch()
    const eventData: EventData = {
      name: e.name,
      comment: e.comment,
      project: e.project,
      start: e.start,
      end: e.end,
      time: e.time,
      duration: e.duration,
      credit: Calc.calculate(e.credit),
      debit: Calc.calculate(e.debit)
    }
    if(isCompleted) eventsStore.uncompleteEvent(eventFormStore.eventData.id, eventData)
    else eventsStore.completeEvent(eventFormStore.eventData.id, eventFormStore.eventData.timestamp, eventData)
    eventFormStore.hideForm()
  }

  const onDeleteHandle = (id: number | null) => {
    if(id === null) return
    eventsStore.deleteEvent(id)
    eventFormStore.hideForm()
  }

  // Изменение параметров события, для всех если событие повторяемое
  const onChangeEventHandle = (id: number | null) => {
    if(id === null) return
    const e = watch()
    const eventData: EventData = {
      name: e.name,
      comment: e.comment,
      project: e.project,
      repeat: e.repeat,
      start: e.start,
      end: e.end,
      time: e.time,
      duration: e.duration,
      credit: Calc.calculate(e.credit),
      debit: Calc.calculate(e.debit)
    }
    eventsStore.updateEvent(id, eventData)
    eventFormStore.hideForm()
  }

  const onAddHandle = () => {
    const e = watch()
    const eventData: EventData = {
      name: e.name,
      comment: e.comment,
      project: e.project,
      repeat: e.repeat,
      start: e.start,
      end: e.end,
      time: e.time,
      duration: e.duration,
      credit: Calc.calculate(e.credit),
      debit: Calc.calculate(e.debit)
    }
    eventsStore.addPlannedEventData(eventData)
    eventsCache.init()
    eventFormStore.hideForm()
  }

  return (
  <form className={styles.form}>
    {!isNew && <Button onClick={()=>onCompleteHandle(eventFormStore.eventData.completed)}>{eventFormStore.eventData.completed?'Mark uncompleted':'Complete'}</Button>}
    {!isNew && <Button onClick={()=>onDeleteHandle(eventFormStore.eventData.id)}>Delete</Button>}
    {!isNew && <Button onClick={()=>onChangeEventHandle(eventFormStore.eventData.id)}>{eventFormStore.eventData.repeat?'Change All':'Change'}</Button>}
    {isNew && <Button onClick={onAddHandle}>Add Event</Button>}
    <Button onClick={eventFormStore.hideForm}>Cancel</Button>

    <TextField label='Name' value={eventFormStore.eventData.name ?? ''} error={!!errors.name}
      {...register('name', {required: true})}></TextField>
    <TextField label='Comment' value={eventFormStore.eventData.comment ?? ''} {...register('comment')}></TextField>
    <Select label='Project' defaultValue={eventFormStore.eventData.project} error={!!errors.project}
      options={projectsStore.list.map((p,i)=>{ return {value: p.name, label: p.name} })}
      {...register('project', {required: true})} />
    <TextField label='Repeat' value={eventFormStore.eventData.repeat ?? ''} error={!!errors.repeat} 
      {...register('repeat', {validate: ZCron.validate})}></TextField>
    <TextField label='Start date' value={eventFormStore.eventData.start ?? ''} error={!!errors.start}
      {...register('start', {required: true, pattern: /^20\d{2}\.(0[1-9]|1[0-2]).(0[1-9]|[1-2]\d|3[01])$/})}></TextField>
    <TextField label='Time' value={eventFormStore.eventData.time ?? ''} error={!!errors.time}
      {...register('time', {pattern: /^([0-1]?\d|2[0-3]):[0-5]\d$/})}></TextField>
    <TextField label='Duration' value={eventFormStore.eventData.duration ?? ''} error={!!errors.duration}
      {...register('duration', {pattern: /^(\d+d ?)?\d*(:\d\d)?$/})}></TextField> {/* поправить с учетом ограничения часов при указании дней*/}
    <TextField label='End date' value={eventFormStore.eventData.end ?? ''} error={!!errors.end}
      {...register('end', {pattern: /^20\d{2}\.(0[1-9]|1[0-2]).(0[1-9]|[1-2]\d|3[01])$/})}></TextField>
    <TextField label='Credit' value={eventFormStore.eventData.credit?.toString() ?? ''} error={!!errors.credit}
      {...register('credit', {validate: Calc.validate})}></TextField>
    <TextField label='Debit' value={eventFormStore.eventData.debit?.toString() ?? ''} error={!!errors.debit}
      {...register('debit', {validate: Calc.validate})}></TextField> {/* поправить с учетом выражений */}
  </form>
  )
}