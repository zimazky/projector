import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Редактор события', exact: true })
const side = (page: Page, number: number) => dialog(page).getByRole('group', { name: `Сторона ${number}`, exact: true })
const card = (page: Page, name: string) => page.getByTestId('day-list').getByRole('button', { name, exact: true })

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date('2026-11-04T09:00:00Z'))
	await page.route('**/__resource-events__', route =>
		route.fulfill({
			contentType: 'text/html',
			body: '<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/dist/resource-catalog.css"><title>День и операции</title></head><body><script src="/dist/resource-catalog.js"></script></body></html>'
		})
	)
	await page.goto('/__resource-events__')
	await page.waitForFunction(() => (window as any).__catalog !== undefined)
	await page.evaluate(async () => {
		const p = (window as any).__catalog
		p.app = await p.mount()
		const s = p.app.stores,
			tabs = s.documentTabsStore
		tabs.openNewDocument('Личные финансы')
		const data = p.resourceBalanceDocument()
		data.completedList = [
			{
				eventUid: 'opening',
				name: 'Начальный остаток',
				start: '2026.11.01',
				projectId: 'default',
				actualOperation: {
					kind: 'opening',
					effectiveDate: '2026.11.01',
					movements: [{ id: 'initial', resourceId: 'RUB', accountId: 'card', quantity: '10000', role: 'principal' }]
				}
			}
		]
		tabs.applyContentToDocument(tabs.activeDocumentId, data)
		s.dayListStore.setDate(Date.parse('2026-11-04T00:00:00Z') / 1000)
		s.uiStore.changeViewMode({ mode: 'Day' })
	})
})

async function createExpense(page: Page, name: string, repeat = false) {
	await page.getByRole('button', { name: 'Добавить событие', exact: true }).click()
	await dialog(page).getByLabel('Название', { exact: true }).fill(name)
	await dialog(page).getByLabel('Операция', { exact: true }).selectOption('expense')
	await side(page, 1)
		.getByLabel('Количество', { exact: true })
		.fill(repeat ? '100 / 4' : '7000')
	await side(page, 1).getByLabel('Цель плана').selectOption('account-category')
	await side(page, 1).getByLabel('Категория счетов').selectOption('everyday')
	if (repeat) {
		await dialog(page).getByText('Комментарий и расписание', { exact: true }).click()
		await dialog(page).getByLabel('Шаблон повторения').fill('/1')
	}
	await dialog(page).getByRole('button', { name: 'Создать план', exact: true }).click()
	await expect(dialog(page)).toHaveCount(0)
}

test('план категории → счёт → выполнение → отмена → Reload без повторного движения', async ({ page }) => {
	await createExpense(page, 'Аренда')
	await expect(card(page, 'Аренда')).toContainText('Категория: Повседневные')
	await page.getByRole('button', { name: 'Следующий день' }).click()
	await expect(page.getByTestId('day-forecast-total')).toContainText('3\u202f000 RUB')
	await expect(page.getByTestId('day-actual-total')).toContainText('10\u202f000 RUB')
	await page.getByRole('button', { name: 'Предыдущий день' }).click()
	await card(page, 'Аренда').click()
	await side(page, 1).getByLabel('Цель плана').selectOption('account')
	await side(page, 1).getByLabel('Счёт', { exact: true }).selectOption('card')
	await dialog(page).getByRole('button', { name: 'Сохранить', exact: true }).click()
	await card(page, 'Аренда').click()
	await dialog(page).getByRole('button', { name: 'Выполнить', exact: true }).click()
	await expect(dialog(page).getByRole('heading', { name: 'Исходный план' })).toBeVisible()
	await dialog(page).getByRole('button', { name: 'Подтвердить выполнение' }).click()
	await expect(card(page, 'Аренда')).toContainText('Выполнено')
	await page.getByRole('button', { name: 'Следующий день' }).click()
	await expect(page.getByTestId('day-actual-total')).toContainText('3\u202f000 RUB')
	await page.getByRole('button', { name: 'Предыдущий день' }).click()
	await card(page, 'Аренда').click()
	await dialog(page).getByRole('button', { name: 'Отменить выполнение' }).click()
	await expect(card(page, 'Аренда')).toContainText('План')
	await page.evaluate(() => (window as any).__catalog.app.stores.documentTabsStore.waitForLocalPersistence())
	await page.reload()
	await page.waitForFunction(() => (window as any).__catalog !== undefined)
	const restored = await page.evaluate(async () => {
		const p = (window as any).__catalog
		p.app = await p.mount()
		const s = p.app.stores
		s.uiStore.changeViewMode({ mode: 'Day' })
		s.dayListStore.setDate(Date.parse('2026-11-04T00:00:00Z') / 1000)
		const data = s.documentTabsStore.getDocumentDataForSave()
		return {
			facts: data.completedList.length,
			plans: data.plannedList.length,
			plan: data.plannedList[0].plannedOperation.movements[0]
		}
	})
	expect(restored).toMatchObject({
		facts: 1,
		plans: 1,
		plan: { quantity: '-7000', target: { kind: 'account', accountId: 'card' } }
	})
	await expect(card(page, 'Аренда')).toBeVisible()
})

