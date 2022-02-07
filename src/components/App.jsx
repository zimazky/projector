import GAPI from '../utils/gapi.js'
import RemoteStorage from '../utils/remoteStorage.js'
import {eventList} from '../model/data.js'
import useUpdate from '../hooks/useUpdate.js'
import Calendar from './Calendar.jsx'
import styles from './App.module.css'
import Navbar from './Navbar.jsx'

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
  menu.push({ name: 'Save to LocalStorage', fn: ()=>{
    const dataString = JSON.stringify(eventList.prepareToStorage())
    localStorage.setItem('data',dataString)
    console.log(dataString)
  }})
  if(loginState) {
    menu.push({ name: 'Logout', fn: GAPI.logOut})
    menu.push({ name: 'Save to Google Drive', fn: async ()=>{
      RemoteStorage.saveFile('data.json',eventList.prepareToStorage())
        .then(()=>console.log('save ok'))
        .catch(()=>alert('Save error'))
    }})
    menu.push({ name: 'Load from Google Drive', fn: async ()=>{
      try {
        const obj = await RemoteStorage.loadFile('data.json')
        eventList.reload(obj)
        forceUpdate()
      } catch(e) {
        console.log('Load error', e)
        alert('Load error')
      }
    }})
  }
  else {
    menu.push({ name: 'Login', fn: GAPI.logIn})
  }
  menu.push({ name: 'Projects', fn: ()=>{} })

  
  console.log('app')
 
  return ( 
  <div className={styles.page}>
    <Navbar menuItems={menu}/>
    <Calendar/>
  </div>
  )
}