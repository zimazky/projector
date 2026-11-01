import React from 'react'
import RippleButton from '../Button/RippleButton'
import styles from './DayButton.module.css'

type DayButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { today?: boolean; selected?: boolean }

const DayButton: React.FC<DayButtonProps> = ({ today, selected, className, ...props }) => (
	<RippleButton
		{...props}
		rippleStyles={styles}
		aria-pressed={selected}
		data-dialog-initial-focus={selected || undefined}
		className={`${styles.day}${today ? ' ' + styles.today : ''}${selected ? ' ' + styles.selected : ''} ${className ?? ''}`}
	/>
)

export default DayButton
