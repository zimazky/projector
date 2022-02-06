import Calendar from './Calendar.jsx'
import GAPI from '../utils/gapi.js'
import Login from './Login.jsx'
import Navbar from './Navbar.jsx'

export default function () {
  const [loginState, setLoginState] = React.useState(false)
  const [gapiInit, setGapiInit] = React.useState(false)
  React.useEffect(()=>{
    GAPI.init({
      onSuccess: ()=>{
        setGapiInit(true)
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
  <>
    <Navbar></Navbar>
    <Calendar></Calendar>
  </>
  )
}