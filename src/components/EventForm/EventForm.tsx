import React from 'react'
import { useForm } from 'react-hook-form'
import { eventsCache, eventsStore, projectsStore } from 'src/stores/MainStore'
import Button from '../Common/Button'
import styles from './EventForm.module.css'
import calculate from 'src/utils/calculate'
import TextField from '../ui/TextField/TextField'
import ZCron from 'src/utils/zcron'
import Select from '../ui/Select/Select'
import { EventData } from 'src/stores/Events/EventData'

/*
function Parameter({name, style, children}) {
  return (
    <>
      <div className={styles.parameter} style={style}>
        <div>{name}</div>
        {children}
      </div>{' '}
    </>
  )
}

function Input({inputRef,children}) {
  return <div ref={inputRef} className={styles.value} contentEditable='true' suppressContentEditableWarning={true}>{children}</div>
}

function BackgroundInput({colors, onChange=(s)=>{}}) {
  return (<>
    <div className={styles.color} style={{backgroundColor:colors.background,color:colors.color}} contentEditable='true' suppressContentEditableWarning={true} 
    onBlur={e=>onChange(s=>({...s,background:e.target.innerText}))}>{colors.background}</div>
    <div className={styles.completed} style={{backgroundColor:colors.background}}>{colors.background}</div>
    <div className={styles.color} style={{backgroundColor:'white',color:'black'}} contentEditable='true' suppressContentEditableWarning={true} 
    onBlur={e=>onChange(s=>({...s,color:e.target.innerText}))}>{colors.color}</div>
  </>)
}
*/

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

export default function EventForm({event, onExit=()=>{}}) {

  const {register, watch, formState: {errors}} = useForm<Fields>({mode: 'onChange'})

  //const submit: SubmitHandler<Fields> = (data)=>{console.log(data)}

  const isNew = event.id?false:true

/*
  var pi = projectsStore.list.findIndex(p => p.name===event.project)
  if(pi<0) pi = 0
  const [projectId, setProjectId] = React.useState(pi)
  const [colors, setColors] = React.useState({...projectsStore.list[projectId]})
*/

  const onCompleteHandle = (isCompleted: boolean) => {
    const e = watch()
    const eventData: EventData = {
      name: e.name,
      comment: e.comment,
      project: e.project,
      start: e.start,
      end: e.end,
      time: e.time,
      duration: e.duration,
      credit: calculate(e.credit),
      debit: calculate(e.debit)
    }
    if(isCompleted) eventsStore.uncompleteEvent(event.id, eventData)
    else eventsStore.completeEvent(event.id, event.timestamp, eventData)
    onExit()
  }

  const onDeleteHandle = (id: number) => {
    eventsStore.deleteEvent(id)
    onExit()
  }

  // Изменение параметров события, для всех если событие повторяемое
  const onChangeEventHandle = (id: number) => {
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
      credit: calculate(e.credit),
      debit: calculate(e.debit)
    }
    eventsStore.updateEvent(id, eventData)
    onExit()
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
      credit: calculate(e.credit),
      debit: calculate(e.debit)
    }
    eventsStore.addPlannedEventData(eventData)
    eventsCache.init()
    onExit()
  }
/*
  const onSaveColors = () => {
    //eventList.projects[projectId].background = colors.background
    //eventList.projects[projectId].color = colors.color
    projectsStore.list[projectId].background = colors.background
    projectsStore.list[projectId].color = colors.color
    eventsCache.init()
    onExit()
  }

  const onChangeProject = (e)=>{
    //var pi = eventList.projects.findIndex(p=>p.name===e.target.value)
    var pi = projectsStore.list.findIndex(p=>p.name===e.target.value)
    if(pi<0) pi = 0
    //setColors({...eventList.projects[pi]})
    setColors({...projectsStore.list[pi]})
    setProjectId(pi)
  }
*/

  return (
  <form className={styles.form}>
    {!isNew && <Button onClick={()=>onCompleteHandle(event.completed)}>{event.completed?'Mark uncompleted':'Complete'}</Button>}
    {!isNew && <Button onClick={()=>onDeleteHandle(event.id)}>Delete</Button>}
    {!isNew && <Button onClick={()=>onChangeEventHandle(event.id)}>{event.repeat?'Change All':'Change'}</Button>}
    {isNew && <Button onClick={onAddHandle}>Add Event</Button>}
    {/* <Button onClick={onSaveColors}>Save Project Color</Button> */}
    <Button onClick={onExit}>Cancel</Button>

    <TextField label='Name' value={event.name ?? ''} error={!!errors.name}
      {...register('name', {required: true})}></TextField>
    <TextField label='Comment' value={event.comment ?? ''} {...register('comment')}></TextField>
    <Select label='Project' defaultValue={event.project} error={!!errors.project}
      options={projectsStore.list.map((p,i)=>{ return {value: p.name, label: p.name} })}
      {...register('project', {required: true})} />

{/*
    <Parameter name='project' style={{minWidth:100}}>
      <select className={styles.select} ref={projectRef} defaultValue={event.project}
      onChange={onChangeProject}>
        {projectsStore.list.map((p,i)=>(<option key={i} value={p.name}>{p.name}</option>))}
      </select>
    </Parameter>
    <Parameter name='background/color' style={{minWidth:60}}>
      <BackgroundInput colors={colors} onChange={setColors}/>
    </Parameter>
*/}

    <TextField label='Repeat' value={event.repeat ?? ''} error={!!errors.repeat} 
      {...register('repeat', {validate: ZCron.validate})}></TextField>
    <TextField label='Start date' value={event.start ?? ''} error={!!errors.start}
      {...register('start', {required: true, pattern: /^20\d{2}\.(0[1-9]|1[0-2]).(0[1-9]|[1-2]\d|3[01])$/})}></TextField>
    <TextField label='Time' value={event.time ?? ''} error={!!errors.time}
      {...register('time', {pattern: /^([0-1]?\d|2[0-3]):[0-5]\d$/})}></TextField>
    <TextField label='Duration' value={event.duration ?? ''} error={!!errors.duration}
      {...register('duration', {pattern: /^(\d+d ?)?\d*(:\d\d)?$/})}></TextField> {/* поправить с учетом ограничения часов при указании дней*/}
    <TextField label='End date' value={event.end ?? ''} error={!!errors.end}
      {...register('end', {pattern: /^20\d{2}\.(0[1-9]|1[0-2]).(0[1-9]|[1-2]\d|3[01])$/})}></TextField>
    <TextField label='Credit' value={event.credit ?? ''} error={!!errors.credit}
      {...register('credit', {pattern: /^\d*[\.,]?\d{0,2}$/})}></TextField>
    <TextField label='Debit' value={event.debit ?? ''} error={!!errors.debit}
      {...register('debit', {pattern: /^\d*[\.,]?\d{0,2}$/})}></TextField> {/* поправить с учетом выражений */}
  </form>
  )
}