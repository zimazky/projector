import React from 'react'
import NativeDialog from '../Dialog/NativeDialog'
import TextButton from '../Button/TextButton'
import styles from './Drawer.module.css'

type DrawerProps = { open?: boolean; onClose?: () => void; children?: React.ReactNode }

const Drawer: React.FC<DrawerProps> = ({ open = false, onClose, children }) => (
	<NativeDialog open={open} onClose={onClose} aria-label="Меню" className={styles.overlay + ' ' + styles.open}>
		<div className={styles.window}>
			{children}
			<TextButton onClick={onClose}>Закрыть меню</TextButton>
		</div>
	</NativeDialog>
)

export default Drawer
