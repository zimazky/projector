import React from 'react'
import { observer } from 'mobx-react-lite'

import { calendarStore } from 'src/6-entities/stores/MainStore'

import Time from 'src/5-features/Time/Time'

import styles from './Header.module.css'

export type HeaderMenuItem = { name: string, fn: () => void }
export type HeaderIconItem = { jsx: React.JSX.Element } & HeaderMenuItem

type HeaderProps = {
  menuItems: HeaderMenuItem[],
  iconItems: HeaderIconItem[]
}

const Header: React.FC<HeaderProps> = observer(function({ menuItems = [], iconItems=[] }) {
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

export default Header