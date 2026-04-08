import React, { useContext } from 'react'
import { observer } from 'mobx-react-lite'
import { StoreContext } from 'src/1-app/Providers/StoreContext'
import styles from './CalendarLegend.module.css'

/**
 * Компонент легенды документов для общего календаря.
 * Отображает цветовую маркировку документов при активном виртуальном документе.
 */
const CalendarLegend: React.FC = observer(function () {
	const { documentTabsStore } = useContext(StoreContext)

	const isVirtualActive = documentTabsStore.activeDocument?.type === 'virtual-aggregated'
	if (!isVirtualActive) return null

	const realDocuments = documentTabsStore.realDocuments

	return (
		<div className={styles.legend} data-testid="calendar-legend">
			<span className={styles.legendTitle}>Документы:</span>
			{realDocuments.map(doc => (
				<div key={doc.id} className={styles.legendItem}>
					<span
						className={styles.legendColor}
						style={{ backgroundColor: doc.color ?? '#888888' }}
						title={doc.ref?.name || 'Без названия'}
					/>
					<span>{doc.ref?.name || 'Без названия'}</span>
				</div>
			))}
		</div>
	)
})

export default CalendarLegend
