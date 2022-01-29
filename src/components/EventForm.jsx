import DateTime from "../utils/datetime"
import { eventList } from "../utils/schedule"
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


export default function EventForm({event, onDelete=(id)=>{}, onComplete=(id,timestamp,raw)=>{}, onAdd=(raw)=>{}}) {
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

  const [repeatCheck, setRepeatCheck] = React.useState(event.repeat && event.repeat!='')
  const isNew = event.id?false:true

  const onChangeRepeatCheckbox = e => {
    if(!isNew) return
    setRepeatCheck(s=>!s)
    if(!event.repeat) event.repeat='* * *'
  }
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
    onComplete(event.id, event.timestamp, raw)
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
    onAdd(raw)
  }

  console.log('event',event)
  return (
    <div className={styles.form}>
      {!isNew && <Button onClick={onCompleteHandle}>{event.completed?'Mark uncompleted':'Complete'}</Button>}
      {!isNew && <Button onClick={()=>onDelete(event.id)}>Delete</Button>}
      {!isNew && <Button onClick={()=>{}}>Save</Button>}
      {isNew && <Button onClick={onAddHandle}>Add Event</Button>}

      <div ref={nameRef} className={styles.name} contentEditable='true' suppressContentEditableWarning={true}>
        {event.name ?? ''}
      </div>

      <Parameter name='comment' style={{width:'100%'}}>
        <Input inputRef={commentRef}>{event.comment ?? ''}</Input>
      </Parameter>
      <br/>
      <Parameter name='project' style={{minWidth:120}}>
        <select ref={projectRef} defaultValue={event.project}>
          <option value=''>Default</option>
          {eventList.projects.map((p,i)=>(<option key={i} value={p.name}>{p.name}</option>))}
        </select>
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
      <Parameter name='duration' style={{minWidth:100}}>
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

