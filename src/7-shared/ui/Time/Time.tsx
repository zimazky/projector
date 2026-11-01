import React from 'react'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import RippleButton from '../Button/RippleButton'
import styles from './Time.module.css'

type TimeProps = { onClick?: React.MouseEventHandler<HTMLButtonElement> }

const Time: React.FC<TimeProps> = ({ onClick }) => {
	const [time, setTime] = React.useState(() => DateTime.getHHMM(Date.now() / 1000))
	React.useEffect(() => {
		let timer: ReturnType<typeof setTimeout>
		const schedule = () => {
			timer = setTimeout(
				() => {
					setTime(DateTime.getHHMM(Date.now() / 1000))
					schedule()
				},
				60000 - (Date.now() % 60000)
			)
		}
		schedule()
		return () => clearTimeout(timer)
	}, [])
	return (
		<RippleButton rippleStyles={styles} className={styles.time} onClick={onClick} title="Перейти к текущей неделе">
			{time}
		</RippleButton>
	)
}

export default Time
