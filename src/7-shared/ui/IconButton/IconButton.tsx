import React from 'react'
import RippleButton from '../Button/RippleButton'
import styles from './IconButton.module.css'

const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
	function IconButton({ className, children = 'Button', ...props }, ref) {
		return (
			<RippleButton {...props} ref={ref} rippleStyles={styles} className={`${styles.button} ${className ?? ''}`}>
				{children}
			</RippleButton>
		)
	}
)

export default IconButton
