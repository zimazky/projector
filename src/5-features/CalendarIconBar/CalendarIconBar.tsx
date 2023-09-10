import React from 'react'
import { observer } from 'mobx-react-lite'

import IconBar, { IconItem } from 'src/7-shared/ui/IconBar/IconBar'
import Drawer from 'src/7-shared/ui/Drawer/Drawer'
import List from 'src/7-shared/ui/List/List'
import ListItem from 'src/7-shared/ui/List/ListItem'
import SwgIcon from 'src/7-shared/ui/Icons/SwgIcon'
import { Diskette, DownloadSign, Fullscreen, Google, Menu, ModifiedAsterisk, UploadSign, Weather } from 'src/7-shared/ui/Icons/Icons'

import { mainStore, weatherStore } from 'src/6-entities/stores/MainStore'

function fullScreen() { 
  document.getElementById('root')?.requestFullscreen() 
}

const CalendarIconBar: React.FC = observer(function() {
 
  let icons: IconItem[] = []
  let menu: MenuItem[] = []

  menu.push({ name: 'Save to LocalStorage', fn: mainStore.saveToLocalStorage })
  icons.push({
    name: '',
    jsx: <SwgIcon><Menu/></SwgIcon>,
    fn: ()=>{mainStore.toggleMenu(true)}
  })
  icons.push({
    name: 'Save to LocalStorage', 
    jsx: <SwgIcon><Diskette/>
      {mainStore.isSyncWithLocalstorage || <ModifiedAsterisk/>}
      </SwgIcon>, 
    fn: mainStore.saveToLocalStorage
  })

  icons.push({
    name: 'Load from Google Drive', 
    jsx: <SwgIcon><Google/><DownloadSign/></SwgIcon>, 
    fn: mainStore.loadFromGoogleDrive
  })
  if(mainStore.isGoogleLoggedIn) {
    menu.push({ name: 'Logout', fn: mainStore.logOut })
    menu.push({ name: 'Save to Google Drive', fn: mainStore.saveToGoogleDrive })
    menu.push({ name: 'Load from Google Drive', fn: mainStore.loadFromGoogleDrive })
    icons.push({
      name: 'Save to Google Drive', 
      jsx: <SwgIcon><Google/><UploadSign/>
        { mainStore.isSyncWithGoogleDrive || <ModifiedAsterisk/> }
        </SwgIcon>, 
      fn: mainStore.saveToGoogleDrive
    })
  }
  else {
    menu.push({ name: 'Login', fn: mainStore.logIn })
  }
  icons.push({
    name: 'Load weather forecast',
    jsx: <SwgIcon><Weather/><DownloadSign/></SwgIcon>,
    fn: weatherStore.loadForecast
  })
  icons.push({
    name: 'Fullscreen mode', 
    jsx: <SwgIcon><Fullscreen/></SwgIcon>,
    fn: fullScreen
  })

  if(mainStore.viewMode !== 'Calendar')
    menu.push({ name: 'Calendar', fn: ()=>{mainStore.changeViewMode({mode: 'Calendar'})} })

  if(mainStore.viewMode !== 'Projects')
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