test('покупка с комиссией меняет цену одной командой и остаётся видимой в многодневном календаре', async ({ page }) => {
	await page.getByRole('button', { name: 'Добавить событие', exact: true }).click()
	await dialog(page).getByLabel('Название', { exact: true }).fill('Заправка')
	await dialog(page).getByLabel('Операция', { exact: true }).selectOption('exchange')
	await side(page, 1).getByLabel('Количество', { exact: true }).fill('2800')
	await side(page, 2).getByLabel('Ресурс', { exact: true }).selectOption('fuel')
	await side(page, 2).getByLabel('Количество', { exact: true }).fill('40')
	await side(page, 2).getByLabel('Цена за единицу (необязательно)').fill('70')
	await side(page, 2).getByLabel('Записать цену в справочник при выполнении').check()
	await dialog(page).getByRole('button', { name: 'Добавить сторону', exact: true }).click()
	await side(page, 3).getByLabel('Количество', { exact: true }).fill('10')
	await side(page, 3).getByLabel('Роль стороны').selectOption('fee')
	await dialog(page).getByText('Комментарий и расписание', { exact: true }).click()
	await dialog(page).getByLabel('Длительность', { exact: true }).fill('2d 0:00')
	await dialog(page).getByRole('button', { name: 'Создать план', exact: true }).click()
	await expect(dialog(page)).toHaveCount(0)
	await card(page, 'Заправка').click()
	await dialog(page).getByRole('button', { name: 'Выполнить', exact: true }).click()
	await side(page, 1).getByLabel('Счёт', { exact: true }).selectOption('card')
	await side(page, 2).getByLabel('Счёт', { exact: true }).selectOption('tank')
	await side(page, 3).getByLabel('Счёт', { exact: true }).selectOption('card')
	await side(page, 3).getByLabel('Количество', { exact: true }).fill('0.001')
	await dialog(page).getByRole('button', { name: 'Подтвердить выполнение' }).click()
	await expect(dialog(page).getByRole('alert')).toContainText('не более 2')
	expect(
		await page.evaluate(
			() =>
				(window as any).__catalog.app.stores.documentTabsStore
					.getDocumentDataForSave()
					.resources.find((r: any) => r.id === 'fuel').price.amountPerUnit
		)
	).toBe('75')
	await side(page, 3).getByLabel('Количество', { exact: true }).fill('10')
	await dialog(page).getByRole('button', { name: 'Подтвердить выполнение' }).click()
	await expect(dialog(page)).toHaveCount(0)
	const result = await page.evaluate(() => {
		const data = (window as any).__catalog.app.stores.documentTabsStore.getDocumentDataForSave()
		return {
			price: data.resources.find((r: any) => r.id === 'fuel').price.amountPerUnit,
			movements: data.completedList.find((r: any) => r.name === 'Заправка').actualOperation.movements.length
		}
	})
	expect(result).toEqual({ price: '70', movements: 3 })
	await page.getByRole('button', { name: 'Следующий день' }).click()
	await expect(card(page, 'Заправка')).toContainText('учёт 2026.11.04 (другая дата)')
	await expect(page.getByTestId('day-actual-total')).toContainText('7\u202f190 RUB')
	await page.getByRole('button', { name: 'Вернуться в календарь' }).click()
	await expect(
		page
			.locator('[data-testid="calendar-day"][data-date="2026.11.05"]')
			.getByRole('button', { name: 'Заправка', exact: true })
	).toBeVisible()
})

