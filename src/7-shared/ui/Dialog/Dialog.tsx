import React from 'react'
import NativeDialog, { type NativeDialogProps } from './NativeDialog'
import styles from './Dialog.module.css'

type DialogProps = Omit<NativeDialogProps, 'className'> & { title?: React.ReactNode }

const Dialog: React.FC<DialogProps> = ({ title, children, ...props }) => {
	const titleId = React.useId()
	return (
		<NativeDialog
			{...props}
			aria-labelledby={title ? titleId : props['aria-labelledby']}
			aria-label={title || props['aria-labelledby'] ? undefined : (props['aria-label'] ?? 'Диалог')}
			className={styles.overlay}
		>
			<div className={styles.window}>
				{title && (
					<div className={styles.title} id={titleId}>
						{title}
					</div>
				)}
				<div className={styles.content}>{children}</div>
			</div>
		</NativeDialog>
	)
}

export default Dialog
