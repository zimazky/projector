import React from 'react'
import { observer } from 'mobx-react-lite'

import IconBar, { IconItem } from 'src/7-shared/ui/IconBar/IconBar'
import Drawer from 'src/7-shared/ui/Drawer/Drawer'
import List from 'src/7-shared/ui/List/List'
import ListItem from 'src/7-shared/ui/List/ListItem'

import { mainStore, weatherStore } from 'src/6-entities/stores/MainStore'
import Spinner from 'src/7-shared/ui/Spinner/Spinner'

function fullScreen() { 
  document.getElementById('root')?.requestFullscreen() 
}

const CalendarIconBar: React.FC = observer(function() {
 
  let icons: IconItem[] = []
  let menu: MenuItem[] = []

  menu.push({ name: 'Save to LocalStorage', fn: mainStore.saveToLocalStorage })
  icons.push({
    name: '',
    jsx: <svg>
      <path d='M2 6h20M2 12h20M2 18h20' strokeWidth={2.5}/>
    </svg>,
    fn: ()=>{mainStore.toggleMenu(true)}
  })
  icons.push({
    name: 'Save to LocalStorage', 
    jsx: <svg width='100%' viewBox="0 0 22 22">
      <path fill="none" d="m1 3a2 2 90 012-2l16 0a2 2 90 012 2l0 16a2 2 90 01-2 2l-16 0a2 2 90 01-2-2l0-16m5-2 0 6a1 1 90 001 1l8 0a1 1 90 001-1l0-6m-2 2a1 1 90 00-2 0l0 3a1 1 90 002 0l0-3"/>
      { mainStore.isSyncWithLocalstorage || <path fill="none" d="M17 1v8m-3-7 6 6m-6 0 6-6m-7 3h8" stroke="white" strokeWidth="5" strokeLinecap="round"></path> }
      { mainStore.isSyncWithLocalstorage || <path fill="none" strokeWidth="1" d="M17 1v8m-3-7 6 6m-6 0 6-6m-7 3h8"></path>}
      </svg>, 
    fn: mainStore.saveToLocalStorage
  })

  icons.push({
    name: 'Load from Google Drive', 
    jsx: <svg width='100%' viewBox="0 0 23 23">
      <path fill="#E34133" d="m17 3a10 10 8 00-14 2l3.2 2.4a6 6 0 018.4-1.2z" stroke="none"/>
      <path fill="#F3B605" d="m3 5a10 10 0 000 12l3.2-2.4a6 6 0 010-7.2z" stroke="none"/>
      <path fill="#32A350" d="m3 17a10 10 0 0014 2l-2.4-3.2a6 6 0 01-8.4-1.2z" stroke="none"/>
      <path fill="#4081EC" d="m17 19a10 10 0 003.8-10l-9.8 0 0 4 5.655 0a6 6 0 01-2.055 2.8z" stroke="none"/>
      <path fill="none" d="m21 16-3 3-3-3m3 2 0-8m3 12-6 0" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <path fill="none" d="m21 16-3 3-3-3m3 2 0-8m3 12-6 0" strokeWidth="2"/>
      </svg>, 
    fn: mainStore.loadFromGoogleDrive
  })
  if(mainStore.isGoogleLoggedIn) {
    menu.push({ name: 'Logout', fn: mainStore.logOut })
    menu.push({ name: 'Save to Google Drive', fn: mainStore.saveToGoogleDrive })
    menu.push({ name: 'Load from Google Drive', fn: mainStore.loadFromGoogleDrive })
    icons.push({
      name: 'Save to Google Drive', 
      jsx: <svg width='100%' viewBox="0 0 23 23">
        <path fill="#E34133" d="m17 3a10 10 8 00-14 2l3.2 2.4a6 6 0 018.4-1.2z" stroke="none"/>
        <path fill="#F3B605" d="m3 5a10 10 0 000 12l3.2-2.4a6 6 0 010-7.2z" stroke="none"/>
        <path fill="#32A350" d="m3 17a10 10 0 0014 2l-2.4-3.2a6 6 0 01-8.4-1.2z" stroke="none"/>
        <path fill="#4081EC" d="m17 19a10 10 0 003.8-10l-9.8 0 0 4 5.655 0a6 6 0 01-2.055 2.8z" stroke="none"/>
        <path fill="none" d="m21 15-3-3-3 3m3 5 0-7m3 9-6 0" stroke="white" strokeWidth="5" strokeLinecap="round"/>
        <path fill="none" d="m21 15-3-3-3 3m3 5 0-7m3 9-6 0" strokeWidth="2"/>
        { mainStore.isSyncWithGoogleDrive || <path fill="none" d="M17 1v8m-3-7 6 6m-6 0 6-6m-7 3h8" stroke="white" strokeWidth="5" strokeLinecap="round"></path> }
        { mainStore.isSyncWithGoogleDrive || <path fill="none" strokeWidth="1" d="M17 1v8m-3-7 6 6m-6 0 6-6m-7 3h8"></path>}

        </svg>, 
      fn: mainStore.saveToGoogleDrive
    })
  }
  else {
    menu.push({ name: 'Login', fn: mainStore.logIn })
  }
  icons.push({
    name: 'Load weather forecast',
    jsx: <svg width='100%' viewBox="0 0 23 23">
      <path fill="#f15d46" stroke="none" d="m16 1a1 1 0 000 12 1 1 0 000-12"></path>
      <path fill="#dddddd" stroke="none" d="m4 9h.5a4.3 4.3 90 01-.1-.9 1 1 0 018.6-.1 2.5 2.5 0 014.1 2.7l.6-.1a1 1 0 01.3 6.4h-14a1 1 0 010-8"></path>
      <path fill="none" d="m21 16-3 3-3-3m3 2 0-8m3 12-6 0" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <path fill="none" d="m21 16-3 3-3-3m3 2 0-8m3 12-6 0" strokeWidth="2"/>
    </svg>,
    fn: weatherStore.loadForecast
  })
  icons.push({
    name: 'Fullscreen mode', 
    jsx: <svg width='100%' viewBox="0 0 22 22">
      <path fill="none" d="m1 10 0-7a2 2 0 012-2l16 0a2 2 0 012 2l0 16a2 2 0 01-2 2l-7 0m-1-2a2 2 0 01-2 2l-6 0a2 2 0 01-2-2l0-6a2 2 0 012-2l6 0a2 2 0 012 2l0 6" strokeWidth="1"/>
      <path fill="none" d="m12 10 5-5m1 3 0-4-4 0" strokeWidth="2"/>
      </svg>, 
    fn: fullScreen
  })

  menu.push({ name: 'Projects', fn: ()=>{mainStore.changeViewMode({mode: 'Projects'})} })

  return <>
    <IconBar icons={icons}/>
    <Drawer open={mainStore.isMenuOpen} onClose={()=>mainStore.toggleMenu(false)}>
      <List>{ menu.map((m, i)=><ListItem key={i} onClick={m.fn}>{m.name}</ListItem>)}</List>
    </Drawer>
  </>
})

export default CalendarIconBar

type MenuItem = {
  name: string
  fn: ()=>void
}