export function downloadJson(content: string, name: string): void {
	const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
	const link = document.createElement('a')
	link.href = url
	link.download = name
	link.click()
	setTimeout(() => URL.revokeObjectURL(url), 0)
}
