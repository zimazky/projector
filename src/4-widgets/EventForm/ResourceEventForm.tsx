import React from 'react'
import { observer } from 'mobx-react-lite'
import { useStores } from 'src/1-app/Providers/StoreContext'
import TextField from 'src/7-shared/ui/TextField/TextField'
import Button from 'src/7-shared/ui/Button/Button'
import { CatalogSelect } from 'src/5-features/ResourceCatalog/CatalogForm'
import { DEFAULT_PROJECT_ID } from 'src/6-entities/Projects/ProjectId'
import { describeMovements } from 'src/6-entities/Resources/ResourcePresentation'
import {
	documentToday,
	type ResourceEventDetails,
	type OperationCommandOptions
} from 'src/6-entities/Operations/ResourceOperationCommands'
import type { OperationKind } from 'src/6-entities/Operations/OperationContracts'
import {
	actualFromDraft,
	buildOperation,
	movementDrafts,
	newMovement,
	type MovementDraft
} from './ResourceOperationDraft'
import styles from './ResourceEventForm.module.css'

const kinds = {
	none: 'Без движения ресурсов',
	income: 'Приход',
	expense: 'Расход',
	transfer: 'Перевод',
	exchange: 'Покупка / обмен',
	opening: 'Начальный остаток',
	adjustment: 'Корректировка'
}

