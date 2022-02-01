import styles from './Calendar.module.css'
import CalendarDay from './CalendarDay.jsx'
import EventItem from './EventItem.jsx'
import DateTime from '../utils/datetime.js'
import EventList from '../utils/eventList'
import {eventList} from '../model/data.js'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import EventForm from './EventForm.jsx'
import { loadClient, logIn, logOut, isLoggedIn } from '../utils/gapi'

const dayHeight = 150
const weekBuffer = 4

export default function Calendar() {

  const [isModal,setModal] = React.useState(false)
  const [shift,setShift] = React.useState(weekBuffer)
  const scrollElement = React.useRef(null)
  const divElement = React.useRef(null)
  const [modalState,setModalState] = React.useState({title: 'Add new event', name:'New event'})
  const currentWeekRef = React.useRef(null)
  

  let currentTimestamp = DateTime.getBegintWeekTimestamp(Date.now()/1000)
  const zeroPoint = currentTimestamp
  currentTimestamp -= shift*7*86400

  React.useEffect(()=>{
    loadClient()
    currentWeekRef.current.scrollIntoView(true)
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
    const w = Math.ceil(t/(dayHeight+1)-shift)
    const d = new Date((zeroPoint+w*7*86400)*1000)
    divElement.current.innerText =d.getFullYear() + ' ' + DateTime.MONTHS_FULL[d.getMonth()] + ' '+w+' week'
    if(t<weekBuffer*dayHeight) setShift(s=>s+weekBuffer)
    else if(b<weekBuffer*dayHeight) setShift(s=>s-weekBuffer)
  }

  const SaveToLocalStorage = ()=>{
    const dataString = JSON.stringify(eventList.prepareToStorage())
    localStorage.setItem('data',dataString)
    console.log(dataString)
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
    eventList.shiftToDate(c.id,timestamp)
    setModalState(s=>({...s}))
  }

  console.log('draw calendar')
  return (
    <div className={styles.wrapper}>
    <div className={styles.header}>
      { isLoggedIn()?
        <Button onClick={logOut}>Logout</Button>
        :<Button onClick={logIn}>Login</Button>}
      <Button onClick={SaveToLocalStorage}>Save to LocalStorage</Button>
      <Button>Today</Button>
      <span ref={divElement} className={styles.monthTitle}></span>
    </div>
    <div className={styles.dayOfWeekLabels}>
      { DateTime.WEEKDAYS.map( (d,i) => <div key={i}>{d}</div> ) }
    </div>
    <div className={styles.CalendarBody} onScroll={onScrollHandle} ref={scrollElement}>
      { arrayOfDays.map( week => (
        <div ref={week[0].timestamp==zeroPoint?currentWeekRef:null} className={styles.CalendarWeek} key={week[0].timestamp} style={{height:(week.reduce((a,d)=>d.tasks.length>a?d.tasks.length:a,7))*14+31+19}}> {
          week.map( (d,j) => (
            <CalendarDay data={d} key={d.timestamp} onAddEvent={openNewEventForm} onDragDrop={e=>dragDrop(e,d.timestamp)}>
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