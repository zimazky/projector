import React from 'react'
import { observer } from 'mobx-react-lite'
import { DocumentSession, DocumentId } from 'src/6-entities/Document/model'

import { getDocumentUiState } from 'src/6-entities/Document/model/DocumentSyncSelectors'

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
	return (
		<div className={styles.documentTabs}>
			{documents.map(doc => {
				const ui = getDocumentUiState(doc)
				return (
					<div
						key={doc.id}
						data-testid="document-tab"
						data-sync-status={ui.status}
						className={`${styles.documentTab} ${doc.id === activeDocumentId ? styles.active : ''}`}
						onClick={() => onActivate(doc.id)}
					>
						<span className={styles.documentTabName}>{doc.ref?.name || 'Без названия'}</span>

						{/* Индикатор несохранённых изменений */}
						{ui.showModifiedMark && (
							<span className={styles.modifiedIndicator} title="Есть несохранённые изменения">
								*
							</span>
						)}

						{/* Индикатор статуса синхронизации (только для документов с fileId) */}
						{doc.ref?.fileId && (
							<span className={`${styles.syncStatus} ${styles[`syncStatus--${ui.status}`]}`} title={ui.tooltip}>
								{ui.statusIcon}
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
				)
			})}
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
