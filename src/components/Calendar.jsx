import styles from './Calendar.module.css'
import CalendarDay from './CalendarDay.jsx'
import EventItem, { EventPlaceholder } from './EventItem.jsx'
import DateTime from '../utils/datetime.js'
import { actualTasks, dayPlannedTasks, actualBalance, plannedBalance, sortPlannedTasks, plannedTasks} from '../utils/schedule'
import Modal from './Modal.jsx'

const dayHeight = 150
const dayScrollSteps = 10
const scrollStep = dayHeight/dayScrollSteps

export default function Calendar({children = null}) {

  const [scrollHeight,setScrollHeight] = React.useState(0)
  const [isModal,setModal] = React.useState(false)
  const CalendarBodyElement = React.useRef(null)
  // перед рендером сортировка фактических событий
  actualTasks.sort((a,b)=>a.start-b.start)
  sortPlannedTasks()
  plannedTasks.forEach(d=>console.log(d.name,DateTime.getTime(d.start)))


  let currentTimestamp = DateTime.getBegintWeekTimestamp(Date.now()/1000)
  
  console.log('scrollHeight',scrollHeight)
  let shiftWeek = ~~(scrollHeight/dayHeight) - 1
  currentTimestamp += 7*86400*shiftWeek

  const arrayOfDays = []
  for(let i=0;i<=5;i++) {
    arrayOfDays.push([])
    let stack = []
    for(let j=0;j<=6;j++) {
      arrayOfDays[i].push([])
      arrayOfDays[i][j] = {timestamp: currentTimestamp, tasks: dayPlannedTasks([], currentTimestamp, stack, true), 
        actualBalance: actualBalance(currentTimestamp), plannedBalance:plannedBalance(currentTimestamp)}
      currentTimestamp += 86400
    }
  }
  
  function onWheel(e) {
    e.preventDefault()
    let d = e.wheelDelta>0 ? 1 : -1
    console.log(this.style.top)
    let top = parseInt(this.style.top) + d*scrollStep
    //this.className = styles.ScrolledTransition
    if(top>=0) {
      console.log(top)
      setScrollHeight(v=>v-dayHeight)
      top -= dayHeight
    }
    else if(top<-dayHeight) {
      console.log(top)
      setScrollHeight(v=>v+dayHeight)
      top += dayHeight
    }
    this.style.top = top + 'px'

  }

  React.useEffect(()=>{
    console.log('Calendar AddEventListener Mouse')
    CalendarBodyElement.current.addEventListener('wheel', onWheel)
    return ()=>{
      console.log('Calendar RemoveEventListener Mouse')
      CalendarBodyElement.current.removeEventListener('wheel', onWheel)
      }
  },[])
  
  const min = (a,b)=>a<b?a:b

  const onAddEventHandle = React.useCallback((timestamp, name) => {
    if(name==='') return
    console.log('Add Event',timestamp,name)
    setModal(true)
  })

  console.log('draw calendar')
  return (
    <>
    <div className={styles.dayOfWeekLabels}>
      { DateTime.WEEKDAYS.map( (d,i) => <div key={i}>{d}</div> ) }
    </div>
    <div className={styles.CalendarBody}>
      <div className={styles.Scrolled} style={{top: -dayHeight}} /*onWheel={onWheel}*/ ref={CalendarBodyElement}> {
        arrayOfDays.map( week => (
          <div className={styles.CalendarWeek} key={week[0].timestamp}> {
            week.map( (d,j) => (
              <CalendarDay timestamp={d.timestamp} dayHeight={dayHeight} key={d.timestamp}
              actualBalance={d.actualBalance} plannedBalance={d.plannedBalance}
              onAddEvent={onAddEventHandle}>
                { d.tasks.map((t,i)=>{
                  if(t.id === -1) return <EventPlaceholder key={i}/>
                  return <EventItem key={i} name={t.name} time={t.time} days={/*console.log('min',t.days,7-j),*/min(t.days,7-j)}/>
                })}
              </CalendarDay>
            ))}
          </div>
        ))}
      </div>
    </div>
    <Modal title='Add event' isOpen={isModal} onCancel={()=>setModal(false)}>

    </Modal>
    </>
  )
}