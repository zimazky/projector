import React from 'react'
import RippleButton from '../Button/RippleButton'
import styles from './Tabs.module.css'

interface TabsProps {
	value?: number
	labels: Array<string | null>
	onChange?: (event: React.SyntheticEvent, newValue: number) => void
}

const Tabs: React.FC<TabsProps> = ({ value = 0, labels, onChange = () => {} }) => {
	const selectedTabRef = React.useRef<HTMLButtonElement | null>(null)
	const [position, setPosition] = React.useState({ left: 0, width: 0 })
	React.useLayoutEffect(() => {
		setPosition({ left: selectedTabRef.current?.offsetLeft ?? 0, width: selectedTabRef.current?.clientWidth ?? 0 })
	}, [value])
	const indexes = labels.flatMap((label, index) => (label === null ? [] : [index]))
	return (
		<div className={styles.wrapper}>
			<div className={styles.container} role="tablist" aria-label="Разделы">
				{labels.map((label, index) =>
					label === null ? null : (
						<RippleButton
							key={index}
							rippleStyles={styles}
							className={styles.tab + (value === index ? ' ' + styles.selected : '')}
							role="tab"
							aria-selected={value === index}
							tabIndex={value === index ? 0 : -1}
							ref={value === index ? selectedTabRef : undefined}
							onClick={event => onChange(event, index)}
							onKeyDown={event => {
								const current = indexes.indexOf(index)
								const next =
									event.key === 'ArrowRight'
										? indexes[(current + 1) % indexes.length]
										: event.key === 'ArrowLeft'
											? indexes[(current + indexes.length - 1) % indexes.length]
											: event.key === 'Home'
												? indexes[0]
												: event.key === 'End'
													? indexes[indexes.length - 1]
													: undefined
								if (next === undefined) return
								event.preventDefault()
								const buttons = event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]')
								buttons[indexes.indexOf(next)].focus()
								onChange(event, next)
							}}
						>
							{label}
						</RippleButton>
					)
				)}
			</div>
			<span className={styles.indicator} style={{ left: position.left + 'px', width: position.width + 'px' }} />
		</div>
	)
}

export default Tabs
