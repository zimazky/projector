import { eventList } from "../model/data.js"
import Button from "./Button.jsx"
import styles from "./EventForm.module.css"

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

function BackgroundInput({colorRef}) {
  const [state,setState] = React.useState(colorRef.current)
  return (<>
    <div className={styles.color} style={{backgroundColor:state.background,color:state.color}} contentEditable='true' suppressContentEditableWarning={true} 
    onBlur={e=>{
      colorRef.current.background = e.target.innerText
      setState(s=>({...s,background:e.target.innerText}))
      }} >{state.background}</div>
    <div className={styles.completed} style={{backgroundColor:state.background}}>{state.background}</div>
    <div className={styles.color} style={{backgroundColor:'white',color:'black'}} contentEditable='true' suppressContentEditableWarning={true} 
    onBlur={e=>{
      colorRef.current.color = e.target.innerText
      setState(s=>({...s,color:e.target.innerText}))
      }} >{state.color}</div>
  </>)
}

export default function EventForm({event, onExit=()=>{}}) {
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

  var pi = eventList.projects.findIndex(p=>p.name===event.project)
  if(pi<0) pi = 0
  const projectColorRef = React.useRef({...eventList.projects[pi]})

  const onCompleteHandle = () => {
    const raw = {
      name: nameRef.current.innerText,
      comment: commentRef.current.innerText,
      project: projectRef.current.value,
      start: startRef.current.innerText,
      end: endRef.current.innerText,
      time: timeRef.current.innerText,
      duration: durationRef.current.innerText,
      credit: creditRef.current.innerText,
      debit: debitRef.current.innerText
    }
    eventList.completeEvent(event.id, event.timestamp, raw)
    onExit()
  }

  const onDeleteHandle = id => {
    eventList.deleteEvent(id)
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
    const credit = creditRef.current.innerText
    const debit = debitRef.current.innerText

    const raw = {name, comment, project, repeat, start, end, time, duration, credit, debit}
    eventList.updateEvent(id, raw)
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
      credit: creditRef.current.innerText,
      debit: debitRef.current.innerText
    }
    eventList.addPlannedRawEvent(raw)
    eventList.clearCache()
    onExit()
  }

  const onChangeColors = () => {
    eventList.projects[pi].background = projectColorRef.current.background
    eventList.projects[pi].color = projectColorRef.current.color
    eventList.clearCache()
    onExit()
  }


  console.log('event',event)
  return (
    <div className={styles.form}>
      {!isNew && <Button onClick={onCompleteHandle}>{event.completed?'Mark uncompleted':'Complete'}</Button>}
      {!isNew && <Button onClick={()=>onDeleteHandle(event.id)}>Delete</Button>}
      {!isNew && <Button onClick={()=>onChangeEventHandle(event.id)}>{event.repeat?'Change All':'Change'}</Button>}
      {isNew && <Button onClick={onAddHandle}>Add Event</Button>}
      <Button onClick={onChangeColors}>Save Project Color</Button>
      <Button onClick={onExit}>Cancel</Button>

      <div ref={nameRef} className={styles.name} contentEditable='true' suppressContentEditableWarning={true}>
        {event.name ?? ''}
      </div>

      <Parameter name='comment' style={{width:'100%'}}>
        <Input inputRef={commentRef}>{event.comment ?? ''}</Input>
      </Parameter>
      <br/>
      <Parameter name='project' style={{minWidth:100}}>
        <select className={styles.select} ref={projectRef} defaultValue={event.project}>
          <option value=''>Default</option>
          {eventList.projects.map((p,i)=>(<option key={i} value={p.name}>{p.name}</option>))}
        </select>
      </Parameter>
      <Parameter name='background/color' style={{minWidth:60}}>
        <BackgroundInput colorRef={projectColorRef} />
      </Parameter>

      <br/>
      <Parameter name='repeat' style={{minWidth:120}}>
        <Input inputRef={repeatRef}>{event.repeat}</Input>
      </Parameter>
      <br/>
      <Parameter name='start date' style={{minWidth:110}}>
        <Input inputRef={startRef}>{event.start?event.start:''}</Input>
      </Parameter>
      <Parameter name='time' style={{minWidth:60}}>
        <Input inputRef={timeRef}>{event.time?event.time:''}</Input>
      </Parameter>
      <Parameter name='duration' style={{minWidth:70}}>
        <Input inputRef={durationRef}>{event.duration?event.duration:''}</Input>
      </Parameter>
      <Parameter name='end date' style={{minWidth:110}}>
        <Input inputRef={endRef}>{event.end?event.end:''}</Input>
      </Parameter>
      <br/>
      <Parameter name='credit' style={{minWidth:120}}>
        <Input inputRef={creditRef}>{event.credit?event.credit:''}</Input>
      </Parameter>
      <Parameter name='debit' style={{minWidth:120}}>
        <Input inputRef={debitRef}>{event.debit?event.debit:''}</Input>
      </Parameter>
    </div>

  )
}