const ResourceEventForm = observer(function ResourceEventForm() {
	const { eventFormStore: store, documentTabsStore: tabs } = useStores()
	const event = store.eventData
	const source = event.actualOperation ?? event.plannedOperation
	const catalogs = store.sourceStores?.resourceStores
	const document = tabs.documents.find(row => row.id === store.sourceDocumentId)
	const data = document?.data
	const baseResourceId = data && 'schemaVersion' in data ? data.baseResourceId : ''
	const [kind, setKind] = React.useState<OperationKind | 'none'>(source?.kind ?? 'none')
	const [rows, setRows] = React.useState(() => movementDrafts(source, baseResourceId))
	const [completing, setCompleting] = React.useState(false)
	const [error, setError] = React.useState('')
	const [deleting, setDeleting] = React.useState(false)
	const [warnings, setWarnings] = React.useState<string[]>([])
	const form = React.useRef<HTMLFormElement>(null)
	const actual = !!event.completed || completing
	if (!catalogs || !document || !data || !('schemaVersion' in data))
		return (
			<div className={styles.form}>
				<p role="alert">Исходный документ закрыт. Откройте карточку заново.</p>
				<Button onClick={store.hideForm}>Закрыть</Button>
			</div>
		)
	const setRow = (id: string, patch: Partial<MovementDraft>) =>
		setRows(rows => rows.map(row => (row.id === id ? { ...row, ...patch } : row)))
	const options = (items: readonly { id: string; name: string }[]) =>
		items.map(item => (
			<option value={item.id} key={item.id}>
				{item.name}
			</option>
		))
	const catalogPrice = (resourceId: string) => {
		const price = catalogs.resourcesStore.getById(resourceId)?.price
		return price
			? `Справочник: ${price.amountPerUnit} ${catalogs.resourcesStore.getById(price.quoteResourceId)?.name} за единицу · ${price.asOf}`
			: 'Цена в справочнике не задана.'
	}
	const attempt = (work: () => void) => {
		try {
			store.assertSource()
			work()
			setError('')
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Не удалось сохранить событие.')
		}
	}
	const finish = (result?: { priceWarnings: { reason: string }[] }) => {
		if (result?.priceWarnings.length) {
			setWarnings(
				result.priceWarnings.map(row =>
					row.reason === 'future-price'
						? 'Цена будущей операции не записана в справочник.'
						: 'Цена справочника сохранена без изменений.'
				)
			)
			return
		}
		store.hideForm()
	}
	const save = (action: 'save' | 'all' | 'complete') => {
		if (!form.current?.reportValidity()) return
		const fields = new FormData(form.current),
			text = (key: string) => String(fields.get(key) ?? '').trim()
		attempt(() => {
			const wholeSeries = event.repeat && action === 'all'
			const details: ResourceEventDetails = {
				name: text('name'),
				comment: text('comment'),
				projectId: text('project'),
				start: text(wholeSeries ? 'seriesStart' : 'start').replaceAll('-', '.'),
				time: text('time'),
				duration: text('duration'),
				end: text(wholeSeries ? 'seriesEnd' : 'end').replaceAll('-', '.'),
				...(!actual && (event.id === null || action === 'all' || !event.repeat) ? { repeat: text('repeat') } : {})
			}
			const plan = kind === 'none' ? undefined : buildOperation(kind, rows, catalogs, source)
			const operation =
				actual && plan
					? actualFromDraft(
							plan,
							rows,
							text('effectiveDate').replaceAll('-', '.'),
							event.actualOperation,
							!!event.repeat
						)
					: undefined
			const commands = tabs.resourceCommands,
				id = document.id
			const commandOptions: OperationCommandOptions = {
				commandId: store.formKey,
				applyPriceNow: fields.has('applyPriceNow')
			}
			if (event.id === null) finish(commands.createPlanned(id, { ...details, plannedOperation: plan }, commandOptions))
			else if (action === 'complete')
				finish(commands.complete(id, store.reference(), operation, details, commandOptions))
			else
				finish(
					commands.edit(
						id,
						store.reference(action === 'all'),
						{
							...details,
							...(event.completed ? (operation ? { actualOperation: operation } : {}) : { plannedOperation: plan })
						},
						commandOptions
					)
				)
		})
	}
	const changeKind = (value: typeof kind) => {
		setKind(value)
		if (!source)
			setRows(current => {
				const first = { ...current[0], direction: value === 'income' ? ('in' as const) : ('out' as const) }
				return value === 'transfer' || value === 'exchange'
					? [
							first,
							{
								...newMovement(
									value === 'exchange'
										? (catalogs.resourcesStore.list.find(row => !row.archived && row.id !== first.resourceId)?.id ?? '')
										: first.resourceId,
									baseResourceId,
									'in'
								)
							}
						]
					: [first]
			})
	}
	const original = event.actualOperation?.originalPlan ?? (completing ? event.plannedOperation : undefined)
	return (
		<div className={styles.form}>
			<header className={styles.header}>
				<span className={styles.eyebrow}>
					{event.id === null
						? 'НОВОЕ СОБЫТИЕ'
						: event.completed
							? 'ВЫПОЛНЕНО'
							: completing
								? 'ПОДТВЕРЖДЕНИЕ ОПЕРАЦИИ'
								: 'ПЛАН'}
				</span>
				<h2>{completing ? 'План → факт' : event.id === null ? 'Добавить событие' : 'Карточка события'}</h2>
				<p>
					{document.ref?.name || 'Без названия'}
					{event.occurrenceDate ? ` · вхождение ${event.occurrenceDate}` : ''}
				</p>
			</header>
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
			{warnings.length ? (
				<>
					<p role="status">{warnings.join(' ')}</p>
					<Button onClick={store.hideForm}>Закрыть карточку</Button>
				</>
			) : (
				<>
					<form
						ref={form}
						onSubmit={event => {
							event.preventDefault()
							save(completing ? 'complete' : 'save')
						}}
					>
						<TextField label="Название" name="name" required value={event.name} />
						<div className={styles.grid}>
							<TextField
								label="Дата события"
								name="start"
								type="date"
								required
								value={(event.repeat ? (event.occurrenceDate ?? event.start) : event.start).replaceAll('.', '-')}
							/>
							<TextField label="Время" name="time" type="time" value={event.time ?? ''} />
							<CatalogSelect label="Проект" name="project" defaultValue={event.projectId ?? DEFAULT_PROJECT_ID}>
								{options(store.sourceStores!.projectsStore.list)}
							</CatalogSelect>
							<CatalogSelect
								label="Операция"
								value={kind}
								onChange={event => changeKind(event.target.value as typeof kind)}
								disabled={!!event.completed}
							>
								{Object.entries(kinds).map(([value, name]) => (
									<option value={value} key={value} disabled={value === 'none' && !!source}>
										{name}
									</option>
								))}
							</CatalogSelect>
						</div>
						{actual && kind !== 'none' && (
							<TextField
								label="Дата финансового учёта"
								name="effectiveDate"
								type="date"
								required
								value={(event.actualOperation?.effectiveDate ?? documentToday(data.timezone)).replaceAll('.', '-')}
							/>
						)}
						{original && (
							<section className={styles.plan}>
								<h3>Исходный план</h3>
								<ul>
									{describeMovements(original, catalogs).map((text, index) => (
										<li key={index}>{text}</li>
									))}
								</ul>
							</section>
						)}
						{kind !== 'none' && (
							<section className={styles.movements} aria-label={actual ? 'Фактические движения' : 'Плановые движения'}>
								<h3>{actual ? 'Фактические движения' : 'Стороны операции'}</h3>
								{rows.map((row, index) => (
									<fieldset key={row.id} className={styles.movement}>
										<legend>Сторона {index + 1}</legend>
										<div className={styles.grid}>
											<CatalogSelect
												label="Направление"
												value={row.direction}
												onChange={e => setRow(row.id, { direction: e.target.value as MovementDraft['direction'] })}
											>
												<option value="out">Расход</option>
												<option value="in">Приход</option>
											</CatalogSelect>
											<CatalogSelect
												label="Ресурс"
												value={row.resourceId}
												onChange={e => setRow(row.id, { resourceId: e.target.value, targetId: '', accountId: '' })}
												required
											>
												<option value="">Выберите ресурс</option>
												{options(
													catalogs.resourcesStore.list.filter(
														resource => !resource.archived || resource.id === row.resourceId
													)
												)}
											</CatalogSelect>
											<TextField
												label="Количество"
												name={`quantity-${row.id}`}
												inputMode="decimal"
												value={row.quantity}
												onChange={e => setRow(row.id, { quantity: e.currentTarget.value })}
												required
											/>
											<CatalogSelect
												label="Роль стороны"
												value={row.role}
												onChange={e =>
													setRow(row.id, {
														role: e.target.value as MovementDraft['role'],
														...(e.target.value !== 'principal' ? { direction: 'out' } : {})
													})
												}
											>
												<option value="principal">Основная</option>
												<option value="fee">Комиссия</option>
												<option value="tax">Налог</option>
											</CatalogSelect>
											{!actual && (
												<CatalogSelect
													label="Цель плана"
													value={row.targetKind}
													onChange={e =>
														setRow(row.id, {
															targetKind: e.target.value as MovementDraft['targetKind'],
															targetId: '',
															accountId: ''
														})
													}
												>
													<option value="unassigned">Не выбрано</option>
													<option value="account">Счёт</option>
													<option value="account-category">Категория</option>
												</CatalogSelect>
											)}
											{(actual || row.targetKind === 'account') && (
												<CatalogSelect
													label="Счёт"
													value={actual ? row.accountId : row.targetId}
													onChange={e =>
														setRow(
															row.id,
															actual
																? { accountId: e.target.value }
																: { targetId: e.target.value, accountId: e.target.value }
														)
													}
													required
												>
													<option value="">Выберите счёт</option>
													{options(
														catalogs.accountsStore.list.filter(
															account =>
																account.allowedResourceIds.includes(row.resourceId) &&
																(!account.archived || account.id === row.accountId || account.id === row.targetId)
														)
													)}
												</CatalogSelect>
											)}
											{!actual && row.targetKind === 'account-category' && (
												<CatalogSelect
													label="Категория счетов"
													value={row.targetId}
													onChange={e => setRow(row.id, { targetId: e.target.value })}
													required
												>
													<option value="">Выберите категорию</option>
													{options(catalogs.balanceCategoriesStore.list.filter(row => row.dimension === 'account'))}
												</CatalogSelect>
											)}
										</div>
										{kind === 'exchange' && row.role === 'principal' && row.resourceId !== baseResourceId && (
											<div className={styles.pricing}>
												<p className={styles.hint}>{catalogPrice(row.resourceId)}</p>
												<TextField
													label="Цена за единицу (необязательно)"
													inputMode="decimal"
													value={row.price}
													onChange={e => setRow(row.id, { price: e.currentTarget.value })}
												/>
												<CatalogSelect
													label="Валюта цены"
													value={row.quoteResourceId}
													onChange={e => setRow(row.id, { quoteResourceId: e.target.value })}
												>
													{options(catalogs.resourcesStore.list.filter(resource => resource.kind === 'currency'))}
												</CatalogSelect>
												<label>
													<input
														type="checkbox"
														checked={row.updatePrice}
														onChange={e => setRow(row.id, { updatePrice: e.target.checked })}
													/>{' '}
													Записать цену в справочник при выполнении
												</label>
											</div>
										)}
										{rows.length > 1 && (
											<Button onClick={() => setRows(rows => rows.filter(other => other.id !== row.id))}>
												Убрать сторону {index + 1}
											</Button>
										)}
									</fieldset>
								))}
								<Button onClick={() => setRows(rows => [...rows, newMovement(baseResourceId, baseResourceId)])}>
									Добавить сторону
								</Button>
								<p className={styles.hint}>
									Количество — положительное число или выражение, например 100 / 4. Расход и приход выбираются отдельно.
									Комиссии добавляются отдельной стороной.
								</p>
								{actual && (
									<label>
										<input type="checkbox" name="applyPriceNow" /> Явно применить цены сделки сейчас при изменении факта
									</label>
								)}
							</section>
						)}
						<details className={styles.more} open={!!event.repeat}>
							<summary>Комментарий и расписание</summary>
							<label className={styles.comment}>
								Комментарий
								<textarea name="comment" defaultValue={event.comment ?? ''} rows={3} />
							</label>
							<div className={styles.grid}>
								<TextField label="Длительность" name="duration" value={event.duration ?? ''} placeholder="1d 2:00" />
								<TextField
									label="Дата окончания (не включая)"
									name="end"
									type="date"
									value={!event.repeat ? (event.end?.replaceAll('.', '-') ?? '') : ''}
								/>
								{!actual && (
									<TextField
										label="Шаблон повторения"
										name="repeat"
										value={event.repeat ?? ''}
										placeholder="/1 — ежедневно"
									/>
								)}
								{event.repeat && !actual && (
									<>
										<TextField
											label="Начало расписания"
											name="seriesStart"
											type="date"
											value={event.start.replaceAll('.', '-')}
										/>
										<TextField
											label="Конец расписания"
											name="seriesEnd"
											type="date"
											value={event.end?.replaceAll('.', '-') ?? ''}
										/>
									</>
								)}
							</div>
						</details>
						<footer className={styles.actions}>
							<Button type="submit">
								{completing
									? 'Подтвердить выполнение'
									: event.id === null
										? 'Создать план'
										: event.repeat
											? 'Сохранить вхождение'
											: 'Сохранить'}
							</Button>
							{event.repeat && !completing && <Button onClick={() => save('all')}>Сохранить расписание</Button>}
							{event.id !== null && !actual && (
								<Button
									onClick={() => {
										if (form.current?.reportValidity()) {
											setCompleting(true)
											setError('')
										}
									}}
								>
									Выполнить
								</Button>
							)}
							{event.completed && (
								<Button
									onClick={() =>
										attempt(() =>
											finish(tabs.resourceCommands.cancel(document.id, store.reference(), { commandId: store.formKey }))
										)
									}
								>
									Отменить выполнение
								</Button>
							)}
							{completing && <Button onClick={() => setCompleting(false)}>Вернуться к плану</Button>}
							<Button onClick={store.hideForm}>Закрыть</Button>
							{event.id !== null && <Button onClick={() => setDeleting(true)}>Удалить</Button>}
						</footer>
					</form>
					{deleting && (
						<section role="alert" className={styles.plan}>
							<p>Удалить {event.repeat ? 'это вхождение' : 'событие'}?</p>
							<Button
								onClick={() => attempt(() => finish(tabs.resourceCommands.remove(document.id, store.reference())))}
							>
								Подтвердить удаление
							</Button>
							{event.repeat && (
								<Button
									onClick={() =>
										attempt(() => finish(tabs.resourceCommands.remove(document.id, store.reference(true))))
									}
								>
									Удалить расписание
								</Button>
							)}
							<Button onClick={() => setDeleting(false)}>Отмена</Button>
						</section>
					)}
				</>
			)}
		</div>
	)
})
export default ResourceEventForm
