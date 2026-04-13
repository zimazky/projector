import React from 'react'
import { observer } from 'mobx-react-lite'
import { DocumentSession, DocumentId } from 'src/6-entities/Document/model'

import styles from './DocumentTabs.module.css'

interface DocumentTabsProps {
	documents: DocumentSession[]
	activeDocumentId: DocumentId | null
	onActivate: (id: DocumentId) => void
	onClose: (id: DocumentId) => void
	onNew: () => void
}

const DocumentTabs: React.FC<DocumentTabsProps> = observer(function ({
	documents,
	activeDocumentId,
	onActivate,
	onClose,
	onNew
}) {
	const getSyncStatusTitle = (status: string): string => {
		switch (status) {
			case 'offline':
				return 'Документ работает в офлайн-режиме'
			case 'syncing':
				return 'Синхронизация...'
			case 'synced':
				return 'Синхронизировано с Google Drive'
			case 'needs-sync':
				return 'Есть несохранённые изменения в Google Drive'
			case 'update-available':
				return 'Доступна новая версия с Google Drive'
			case 'error':
				return 'Ошибка синхронизации'
			default:
				return ''
		}
	}

	const getSyncStatusIcon = (status: string): string => {
		switch (status) {
			case 'offline':
				return '📴'
			case 'syncing':
				return '🔄'
			case 'synced':
				return '✓'
			case 'needs-sync':
				return '⚠'
			case 'update-available':
				return '☁️'
			case 'error':
				return '❌'
			default:
				return ''
		}
	}

	return (
		<div className={styles.documentTabs}>
			{documents.map(doc => (
				<div
					key={doc.id}
					data-testid="document-tab"
					className={`${styles.documentTab} ${doc.id === activeDocumentId ? styles.active : ''}`}
					onClick={() => onActivate(doc.id)}
				>
					<span className={styles.documentTabName}>{doc.ref?.name || 'Без названия'}</span>

					{/* Индикатор несохранённых изменений */}
					{(doc.state.isDirty || doc.state.hasUnsyncedChanges) && (
						<span
							className={styles.modifiedIndicator}
							title={
								doc.state.isDirty ? 'Есть несохранённые изменения' : 'Есть несохранённые изменения с предыдущей сессии'
							}
						>
							*
						</span>
					)}

					{/* Индикатор статуса синхронизации (только для документов с fileId) */}
					{doc.ref?.fileId && (
						<span
							className={`${styles.syncStatus} ${styles[`syncStatus--${doc.state.syncStatus}`]}`}
							title={getSyncStatusTitle(doc.state.syncStatus)}
						>
							{getSyncStatusIcon(doc.state.syncStatus)}
						</span>
					)}

					<button
						className={styles.documentTabClose}
						onClick={e => {
							e.stopPropagation()
							onClose(doc.id)
						}}
						title="Закрыть вкладку"
					>
						×
					</button>
				</div>
			))}
			<button
				className={styles.documentTabNew}
				onClick={onNew}
				title="Новый документ"
				data-testid="new-document-button"
			>
				+
			</button>
		</div>
	)
})

export default DocumentTabs
