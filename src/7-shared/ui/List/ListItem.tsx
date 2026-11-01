import React from 'react'
import RippleButton from '../Button/RippleButton'
import styles from './ListItem.module.css'

type ListItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }

const ListItem: React.FC<ListItemProps> = ({ selected, className, children = 'ListItem', ...props }) => (
	<li>
		<RippleButton
			{...props}
			rippleStyles={styles}
			className={`${styles.item} ${selected ? styles.selected : ''} ${className ?? ''}`}
			aria-pressed={selected}
		>
			{children}
		</RippleButton>
	</li>
)

export default ListItem
