/** Отмена пользователем не является успешной записью документа. */
export class GoogleLoginCancelledError extends Error {
	constructor() {
		super('Вход в Google отменён.')
		this.name = 'GoogleLoginCancelledError'
	}
}
