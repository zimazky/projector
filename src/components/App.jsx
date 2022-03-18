import GAPI from '../utils/gapi.js'
import RemoteStorage from '../utils/remoteStorage.js'
import {eventList} from '../model/data.js'
import useUpdate from '../hooks/useUpdate.js'
import Calendar from './Calendar.jsx'
import styles from './App.module.css'
import Navbar from './Navbar.jsx'

function saveToLocalStorage() {
  const dataString = JSON.stringify(eventList.prepareToStorage())
  localStorage.setItem('data',dataString)
  console.log(dataString)
}

async function saveToGoogleDrive() {
  RemoteStorage.saveFile('data.json',eventList.prepareToStorage())
        .then(()=>console.log('save ok'))
        .catch(()=>alert('Save error'))
}

async function loadFromGoogleDrive() {
  try {
    const obj = await RemoteStorage.loadFile('data.json')
    eventList.reload(obj)
    forceUpdate()
  } catch(e) {
    console.log('Load error', e)
    alert('Load error')
  }
}

export default function () {
  const forceUpdate = useUpdate()
  const [loginState, setLoginState] = React.useState(false)
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

  if(loginState) {
    menu.push({ name: 'Logout', fn: GAPI.logOut})
    menu.push({ name: 'Save to Google Drive', fn: saveToGoogleDrive})
    icons.push({
      name: 'Save to Google Drive', 
      jsx: <svg width='100%' viewBox="0 0 76 76">
        <path fill="none" strokeLinecap="round" d="m15 44a1 1 0 010-25 11 11 0 0117-8 13 13 0 0125 4 1 1 0 013 29m-3 10a1 1 0 00-39 0 1 1 0 0039 0m-10-2-9-9-9 9m9 13 0-22"/>
        </svg>, 
      fn: saveToGoogleDrive
    })
    menu.push({ name: 'Load from Google Drive', fn: loadFromGoogleDrive})
    icons.push({
      name: 'Load from Google Drive', 
      jsx: <svg width='100%' viewBox="0 0 76 76">
        <path fill="none" strokeLinecap="round" d="m15 44a1 1 0 010-25 11 11 0 0117-8 13 13 0 0125 4 1 1 0 013 29m-3 10a1 1 0 00-39 0 1 1 0 0039 0m-10 2-9 9-9-9m9 9 0-22"/>
        </svg>, 
      fn: loadFromGoogleDrive
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
    <Calendar/>
  </div>
  )
}