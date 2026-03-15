import React from 'react'

import IconButton from 'src/7-shared/ui/IconButton/IconButton'

import styles from './IconBar.module.css'

export type IconItem = {
	name: string
	fn: () => void
	jsx: React.JSX.Element
	disabled?: boolean
}

type IconBarProps = {
	icons: IconItem[]
}

const IconBar: React.FC<IconBarProps> = function ({ icons = [] }) {
	return (
		<div className={styles.iconbar}>
			{icons.map((e, i) => (
				<IconButton
					title={e.name}
					key={i}
					onClick={e.fn}
					disabled={e.disabled}
					style={e.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
				>
					{e.jsx}
				</IconButton>
			))}
		</div>
	)
}

export default IconBar
