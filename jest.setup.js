require('@testing-library/jest-dom')

// jsdom has no modal top layer. Real focus containment/inert/Escape are tested in Chromium.
HTMLDialogElement.prototype.showModal = function () {
	this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function () {
	this.removeAttribute('open')
}

// Use jsdom Storage: key(), length and prototype errors are part of the persistence contract.

// Mock scrollIntoView for jsdom environment
if (!Element.prototype.scrollIntoView) {
	Element.prototype.scrollIntoView = jest.fn()
}

// Mock scrollTo for jsdom environment
if (!window.scrollTo) {
	window.scrollTo = jest.fn()
}
