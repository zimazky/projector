import React from 'react'
import { observer } from 'mobx-react-lite'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import { kilo, plus } from 'src/7-shared/helpers/utils'
import { useStores } from 'src/1-app/Providers/StoreContext'
import Button from 'src/7-shared/ui/Button/Button'
import ResourceDaySummary from 'src/5-features/ResourceSummary/ResourceDaySummary'
import DayListEventItem from './DayListEventItem'
import styles from './DayList.module.css'

const DayList = observer(function DayList() {
	const { dayListStore, uiStore, eventFormStore } = useStores()
	const timestamp = dayListStore.date
	const data = dayListStore.getDayListStructure()
	const date = DateTime.getYYYYMMDD(timestamp)
	const today = DateTime.isToday(timestamp)
	const [name, setName] = React.useState('')
	const planned = data.events.filter(event => !event.completed),
		completed = data.events.filter(event => event.completed)
	const label = new Intl.DateTimeFormat('ru-RU', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(DateTime.YYYYMMDDToTimestampUTC(date) * 1000))
	const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: 'UTC' }).format(
		new Date(DateTime.YYYYMMDDToTimestampUTC(date) * 1000)
	)
	const count = data.events.length
	const eventWord =
		count % 100 >= 11 && count % 100 <= 14
			? 'событий'
			: count % 10 === 1
				? 'событие'
				: count % 10 >= 2 && count % 10 <= 4
					? 'события'
					: 'событий'
	const add = () => {
		eventFormStore.setEventDto({ id: null, name: name.trim(), timestamp, start: date })
		eventFormStore.showForm()
		setName('')
	}
	return (
		<div className={styles.day} data-testid="day-list" data-date={date}>
			<div className={styles.content}>
				<header className={styles.header}>
					<div>
						<span className={styles.eyebrow}>ПЛАН НА ДЕНЬ {today ? ' / СЕГОДНЯ' : ''}</span>
						<h1>{label.replace(' г.', '')}</h1>
						<p>
							{weekday[0].toUpperCase() + weekday.slice(1)} <span>·</span> {count} {eventWord} <span>·</span>{' '}
							{completed.length} выполнено
						</p>
					</div>
					<div className={styles.navigation}>
						<button
							onClick={() => {
								uiStore.changeViewMode({ mode: 'Calendar' })
								dayListStore.calendarStore.setWeek(timestamp)
							}}
							aria-label="Вернуться в календарь"
						>
							Календарь ↗
						</button>
						<div>
							<button aria-label="Предыдущий день" onClick={() => dayListStore.setDate(timestamp - 86400)}>
								←
							</button>
							<button onClick={() => dayListStore.setDate(Date.now() / 1000)}>Сегодня</button>
							<button aria-label="Следующий день" onClick={() => dayListStore.setDate(timestamp + 86400)}>
								→
							</button>
						</div>
					</div>
				</header>
				{data.resourceBalance ? (
					<ResourceDaySummary report={data.resourceBalance} />
				) : (
					<section className={styles.legacySummary} aria-label="Баланс дня">
						<div>
							<span>Прогноз и изменение за день</span>
							<strong
								className={styles.balance}
								title={`planned: ${data.plannedBalance.toFixed(2)}${plus(data.plannedBalanceChange, 2)}\nactual: ${data.actualBalance.toFixed(2)}`}
							>
								{kilo(data.plannedBalance, 1) +
									(data.plannedBalanceChange === 0 ? 'k' : plus(data.plannedBalanceChange / 1000, 1) + 'k') +
									' ' +
									kilo(data.actualBalance, 1)}
							</strong>
						</div>
						<p>Суммы в единицах исходного документа</p>
					</section>
				)}
				<div className={styles.sectionHeader}>
					<h2>
						Запланировано <span>{planned.length}</span>
					</h2>
					<Button onClick={add}>Добавить событие</Button>
				</div>
				<form
					className={styles.quickAdd}
					onSubmit={event => {
						event.preventDefault()
						add()
					}}
				>
					<span aria-hidden="true">＋</span>
					<input
						aria-label="Новое событие дня"
						placeholder="Что запланируем на этот день?"
						value={name}
						onChange={event => setName(event.target.value)}
					/>
					<button type="submit" aria-label="Открыть карточку нового события">
						↵
					</button>
				</form>
				<section className={styles.events} aria-label="Запланированные события">
					{planned.length ? (
						planned.map(event => (
							<DayListEventItem
								key={event.occurrenceKey ?? event.eventUid ?? event.id}
								event={event}
								timestamp={timestamp}
							/>
						))
					) : (
						<div className={styles.empty}>
							<span aria-hidden="true">☀</span>
							<h3>День свободен</h3>
							<p>Добавьте задачу, поступление или покупку — всё будет здесь.</p>
						</div>
					)}
				</section>
				{completed.length > 0 && (
					<>
						<div className={styles.sectionHeader}>
							<h2>
								Выполнено <span>{completed.length}</span>
							</h2>
							<span className={styles.doneLabel}>Всё учтено</span>
						</div>
						<section className={styles.events} aria-label="Выполненные события">
							{completed.map(event => (
								<DayListEventItem key={event.eventUid ?? event.id} event={event} timestamp={timestamp} />
							))}
						</section>
					</>
				)}
				<footer className={styles.footer}>События и остатки относятся к выбранному документу</footer>
			</div>
		</div>
	)
})
export default DayList
