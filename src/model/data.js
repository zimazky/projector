import EventList from '../utils/eventList'

const json = localStorage.getItem('data')
console.log('localStorage',json)
const obj = JSON.parse(json)
export const eventList = new EventList(obj)
