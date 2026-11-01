import React from 'react'
import NativeDialog, { type NativeDialogProps } from '../Dialog/NativeDialog'
import styles from './Modal.module.css'

type ModalProps = Omit<NativeDialogProps, 'className'>

const Modal: React.FC<ModalProps> = ({ children, ...props }) => (
	<NativeDialog
		{...props}
		aria-label={props['aria-label'] ?? (props['aria-labelledby'] ? undefined : 'Диалог')}
		className={styles.overlay}
	>
		<div className={styles.window}>{children}</div>
	</NativeDialog>
)

export default Modal
