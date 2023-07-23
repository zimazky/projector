import React from 'react'
import ReactDOM from 'react-dom'
import useUpdate from './hooks/useUpdate'
import { Calendar } from './components/Calendar'
import DayList from './components/DayList'
import Navbar from './components/Navbar'
import styles from './App.module.css'
import { weatherStore } from './stores/Weather/WeatherStore'
import { mainStore } from './stores/MainStore'
import { observer } from 'mobx-react-lite'

function fullScreen() { 
  document.getElementById('root').requestFullscreen() 
}

function app() {
  const forceUpdate = useUpdate()
  React.useEffect(mainStore.gapiInit, [])
  React.useEffect(forceUpdate, [mainStore.mustForceUpdate])
  
  let menu = []
  let icons = []

  menu.push({ name: 'Save to LocalStorage', fn: mainStore.saveToLocalStorage })
  icons.push({
    name: 'Save to LocalStorage', 
    jsx: <svg width='100%' viewBox="0 0 22 22">
      <path fill="none" d="m 1 3 a 2 2 90 0 1 2 -2 l 16 0 a 2 2 90 0 1 2 2 l 0 16 a 2 2 90 0 1 -2 2 l -16 0 a 2 2 90 0 1 -2 -2 l 0 -16 m 5 -2 l 0 6 a 1 1 90 0 0 1 1 l 8 0 a 1 1 90 0 0 1 -1 l 0 -6 m -2 2 a 1 1 90 0 0 -2 0 l 0 3 a 1 1 90 0 0 2 0 l 0 -3"/>
      </svg>, 
    fn: mainStore.saveToLocalStorage
  })

  icons.push({
    name: 'Load from Google Drive', 
    jsx: <svg width='100%' viewBox="0 0 23 23">
      <path fill="#E34133" d="M 17 3 A 10 10 8 0 0 3 5 L 6.2 7.4 A 6 6 0 0 1 14.6 6.2 Z" stroke="none"/>
      <path fill="#F3B605" d="M 3 5 A 10 10 0 0 0 3 17 L 6.2 14.6 A 6 6 0 0 1 6.2 7.4 Z" stroke="none"/>
      <path fill="#32A350" d="M 3 17 A 10 10 0 0 0 17 19 L 14.6 15.8 A 6 6 0 0 1 6.2 14.6 Z" stroke="none"/>
      <path fill="#4081EC" d="M 17 19 A 10 10 0 0 0 20.8 9 L 11 9 L 11 13 L 16.655 13 A 6 6 0 0 1 14.6 15.8 Z" stroke="none"/>
      <path fill="none" d="m21 16-3 3-3-3m3 2 0-8m3 12-6 0" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <path fill="none" d="m21 16-3 3-3-3m3 2 0-8m3 12-6 0" strokeWidth="2"/>
      </svg>, 
    fn: mainStore.loadFromGoogleDrive
  })
  if(mainStore.isGoogleLoggedIn) {
    menu.push({ name: 'Logout', fn: mainStore.logOut })
    menu.push({ name: 'Save to Google Drive', fn: mainStore.saveToGoogleDrive })
    menu.push({ name: 'Load from Google Drive', fn: mainStore.loadFromGoogleDrive })
    icons.push({
      name: 'Save to Google Drive', 
      jsx: <svg width='100%' viewBox="0 0 23 23">
        <path fill="#E34133" d="M 17 3 A 10 10 8 0 0 3 5 L 6.2 7.4 A 6 6 0 0 1 14.6 6.2 Z" stroke="none"/>
        <path fill="#F3B605" d="M 3 5 A 10 10 0 0 0 3 17 L 6.2 14.6 A 6 6 0 0 1 6.2 7.4 Z" stroke="none"/>
        <path fill="#32A350" d="M 3 17 A 10 10 0 0 0 17 19 L 14.6 15.8 A 6 6 0 0 1 6.2 14.6 Z" stroke="none"/>
        <path fill="#4081EC" d="M 17 19 A 10 10 0 0 0 20.8 9 L 11 9 L 11 13 L 16.655 13 A 6 6 0 0 1 14.6 15.8 Z" stroke="none"/>
        <path fill="none" d="m21 15-3-3-3 3m3 5 0-7m3 9-6 0" stroke="white" strokeWidth="5" strokeLinecap="round"/>
        <path fill="none" d="m21 15-3-3-3 3m3 5 0-7m3 9-6 0" strokeWidth="2"/>
        </svg>, 
      fn: mainStore.saveToGoogleDrive
    })
  }
  else {
    menu.push({ name: 'Login', fn: mainStore.logIn })
  }
  icons.push({
    name: 'Load weather forecast',
    jsx: <svg width='100%' viewBox="0 0 23 23">
      <path fill="#f15d46" stroke="none" d="m16 1a1 1 0 000 12 1 1 0 000-12"></path>
      <path fill="#dddddd" stroke="none" d="m4 9h.5a4.3 4.3 90 01-.1-.9 1 1 0 018.6-.1 2.5 2.5 0 014.1 2.7l.6-.1a1 1 0 01.3 6.4h-14a1 1 0 010-8"></path>
      <path fill="none" d="m21 16-3 3-3-3m3 2 0-8m3 12-6 0" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <path fill="none" d="m21 16-3 3-3-3m3 2 0-8m3 12-6 0" strokeWidth="2"/>
    </svg>,
    fn: weatherStore.loadForecast
  })
  icons.push({
    name: 'Fullscreen mode', 
    jsx: <svg width='100%' viewBox="0 0 22 22">
      <path fill="none" d="m 1 10 l 0 -7 a 2 2 0 0 1 2 -2 l 16 0 a 2 2 0 0 1 2 2 l 0 16 a 2 2 0 0 1 -2 2 l -7 0 m -1 -2 a 2 2 0 0 1 -2 2 l -6 0 a 2 2 0 0 1 -2 -2 l 0 -6 a 2 2 0 0 1 2 -2 l 6 0 a 2 2 0 0 1 2 2 l 0 6" strokeWidth="1"/>
      <path fill="none" d="M 12 10 L 17 5 M 18 8 L 18 4 L 14 4" strokeWidth="2"/>
      </svg>, 
    fn: fullScreen
  })

  menu.push({ name: 'Projects', fn: ()=>{} })


  console.log('app')
 
  return ( 
  <div className={styles.page}>
    <Navbar menuItems={menu} iconItems={icons}/>
    {
      mainStore.viewMode === 'Calendar' ?
      <Calendar onDayOpen={t=>mainStore.changeViewMode({mode: 'Day', timestamp: t}) /*setState(s=>{return {...s,timestamp:t,view:'Day'}})*/ }/>
      :null
    }
    {
      mainStore.viewMode === 'Day' ?
      <DayList timestamp={mainStore.timestamp} 
      onChangeDate={t=> mainStore.changeViewMode({timestamp: t}) /*setState(s=>{return {...s,timestamp:t}})*/}
      onCalendarOpen={()=> mainStore.changeViewMode({mode: 'Calendar'})   /*setState(s=>{return {...s,view:'Calendar'}})*/ }
      />
      :null
    }
  </div>
  )
}
export const App = observer(app);

ReactDOM.render(<App/>, document.getElementById('root'))