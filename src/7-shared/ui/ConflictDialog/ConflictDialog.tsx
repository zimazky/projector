import React from 'react'
import Dialog from 'src/7-shared/ui/Dialog/Dialog'
import Button from 'src/7-shared/ui/Button/Button'
import type { ConflictDialogProps } from './types'

import styles from './ConflictDialog.module.css'

const ConflictDialog: React.FC<ConflictDialogProps> = ({
	open,
	localModifiedAt,
	remoteModifiedAt,
	hasLocalChanges,
	hasRemoteChanges,
	remoteMetadata,
	onChooseLocal,
	onChooseRemote,
	onCancel
}) => {
	const formatDate = (ts: number) =>
		new Date(ts).toLocaleString('ru-RU', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		})

	const getTitle = () => {
		if (hasLocalChanges && hasRemoteChanges) {
			return '⚠️ Обнаружены изменения с обеих сторон'
		}
		if (hasRemoteChanges) {
			return '⚠️ Версия на Google Drive новее'
		}
		if (hasLocalChanges) {
			return '💾 Есть несохранённые изменения'
		}
		return '✓ Синхронизация не требуется'
	}

	const getMessage = () => {
		if (hasLocalChanges && hasRemoteChanges) {
			return (
				<>
					<p>Обнаружены изменения и локально, и на Google Drive.</p>
					<p className={styles.warning}>
						<strong>Важно:</strong> Выбор версии приведёт к потере изменений в другой версии.
					</p>
				</>
			)
		}
		if (hasRemoteChanges) {
			return (
				<>
					<p>Версия на Google Drive была изменена после последней синхронизации.</p>
					<p className={styles.warning}>
						<strong>Внимание:</strong> Загрузка версии с Drive перезапишет локальные изменения.
					</p>
				</>
			)
		}
		if (hasLocalChanges) {
			return (
				<>
					<p>У вас есть изменения, которые не сохранены в Google Drive.</p>
					<p>Выберите действие:</p>
				</>
			)
		}
		return <p>Данные синхронизированы.</p>
	}

	return (
		<Dialog open={open} onClose={onCancel} title={getTitle()}>
			<div className={styles.content}>
				{getMessage()}

				<table className={styles.versionComparison}>
					<thead>
						<tr>
							<th>Версия</th>
							<th>Дата изменения</th>
							<th>Статус</th>
						</tr>
					</thead>
					<tbody>
						<tr className={hasLocalChanges ? styles.highlight : ''}>
							<td>📁 Локальная</td>
							<td>{formatDate(localModifiedAt)}</td>
							<td>
								{hasLocalChanges && <span className={`${styles.badge} ${styles.badgeWarning}`}>Изменена</span>}
								{!hasLocalChanges && <span className={styles.ok}>Актуальна</span>}
							</td>
						</tr>
						<tr className={hasRemoteChanges ? styles.highlight : ''}>
							<td>☁️ Google Drive</td>
							<td>{remoteMetadata.modifiedTime ? formatDate(new Date(remoteMetadata.modifiedTime).getTime()) : '—'}</td>
							<td>
								{hasRemoteChanges && <span className={`${styles.badge} ${styles.badgeWarning}`}>Изменена</span>}
								{!hasRemoteChanges && <span className={styles.ok}>Актуальна</span>}
							</td>
						</tr>
					</tbody>
				</table>

				<div className={styles.actions}>
					{hasLocalChanges && (
						<Button onClick={onChooseLocal} className={styles.primaryButton}>
							💾 Сохранить локальную версию в Drive
						</Button>
					)}

					{hasRemoteChanges && (
						<Button onClick={onChooseRemote} className={styles.secondaryButton}>
							☁️ Загрузить версию с Drive
						</Button>
					)}

					<Button onClick={onCancel}>Отменить</Button>
				</div>
			</div>
		</Dialog>
	)
}

export default ConflictDialog
