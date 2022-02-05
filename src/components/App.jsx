import Calendar from './Calendar.jsx'
import GAPI from '../utils/gapi.js'
import Login from './Login.jsx'

export default function () {
  const [loginState, setLoginState] = React.useState(false)
  React.useEffect(()=>{
    GAPI.init({
      onSuccess: ()=>setLoginState(GAPI.isLoggedIn()),
      onSignIn: ()=>{
      setLoginState(GAPI.isLoggedIn())
      console.log('onSignIn',GAPI.isLoggedIn())
    }})
  },[])
  console.log('app')
  return loginState?<Calendar></Calendar>:<Login></Login>
}