test('повторяемое вхождение выполняется и восстанавливается ровно один раз после Reload', async ({ page }) => {
	await createExpense(page, 'Кофе', true)
	await card(page, 'Кофе').click()
	await dialog(page).getByRole('button', { name: 'Выполнить', exact: true }).click()
	await side(page, 1).getByLabel('Счёт', { exact: true }).selectOption('card')
	await dialog(page).getByRole('button', { name: 'Подтвердить выполнение' }).click()
	await expect(card(page, 'Кофе')).toContainText('Выполнено')
	await card(page, 'Кофе').click()
	await dialog(page).getByRole('button', { name: 'Отменить выполнение' }).click()
	await expect(card(page, 'Кофе')).toHaveCount(1)
	await page.getByRole('button', { name: 'Следующий день' }).click()
	await expect(card(page, 'Кофе')).toHaveCount(1)
	await page.evaluate(() => (window as any).__catalog.app.stores.documentTabsStore.waitForLocalPersistence())
	await page.reload()
	await page.waitForFunction(() => (window as any).__catalog !== undefined)
	await page.evaluate(async () => {
		const p = (window as any).__catalog
		p.app = await p.mount()
		p.app.stores.uiStore.changeViewMode({ mode: 'Day' })
		p.app.stores.dayListStore.setDate(Date.parse('2026-11-04T00:00:00Z') / 1000)
	})
	await expect(card(page, 'Кофе')).toHaveCount(1)
	await page.getByRole('button', { name: 'Следующий день' }).click()
	await expect(card(page, 'Кофе')).toHaveCount(1)
})

test('открытая карточка A не изменяет B; подмена исходного снимка блокирует сохранение', async ({ page }) => {
	await createExpense(page, 'Только A')
	await card(page, 'Только A').click()
	await dialog(page).getByLabel('Название', { exact: true }).fill('Исправлено в A')
	await page.evaluate(() => (window as any).__catalog.app.stores.documentTabsStore.openNewDocument('B'))
	await dialog(page).getByRole('button', { name: 'Сохранить', exact: true }).click()
	await expect(card(page, 'Исправлено в A')).toHaveCount(0)
	await page.getByTestId('document-tab').filter({ hasText: 'Личные финансы' }).click()
	await card(page, 'Исправлено в A').click()
	await page.evaluate(() => {
		const t = (window as any).__catalog.app.stores.documentTabsStore
		t.applyContentToDocument(t.activeDocumentId, t.getDocumentDataForSave())
	})
	await dialog(page).getByRole('button', { name: 'Сохранить', exact: true }).click()
	await expect(dialog(page).getByRole('alert')).toContainText('Откройте карточку заново')
})

