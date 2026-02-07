import React, { useContext } from 'react'
import { observer } from 'mobx-react-lite'
import useUpdate from 'src/7-shared/hooks/useUpdate'

import { StoreContext } from 'src/contexts/StoreContext'

import Header from 'src/4-widgets/Header/Header'
import Calendar from 'src/3-pages/Calendar/Calendar'
import DayList from 'src/3-pages/DayList/DayList'

import './App.css'
import ProjectsForm from 'src/3-pages/Projects/ProjectsForm'

const App: React.FC = observer(function() {
  const forceUpdate = useUpdate()
  const { mainStore, uiStore } = useContext(StoreContext)

  React.useEffect(forceUpdate, [mainStore.mustForceUpdate])

  console.log('app')
 
  return <>
    <Header/>
    { uiStore.viewMode === 'Calendar' ? <Calendar/> : null }
    { uiStore.viewMode === 'Day' ? <DayList/> : null }
    { uiStore.viewMode === 'Projects' ? <ProjectsForm/> : null }
  </>
})

export default App