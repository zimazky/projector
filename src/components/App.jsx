import GAPI from '../utils/gapi.js'
import Calendar from './Calendar.jsx'
import styles from './App.module.css'
import Navbar from './Navbar.jsx'

export default function () {
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
  console.log('app')
  
  return ( 
  <div className={styles.page}>
    <Navbar isLogin={loginState}></Navbar>
    <Calendar></Calendar>
  </div>
  )
}