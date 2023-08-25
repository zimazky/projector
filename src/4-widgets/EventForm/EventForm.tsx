import React from 'react'
import { useForm } from 'react-hook-form'

import ZCron from 'src/7-shared/libs/ZCron/ZCron'
import Calc from 'src/7-shared/libs/Calc/Calc'
import Button from 'src/7-shared/ui/Button/Button'
import TextField from 'src/7-shared/ui/TextField/TextField'
import Select from 'src/7-shared/ui/Select/Select'
import TextArea from 'src/7-shared/ui/TextArea/TextArea'
import Tabs from 'src/7-shared/ui/Tabs/Tabs'
import TabPanel from 'src/7-shared/ui/Tabs/TabPanel'

import { eventFormStore, eventsCache, eventsStore, projectsStore } from 'src/6-entities/stores/MainStore'
import { EventData } from 'src/6-entities/stores/Events/EventData'

import styles from './EventForm.module.css'

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

  const [tab, setTab] = React.useState(0)

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

  const isRepeat = watch().repeat ? true : false
  const isCompleted = eventFormStore.eventData.completed

  return ( <>
  <header>
    <div className={styles.buttonGroup}>
      {!isNew && <>
        <Button onClick={onCompleteHandle}>{eventFormStore.eventData.completed?'Undo':'Done'}</Button>
        {isRepeat && <Button>Delete</Button>}
        <Button onClick={onDeleteHandle}>{isRepeat ? 'Delete All' : 'Delete'}</Button>
      </>}
      <TextField label='Name' error={!!errors.name}
        {...register('name', {required: true})}/>
    </div>
    <Tabs value={tab} labels={['Main', isCompleted ? null : (isRepeat ? 'Repeating' : 'Repeat'), 'Location']} onChange={(e,tab)=>{setTab(tab)}}></Tabs>
  </header>
  <form className={styles.form}>
  <TabPanel value={tab} index={0}>
    <TextArea label='Comment'
      {...register('comment')}/>
    <Select label='Project' error={!!errors.project}
      options={projectsStore.list.map((p,i)=>{ return {value: p.name, label: p.name} })}
      {...register('project', {required: true})} />
    <div className={styles.grid}>
      {isRepeat ||
      <TextField label='Start date' error={!!errors.start}
        {...register('start', {required: true, pattern: /^20\d{2}\.(0[1-9]|1[0-2]).(0[1-9]|[1-2]\d|3[01])$/})}/>
      }
      <TextField label='Time' error={!!errors.time}
        {...register('time', {pattern: /^([0-1]?\d|2[0-3]):[0-5]\d$/})}/>
      <TextField label='Duration' disabled={!!watch().end} error={!!errors.duration}
        {...register('duration', {pattern: /^(\d+d ?)?\d*(:\d\d)?$/})}/> {/* поправить с учетом ограничения часов при указании дней*/}
      {isRepeat ||
      <TextField label='End date' disabled={!!watch().duration} error={!!errors.end}
        {...register('end', {pattern: /^20\d{2}\.(0[1-9]|1[0-2]).(0[1-9]|[1-2]\d|3[01])$/})}/>
      }
      <TextField label={'Credit'} error={!!errors.credit}
        {...register('credit', {validate: Calc.validate})}/>
      <TextField label='Debit' error={!!errors.debit}
        {...register('debit', {validate: Calc.validate})}/>
    </div>
  </TabPanel>
  <TabPanel value={tab} index={1}>
    <TextField label='Repeat template' error={!!errors.repeat} 
      {...register('repeat', {validate: ZCron.validate})}/>
    <TextField label='Template start date' error={!!errors.start}
      {...register('start', {required: true, pattern: /^20\d{2}\.(0[1-9]|1[0-2]).(0[1-9]|[1-2]\d|3[01])$/})}/>
    <TextField label='Template end date' disabled={!!watch().duration} error={!!errors.end}
      {...register('end', {pattern: /^20\d{2}\.(0[1-9]|1[0-2]).(0[1-9]|[1-2]\d|3[01])$/})}/>
  </TabPanel>
  </form>
  <footer className={styles.footer}>{
    isNew 
    ? <Button onClick={onAddHandle}>Add Event</Button>
    : <>
      <Button onClick={onChangeEventHandle}>{eventFormStore.eventData.repeat?'Save All':'Save'}</Button>
      {isRepeat && <Button>Save single</Button>}
      </>
  }
  {<Button onClick={eventFormStore.hideForm}>Cancel</Button>}
  </footer>
  </>
  )
}

export default EventForm