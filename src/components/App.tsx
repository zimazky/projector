import React from 'react'
import GAPI from '../utils/gapi.js'
import RemoteStorage from '../utils/remoteStorage.js'
import {eventList} from '../model/data'
import useUpdate from '../hooks/useUpdate.js'
import Calendar from './Calendar'
import DayList from './DayList'
import Navbar from './Navbar'
import styles from './App.module.css'

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

export default function () {
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
      }
    })
  },[])
  
  let menu = []
  let icons = []

  menu.push({ name: 'Save to LocalStorage', fn: saveToLocalStorage})
  icons.push({
    name: 'Save to LocalStorage', 
    jsx: <svg width='100%' viewBox="0 0 76 76">
      <path fill="none" d="m3 10a7 7 0 017-7l54 0a7 7 0 017 7l0 56a7 7 0 01-7 7l-54 0a7 7 0 01-7-7l0-56m14-7 0 22a4 4 0 004 4l32 0a4 4 0 004-4l0-22m-9 7a1 1 0 00-6 0l0 12a1 1 0 006 0l0-12"/>
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
      <path fill="none" d="M 22 15 L 18 19 L 14 15 M 18 17 L 18 9 M 22 22 L 14 22" stroke="white" strokeWidth="6"/>
      <path fill="none" d="M 22 15 L 18 19 L 14 15 M 18 17 L 18 9 M 22 22 L 14 22" strokeWidth="2"/>
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
        <path fill="none" d="M 22 15 L 18 11 L 14 15 M 18 20 L 18 13 M 22 22 L 14 22" stroke="white" strokeWidth="6"/>
        <path fill="none" d="M 22 15 L 18 11 L 14 15 M 18 20 L 18 13 M 22 22 L 14 22" strokeWidth="2"/>
        </svg>, 
      fn: saveToGoogleDrive
    })
  }
  else {
    menu.push({ name: 'Login', fn: GAPI.logIn})

  }
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