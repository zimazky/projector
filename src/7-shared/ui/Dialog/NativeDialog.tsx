import React from 'react'
import { createPortal } from 'react-dom'
import styles from './NativeDialog.module.css'

export type NativeDialogProps = {
	open: boolean
	onClose?: () => void
	dismissible?: boolean
	className?: string
	'aria-label'?: string
	'aria-labelledby'?: string
	'aria-describedby'?: string
	children?: React.ReactNode
}

/** showModal обеспечивает top layer, inert-фон и фокус для вложенных окон. */
const NativeDialog: React.FC<NativeDialogProps> = ({
	open,
	onClose,
	dismissible = true,
	className,
	children,
	...label
}) => {
	const ref = React.useRef<HTMLDialogElement>(null)
	React.useLayoutEffect(() => {
		if (!open) return
		const dialog = ref.current!
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
		dialog.showModal()
		dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]:not(:disabled)')?.focus()
		return () => {
			if (dialog.open) dialog.close()
			// React может уже убрать portal из DOM до close(); возвращаем фокус явно.
			if (opener?.isConnected) opener.focus()
		}
	}, [open])
	if (!open) return null
	return createPortal(
		<dialog
			ref={ref}
			className={`${styles.surface} ${className ?? ''}`}
			{...label}
			aria-modal="true"
			onKeyDown={event => {
				const dialog = event.currentTarget
				// Вложенный portal всплывает по React-дереву, но принадлежит другому окну.
				if (event.key !== 'Tab' || !dialog.contains(event.target as Node)) return
				const controls = Array.from(
					dialog.querySelectorAll<HTMLElement>(
						'button, input, select, textarea, a[href], [tabindex], [contenteditable="true"]'
					)
				).filter(
					element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0
				)
				const first = controls[0]
				const last = controls[controls.length - 1]
				if (!first) {
					event.preventDefault()
					dialog.focus()
				} else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
					event.preventDefault()
					last.focus()
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault()
					first.focus()
				}
			}}
			onCancel={event => {
				event.preventDefault()
				event.stopPropagation()
				if (dismissible) onClose?.()
			}}
			onClick={event => {
				if (event.target === event.currentTarget && dismissible) onClose?.()
			}}
		>
			{children}
		</dialog>,
		document.body
	)
}

export default NativeDialog