test('список дня показывает неполную оценку и поиск по ресурсу; адаптивный вид', async ({ page }) => {
	await page.evaluate(() => {
		const p = (window as any).__catalog,
			s = p.app.stores,
			tabs = s.documentTabsStore
		const data = tabs.getDocumentDataForSave()
		delete data.resources.find((r: any) => r.id === 'bonus').price
		data.balanceCategories.find((r: any) => r.id === 'materials').includeInGrandTotal = true
		data.plannedList = [
			p.balancePlan('Бонусы за покупки', '2026.11.04', 'bonus', '200'),
			p.balancePlan('Оплатить страховку', '2026.11.04', 'RUB', '-1800', {
				kind: 'account-category',
				categoryId: 'everyday'
			})
		]
		data.completedList.push({
			eventUid: 'internet',
			name: 'Оплата интернета',
			start: '2026.11.04',
			time: '9:00',
			projectId: 'default',
			actualOperation: {
				kind: 'expense',
				effectiveDate: '2026.11.04',
				movements: [
					{ id: 'internet-payment', accountId: 'card', resourceId: 'RUB', quantity: '-650', role: 'principal' }
				]
			}
		})
		tabs.applyContentToDocument(tabs.activeDocumentId, data)
	})
	await expect(card(page, 'Бонусы за покупки')).toContainText('Не выбрано')
	await page.getByRole('button', { name: 'Следующий день' }).click()
	await expect(page.getByTestId('day-forecast-total')).toContainText('неполная оценка')
	await expect(page.getByText(/Нет оценки:/)).toContainText('200')
	await page.getByRole('button', { name: 'Предыдущий день' }).click()
	await page.getByPlaceholder('Поиск событий...').fill('балл')
	await page.getByPlaceholder('Поиск событий...').press('Enter')
	await expect(page.getByTestId('day-event').filter({ hasText: 'Бонусы за покупки' })).toHaveClass(/highlighted/)
	await page.getByPlaceholder('Поиск событий...').press('Escape')
	await page.setViewportSize({ width: 1280, height: 1280 })
	await page.screenshot({ path: 'artifacts/playwright/day-list-r08-desktop.png', fullPage: true })
	await page.setViewportSize({ width: 390, height: 844 })
	await page.screenshot({ path: 'artifacts/playwright/day-list-r08-mobile.png', fullPage: true })
	expect(await page.getByTestId('day-list').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})

test('правка одного вхождения сохраняет другие дни расписания', async ({ page }) => {
	await createExpense(page, 'Кофе', true)
	await page.getByRole('button', { name: 'Следующий день' }).click()
	await card(page, 'Кофе').click()
	await dialog(page).getByLabel('Название', { exact: true }).fill('Кофе с другом')
	await side(page, 1).getByLabel('Количество', { exact: true }).fill('125')
	await dialog(page).getByRole('button', { name: 'Сохранить вхождение', exact: true }).click()
	await expect(dialog(page)).toHaveCount(0)
	await expect(card(page, 'Кофе с другом')).toContainText('-125')
	await page.getByRole('button', { name: 'Предыдущий день' }).click()
	await expect(card(page, 'Кофе')).toContainText('-25')
	await page.getByRole('button', { name: 'Следующий день' }).click()
	await page.getByRole('button', { name: 'Следующий день' }).click()
	await expect(card(page, 'Кофе')).toContainText('-25')
})

test('перевод между картами сохраняет общий итог; факт виден в независимую дату учёта', async ({ page }) => {
	await page.evaluate(() => {
		const tabs = (window as any).__catalog.app.stores.documentTabsStore,
			data = tabs.getDocumentDataForSave()
		data.completedList.push({
			eventUid: 'late',
			name: 'Позднее зачисление',
			start: '2026.11.01',
			projectId: 'default',
			actualOperation: {
				kind: 'income',
				effectiveDate: '2026.11.04',
				movements: [{ id: 'late-move', resourceId: 'RUB', accountId: 'card', quantity: '300', role: 'principal' }]
			}
		})
		tabs.applyContentToDocument(tabs.activeDocumentId, data)
	})
	await expect(card(page, 'Позднее зачисление')).toContainText('учёт 2026.11.04')
	await page.getByRole('button', { name: 'Добавить событие', exact: true }).click()
	await dialog(page).getByLabel('Название', { exact: true }).fill('Между картами')
	await dialog(page).getByLabel('Операция', { exact: true }).selectOption('transfer')
	for (const [number, account] of [
		[1, 'card'],
		[2, 'card-b']
	] as const) {
		await side(page, number).getByLabel('Количество', { exact: true }).fill('500')
		await side(page, number).getByLabel('Цель плана').selectOption('account')
		await side(page, number).getByLabel('Счёт', { exact: true }).selectOption(account)
	}
	await dialog(page).getByRole('button', { name: 'Создать план', exact: true }).click()
	await card(page, 'Между картами').click()
	await dialog(page).getByRole('button', { name: 'Выполнить', exact: true }).click()
	await dialog(page).getByRole('button', { name: 'Подтвердить выполнение' }).click()
	await expect(dialog(page)).toHaveCount(0)
	await page.getByRole('button', { name: 'Следующий день' }).click()
	await expect(page.getByTestId('day-actual-total')).toContainText('10\u202f300 RUB')
	await expect(page.getByTestId('day-forecast-total')).toContainText('10\u202f300 RUB')
})

test('перенос и копия в календаре используют ресурсные команды и новые UID', async ({ page }) => {
	await createExpense(page, 'Перенести')
	await page.getByRole('button', { name: 'Вернуться в календарь' }).click()
	const day = (date: string) => page.locator(`[data-testid="calendar-day"][data-date="${date}"]`)
	const transfer = await page.evaluateHandle(() => new DataTransfer())
	await day('2026.11.04')
		.getByRole('button', { name: 'Перенести', exact: true })
		.dispatchEvent('dragstart', { dataTransfer: transfer })
	await day('2026.11.05').dispatchEvent('drop', { dataTransfer: transfer })
	await expect(day('2026.11.04').getByRole('button', { name: 'Перенести', exact: true })).toHaveCount(0)
	await day('2026.11.05')
		.getByRole('button', { name: 'Перенести', exact: true })
		.dispatchEvent('dragstart', { dataTransfer: transfer })
	await day('2026.11.06').dispatchEvent('drop', { dataTransfer: transfer, ctrlKey: true })
	await expect(day('2026.11.05').getByRole('button', { name: 'Перенести', exact: true })).toHaveCount(1)
	await expect(day('2026.11.06').getByRole('button', { name: 'Перенести', exact: true })).toHaveCount(1)
	const result = await page.evaluate(() => {
		const s = (window as any).__catalog.app.stores,
			tabs = s.documentTabsStore,
			data = tabs.getDocumentDataForSave()
		return {
			amount: s.eventsCache.resourceBalances.get(tabs.activeDocumentId, '2026.11.07').grandTotal.amount,
			uids: data.plannedList.map((e: any) => e.eventUid),
			movements: data.plannedList.map((e: any) => e.plannedOperation.movements[0].id)
		}
	})
	expect(result.amount).toBe('-4000')
	expect(new Set(result.uids).size).toBe(2)
	expect(new Set(result.movements).size).toBe(2)
	await transfer.dispose()
})
