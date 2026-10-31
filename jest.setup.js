require('@testing-library/jest-dom')

// Use jsdom Storage: key(), length and prototype errors are part of the persistence contract.

// Mock scrollIntoView for jsdom environment
if (!Element.prototype.scrollIntoView) {
	Element.prototype.scrollIntoView = jest.fn()
}

// Mock scrollTo for jsdom environment
if (!window.scrollTo) {
	window.scrollTo = jest.fn()
}
