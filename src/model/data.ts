import { EventsCache } from "../stores/EventsCache/EventsCache"

const json = localStorage.getItem('data') ?? '{}'
console.log('localStorage',json)
const obj = JSON.parse(json)
export const eventList = new EventsCache()
eventList.load(obj)

