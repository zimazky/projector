import React from 'react'
import RippleButton from './RippleButton'
import styles from './Button.module.css'

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(function Button(
	{ className, children = 'Button', ...props },
	ref
) {
	return (
		<RippleButton {...props} ref={ref} rippleStyles={styles} className={`${styles.button} ${className ?? ''}`}>
			{children}
		</RippleButton>
	)
})

export default Button
