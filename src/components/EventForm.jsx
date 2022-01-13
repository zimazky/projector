import DateTime from "../utils/datetime"

export default function EventForm({event}) {

  console.log('event',event)
  return (
    <>
      <div>{'name'}</div>
      <input value={event.name ?? ''}></input>
      <div>{'comment'}</div>
      <input value={event.comment ?? ''}></input>
      <div>{'start date'}</div>
      <input type='datetime-local' 
        value={DateTime.getYYYYMMDDTHHMM(event.repeat?event.repeatStart:event.start ?? 0)}></input>
      <div>{'start time'}</div>
      <input value={new Date((event.repeat?event.repeatStart:event.start ?? 0)*1000).toLocaleTimeString()}></input>

    </>

  )
}

