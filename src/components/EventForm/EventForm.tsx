import React from 'react'
import { useForm } from 'react-hook-form'
import { eventFormStore, eventsCache, eventsStore, projectsStore } from 'src/stores/MainStore'
import { EventData } from 'src/stores/Events/EventData'
import ZCron from 'src/utils/ZCron'
import Calc from 'src/utils/Calc'

import Button from 'src/components/Common/Button'
import TextField from 'src/components/ui/TextField/TextField'
import Select from 'src/components/ui/Select/Select'
import styles from './EventForm.module.css'
import TextArea from '../ui/TextArea/TextArea'

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

const EventForm: React.FC = () => {

  const {register, watch, handleSubmit, formState: {errors}} = useForm<Fields>({
    mode: 'onChange',
    defaultValues: {
      name: eventFormStore.eventData.name,
      comment: eventFormStore.eventData.comment,
      project: eventFormStore.eventData.project,
      repeat: eventFormStore.eventData.repeat,
      start: eventFormStore.eventData.start,
      time: eventFormStore.eventData.time,
      duration: eventFormStore.eventData.duration,
      end: eventFormStore.eventData.end,
      credit: eventFormStore.eventData.credit?.toString(),
      debit: eventFormStore.eventData.debit?.toString()
    }
  })

  const isNew = eventFormStore.eventData.id !== null ? false : true

  const onCompleteHandle = handleSubmit((e) => {
    const isCompleted = eventFormStore.eventData.completed
    if(isCompleted === undefined) return
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
  })

  const onDeleteHandle = () => {
    const id = eventFormStore.eventData.id
    if(id === null) return
    eventsStore.deleteEvent(id)
    eventFormStore.hideForm()
  }

  // Изменение параметров события, для всех если событие повторяемое
  const onChangeEventHandle = handleSubmit((e) => {
    const id = eventFormStore.eventData.id
    if(id === null) return
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
  })

  const onAddHandle = handleSubmit((e) => {
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
  })

  return ( <>
    <header className={styles.header}>
    {!isNew && <Button onClick={onCompleteHandle}>{eventFormStore.eventData.completed?'Mark uncompleted':'Complete'}</Button>}
    {!isNew && <Button onClick={onDeleteHandle}>Delete</Button>}
    {!isNew && <Button onClick={onChangeEventHandle}>{eventFormStore.eventData.repeat?'Change All':'Change'}</Button>}
    {isNew && <Button onClick={onAddHandle}>Add Event</Button>}
    <Button onClick={eventFormStore.hideForm}>Cancel</Button>
  </header>
  <form className={styles.form}>
    <TextField label='Name' error={!!errors.name}
      {...register('name', {required: true})}/>
    <TextArea label='Comment'
      {...register('comment')}/>
    <Select label='Project' error={!!errors.project}
      options={projectsStore.list.map((p,i)=>{ return {value: p.name, label: p.name} })}
      {...register('project', {required: true})} />
    <TextField label='Repeat' error={!!errors.repeat} 
      {...register('repeat', {validate: ZCron.validate})}/>
    <div className={styles.grid}>
      <TextField label='Start date' error={!!errors.start}
        {...register('start', {required: true, pattern: /^20\d{2}\.(0[1-9]|1[0-2]).(0[1-9]|[1-2]\d|3[01])$/})}/>
      <TextField label='Time' error={!!errors.time}
        {...register('time', {pattern: /^([0-1]?\d|2[0-3]):[0-5]\d$/})}/>
      <TextField label='Duration' disabled={!!watch().end} error={!!errors.duration}
        {...register('duration', {pattern: /^(\d+d ?)?\d*(:\d\d)?$/})}/> {/* поправить с учетом ограничения часов при указании дней*/}
      <TextField label='End date' disabled={!!watch().duration} error={!!errors.end}
        {...register('end', {pattern: /^20\d{2}\.(0[1-9]|1[0-2]).(0[1-9]|[1-2]\d|3[01])$/})}/>
      <TextField label={'Credit'} error={!!errors.credit}
        {...register('credit', {validate: Calc.validate})}/>
      <TextField label='Debit' error={!!errors.debit}
        {...register('debit', {validate: Calc.validate})}/>
    </div>
  </form>
  </>
  )
}

export default EventForm