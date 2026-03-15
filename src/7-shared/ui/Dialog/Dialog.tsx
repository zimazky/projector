import React from 'react'
import styles from './Dialog.module.css'

type DialogProps = {
	/** Признак открытого окна */
	open: boolean
	/** Функция, вызываемая при закрытии сайдбара */
	onClose?: () => void
	/** Заголовок диалога */
	title?: React.ReactNode
	children?: React.ReactNode
}

type state = 'hidden' | 'open' | 'closing'

const Dialog: React.FC<DialogProps> = ({ open = false, onClose = () => {}, title, children = null }) => {
	const [state, setState] = React.useState<state>(open ? 'open' : 'hidden')
	React.useEffect(() => {
		if (open) setState('open')
		else if (state === 'open') {
			setState('closing')
			setTimeout(() => {
				setState('hidden')
			}, 300)
		}
	}, [open])

	return state === 'hidden' ? null : (
		<div className={styles.overlay + ' ' + styles[state]} onClick={onClose}>
			<div className={styles.window} onClick={e => e.stopPropagation()}>
				{title && <div className={styles.title}>{title}</div>}
				<div className={styles.content}>{children}</div>
			</div>
		</div>
	)
}

export default Dialog
