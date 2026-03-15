import React from 'react'

import Button from 'src/7-shared/ui/Button/Button'

import styles from './EmptyState.module.css'

interface EmptyStateProps {
	onCreateNew: () => void
	onOpenFromDrive: () => void
}

const EmptyState: React.FC<EmptyStateProps> = ({ onCreateNew, onOpenFromDrive }) => {
	return (
		<div className={styles.emptyState}>
			<div className={styles.emptyStateContent}>
				<h2 className={styles.emptyStateTitle}>Нет открытых документов</h2>
				<p className={styles.emptyStateDescription}>
					Создайте новый документ или откройте существующий из Google Drive
				</p>
				<div className={styles.emptyStateActions}>
					<Button onClick={onCreateNew} className={styles.buttonPrimary} title="Новый документ">
						Создать новый документ
					</Button>
					<Button onClick={onOpenFromDrive} title="Открыть из Google Drive">
						Открыть из Google Drive
					</Button>
				</div>
			</div>
		</div>
	)
}

export default EmptyState
