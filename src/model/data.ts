import { projectsStore } from "src/stores/Projects/ProjectsStore"
import { EventsCache } from "../stores/EventsCache/EventsCache"

const json = localStorage.getItem('data') ?? '{}'
console.log('localStorage',json)
const obj = JSON.parse(json)
//console.log(obj)
projectsStore.init(obj.projectsList)
export const eventList = new EventsCache()
eventList.load(obj)

