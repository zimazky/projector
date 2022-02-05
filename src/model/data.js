import EventList from '../utils/eventList'
import GAPI from '../utils/gapi.js'

const json = localStorage.getItem('data')
console.log('localStorage',json)
const obj = JSON.parse(json)
export const eventList = new EventList(obj)
