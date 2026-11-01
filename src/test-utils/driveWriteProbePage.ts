import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { verifyDriveConditionalWrite } from './DriveWriteLiveProbe'

const api = new GoogleApiService()
const login = document.querySelector<HTMLButtonElement>('#login')!
const run = document.querySelector<HTMLButtonElement>('#run')!
const result = document.querySelector<HTMLPreElement>('#result')!
api.initGapi()
void api.waitForGapiReady().then(
	() => {
		login.disabled = false
		result.textContent = 'Google API готов. Войдите в тот же аккаунт, который используете в Projector.'
	},
	() => {
		result.textContent = 'Google API недоступен. Проверьте подключение и настройки OAuth для этого адреса.'
	}
)
login.onclick = async () => {
	try {
		await api.logIn()
		run.disabled = !api.isGoogleLoggedIn
		result.textContent = 'Вход выполнен. Можно запустить проверку.'
	} catch {
		result.textContent = 'Вход не завершён. Можно повторить.'
	}
}
run.onclick = async () => {
	run.disabled = true
	login.disabled = true
	result.textContent = 'Проверка выполняется на новых тестовых файлах…'
	try {
		const report = await verifyDriveConditionalWrite(api)
		result.textContent =
			(report.passed ? 'Проверка пройдена.\n' : 'Проверка НЕ пройдена.\n') + JSON.stringify(report, null, 2)
		const response = await fetch('/result', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(report)
		})
		if (!response.ok) result.textContent += '\nНе удалось сохранить отчёт на диск. Скопируйте показанный JSON.'
	} catch {
		result.textContent += '\nПроверка прервана. Запустите повторно и проверьте наличие тестовых файлов в Drive.'
	} finally {
		run.disabled = false
		login.disabled = false
	}
}
