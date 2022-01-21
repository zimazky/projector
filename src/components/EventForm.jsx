import DateTime from "../utils/datetime"
import styles from "./EventForm.module.css"

export default function EventForm({event}) {
  const [repeatCheck, setRepeatCheck] = React.useState(event.repeat && event.repeat!='')

  const onChangeRepeatCheckbox = e => setRepeatCheck(s=>!s)

  console.log('event',event)
  return (
    <form className={styles.event_form}>
      <div className={styles.name} contentEditable='true' suppressContentEditableWarning={true}>
        {event.name ?? ''}
      </div>
      <label>comment:</label>
      <div className={styles.comment} contentEditable='true' suppressContentEditableWarning={true}>
        {event.comment ?? ''}
      </div>
      <div>start date:</div>
      <input type='date' className={styles.datetime}
        defaultValue={DateTime.getYYYYMMDD(event.repeat?event.repeatStart:event.start ?? 0)}></input>
      <div className={styles.row}>
        <div className={styles.parameter}>
          <div>time:</div>
          <input type='time' className={styles.datetime}
            defaultValue={DateTime.getHHMM(event.repeat?event.repeatStart:event.start ?? 0)}></input>
        </div>
        {' '}
        <div className={styles.parameter}>
          <div>duration:</div>
          <input type='time' className={styles.datetime}
            defaultValue=''></input>
        </div>
      </div>
      <div>end date:</div>
      <input type='date' className={styles.datetime}
        defaultValue={DateTime.getYYYYMMDD(event.repeat?event.repeatStart:event.start ?? 0)}></input>
      <div>repeat:</div>
      <input type='checkbox' value='repeat' checked={repeatCheck} onChange={onChangeRepeatCheckbox}></input>
      {repeatCheck && 
        <div className={styles.comment} contentEditable='true' suppressContentEditableWarning={true}>{event.repeat}</div>}
      <div>credit:</div>
        <div className={styles.comment} contentEditable='true' suppressContentEditableWarning={true}>{event.credit}</div>
      <div>debit:</div>
        <div className={styles.comment} contentEditable='true' suppressContentEditableWarning={true}>{event.debit}</div>
    </form>

  )
}

