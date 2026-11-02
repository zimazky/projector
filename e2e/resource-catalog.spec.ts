import { test, expect } from './fixtures'

test.beforeEach(async ({ page }) => {
	await page.route('**/__resource-catalog__', route =>
		route.fulfill({
			contentType: 'text/html',
			body: '<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/dist/resource-catalog.css"><title>Справочники</title></head><body><script src="/dist/resource-catalog.js"></script></body></html>'
		})
	)
	await page.goto('/__resource-catalog__')
	await page.waitForFunction(() => (window as any).__catalog !== undefined)
	await page.evaluate(async () => {
		const probe = (window as any).__catalog
		probe.app = await probe.mount()
	})
})

test('справочники готовятся через формы; цена, состав итога и Reload сохраняют бонусный счёт', async ({ page }) => {
	await page.evaluate(() => (window as any).__catalog.app.stores.documentTabsStore.openNewDocument('Бонусы'))
	const nav = page.getByRole('navigation', { name: 'Справочники' })
	const form = page.getByRole('region', { name: 'Редактор справочника' })
	await nav.getByRole('button', { name: 'Ресурсы', exact: true }).click()
	await page.getByRole('button', { name: 'Добавить единицу' }).click()
	await form.getByLabel('Обозначение единицы').fill('балл')
	await form.getByLabel('Знаков после запятой').fill('0')
	await form.getByRole('button', { name: 'Сохранить', exact: true }).click()
	await nav.getByRole('button', { name: 'Категории', exact: true }).click()
	await page.getByRole('button', { name: 'Добавить категорию' }).click()
	await form.getByLabel('Название', { exact: true }).fill('Бонусные программы')
	await form.getByLabel('Категория для').selectOption('resource')
	await form.getByLabel('Включать в общий баланс').uncheck()
	await form.getByRole('button', { name: 'Сохранить', exact: true }).click()
	await nav.getByRole('button', { name: 'Ресурсы', exact: true }).click()
	await page.getByRole('button', { name: 'Добавить ресурс' }).click()
	await form.getByLabel('Название', { exact: true }).fill('Баллы программы')
	await form.getByLabel('Вид ресурса').selectOption('bonus')
	await form.getByLabel('Единица', { exact: true }).selectOption({ label: 'балл · знаков: 0' })
	await form.getByLabel('Категория', { exact: true }).selectOption({ label: 'Бонусные программы' })
	await form.getByRole('button', { name: 'Сохранить', exact: true }).click()
	await expect(page.getByRole('row').filter({ hasText: 'Баллы программы' })).toContainText('Цена не задана')
	await nav.getByRole('button', { name: 'Счета', exact: true }).click()
	await page.getByRole('button', { name: 'Добавить счёт' }).click()
	await form.getByLabel('Название', { exact: true }).fill('Бонусный счёт')
	await form.getByLabel('Баллы программы', { exact: true }).check()
	await form.getByRole('button', { name: 'Сохранить', exact: true }).click()
	await page.getByRole('button', { name: 'Изменить остаток' }).click()
	await form.getByLabel('Изменение количества').fill('200')
	await form.getByLabel('Дата учёта').fill('2026-11-01')
	await form.getByRole('button', { name: 'Сохранить', exact: true }).click()
	await nav.getByRole('button', { name: 'Остатки', exact: true }).click()
	await page.getByLabel('Дата границы').fill('2026-11-03')
	await expect(page.getByTestId('resource-grand-total')).toHaveText('Общий баланс: 0 RUB')
	await expect(page.getByText('Баллы программы: 200 балл').first()).toBeVisible()
	await nav.getByRole('button', { name: 'Категории', exact: true }).click()
	await page.getByRole('button', { name: 'Изменить категорию Бонусные программы (ресурсы)' }).click()
	await form.getByLabel('Включать в общий баланс').check()
	await form.getByRole('button', { name: 'Сохранить', exact: true }).click()
	await nav.getByRole('button', { name: 'Остатки', exact: true }).click()
	await page.getByLabel('Дата границы').fill('2026-11-03')
	await expect(page.getByText('Оценка неполная. Не оценены:')).toBeVisible()
	await nav.getByRole('button', { name: 'Ресурсы', exact: true }).click()
	await page.getByRole('button', { name: 'Цена Баллы программы', exact: true }).click()
	await form.getByLabel('Цена за единицу').fill('0,5')
	await form.getByLabel('Дата цены').fill('2026-11-01')
	await form.getByRole('button', { name: 'Сохранить', exact: true }).click()
	await nav.getByRole('button', { name: 'Категории', exact: true }).click()
	await page.getByRole('button', { name: 'Изменить категорию Бонусные программы (ресурсы)' }).click()
	await form.getByLabel('Показывать в сводке').uncheck()
	await form.getByRole('button', { name: 'Сохранить', exact: true }).click()
	await nav.getByRole('button', { name: 'Остатки', exact: true }).click()
	await page.getByLabel('Дата границы').fill('2026-11-03')
	await expect(page.getByTestId('resource-grand-total')).toHaveText('Общий баланс: 100 RUB')
	await expect(page.getByRole('heading', { name: 'Бонусные программы', exact: true })).toHaveCount(0)
	await page.evaluate(() => (window as any).__catalog.app.stores.documentTabsStore.waitForLocalPersistence())
	await page.reload()
	await page.waitForFunction(() => (window as any).__catalog !== undefined)
	await page.evaluate(async () => {
		const p = (window as any).__catalog
		p.app = await p.mount()
	})
	await expect(page.getByRole('row').filter({ hasText: 'Бонусный счёт' })).toContainText('Баллы программы')
	await nav.getByRole('button', { name: 'Остатки', exact: true }).click()
	await page.getByLabel('Дата границы').fill('2026-11-03')
	await expect(page.getByTestId('resource-grand-total')).toHaveText('Общий баланс: 100 RUB')
	await page.screenshot({ path: 'artifacts/playwright/resource-catalog-balances.png', fullPage: true })
})

