import React from 'react'
import ReactDOM from 'react-dom'
import GAPI from './utils/gapi'
import RemoteStorage from './utils/remoteStorage'
import {eventList} from './model/data'
import useUpdate from './hooks/useUpdate.js'
import Calendar from './pages/calendar/Calendar'
import DayList from './pages/daylist/DayList'
import Navbar from './components/Navbar'
import styles from './App.module.css'
import OpenWeatherMap from './utils/openweathermap'

function saveToLocalStorage() {
  const dataString = JSON.stringify(eventList.prepareToSave())
  localStorage.setItem('data',dataString)
  console.log(dataString)
}

async function saveToGoogleDrive() {
  RemoteStorage.saveFile('data.json',eventList.prepareToSave())
        .then(()=>console.log('save ok'))
        .catch(()=>alert('Save error'))
}

function fullScreen() { 
  document.getElementById('root').requestFullscreen() 
}

async function loadWeatherForecast() {
  const data = await OpenWeatherMap.getForecast(58.727591, 32.463607);
  console.log(data);
}

export default function App() {
  const forceUpdate = useUpdate()
  const [loginState, setLoginState] = React.useState(false)
  const [state, setState] = React.useState({view:'Calendar', timestamp: Date.now()/1000})

  async function loadFromGoogleDrive() {
    try {
      if(!GAPI.isLoggedIn()) {
        console.log('logging...')
        await GAPI.logIn()
        console.log('login ok')
      }
      const obj = await RemoteStorage.loadFile('data.json')
      eventList.load(obj)
      forceUpdate()
    } catch(e) {
      console.log('Load error', e)
      alert('Load error')
    }
  }
  
  React.useEffect(()=>{
    GAPI.init({
      onSuccess: ()=>{
        setLoginState(GAPI.isLoggedIn())
      },
      onSignIn: ()=>{
        setLoginState(GAPI.isLoggedIn())
        console.log('onSignIn',GAPI.isLoggedIn())
      },
      onExpiredToken: ()=>{
        setLoginState(false)
      }
    })
  },[])
  
  let menu = []
  let icons = []

  menu.push({ name: 'Save to LocalStorage', fn: saveToLocalStorage})
  icons.push({
    name: 'Save to LocalStorage', 
    jsx: <svg width='100%' viewBox="0 0 22 22">
      <path fill="none" d="m 1 3 a 2 2 90 0 1 2 -2 l 16 0 a 2 2 90 0 1 2 2 l 0 16 a 2 2 90 0 1 -2 2 l -16 0 a 2 2 90 0 1 -2 -2 l 0 -16 m 5 -2 l 0 6 a 1 1 90 0 0 1 1 l 8 0 a 1 1 90 0 0 1 -1 l 0 -6 m -2 2 a 1 1 90 0 0 -2 0 l 0 3 a 1 1 90 0 0 2 0 l 0 -3"/>
      </svg>, 
    fn: saveToLocalStorage
  })

  icons.push({
    name: 'Load from Google Drive', 
    jsx: <svg width='100%' viewBox="0 0 23 23">
      <path fill="#E34133" d="M 17 3 A 10 10 8 0 0 3 5 L 6.2 7.4 A 6 6 0 0 1 14.6 6.2 Z" stroke="none"/>
      <path fill="#F3B605" d="M 3 5 A 10 10 0 0 0 3 17 L 6.2 14.6 A 6 6 0 0 1 6.2 7.4 Z" stroke="none"/>
      <path fill="#32A350" d="M 3 17 A 10 10 0 0 0 17 19 L 14.6 15.8 A 6 6 0 0 1 6.2 14.6 Z" stroke="none"/>
      <path fill="#4081EC" d="M 17 19 A 10 10 0 0 0 20.8 9 L 11 9 L 11 13 L 16.655 13 A 6 6 0 0 1 14.6 15.8 Z" stroke="none"/>
      <path fill="none" d="M 22 15 L 18 19 L 14 15 M 18 18 L 18 9 M 22 22 L 14 22" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <path fill="none" d="M 22 15 L 18 19 L 14 15 M 18 18 L 18 9 M 22 22 L 14 22" strokeWidth="2"/>
      </svg>, 
    fn: loadFromGoogleDrive
  })
  if(loginState) {
    menu.push({ name: 'Logout', fn: ()=>{
      GAPI.logOut()
      setLoginState(false)
    }})
    menu.push({ name: 'Save to Google Drive', fn: saveToGoogleDrive})

    // icons.push({
    //   name: 'Save to Google Drive', 
    //   jsx: <svg width='100%' viewBox="0 0 76 76">
    //     <path fill="none" strokeLinecap="round" d="m15 44a1 1 0 010-25 11 11 0 0117-8 13 13 0 0125 4 1 1 0 013 29m-3 10a1 1 0 00-39 0 1 1 0 0039 0m-10-2-9-9-9 9m9 13 0-22"/>
    //     </svg>, 
    //   fn: saveToGoogleDrive
    // })
    menu.push({ name: 'Load from Google Drive', fn: loadFromGoogleDrive})
    // icons.push({
    //   name: 'Load from Google Drive', 
    //   jsx: <svg width='100%' viewBox="0 0 76 76">
    //     <path fill="none" strokeLinecap="round" d="m15 44a1 1 0 010-25 11 11 0 0117-8 13 13 0 0125 4 1 1 0 013 29m-3 10a1 1 0 00-39 0 1 1 0 0039 0m-10 2-9 9-9-9m9 9 0-22"/>
    //     </svg>, 
    //   fn: loadFromGoogleDrive
    // })
    icons.push({
      name: 'Save to Google Drive', 
      jsx: <svg width='100%' viewBox="0 0 23 23">
        <path fill="#E34133" d="M 17 3 A 10 10 8 0 0 3 5 L 6.2 7.4 A 6 6 0 0 1 14.6 6.2 Z" stroke="none"/>
        <path fill="#F3B605" d="M 3 5 A 10 10 0 0 0 3 17 L 6.2 14.6 A 6 6 0 0 1 6.2 7.4 Z" stroke="none"/>
        <path fill="#32A350" d="M 3 17 A 10 10 0 0 0 17 19 L 14.6 15.8 A 6 6 0 0 1 6.2 14.6 Z" stroke="none"/>
        <path fill="#4081EC" d="M 17 19 A 10 10 0 0 0 20.8 9 L 11 9 L 11 13 L 16.655 13 A 6 6 0 0 1 14.6 15.8 Z" stroke="none"/>
        <path fill="none" d="M 22 15 L 18 11 L 14 15 M 18 20 L 18 12 M 22 22 L 14 22" stroke="white" strokeWidth="5" strokeLinecap="round"/>
        <path fill="none" d="M 22 15 L 18 11 L 14 15 M 18 20 L 18 12 M 22 22 L 14 22" strokeWidth="2"/>
        </svg>, 
      fn: saveToGoogleDrive
    })
  }
  else {
    menu.push({ name: 'Login', fn: ()=>{GAPI.logIn()}})


  }
  icons.push({
    name: 'Load weather forecast',
    jsx: <svg width='100%' viewBox="0 0 23 23">
      <path fill="#f15d46" stroke="none" d="m16 1a1 1 0 000 12 1 1 0 000-12"></path>
      <path fill="#dddddd" stroke="none" d="m4 9h.5a4.3 4.3 90 01-.1-.9 1 1 0 018.6-.1 2.5 2.5 0 014.1 2.7l.6-.1a1 1 0 01.3 6.4h-14a1 1 0 010-8"></path>
      <path fill="none" d="m22 15-4 4-4-4m4 3 0-9m4 13-8 0" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <path fill="none" d="m22 15-4 4-4-4m4 3 0-9m4 13-8 0" strokeWidth="2"/>
    </svg>,
    fn: loadWeatherForecast
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
      state.view==='Calendar'?
      <Calendar onDayOpen={t=>setState(s=>{return {...s,timestamp:t,view:'Day'}})}/>
      :null
    }
    {
      state.view==='Day'?
      <DayList timestamp={state.timestamp} 
      onChangeDate={t=>setState(s=>{return {...s,timestamp:t}})}
      onCalendarOpen={()=>setState(s=>{return {...s,view:'Calendar'}})}
      />
      :null
    }
  </div>
  )
}

ReactDOM.render(<App/>, document.getElementById('root'))