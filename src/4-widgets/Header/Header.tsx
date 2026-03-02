import React, { useContext, useState } from 'react'
import { observer } from 'mobx-react-lite'

import Time from 'src/7-shared/ui/Time/Time'
import UserAvatar from 'src/7-shared/ui/UserAvatar/UserAvatar'
import List from 'src/7-shared/ui/List/List'
import ListItem from 'src/7-shared/ui/List/ListItem'

import { StoreContext } from 'src/1-app/Providers/StoreContext'

import CalendarIconBar from 'src/4-widgets/CalendarIconBar/CalendarIconBar'

import styles from './Header.module.css'

const Header: React.FC = observer(function () {
  const { calendarStore, uiStore, documentSessionStore, googleApiService } = useContext(StoreContext)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const documentTitle = documentSessionStore.isOpened
    ? `${documentSessionStore.title}${documentSessionStore.state.isDirty ? ' *' : ''}`
    : 'Документ не открыт'

  const handleAvatarClick = () => {
    setIsUserMenuOpen(prev => !prev)
  }

  const handleLogoutClick = () => {
    googleApiService.logOut()
    setIsUserMenuOpen(false)
  }

  return (
    <header className={styles.header}>
      <CalendarIconBar />
      <span className={styles.documentName}>{documentTitle}</span>
      <span className={styles.caption}>{calendarStore.caption}</span>
      <span className={styles.rightSection}>
        <Time
          onClick={() => {
            calendarStore.setWeek(Date.now() / 1000)
            uiStore.forceUpdate()
          }}
        />
        <span className={styles.userMenu}>
          <UserAvatar
            isLoggedIn={googleApiService.isGoogleLoggedIn}
            userName={googleApiService.userName}
            avatarUrl={googleApiService.userAvatarUrl}
            onClick={handleAvatarClick}
            size="small"
          />
          {isUserMenuOpen && googleApiService.isGoogleLoggedIn && (
            <div className={styles.userMenuDropdown}>
              <div className={styles.userMenuProfile}>
                <UserAvatar
                  isLoggedIn={googleApiService.isGoogleLoggedIn}
                  userName={googleApiService.userName}
                  avatarUrl={googleApiService.userAvatarUrl}
                  size="large"
                />
                <div className={styles.userMenuProfileInfo}>
                  <div className={styles.userMenuProfileName}>
                    {googleApiService.userName || googleApiService.userEmail || 'Аккаунт Google'}
                  </div>
                  {googleApiService.userEmail && <div className={styles.userMenuProfileEmail}>{googleApiService.userEmail}</div>}
                </div>
              </div>
              <List>
                <ListItem onClick={handleLogoutClick}>Выйти</ListItem>
              </List>
            </div>
          )}
        </span>
      </span>
    </header>
  )
})

export default Header
