import styles from './Calendar.module.css'
import CalendarDay from './CalendarDay.jsx'
import EventItem, { EventPlaceholder } from './EventItem.jsx'
import DateTime from '../utils/datetime.js'
import {eventList} from '../utils/schedule.js'
import Modal from './Modal.jsx'

const dayHeight = 150
const weekBuffer = 4

export default function Calendar({children = null}) {

  const [isModal,setModal] = React.useState(false)
  const [shift,setShift] = React.useState(weekBuffer)
  const scrollElement = React.useRef(null)
  const divElement = React.useRef(null)
  

  let currentTimestamp = DateTime.getBegintWeekTimestamp(Date.now()/1000)
  const zeroPoint = currentTimestamp
  currentTimestamp -= shift*7*86400

  React.useEffect(()=>{
    setShift(weekBuffer)
    scrollElement.current.scrollTop = weekBuffer*(dayHeight+1)//606
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
    const w = ~~(t/(dayHeight+1)-shift)
    divElement.current.innerText =new Date((zeroPoint+w*7*86400)*1000).toLocaleDateString() + ' ('+w+')'
    if(t<weekBuffer*dayHeight) setShift(s=>s+weekBuffer)
    else if(b<weekBuffer*dayHeight) setShift(s=>s-weekBuffer)
  }

  console.log('draw calendar')
  return (
    <div className={styles.wrapper}>
    <div ref={divElement}></div>
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