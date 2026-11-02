import React from 'react'
import { observer } from 'mobx-react-lite'
import { useStores } from 'src/1-app/Providers/StoreContext'
import Button from 'src/7-shared/ui/Button/Button'
import TextField from 'src/7-shared/ui/TextField/TextField'
import { newEventUid } from 'src/6-entities/Events/EventIdentity'
import { documentToday } from 'src/6-entities/Operations/ResourceOperationCommands'
import type { Resource, BalanceCategory } from 'src/6-entities/Resources/ResourceContracts'
import { ResourceCatalogEditor, type CatalogChange } from './ResourceCatalogEditor'
import styles from './ResourceCatalog.module.css'

export type CatalogFormKind = CatalogChange['kind'] | 'price' | 'balance'
export type CatalogFormContext = { editor: ResourceCatalogEditor; kind: CatalogFormKind; id?: string; title: string }

export function CatalogSelect({
	label,
	children,
	...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
	const id = React.useId()
	return (
		<div className={styles.field}>
			<label htmlFor={id}>{label}</label>
			<select {...props} id={id}>
				{children}
			</select>
		</div>
	)
}

const CatalogForm = observer(function CatalogForm({
	context,
	onClose,
	onSaved
}: {
	context: CatalogFormContext
	onClose(): void
	onSaved(): void
}) {
	const { documentTabsStore: tabs } = useStores()
	const { editor, kind, id } = context
	const catalogs = tabs.getDocumentStores(editor.documentId)?.resourceStores
	const [error, setError] = React.useState('')
	const [pending, setPending] = React.useState<{ change: CatalogChange; warnings: string[] } | null>(null)
	const [newId] = React.useState(() => newEventUid())
	const account = catalogs?.accountsStore.getById(id ?? '')
	const resource = catalogs?.resourcesStore.getById(id ?? '')
	const category = catalogs?.balanceCategoriesStore.getById(id ?? '')
	const unit = catalogs?.unitsStore.getById(id ?? '')
	const [accountId, setAccountId] = React.useState(
		account?.id ?? catalogs?.accountsStore.list.find(row => !row.archived)?.id ?? ''
	)
	const source = tabs.getDocumentData(editor.documentId)
	if (!catalogs || !source || !('schemaVersion' in source))
		return (
			<section className={styles.editor}>
				<p role="alert">Исходный документ закрыт. Откройте форму заново.</p>
				<Button onClick={onClose}>Закрыть форму</Button>
			</section>
		)
	const date = documentToday(source.timezone).replaceAll('.', '-')
	const options = (items: readonly { id: string; name: string }[]) =>
		items.map(item => (
			<option key={item.id} value={item.id}>
				{item.name}
			</option>
		))
	const categories = (dimension: BalanceCategory['dimension']) =>
		options(catalogs.balanceCategoriesStore.list.filter(row => row.dimension === dimension))
	const attempt = (action: () => void) => {
		try {
			action()
			setError('')
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения.')
		}
	}
	const submit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		const fields = new FormData(event.currentTarget)
		const text = (name: string) => String(fields.get(name) ?? '').trim()
		const checked = (name: string) => fields.has(name)
		attempt(() => {
			editor.check()
			if (kind === 'price') {
				editor.price(id!, text('amount'), text('quote'), text('date').replaceAll('-', '.'))
				onSaved()
				return
			}
			if (kind === 'balance') {
				editor.balance(
					text('operation') as 'opening' | 'adjustment',
					accountId,
					text('resource'),
					text('quantity'),
					text('date').replaceAll('-', '.')
				)
				onSaved()
				return
			}
			let change: CatalogChange
			const name = text('name')
			if (kind !== 'unit' && !name) throw new Error('Введите название.')
			if (kind === 'account')
				change = {
					kind,
					value: {
						id: id ?? newId,
						name,
						categoryId: text('category'),
						archived: checked('archived'),
						allowedResourceIds: fields.getAll('allowed').map(String)
					}
				}
			else if (kind === 'resource')
				change = {
					kind,
					value: {
						...resource,
						id: id ?? newId,
						name,
						unitId: text('unit'),
						kind: text('resourceKind') as Resource['kind'],
						categoryId: text('category'),
						archived: checked('archived')
					}
				}
			else if (kind === 'category')
				change = {
					kind,
					value: {
						id: id ?? newId,
						name,
						dimension: text('dimension') as BalanceCategory['dimension'],
						includeInGrandTotal: checked('include'),
						showInSummary: checked('show')
					}
				}
			else change = { kind: 'unit', value: { id: id ?? newId, symbol: text('symbol'), scale: Number(text('scale')) } }
			const warnings = editor.preview(change)
			if (warnings.length) setPending({ change, warnings })
			else {
				editor.save(change)
				onSaved()
			}
		})
	}
	return (
		<section className={styles.editor} aria-label="Редактор справочника">
			<h2>{context.title}</h2>
			<p>Документ: {tabs.documents.find(row => row.id === editor.documentId)?.ref?.name ?? editor.documentId}</p>
			{error && <p role="alert">{error}</p>}
			{pending && (
				<div>
					<ul>
						{pending.warnings.map(warning => (
							<li key={warning}>{warning}</li>
						))}
					</ul>
					<div className={styles.actions}>
						<Button
							onClick={() =>
								attempt(() => {
									editor.save(pending.change)
									onSaved()
								})
							}
						>
							Применить изменения
						</Button>
						<Button onClick={() => setPending(null)}>Вернуться к форме</Button>
						<Button onClick={onClose}>Отмена</Button>
					</div>
				</div>
			)}
			<form onSubmit={submit} hidden={!!pending}>
				<div className={styles.fields}>
					{(kind === 'account' || kind === 'resource' || kind === 'category') && (
						<TextField
							label="Название"
							name="name"
							required
							maxLength={200}
							value={(kind === 'account' ? account : kind === 'resource' ? resource : category)?.name ?? ''}
						/>
					)}
					{(kind === 'account' || kind === 'resource') && (
						<>
							<CatalogSelect
								label="Категория"
								name="category"
								defaultValue={(kind === 'account' ? account : resource)?.categoryId}
								required
							>
								{categories(kind === 'account' ? 'account' : 'resource')}
							</CatalogSelect>
							<label>
								<input
									type="checkbox"
									name="archived"
									defaultChecked={(kind === 'account' ? account : resource)?.archived}
								/>{' '}
								В архиве
							</label>
						</>
					)}
					{kind === 'account' && (
						<fieldset>
							<legend>Допустимые ресурсы</legend>
							{catalogs.resourcesStore.list.map(row => (
								<label className={styles.check} key={row.id}>
									<input
										type="checkbox"
										name="allowed"
										value={row.id}
										defaultChecked={account?.allowedResourceIds.includes(row.id)}
									/>{' '}
									{row.name}
									{row.archived ? ' (архив)' : ''}
								</label>
							))}
						</fieldset>
					)}
					{kind === 'resource' && (
						<>
							<CatalogSelect label="Вид ресурса" name="resourceKind" defaultValue={resource?.kind ?? 'currency'}>
								{Object.entries({
									currency: 'Валюта',
									bond: 'Облигация',
									material: 'Материальный ресурс',
									bonus: 'Бонусы',
									other: 'Другое'
								}).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</CatalogSelect>
							<CatalogSelect label="Единица" name="unit" defaultValue={resource?.unitId} required>
								{catalogs.unitsStore.list.map(row => (
									<option key={row.id} value={row.id}>
										{row.symbol} · знаков: {row.scale}
									</option>
								))}
							</CatalogSelect>
							<p>
								Цена необязательна. Для бонусной программы создайте отдельный ресурс и счёт; денежный итог настраивается
								в категории.
							</p>
						</>
					)}
					{kind === 'category' && (
						<>
							<CatalogSelect label="Категория для" name="dimension" defaultValue={category?.dimension ?? 'account'}>
								<option value="account">Счетов</option>
								<option value="resource">Ресурсов</option>
							</CatalogSelect>
							<label>
								<input type="checkbox" name="include" defaultChecked={category?.includeInGrandTotal ?? true} /> Включать
								в общий баланс
							</label>
							<label>
								<input type="checkbox" name="show" defaultChecked={category?.showInSummary ?? true} /> Показывать в
								сводке
							</label>
							<p>
								В общий итог входят позиции, разрешённые обеими категориями: счёта и ресурса. Видимость сводки не меняет
								сумму.
							</p>
						</>
					)}
					{kind === 'unit' && (
						<>
							<TextField label="Обозначение единицы" name="symbol" required value={unit?.symbol ?? ''} />
							<TextField
								label="Знаков после запятой"
								name="scale"
								type="number"
								min={0}
								max={18}
								step={1}
								required
								value={String(unit?.scale ?? 2)}
							/>
						</>
					)}
					{kind === 'price' && (
						<>
							<TextField
								label="Цена за единицу"
								name="amount"
								inputMode="decimal"
								required
								value={resource?.price?.amountPerUnit ?? ''}
							/>
							<CatalogSelect
								label="Валюта цены"
								name="quote"
								defaultValue={resource?.price?.quoteResourceId ?? source.baseResourceId}
								required
							>
								{options(catalogs.resourcesStore.list.filter(row => row.kind === 'currency' && !row.archived))}
							</CatalogSelect>
							<TextField label="Дата цены" name="date" type="date" required max={date} value={date} />
							<p>Источник новой цены: ручной ввод. Оценка использует текущую цену на всём горизонте прогноза.</p>
						</>
					)}
					{kind === 'balance' && (
						<>
							<CatalogSelect label="Операция" name="operation">
								<option value="opening">Начальный остаток</option>
								<option value="adjustment">Корректировка</option>
							</CatalogSelect>
							<CatalogSelect
								label="Счёт"
								value={accountId}
								onChange={event => setAccountId(event.target.value)}
								required
							>
								{options(catalogs.accountsStore.list.filter(row => !row.archived))}
							</CatalogSelect>
							<CatalogSelect key={accountId} label="Ресурс" name="resource" required>
								{options(
									catalogs.resourcesStore.list.filter(
										row =>
											!row.archived && catalogs.accountsStore.getById(accountId)?.allowedResourceIds.includes(row.id)
									)
								)}
							</CatalogSelect>
							<TextField label="Изменение количества" name="quantity" inputMode="decimal" required />
							<TextField label="Дата учёта" name="date" type="date" required value={date} />
							<p>
								Введите изменение со знаком, а не новый итог. Не добавляйте полный текущий остаток поверх уже учтённой
								истории.
							</p>
						</>
					)}
				</div>
				<div className={styles.actions}>
					<Button type="submit">Сохранить</Button>
					<Button type="button" onClick={onClose}>
						Отмена
					</Button>
				</div>
			</form>
		</section>
	)
})

export default CatalogForm
