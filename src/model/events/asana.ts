import DateTime from "src/utils/datetime"
import { ISingleEvent } from "./ievents"

type SingleCompletableEvent = ISingleEvent & {
  completed: boolean
}

function asanaToEvent(str: string):SingleCompletableEvent {
  const asana = str.split('"')
  const str1 = asana.map((s,i)=>i%2==0?s:s.replace(/,/g,'.')).join('"')
  const [id,created,completed,modified,name,section,assignee,email,startDate,dueDate,tags,notes,projects,parent,cost] = str1.split(',')
  const e = {name:name.replace(/"/g,''),start:dueDate,comment:notes.replace(/"/g,''),project:projects}
  const start = DateTime.getBeginDayTimestamp(+new Date(e.start)/1000)
  const time = null
  const duration = 0
  const end = start+86400
  return { 
    name: e.name===''?'без названия':e.name, comment: e.comment ?? '', project: e.project ?? '',
    start, time, duration, end, credit: 0, debit: 0, completed: completed===''?false:true
  }
}
