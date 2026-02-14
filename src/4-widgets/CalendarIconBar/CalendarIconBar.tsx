import React, { useContext, useState, useMemo } from 'react'
import { observer } from 'mobx-react-lite'

import IconBar, { IconItem } from 'src/7-shared/ui/IconBar/IconBar'
import Drawer from 'src/7-shared/ui/Drawer/Drawer'
import List from 'src/7-shared/ui/List/List'
import ListItem from 'src/7-shared/ui/List/ListItem'
import SwgIcon from 'src/7-shared/ui/Icons/SwgIcon'
import { Diskette, DownloadSign, Fullscreen, Google, Menu, ModifiedAsterisk, UploadSign, Weather } from 'src/7-shared/ui/Icons/Icons'

import { StoreContext } from 'src/1-app/Providers/StoreContext'
import DriveFilePicker from 'src/4-widgets/DriveFilePicker/DriveFilePicker'
import { IDriveItem } from 'src/7-shared/types/IDriveItem' // Изменено с DriveFileMetadata

import SaveToDrive from 'src/4-widgets/SaveToDrive/SaveToDrive';

function fullScreen() {
  document.getElementById('root')?.requestFullscreen()
}

const CalendarIconBar: React.FC = observer(function() {
  const { uiStore, googleApiService, storageService, weatherStore, saveToDriveStore } = useContext(StoreContext)
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const handleSaveToDrive = () => {
    // const dataToSave = {
    //   title: "Calendar Events Export",
    //   date: new Date().toISOString(),
    //   eventsCount: 123, // Example data
    //   events: [ // Just a placeholder, replace with actual event data
    //     { id: '1', name: 'Meeting', date: '2026-02-08', time: '10:00' },
    //     { id: '2', name: 'Presentation', date: '2026-02-09', time: '14:00' },
    //   ]
    // };
    const dataToSave = storageService.getContentToSave();
    const fileName = `calendar_data_${new Date().toISOString().slice(0, 10)}.json`;
    const mimeType = 'application/json';
    saveToDriveStore.open(fileName, JSON.stringify(dataToSave, null, 2), mimeType);
  };

  let icons: IconItem[] = []
  let menu: MenuItem[] = []

  menu.push({ name: 'Save to LocalStorage', fn: storageService.saveToLocalStorage })
  icons.push({
    name: '',
    jsx: <SwgIcon><Menu/></SwgIcon>,
    fn: ()=>{uiStore.toggleMenu(true)}
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

  if(googleApiService.isGoogleLoggedIn) {
    menu.push({ name: 'Logout', fn: googleApiService.logOut })
    menu.push({ name: 'Save to Google Drive', fn: storageService.saveToGoogleDrive })
    menu.push({ name: 'Load from Google Drive', fn: storageService.loadFromGoogleDrive })
    menu.push({ name: 'Open Drive File Picker', fn: () => setIsPickerOpen(true) }) // New menu item

    icons.push({
      name: 'Save to Google Drive',
      jsx: <SwgIcon><Google/><UploadSign/>
        { storageService.isSyncWithGoogleDrive || <ModifiedAsterisk/> }
        </SwgIcon>,
      fn: storageService.saveToGoogleDrive
    })

    icons.push({
      name: 'Choose File from Drive',
      jsx: <SwgIcon><Google/><DownloadSign/></SwgIcon>,
      fn: () => setIsPickerOpen(true)
    })

    icons.push({
      name: 'Save to Google Drive (New)',
      jsx: <SwgIcon><Google/><UploadSign/></SwgIcon>,
      fn: handleSaveToDrive
    });
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

  if(uiStore.viewMode !== 'Calendar')
    menu.push({ name: 'Calendar', fn: ()=>{uiStore.changeViewMode({mode: 'Calendar'})} })

  if(uiStore.viewMode !== 'Projects')
    menu.push({ name: 'Projects', fn: ()=>{uiStore.changeViewMode({mode: 'Projects'})} })

  const handleFileSelect = (file: IDriveItem) => { // Изменено
    console.log('Selected file:', file);
    if (file.isFolder()) return;
    storageService.loadFromGoogleDriveByFileId(file.id);
    // Here you would typically integrate with storageService to load the file
    // For example: storageService.loadFileFromGoogleDrive(file.id);
  };

  return <>
    <IconBar icons={icons}/>
    <Drawer open={uiStore.isMenuOpen} onClose={()=>uiStore.toggleMenu(false)}>
      <List>{ menu.map((m, i)=><ListItem key={i} onClick={m.fn}>{m.name}</ListItem>)}</List>
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
  fn: ()=>void
}