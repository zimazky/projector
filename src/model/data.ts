import { CacheableEventList } from "./events/CacheableEventList"

const json = localStorage.getItem('data') ?? '{}'
console.log('localStorage',json)
const obj = JSON.parse(json)
export const eventList = new CacheableEventList()
eventList.load(obj)

