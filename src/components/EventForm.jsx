import DateTime from "../utils/datetime"
import { eventList } from "../utils/schedule"
import Button from "./Button.jsx"
import styles from "./EventForm.module.css"

export default function EventForm({event}) {
  const [repeatCheck, setRepeatCheck] = React.useState(event.repeat && event.repeat!='')
  //const [repeat, setRepeat] = React.useState(event.repeat ?? '')

  const onChangeRepeatCheckbox = e => {
    setRepeatCheck(s=>!s)
    if(!event.repeat) event.repeat='* * *'
  }

  console.log('event',event)
  return (
    <form className={styles.event_form}>
      <Button>Mark complete</Button>
      <div className={styles.name} contentEditable='true' suppressContentEditableWarning={true}>
        {event.name ?? ''}
      </div>

      <div className={styles.block_parameter}>
        <label>comment:</label>
        <div className={styles.comment} contentEditable='true' suppressContentEditableWarning={true}>
          {event.comment ?? ''}
        </div>
      </div>

      <div className={styles.block_parameter}>
        <label>project:</label>
        <select defaultValue={event.project}>
          <option value=''>Default</option>
          {eventList.projects.map((p,i)=>(<option key={i} value={p.name}>{p.name}</option>))}
        </select>
      </div>

      <div className={styles.repeat_row}>
        <span 
          style={{fontWeight:'bold', color:repeatCheck?'black':'lightgray'}} 
          onClick={onChangeRepeatCheckbox}>&#11118;</span>
        {repeatCheck && 
          <>
            <span> repeat: </span>
            <span className={styles.repeat_string} contentEditable='true' 
              suppressContentEditableWarning={true}>{event.repeat}</span>
          </>}
      </div>

      <div>start date:</div>
      <input type='date' className={styles.date}
        defaultValue={DateTime.getYYYYMMDD(event.repeat?event.repeatStart:event.start ?? 0)}></input>
      <div className={styles.row}>
        <div className={styles.parameter}>
          <div>time:</div>
          <input type='time' className={styles.time}
            defaultValue={DateTime.getHHMM(event.repeat?event.repeatStart:event.start ?? 0)}></input>
        </div>
        {' '}
        <div className={styles.parameter}>
          <div>duration:</div>
          <input type='time' className={styles.time}
            defaultValue=''></input>
        </div>
      </div>
      <div>end date:</div>
      <input type='date' className={styles.date}
        defaultValue={DateTime.getYYYYMMDD(event.repeat?event.repeatStart:event.start ?? 0)}></input>
      <div>credit:</div>
        <div className={styles.comment} contentEditable='true' suppressContentEditableWarning={true}>{event.credit}</div>
      <div>debit:</div>
        <div className={styles.comment} contentEditable='true' suppressContentEditableWarning={true}>{event.debit}</div>
    </form>

  )
}

