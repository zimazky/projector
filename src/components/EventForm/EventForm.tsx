import React from 'react'
import { Controller, SubmitHandler, useForm } from 'react-hook-form'
import { eventsCache, eventsStore, projectsStore } from 'src/stores/MainStore'
import Button from '../Common/Button'
import styles from './EventForm.module.css'
import calculate from 'src/utils/calculate'
import { TextField } from '../ui/TextField/TextField'
import ZCron from 'src/utils/zcron'

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

interface Fields {
  name: string
  comment: string
  repeat: string
  start: string
  time: string
  duration: string
  end: string
  credit: string
  debit: string
}

export default function EventForm({event, onExit=()=>{}}) {

  const {register, handleSubmit, formState: {errors}} = useForm<Fields>({mode: 'onChange'})

  const submit: SubmitHandler<Fields> = (data)=>{console.log(data)}

  const nameRef = React.useRef(null)
  const commentRef = React.useRef(null)
  const projectRef = React.useRef(null)
  const repeatRef = React.useRef(null)
  const startRef = React.useRef(null)
  const timeRef = React.useRef(null)
  const durationRef = React.useRef(null)
  const endRef = React.useRef(null)
  const creditRef = React.useRef(null)
  const debitRef = React.useRef(null)

  const isNew = event.id?false:true

  //var pi = eventList.projects.findIndex(p=>p.name===event.project)
  var pi = projectsStore.list.findIndex(p => p.name===event.project)
  if(pi<0) pi = 0
  const [projectId, setProjectId] = React.useState(pi)
  //const [colors, setColors] = React.useState({...eventList.projects[projectId]})
  const [colors, setColors] = React.useState({...projectsStore.list[projectId]})


  const onCompleteHandle = (isCompleted: boolean) => {
    const raw = {
      name: nameRef.current.innerText,
      comment: commentRef.current.innerText,
      project: projectRef.current.value,
      start: startRef.current.innerText,
      end: endRef.current.innerText,
      time: timeRef.current.innerText,
      duration: durationRef.current.innerText,
      credit: calculate(creditRef.current.innerText),
      debit: calculate(debitRef.current.innerText)
    }
    if(isCompleted) eventsStore.uncompleteEvent(event.id, raw)
    else eventsStore.completeEvent(event.id, event.timestamp, raw)
    onExit()
  }

  const onDeleteHandle = id => {
    eventsStore.deleteEvent(id)
    onExit()
  }

  // Изменение параметров события, для всех если событие повторяемое
  const onChangeEventHandle = id => {
    const name = nameRef.current.innerText
    const comment = commentRef.current.innerText
    const project = projectRef.current.value
    const repeat = repeatRef.current.innerText
    const start = startRef.current.innerText
    const end = endRef.current.innerText
    const time = timeRef.current.innerText
    const duration = durationRef.current.innerText
    const credit = calculate(creditRef.current.innerText)
    const debit = calculate(debitRef.current.innerText)

    const raw = {name, comment, project, repeat, start, end, time, duration, credit, debit}
    eventsStore.updateEvent(id, raw)
    onExit()
  }

  //    name:string,                    mandatory   
  //    comment:string,                 optional    ''
  //    project:string,                 optional    ''
  //    repeat:string 'D M W',          optional    ''
  //    start:string 'YYYY.MM.DD',      mandatory           для повторяемых начало расписания
  //    end:string 'YYYY.MM.DD',        optional    0       для повторяемых конец расписания
  //    time:string 'HH:MI',            optional    null
  //    duration:string 'DDd HH:MI',    optional    0
  //    credit:float,                   optional    0
  //    debit:float                     optional    0
  const onAddHandle = () => {
    const raw = {
      name: nameRef.current.innerText,
      comment: commentRef.current.innerText,
      project: projectRef.current.value,
      repeat: repeatRef.current.innerText,
      start: startRef.current.innerText,
      end: endRef.current.innerText,
      time: timeRef.current.innerText,
      duration: durationRef.current.innerText,
      credit: calculate(creditRef.current.innerText),
      debit: calculate(debitRef.current.innerText)
    }
    eventsStore.addPlannedEventData(raw)
    eventsCache.init()
    onExit()
  }

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

  //console.log('event',event)
  //console.log('eventList.planned',eventsStore.planned)
  console.log('errors', errors)
  return (
  <form className={styles.form} onSubmit={handleSubmit(submit)}>
    {!isNew && <Button onClick={()=>onCompleteHandle(event.completed)}>{event.completed?'Mark uncompleted':'Complete'}</Button>}
    {!isNew && <Button onClick={()=>onDeleteHandle(event.id)}>Delete</Button>}
    {!isNew && <Button onClick={()=>onChangeEventHandle(event.id)}>{event.repeat?'Change All':'Change'}</Button>}
    {isNew && <Button onClick={onAddHandle}>Add Event</Button>}
    <Button onClick={onSaveColors}>Save Project Color</Button>
    <Button onClick={onExit}>Cancel</Button>

    <TextField label='Name' value={event.name ?? ''} error={!!errors.name} {...register('name', {required: true})}></TextField>
    <TextField label='Comment' value={event.comment ?? ''} {...register('comment')}></TextField>

    <button>Send</button>

{/***********************************************************/}
    <Parameter name='project' style={{minWidth:100}}>
      <select className={styles.select} ref={projectRef} defaultValue={event.project}
      onChange={onChangeProject}>
        {/*eventList.projects.map((p,i)=>(<option key={i} value={p.name}>{p.name}</option>))*/}
        {projectsStore.list.map((p,i)=>(<option key={i} value={p.name}>{p.name}</option>))}

      </select>
    </Parameter>
    <Parameter name='background/color' style={{minWidth:60}}>
      <BackgroundInput colors={colors} onChange={setColors}/>
    </Parameter>
{/****************************************************************/}

    <TextField label='Repeat' value={event.repeat ?? ''} error={!!errors.repeat} 
      {...register('repeat', {validate: ZCron.validate})}></TextField>
    <TextField label='Start date' value={event.start ?? ''} error={!!errors.start}
      {...register('start', {required: true, pattern: /^20\d{2}\.(0[1-9]|1[0-2]).(0[1-9]|[1-2]\d|3[01])$/})}></TextField>
    <TextField label='Time' value={event.time ?? ''} error={!!errors.time}
      {...register('time', {pattern: /^([0-1]?\d|2[0-3]):[0-5]\d$/})}></TextField>
    <TextField label='Duration' value={event.duration ?? ''} error={!!errors.duration}
      {...register('duration', {pattern: /^(\d+d ?)?\d*(:\d\d)?$/})}></TextField> {/* поправить */}
    <TextField label='End date' value={event.end ?? ''} error={!!errors.end}
      {...register('end', {pattern: /^20\d{2}\.(0[1-9]|1[0-2]).(0[1-9]|[1-2]\d|3[01])$/})}></TextField>
    <TextField label='Credit' value={event.credit ?? ''} error={!!errors.credit}
      {...register('credit', {pattern: /^\d*[\.,]?\d{0,2}$/})}></TextField>
    <TextField label='Debit' value={event.debit ?? ''} error={!!errors.debit}
      {...register('debit', {pattern: /^\d*[\.,]?\d{0,2}$/})}></TextField>
  </form>
  )
}

