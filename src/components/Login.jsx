import GAPI from '../utils/gapi.js'
import Button from './Button.jsx'

export default function () {
  return (
    <>
      <Button onClick={GAPI.logIn}>Log in</Button>
      <Button onClick={GAPI.logOut}>Log out</Button>
    </>
  )
}