import { test, expect } from './fixtures'

test.use({ timezoneId: 'Europe/Moscow' })

const interval = (date: string, temperature = 10) => ({
	dt: Date.parse(date) / 1000,
	main: { temp_min: temperature - 5, temp_max: temperature, humidity: 60 },
	clouds: { all: 20 },
	pop: 0.2,
	weather: [{ id: 800 }]
})

for (const failure of ['http', 'network', 'json'] as const) {
	test(`погода: ${failure}, повтор и замена прогноза без дубликатов`, async ({ page }, testInfo) => {
		await page.clock.setFixedTime(new Date('2026-11-01T12:00:00Z'))
		let requests = 0
		await page.route('https://api.openweathermap.org/data/2.5/forecast?**', async route => {
			requests++
			if (requests === 1) {
				if (failure === 'network') return route.abort('failed')
				if (failure === 'http') return route.fulfill({ status: 503, json: { message: 'unavailable' } })
				return route.fulfill({ json: { list: [interval('2026-11-01T18:00:00Z'), { dt: 42 }] } })
			}
			return route.fulfill({
				json: {
					cod: '200',
					list:
						requests === 2
							? [
									interval('2026-11-04T21:00:00Z'),
									interval('2026-11-02T00:00:00Z'),
									interval('2026-11-01T18:00:00Z'),
									interval('2026-11-01T21:00:00Z')
								]
							: [interval('2026-11-01T18:00:00Z', 30)]
				}
			})
		})
		await page.goto('/index.html')
		await page.getByRole('button', { name: 'Создать новый документ', exact: true }).click()
		const weather = (date: string) =>
			page.locator(`[data-testid="calendar-day"][data-date="${date}"] [title^="temperature:"]`)
		await page.getByRole('button', { name: 'Загрузить погоду', exact: true }).click()
		await expect(page.getByRole('alert')).toContainText('Не удалось загрузить погоду. Повторите запрос.')
		await expect(page.getByRole('status').filter({ hasText: 'Загрузка погоды:' })).toHaveCount(0)
		await expect(weather('2026.11.01')).toHaveCount(0)
		if (failure === 'http') await page.screenshot({ path: testInfo.outputPath('weather-error.png'), fullPage: true })
		await page.getByRole('alert').getByRole('button', { name: 'Повторить загрузку погоды' }).click()
		await expect(page.getByRole('alert')).toHaveCount(0)
		await expect(weather('2026.11.01')).toHaveAttribute('title', /temperature: \+10\/\+5[\s\S]*count: 1$/)
		await expect(weather('2026.11.02')).toHaveAttribute('title', /count: 2$/)
		await expect(weather('2026.11.05')).toHaveAttribute('title', /count: 1$/)
		await page.getByRole('button', { name: 'Загрузить погоду', exact: true }).click()
		await expect(weather('2026.11.01')).toHaveAttribute('title', /temperature: \+30\/\+25[\s\S]*count: 1$/)
		await expect(weather('2026.11.02')).toHaveCount(0)
		await expect(weather('2026.11.05')).toHaveCount(0)
		expect(requests).toBe(3)
		if (failure === 'http') await page.screenshot({ path: testInfo.outputPath('weather-reloaded.png'), fullPage: true })
	})
}

test('погода: ожидание запроса видно, повторная команда заблокирована до ответа', async ({ page }) => {
	await page.clock.setFixedTime(new Date('2026-11-01T12:00:00Z'))
	let release!: () => void
	const responseReady = new Promise<void>(resolve => {
		release = resolve
	})
	let requests = 0
	await page.route('https://api.openweathermap.org/data/2.5/forecast?**', async route => {
		requests++
		await responseReady
		await route.fulfill({ json: { list: [interval('2026-11-01T18:00:00Z')] } })
	})
	await page.goto('/index.html')
	await page.getByRole('button', { name: 'Создать новый документ', exact: true }).click()
	const load = page.getByRole('button', { name: 'Загрузить погоду', exact: true })
	try {
		await load.click()
		await expect(page.getByRole('status').filter({ hasText: 'Загрузка погоды:' })).toBeVisible()
		await expect(load).toBeDisabled()
		expect(requests).toBe(1)
	} finally {
		release()
	}
	await expect(load).toBeEnabled()
	await expect(page.getByRole('status').filter({ hasText: 'Загрузка погоды:' })).toHaveCount(0)
	await expect(page.locator('[data-date="2026.11.01"] [title^="temperature:"]')).toBeVisible()
})
