import React from 'react'
import styles from './Navbar.module.css'
import { calendarStore } from 'src/stores/MainStore'
import { observer } from 'mobx-react-lite'
import Time from './Time'

function navbar({menuItems=[], iconItems=[], navItems=[]}) {
  const [menuOpen, setMenuOpen] = React.useState(false)

  return <>
    <nav className={styles.navigationbar}>
      <span className={styles.navbar__icon_list}>
        <span className={styles.burgermenu} tabIndex={0} onClick={()=>setMenuOpen(s=>!s)} onBlur={()=>setMenuOpen(false)}>
          <svg width='100%' viewBox='0 0 12 11'>
            <rect width='12' height='2' y='0'/>
            <rect width='12' height='2' y='4'/>
            <rect width='12' height='2' y='8'/>
          </svg>
          { menuOpen && 
          <div className={styles.menu}>
              { menuItems.map((e, i)=><div key={i} onClick={e.fn}>{e.name}</div>) }
          </div> }
        </span>
        { iconItems.map((e,i)=><span className={styles.icons} title={e.name} key={i} onClick={e.fn}>{e.jsx}</span>)}
      </span>
      <span className={styles.caption}>{ calendarStore.caption }</span>
      <Time></Time>
    </nav>
  </>
}

export const Navbar = observer(navbar)