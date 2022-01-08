import styles from './Calendar.module.css'
import CalendarDay from './CalendarDay.jsx'
import EventItem, { EventPlaceholder } from './EventItem.jsx'
import DateTime from '../utils/datetime.js'
import { eventList, actualTasks, dayPlannedTasks, actualBalance, plannedBalance, sortPlannedTasks} from '../utils/schedule.js'
import Modal from './Modal.jsx'

const dayHeight = 150
const dayBuffer = 2

export default function Calendar({children = null}) {

  const [isModal,setModal] = React.useState(false)
  const [shift,setShift] = React.useState(2)
  const scrollElement = React.useRef(null)


  // перед рендером сортировка фактических событий
  //actualTasks.sort((a,b)=>a.start-b.start)
  //sortPlannedTasks()
  //plannedTasks.forEach(d=>console.log(d.name,DateTime.getTime(d.start)))

  let currentTimestamp = DateTime.getBegintWeekTimestamp(Date.now()/1000)
  currentTimestamp -= shift*7*86400
  const scrollTop = shift*150

  React.useEffect(()=>{
    setShift(2)
    scrollElement.current.scrollTop = 303
  }, [])

  const arrayOfDays = []
  for(let i=0;i<=10;i++) {
    arrayOfDays.push([])
    let stack = []
    for(let j=0;j<=6;j++) {
      arrayOfDays[i].push([])
      arrayOfDays[i][j] = {
        timestamp: currentTimestamp, tasks: eventList.getEventsWithPlaceholders(currentTimestamp,stack)
        /*dayPlannedTasks([], currentTimestamp, stack, true)*/, 
        actualBalance: eventList.getActualBalance(currentTimestamp)
        /*actualBalance(currentTimestamp)*/, 
        plannedBalance: eventList.getPlannedBalance(currentTimestamp)
        /*plannedBalance(currentTimestamp)*/
      }
      currentTimestamp += 86400
    }
  }
  const min = (a,b)=>a<b?a:b

  const onAddEventHandle = React.useCallback((timestamp, name) => {
    if(name==='') return
    //console.log('Add Event',timestamp,name)
    setModal(true)
  })
  const onScrollHandle = (e)=>{
    const el=e.target
    const t = el.scrollTop
    const b = el.scrollHeight-el.scrollTop-el.clientHeight
    if(t<300) setShift(s=>s+2)
    else if(b<300) setShift(s=>s-2)
    //console.log(t,b)
  }

  console.log('draw calendar')
  return (
    <div className={styles.wrapper}>
    <div className={styles.dayOfWeekLabels}>
      { DateTime.WEEKDAYS.map( (d,i) => <div key={i}>{d}</div> ) }
    </div>
    <div className={styles.CalendarBody} onScroll={onScrollHandle} ref={scrollElement}>
      <div className={styles.Scrolled}> {
        arrayOfDays.map( week => (
          <div className={styles.CalendarWeek} key={week[0].timestamp}> {
            week.map( (d,j) => (
              <CalendarDay timestamp={d.timestamp} dayHeight={dayHeight} key={d.timestamp}
              actualBalance={d.actualBalance} plannedBalance={d.plannedBalance}
              onAddEvent={onAddEventHandle}>
                { d.tasks.map((t,i)=>{
                  if(t.id === -1) return <EventPlaceholder key={i}/>
                  return <EventItem key={i} name={t.name} time={DateTime.getTime(t.start)} days={min(t.days,7-j)}/>
                })}
              </CalendarDay>
            ))}
          </div>
        ))}
      </div>
    </div>
    <Modal title='Add event' isOpen={isModal} onCancel={()=>setModal(false)}>

    </Modal>
    </div>
  )
}