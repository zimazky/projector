import React from 'react'
import { observer } from 'mobx-react-lite'
import { calendarStore } from 'src/stores/MainStore'
import Time from 'src/components/Time/Time'
import styles from './Navbar.module.css'

export type NavbarMenuItem = { name: string, fn: () => void }
export type NavbarIconItem = { jsx: React.JSX.Element } & NavbarMenuItem

type NavbarProps = {
  menuItems: NavbarMenuItem[],
  iconItems: NavbarIconItem[]
}

const Navbar: React.FC<NavbarProps> = observer(function({ menuItems = [], iconItems=[] }) {
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
})

export default Navbar