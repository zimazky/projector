import styles from './Navbar.module.css'

export default function Navbar({event}) {
  const [menuOpen,setMenuOpen] = React.useState(false)
  return (
    <>
    <nav className={styles.navigationbar}>
      <div className={styles.burgermenu} onClick={()=>setMenuOpen(s=>!s)}>
        <svg width='100%' viewBox='0 0 12 10'>
          <rect width='12' height='2' y='0'/>
          <rect width='12' height='2' y='4'/>
          <rect width='12' height='2' y='8'/>
        </svg>
      </div>
      <div>Save</div>
      {/*
      Для событий
      <div>Complete/Mark uncompleted</div>
      <div>Delete All</div>
      <div>Delete one</div>
      <div>Delete one and all before</div>
      <div>Copy</div>
      */}
    </nav>
    { menuOpen && 
    <div className={styles.menu}>
      <div>Save to LocalStorage</div>
      <div>Login</div>
      <div>Save to GoogleDrive</div>
      <div>Load from GoogleDrive</div>
      <div>Projects</div>
    </div> }
    </>
  )
}