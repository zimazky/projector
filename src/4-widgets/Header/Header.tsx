import React, { useState } from 'react'
import { observer } from 'mobx-react-lite'

import Time from 'src/7-shared/ui/Time/Time'
import UserAvatar from 'src/7-shared/ui/UserAvatar/UserAvatar'
import List from 'src/7-shared/ui/List/List'
import ListItem from 'src/7-shared/ui/List/ListItem'

import { useStores } from 'src/1-app/Providers/StoreContext'

import CalendarIconBar from 'src/4-widgets/CalendarIconBar/CalendarIconBar'
import { EventSearchInput } from 'src/5-features/EventSearch/EventSearchInput'

import styles from './Header.module.css'
import { getDocumentUiState } from 'src/6-entities/Document/model/DocumentSyncSelectors'

const Header: React.FC<{ onCloseDocument: (id: string) => Promise<void> }> = observer(function ({ onCloseDocument }) {
	const { calendarStore, dayListStore, uiStore, documentTabsStore, googleApiService } = useStores()
	const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
	const activeDoc = documentTabsStore.activeDocument
	const documentUi = activeDoc ? getDocumentUiState(activeDoc) : null
	const documentTitle = activeDoc
		? `${activeDoc.ref?.name || 'Без названия'}${documentUi!.titleSuffix}`
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
			<CalendarIconBar onCloseDocument={onCloseDocument} />
			<EventSearchInput />
			<span
				className={styles.documentName}
				title={documentUi?.tooltip}
				data-testid="document-title"
				data-sync-status={documentUi?.status}
			>
				{documentTitle}
			</span>
			<span className={styles.caption}>
				{uiStore.viewMode === 'Day' ? dayListStore.caption : calendarStore.caption}
			</span>
			<span className={styles.rightSection}>
				<Time
					onClick={() => {
						if (uiStore.viewMode === 'Day') dayListStore.setDate(Date.now() / 1000)
						else calendarStore.setWeek(Date.now() / 1000)
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
									{googleApiService.userEmail && (
										<div className={styles.userMenuProfileEmail}>{googleApiService.userEmail}</div>
									)}
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