test('форма A сохраняет адрес после перехода на B; замена исходного снимка запрещает устаревшую запись', async ({
	page
}) => {
	await page.evaluate(() => {
		const tabs = (window as any).__catalog.app.stores.documentTabsStore
		tabs.openNewDocument('A')
		const a = tabs.activeDocumentId
		tabs.openNewDocument('B')
		tabs.activateDocument(a)
	})
	await page.getByRole('button', { name: 'Добавить счёт' }).click()
	const form = page.getByRole('region', { name: 'Редактор справочника' })
	await form.getByLabel('Название', { exact: true }).fill('Счёт A')
	await form.getByLabel('RUB', { exact: true }).check()
	await page.getByTestId('document-tab').filter({ hasText: 'B' }).click()
	await form.getByRole('button', { name: 'Сохранить', exact: true }).click()
	await expect(page.getByRole('row').filter({ hasText: 'Счёт A' })).toHaveCount(0)
	await page.getByTestId('document-tab').filter({ hasText: 'A' }).click()
	await expect(page.getByRole('row').filter({ hasText: 'Счёт A' })).toHaveCount(1)
	await page.getByRole('button', { name: 'Изменить счёт Счёт A', exact: true }).click()
	await form.getByLabel('Название', { exact: true }).fill('Устаревшая правка')
	await page.evaluate(() => {
		const tabs = (window as any).__catalog.app.stores.documentTabsStore
		tabs.applyContentToDocument(tabs.activeDocumentId, tabs.getDocumentDataForSave())
	})
	await form.getByRole('button', { name: 'Сохранить', exact: true }).click()
	await expect(form.getByRole('alert')).toContainText('Откройте форму заново')
	await expect(page.getByRole('row').filter({ hasText: 'Счёт A' })).toHaveCount(1)
})

test('архивирование предупреждает о планах; отмена подтверждения не меняет документ', async ({ page }) => {
	await page.evaluate(() => {
		const p = (window as any).__catalog,
			tabs = p.app.stores.documentTabsStore
		tabs.openNewDocument('Планы')
		const data = p.resourceBalanceDocument()
		data.plannedList = [p.balancePlan('Покупка', '2026.11.10', 'RUB', '-10', { kind: 'account', accountId: 'card' })]
		tabs.applyContentToDocument(tabs.activeDocumentId, data)
	})
	await page.getByRole('button', { name: 'Изменить счёт Карта', exact: true }).click()
	const form = page.getByRole('region', { name: 'Редактор справочника' })
	await form.getByLabel('В архиве').check()
	await form.getByRole('button', { name: 'Сохранить', exact: true }).click()
	await expect(form).toContainText('План «Покупка»: нет подходящего активного счёта')
	await form.getByRole('button', { name: 'Отмена', exact: true }).click()
	await expect(
		page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Изменить счёт Карта', exact: true }) })
	).not.toContainText('(архив)')
	await page.getByRole('button', { name: 'Изменить счёт Карта', exact: true }).click()
	await form.getByLabel('В архиве').check()
	await form.getByRole('button', { name: 'Сохранить', exact: true }).click()
	await form.getByRole('button', { name: 'Применить изменения' }).click()
	await expect(
		page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Изменить счёт Карта', exact: true }) })
	).toContainText('(архив)')
})

test('без документа доступно пустое состояние', async ({ page }) => {
	await expect(page.getByRole('main')).toContainText('Создать')
	await expect(page.getByRole('button', { name: 'Добавить счёт' })).toHaveCount(0)
})
