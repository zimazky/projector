import React, { useContext } from 'react'
import { useForm } from 'react-hook-form'

import ZCron from 'src/7-shared/libs/ZCron/ZCron'
import Calc from 'src/7-shared/libs/Calc/Calc'
import TextField from 'src/7-shared/ui/TextField/TextField'
import Select from 'src/7-shared/ui/Select/Select'
import TextArea from 'src/7-shared/ui/TextArea/TextArea'
import Tabs from 'src/7-shared/ui/Tabs/Tabs'
import TabPanel from 'src/7-shared/ui/Tabs/TabPanel'
import TextButton from 'src/7-shared/ui/Button/TextButton'
import DatePicker from 'src/7-shared/ui/DatePicker/DatePicker'

import { StoreContext } from 'src/1-app/Providers/StoreContext'
import { EventDto } from 'src/6-entities/Events/EventDto'

import YesCancelConfirmation from 'src/5-features/YesCancelConfirmation/YesCancelConfirmation'

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

type DeleteState = 'Delete' | 'DeleteCurrentRepeatable' | null

const EventForm: React.FC = () => {

  const { eventFormStore, eventsCache, eventsStore, projectsStore } = useContext(StoreContext)

  const [tab, setTab] = React.useState(0)
  const [deleteState, setDeleteState] = React.useState<DeleteState>(null)
  const [saveAsSingle, setSaveAsSingle] = React.useState(false)

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

  const handleConfirmDelete = () => {
    if(deleteState === null) return
    if(deleteState === 'DeleteCurrentRepeatable') {
      eventsStore.deleteCurrentRepeatableEvent(eventFormStore.eventData.id, eventFormStore.eventData.timestamp)
      eventFormStore.hideForm()
    }
    else {
      eventsStore.deleteEvent(eventFormStore.eventData.id)
      eventFormStore.hideForm()
    }
    setDeleteState(null)
  }

  const handleSaveAsSingle = handleSubmit((e) => {
    const id = eventFormStore.eventData.id
    if(id === null) return
    const eventDto: EventDto = {
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
    eventsStore.saveAsSingleEvent(id, eventFormStore.eventData.timestamp, eventDto)
    eventFormStore.hideForm()
  })

  const onCompleteHandle = handleSubmit((e) => {
    const isCompleted = eventFormStore.eventData.completed
    if(isCompleted === undefined) return
    const eventDto: EventDto = {
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
    if(isCompleted) eventsStore.uncompleteEvent(eventFormStore.eventData.id, eventDto)
    else eventsStore.completeEvent(eventFormStore.eventData.id, eventFormStore.eventData.timestamp, eventDto)
    eventFormStore.hideForm()
  })

  // Изменение параметров события, для всех если событие повторяемое
  const onChangeEventHandle = handleSubmit((e) => {
    const id = eventFormStore.eventData.id
    if(id === null) return
    const eventDto: EventDto = {
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
    eventsStore.updateEvent(id, eventDto)
    eventFormStore.hideForm()
  })

  const onAddHandle = handleSubmit((e) => {
    const eventDto: EventDto = {
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
    eventsStore.addPlannedEventDto(eventDto)
    eventsCache.init()
    eventFormStore.hideForm()
  })

  const isRepeat = watch().repeat ? true : false
  const isCompleted = eventFormStore.eventData.completed

  return <>
  <header>
    <div className={styles.buttonGroup}>
      {!isNew && (
        isRepeat
        ? 
        <>
          <TextButton onClick={onCompleteHandle}>Complete</TextButton>
          <TextButton onClick={()=>setDeleteState('DeleteCurrentRepeatable')}>Delete</TextButton>
          <TextButton onClick={()=>setDeleteState('Delete')}>Delete All</TextButton>
          <YesCancelConfirmation open={deleteState!==null}
            onConfirm={handleConfirmDelete}
            onClose={()=>setDeleteState(null)}>{
              deleteState === 'DeleteCurrentRepeatable'
              ? 'Are you sure you want to delete this single event?' 
              : 'Are you sure you want to delete all repeatable events?'
            }
          </YesCancelConfirmation>
        </>
        :
        <>
          <TextButton onClick={onCompleteHandle}>{eventFormStore.eventData.completed?'Undo':'Complete'}</TextButton>
          <TextButton onClick={()=>setDeleteState('Delete')}>Delete</TextButton>
          <YesCancelConfirmation open={deleteState!==null}
            onConfirm={handleConfirmDelete}
            onClose={()=>setDeleteState(null)}>
              Are you sure you want to delete this event?
          </YesCancelConfirmation>
        </>
      )}
      
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
      <DatePicker label='Start date' error={!!errors.start}
        {...register('start', {required: true, pattern: /^20\d{2}\.(0[1-9]|1[0-2]).(0[1-9]|[1-2]\d|3[01])$/})}/>
      }
      <TextField label='Time' error={!!errors.time}
        {...register('time', {pattern: /^([0-1]?\d|2[0-3]):[0-5]\d$/})}/>
      <TextField label='Duration' disabled={!!watch().end} error={!!errors.duration}
        {...register('duration', {pattern: /^(\d+d ?)?\d*(:\d\d)?$/})}/> {/* поправить с учетом ограничения часов при указании дней*/}
      {isRepeat ||
      <DatePicker label='End date' disabled={!!watch().duration} error={!!errors.end}
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
    ? <TextButton onClick={onAddHandle}>Add Event</TextButton>
    : isRepeat ? 
      <>
        <TextButton onClick={onChangeEventHandle}>Save All</TextButton>
        <TextButton onClick={()=>setSaveAsSingle(true)}>Save as single</TextButton>
      </>
      :
      <TextButton onClick={onChangeEventHandle}>Save</TextButton>
  }
  {<TextButton onClick={eventFormStore.hideForm}>Cancel</TextButton>}
  </footer>
  <YesCancelConfirmation open={saveAsSingle}
    onConfirm={handleSaveAsSingle}
    onClose={()=>setSaveAsSingle(false)}>
      Are you sure you want to save this event as single?
  </YesCancelConfirmation>
  </>
}

export default EventForm