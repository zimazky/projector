import styles from './Calendar.module.css'
import CalendarDay from './CalendarDay.jsx'
import EventItem from './EventItem.jsx'
import DateTime from '../utils/datetime.js'
import EventList from '../utils/eventList'
import {eventList} from '../model/data.js'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import EventForm from './EventForm.jsx'
import GAPI from '../utils/gapi.js'
import RemoteStorage from '../utils/remoteStorage.js'

const weekBuffer = 4

export default function Calendar() {

  const [isModal,setModal] = React.useState(false)
  const [shift,setShift] = React.useState(weekBuffer)
  const scrollElement = React.useRef(null)
  const divElement = React.useRef(null)
  const [modalState,setModalState] = React.useState({title: 'Add new event', name:'New event'})
  const currentWeekRef = React.useRef(null)
  const wrapperRef = React.useRef(null)
  
  const currentDay = DateTime.getBeginDayTimestamp(Date.now()/1000)
  let currentTimestamp = DateTime.getBegintWeekTimestamp(Date.now()/1000)
  const zeroPoint = currentTimestamp
  currentTimestamp -= shift*7*86400

  React.useEffect(()=>{
    currentWeekRef.current.scrollIntoView(true)
    wrapperRef.current.scrollIntoView(true)
  }, [])

  const arrayOfDays = []
  for(let i=0;i<=20;i++) {
    arrayOfDays.push([])
    let stack = []
    for(let j=0;j<=6;j++) {
      arrayOfDays[i].push([])
      arrayOfDays[i][j] = {
        timestamp: currentTimestamp, 
        tasks: eventList.getEventsWithPlaceholders(currentTimestamp,stack),
        actualBalance: eventList.getActualBalance(currentTimestamp),
        plannedBalance: eventList.getPlannedBalance(currentTimestamp),
        plannedBalanceChange: eventList.getPlannedBalanceChange(currentTimestamp)
      }
      currentTimestamp += 86400
    }
  }
  const min = (a,b)=>a<b?a:b

  const onScrollHandle = (e)=>{
    const el=e.target
    const t = el.scrollTop
    const b = el.scrollHeight-el.scrollTop-el.clientHeight
    const avgDayHeight = el.scrollHeight/arrayOfDays.length
    const w = Math.ceil(t/avgDayHeight-shift)
    const d = new Date((zeroPoint+w*7*86400)*1000)
    divElement.current.innerText =d.getFullYear() + ' ' + DateTime.MONTHS_FULL[d.getMonth()] + ' '+w+' week'
    if(t<weekBuffer*avgDayHeight) setShift(s=>s+weekBuffer)
    else if(b<weekBuffer*avgDayHeight) setShift(s=>s-weekBuffer)
  }

  const SaveToLocalStorage = ()=>{
    const dataString = JSON.stringify(eventList.prepareToStorage())
    localStorage.setItem('data',dataString)
    console.log(dataString)
  }

  const SaveToGoogleDrive = async ()=>{
    //const dataString = JSON.stringify(eventList.prepareToStorage())
    RemoteStorage.saveFile('data.json',eventList.prepareToStorage())
      .then(()=>console.log('save ok'))
      .catch(()=>console.log('save error'))
  }
  const LoadFromGoogleDrive = async ()=>{
    const obj = await RemoteStorage.loadFile('data.json')
    eventList.reload(obj)
    console.log(eventList)
    setModalState(s=>({...s}))
  }


  /////////////////////////////////////////////////////////////////////////////
  // Методы открывания формы
  const openNewEventForm = (timestamp, name) => {
    if(name==='') return
    setModalState(EventList.eventToRaw({name, start:timestamp, time:null}))
    setModal(true)
  }

  const openEventForm = compactEvent => {
    const {id, completed, start} = compactEvent
    const s = (completed ? eventList.completed.find(e=>e.id===id) : eventList.planned.find(e=>e.id===id)) ?? 
      eventList.plannedRepeatable.find(e=>e.id===id)
    setModalState({...EventList.eventToRaw(s), completed, timestamp:start, id:s.id})
    setModal(true)
  }
  const dragStart = (e,id) => {
    e.dataTransfer.setData('event_item', JSON.stringify(id))
    console.log('drag start',e,id)
  }
  const dragDrop = (e, timestamp) => {
    e.preventDefault()
    const c = JSON.parse(e.dataTransfer.getData('event_item'))
    if(e.ctrlKey) eventList.copyToDate(c.id,timestamp)
    else eventList.shiftToDate(c.id,timestamp,c.start)
    setModalState(s=>({...s}))
  }

  console.log('draw calendar')
  return (
    <div className={styles.wrapper}>
    <div ref={wrapperRef} className={styles.header}>
      <Button onClick={()=>document.getElementById('root').requestFullscreen()}>FullScr</Button>
      <Button onClick={GAPI.logOut}>Logout</Button>
      <Button onClick={SaveToLocalStorage}>Save&gt;LS</Button>
      <Button onClick={SaveToGoogleDrive}>Save&gt;GD</Button>
      <Button onClick={LoadFromGoogleDrive}>Load&lt;GD</Button>
      <Button>Today</Button>
      <span ref={divElement} className={styles.monthTitle}></span>
      <div className={styles.dayOfWeekLabels}>
        { DateTime.WEEKDAYS.map( (d,i) => <div key={i}>{d}</div> ) }
      </div>
    </div>
    <div className={styles.CalendarBody} onScroll={onScrollHandle} ref={scrollElement}>
      { arrayOfDays.map( week => (
        <div ref={week[0].timestamp==zeroPoint?currentWeekRef:null} className={styles.CalendarWeek} key={week[0].timestamp} style={{height:(week.reduce((a,d)=>d.tasks.length>a?d.tasks.length:a,7))*1.5+1.4+1.4+1.4+'em'}}> {
          week.map( (d,j) => (
            <CalendarDay data={d} key={d.timestamp} today={currentDay===d.timestamp}
              onAddEvent={openNewEventForm} onDragDrop={e=>dragDrop(e,d.timestamp)}>
              { d.tasks.map((t,i)=>(<EventItem key={i} event={t} days={min(t.days,7-j)} 
                onClick={openEventForm} onDragStart={e=>dragStart(e,t)}/>))}
            </CalendarDay>
          ))}
        </div>
      ))}
    </div>
    <Modal isOpen={isModal} onCancel={()=>setModal(false)}>
      <EventForm event={modalState} onExit={()=>setModal(false)}/>
    </Modal>
    </div>
  )
}