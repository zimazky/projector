import React from 'react'
import RippleButton from './RippleButton'
import styles from './TextButton.module.css'

const TextButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
	function TextButton({ className, children = 'Button', ...props }, ref) {
		return (
			<RippleButton {...props} ref={ref} rippleStyles={styles} className={`${styles.button} ${className ?? ''}`}>
				{children}
			</RippleButton>
		)
	}
)

export default TextButton
