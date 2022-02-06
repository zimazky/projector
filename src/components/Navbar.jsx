import styles from './Navbar.module.css'
import GAPI from '../utils/gapi.js'

export default function Navbar({event, isLogin=false}) {
  const [menuOpen,setMenuOpen] = React.useState(false)
/*
  React.useEffect(() => {
    const onClick = e => {if(menuRef.current && menuRef.current.contains(e.target)) setMenuOpen(false)}
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
*/
  return (
    <>
    <nav className={styles.navigationbar}>
      <span className={styles.burgermenu} tabIndex='0' onClick={()=>setMenuOpen(s=>!s)} onBlur={()=>setMenuOpen(false)}>
        <svg width='100%' viewBox='0 0 12 10'>
          <rect width='12' height='2' y='0'/>
          <rect width='12' height='2' y='4'/>
          <rect width='12' height='2' y='8'/>
        </svg>
        { menuOpen && 
        <div className={styles.menu}>
          <div onClick={()=>console.log('click')}>Save to LocalStorage</div>
          {isLogin?
            <>
              <div onClick={GAPI.logOut}>Logout</div>
              <div>Save to GoogleDrive</div>
              <div>Load from GoogleDrive</div>
            </>:
            <div onClick={GAPI.logIn}>Login</div>
          }
          <div>Projects</div>
        </div> }
      </span>
      <span onClick={()=>document.getElementById('root').requestFullscreen()}>Fullscreen</span>
      {/*
      Для событий
      <div>Complete/Mark uncompleted</div>
      <div>Delete All</div>
      <div>Delete one</div>
      <div>Delete one and all before</div>
      <div>Copy</div>
      */}
    </nav>
    </>
  )
}