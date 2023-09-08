import React from 'react'
import { observer } from 'mobx-react-lite'

import useUpdate from 'src/7-shared/hooks/useUpdate'

import { mainStore } from 'src/6-entities/stores/MainStore'

import Header from 'src/4-widgets/Header/Header'

import Calendar from 'src/3-pages/Calendar/Calendar'
import DayList from 'src/3-pages/DayList/DayList'

import './App.css'
import ProjectsForm from 'src/3-pages/Projects/ProjectsForm'

const App: React.FC = observer(function() {
  const forceUpdate = useUpdate()
  React.useEffect(mainStore.gapiInit, [])
  React.useEffect(forceUpdate, [mainStore.mustForceUpdate])

  console.log('app')
 
  return <>
    <Header/>
    { mainStore.viewMode === 'Calendar' ? <Calendar/> : null }
    { mainStore.viewMode === 'Day' ? <DayList/> : null }
    { mainStore.viewMode === 'Projects' ? <ProjectsForm/> : null }
  </>
})

export default App