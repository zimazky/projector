import React, { useContext, useState } from 'react'
import { observer } from 'mobx-react-lite'

import IconBar, { IconItem } from 'src/7-shared/ui/IconBar/IconBar'
import Drawer from 'src/7-shared/ui/Drawer/Drawer'
import List from 'src/7-shared/ui/List/List'
import ListItem from 'src/7-shared/ui/List/ListItem'
import SwgIcon from 'src/7-shared/ui/Icons/SwgIcon'
import { Diskette, DownloadSign, Fullscreen, Google, Menu, ModifiedAsterisk, UploadSign, Weather } from 'src/7-shared/ui/Icons/Icons'

import { StoreContext } from 'src/1-app/Providers/StoreContext'
import DriveFilePicker from 'src/4-widgets/DriveFilePicker/DriveFilePicker'
import { IDriveItem } from 'src/7-shared/types/IDriveItem'

import SaveToDrive from 'src/4-widgets/SaveToDrive/SaveToDrive'

function fullScreen() {
  document.getElementById('root')?.requestFullscreen()
}

const CalendarIconBar: React.FC = observer(function() {
  const {
    uiStore,
    googleApiService,
    storageService,
    weatherStore,
    saveToDriveStore,
    documentSessionStore
  } = useContext(StoreContext)

  const [isPickerOpen, setIsPickerOpen] = useState(false)

  const handleSaveAsToDrive = () => {
    const dataToSave = storageService.getContentToSave()
    const fileName = documentSessionStore.state.ref?.name || `calendar_data_${new Date().toISOString().slice(0, 10)}.json`
    const mimeType = documentSessionStore.state.ref?.mimeType || 'application/json'
    saveToDriveStore.open(fileName, JSON.stringify(dataToSave, null, 2), mimeType)
  }

  const handleSaveCurrentDocument = async () => {
    if (documentSessionStore.state.ref?.fileId) {
      const isSaved = await documentSessionStore.saveToCurrentFile()
      if (!isSaved && documentSessionStore.state.error) {
        alert(documentSessionStore.state.error)
      }
      return
    }
    handleSaveAsToDrive()
  }

  let icons: IconItem[] = []
  let menu: MenuItem[] = []

  menu.push({ name: 'Save to LocalStorage', fn: storageService.saveToLocalStorage })
  icons.push({
    name: '',
    jsx: <SwgIcon><Menu/></SwgIcon>,
    fn: () => { uiStore.toggleMenu(true) }
  })
  icons.push({
    name: 'Save to LocalStorage',
    jsx: <SwgIcon><Diskette/>
      {storageService.isSyncWithLocalstorage || <ModifiedAsterisk/>}
      </SwgIcon>,
    fn: storageService.saveToLocalStorage
  })

  icons.push({
    name: 'Load from Google Drive',
    jsx: <SwgIcon><Google/><DownloadSign/></SwgIcon>,
    fn: storageService.loadFromGoogleDrive
  })

  if (googleApiService.isGoogleLoggedIn) {
    menu.push({ name: 'Logout', fn: googleApiService.logOut })
    menu.push({ name: 'Save to Google Drive', fn: handleSaveCurrentDocument })
    menu.push({ name: 'Save to Google Drive As...', fn: handleSaveAsToDrive })
    menu.push({ name: 'Load from Google Drive', fn: storageService.loadFromGoogleDrive })
    menu.push({ name: 'Open Drive File Picker', fn: () => setIsPickerOpen(true) })

    icons.push({
      name: 'Save to Google Drive',
      jsx: <SwgIcon><Google/><UploadSign/>
        {storageService.isSyncWithGoogleDrive || <ModifiedAsterisk/>}
        </SwgIcon>,
      fn: handleSaveCurrentDocument
    })

    icons.push({
      name: 'Choose File from Drive',
      jsx: <SwgIcon><Google/><DownloadSign/></SwgIcon>,
      fn: () => setIsPickerOpen(true)
    })

    icons.push({
      name: 'Save to Google Drive As...',
      jsx: <SwgIcon><Google/><UploadSign/></SwgIcon>,
      fn: handleSaveAsToDrive
    })
  }
  else {
    menu.push({ name: 'Login', fn: googleApiService.logIn })
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

  if (uiStore.viewMode !== 'Calendar') {
    menu.push({ name: 'Calendar', fn: () => { uiStore.changeViewMode({ mode: 'Calendar' }) } })
  }

  if (uiStore.viewMode !== 'Projects') {
    menu.push({ name: 'Projects', fn: () => { uiStore.changeViewMode({ mode: 'Projects' }) } })
  }

  const handleFileSelect = async (file: IDriveItem) => {
    console.log('Selected file:', file)
    if (file.isFolder()) return

    await documentSessionStore.openFromDriveFile(file.id)
    if (documentSessionStore.state.error) {
      alert(documentSessionStore.state.error)
    }
  }

  return <>
    <IconBar icons={icons}/>
    <Drawer open={uiStore.isMenuOpen} onClose={() => uiStore.toggleMenu(false)}>
      <List>{menu.map((m, i) => <ListItem key={i} onClick={m.fn}>{m.name}</ListItem>)}</List>
    </Drawer>
    <DriveFilePicker
      isOpen={isPickerOpen}
      onClose={() => setIsPickerOpen(false)}
      onSelect={handleFileSelect}
    />
    <SaveToDrive />
  </>
})

export default CalendarIconBar

type MenuItem = {
  name: string
  fn: () => void
}
