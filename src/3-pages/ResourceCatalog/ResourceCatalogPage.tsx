import React from 'react'
import { observer } from 'mobx-react-lite'
import { useStores } from 'src/1-app/Providers/StoreContext'
import Button from 'src/7-shared/ui/Button/Button'
import CatalogForm, { type CatalogFormContext, type CatalogFormKind } from 'src/5-features/ResourceCatalog/CatalogForm'
import { ResourceCatalogEditor } from 'src/5-features/ResourceCatalog/ResourceCatalogEditor'
import styles from '../../5-features/ResourceCatalog/ResourceCatalog.module.css'
import ResourceBalances from './ResourceBalances'

export type CatalogSection = 'Accounts' | 'Resources' | 'Categories' | 'Balances'
export const catalogSections: Record<CatalogSection, string> = {
	Accounts: 'Счета',
	Resources: 'Ресурсы',
	Categories: 'Категории',
	Balances: 'Остатки'
}

const ResourceCatalogPage = observer(function ResourceCatalogPage({ section }: { section: CatalogSection }) {
	const { documentTabsStore: tabs, uiStore } = useStores()
	const [form, setForm] = React.useState<CatalogFormContext | null>(null)
	const catalogs = tabs.getActiveDocumentStores()?.resourceStores
	const source = tabs.activeDocument?.data
	const baseResourceId = source && 'schemaVersion' in source ? source.baseResourceId : undefined
	const [notice, setNotice] = React.useState('')
	const open = (kind: CatalogFormKind, title: string, id?: string) => {
		if (!tabs.activeDocumentId || !catalogs) return
		setNotice('')
		setForm({ kind, title, id, editor: new ResourceCatalogEditor(tabs, tabs.activeDocumentId) })
	}
	const categoryName = (id: string) => catalogs?.balanceCategoriesStore.getById(id)?.name ?? id
	const saved = () => {
		setForm(null)
		setNotice('Изменения сохранены в исходном документе.')
	}
	return (
		<section className={styles.page} aria-label="Справочники документа">
			<h1>{catalogSections[section]}</h1>
			<nav className={styles.actions} aria-label="Справочники">
				{Object.entries(catalogSections).map(([mode, title]) => (
					<Button
						key={mode}
						aria-current={mode === section ? 'page' : undefined}
						onClick={() => uiStore.changeViewMode({ mode: mode as CatalogSection })}
					>
						{title}
					</Button>
				))}
			</nav>
			{notice && <p role="status">{notice}</p>}
			{form && <CatalogForm key={form.editor.commandId} context={form} onClose={() => setForm(null)} onSaved={saved} />}
			{!catalogs ? (
				<p>Откройте документ с учётом ресурсов, чтобы настроить справочники.</p>
			) : (
				<>
					{section === 'Accounts' && (
						<>
							<div className={styles.actions}>
								<Button onClick={() => open('account', 'Новый счёт')}>Добавить счёт</Button>
								<Button onClick={() => open('balance', 'Начальный остаток / корректировка')}>Изменить остаток</Button>
							</div>
							<div className={styles.table}>
								<table>
									<caption>Счета документа</caption>
									<thead>
										<tr>
											<th>Название</th>
											<th>Категория</th>
											<th>Допустимые ресурсы</th>
											<th>Действия</th>
										</tr>
									</thead>
									<tbody>
										{catalogs.accountsStore.list.map(row => (
											<tr key={row.id}>
												<td>
													{row.name}
													{row.archived && ' (архив)'}
												</td>
												<td>{categoryName(row.categoryId)}</td>
												<td>
													{row.allowedResourceIds.map(id => catalogs.resourcesStore.getById(id)?.name ?? id).join(', ')}
												</td>
												<td>
													<Button
														aria-label={`Изменить счёт ${row.name}`}
														onClick={() => open('account', 'Редактирование счёта', row.id)}
													>
														Изменить
													</Button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
							{!catalogs.accountsStore.list.length && (
								<p>Счетов пока нет. Создайте счёт и выберите допустимые ресурсы.</p>
							)}
						</>
					)}
					{section === 'Resources' && (
						<>
							<Button onClick={() => open('resource', 'Новый ресурс')}>Добавить ресурс</Button>
							<div className={styles.table}>
								<table>
									<caption>Ресурсы документа</caption>
									<thead>
										<tr>
											<th>Название</th>
											<th>Единица</th>
											<th>Категория</th>
											<th>Текущая цена и источник</th>
											<th>Действия</th>
										</tr>
									</thead>
									<tbody>
										{catalogs.resourcesStore.list.map(row => (
											<tr key={row.id}>
												<td>
													{row.name}
													{row.archived && ' (архив)'}
												</td>
												<td>{catalogs.unitsStore.getById(row.unitId)?.symbol}</td>
												<td>{categoryName(row.categoryId)}</td>
												<td>
													{row.price ? (
														<>
															{row.price.amountPerUnit}{' '}
															{catalogs.resourcesStore.getById(row.price.quoteResourceId)?.name}
															<br />
															{row.price.asOf} · ревизия {row.price.revision}
															<br />
															{row.price.sourceEventUid
																? `Событие: ${row.price.sourceEventUid}`
																: 'Ручная / исходная цена'}
														</>
													) : (
														'Цена не задана'
													)}
												</td>
												<td>
													<Button
														aria-label={`Изменить ресурс ${row.name}`}
														onClick={() => open('resource', 'Редактирование ресурса', row.id)}
													>
														Изменить
													</Button>
													{row.id !== baseResourceId && (
														<Button
															aria-label={`Цена ${row.name}`}
															onClick={() => open('price', `Цена: ${row.name}`, row.id)}
														>
															Цена
														</Button>
													)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
							<h2>Единицы</h2>
							<Button onClick={() => open('unit', 'Новая единица')}>Добавить единицу</Button>
							<ul>
								{catalogs.unitsStore.list.map(row => (
									<li key={row.id}>
										{row.symbol} · знаков после запятой: {row.scale}{' '}
										<Button
											aria-label={`Изменить единицу ${row.symbol}`}
											onClick={() => open('unit', 'Редактирование единицы', row.id)}
										>
											Изменить
										</Button>
									</li>
								))}
							</ul>
						</>
					)}
					{section === 'Categories' && (
						<>
							<Button onClick={() => open('category', 'Новая категория')}>Добавить категорию</Button>
							<div className={styles.table}>
								<table>
									<caption>Категории счетов и ресурсов</caption>
									<thead>
										<tr>
											<th>Название</th>
											<th>Для</th>
											<th>В общем балансе</th>
											<th>В сводке</th>
											<th>Действия</th>
										</tr>
									</thead>
									<tbody>
										{catalogs.balanceCategoriesStore.list.map(row => (
											<tr key={row.id}>
												<td>{row.name}</td>
												<td>{row.dimension === 'account' ? 'Счетов' : 'Ресурсов'}</td>
												<td>{row.includeInGrandTotal ? 'Да' : 'Нет'}</td>
												<td>{row.showInSummary ? 'Да' : 'Нет'}</td>
												<td>
													<Button
														aria-label={`Изменить категорию ${row.name} (${row.dimension === 'account' ? 'счета' : 'ресурсы'})`}
														onClick={() => open('category', 'Редактирование категории', row.id)}
													>
														Изменить
													</Button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</>
					)}
					{section === 'Balances' && (
						<ResourceBalances onAdjust={() => open('balance', 'Начальный остаток / корректировка')} />
					)}
				</>
			)}
		</section>
	)
})

export default ResourceCatalogPage
