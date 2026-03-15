// Custom Jest matchers declarations
declare global {
	namespace jest {
		interface Matchers<R> {
			toBeTrue(): R
			toBeFalse(): R
			toBeNull(): R
			toBeUndefined(): R
		}
	}
}

export {}
