import React from 'react'
import { useRipple } from 'src/7-shared/hooks/useRipple'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	rippleStyles: { ripple: string; clicked: string }
}

/** Общий нативный контракт кнопок: disabled, клавиатура, атрибуты и ref. */
const RippleButton = React.forwardRef<HTMLButtonElement, Props>(function RippleButton(
	{ rippleStyles, type = 'button', onPointerDown, onPointerUp, onPointerLeave, onPointerCancel, ...props },
	ref
) {
	const ripple = useRipple(rippleStyles)
	return (
		<button
			{...props}
			ref={ref}
			type={type}
			onPointerDown={event => {
				onPointerDown?.(event)
				ripple.onPointerDown(event)
			}}
			onPointerUp={event => {
				onPointerUp?.(event)
				ripple.onPointerUp()
			}}
			onPointerLeave={event => {
				onPointerLeave?.(event)
				ripple.onPointerLeave()
			}}
			onPointerCancel={event => {
				onPointerCancel?.(event)
				ripple.onPointerCancel()
			}}
		/>
	)
})

export default RippleButton
