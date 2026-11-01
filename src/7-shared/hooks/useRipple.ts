import React from 'react'

/** Таймеры и DOM-узлы эффекта принадлежат экземпляру элемента. */
export function useRipple(styles: { ripple: string; clicked: string }) {
	const timers = React.useRef(new Set<ReturnType<typeof setTimeout>>())
	const circles = React.useRef(new Set<HTMLSpanElement>())
	React.useEffect(() => {
		const pending = timers.current
		const nodes = circles.current
		return () => {
			pending.forEach(clearTimeout)
			pending.clear()
			nodes.forEach(node => node.remove())
			nodes.clear()
		}
	}, [])
	const finish = () => {
		circles.current.forEach(circle => {
			if (!circle.classList.contains(styles.clicked)) return
			circle.classList.remove(styles.clicked)
			const timer = setTimeout(() => {
				circle.remove()
				circles.current.delete(circle)
				timers.current.delete(timer)
			}, 500)
			timers.current.add(timer)
		})
	}
	return {
		onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
			if (!event.isPrimary || event.defaultPrevented || event.currentTarget.matches(':disabled')) return
			finish()
			const element = event.currentTarget
			const rect = element.getBoundingClientRect()
			const circle = document.createElement('span')
			const radius = Math.ceil(Math.hypot(element.clientWidth, element.clientHeight))
			circle.style.width = circle.style.height = `${2 * radius}px`
			circle.style.left = `${event.clientX - rect.left - radius}px`
			circle.style.top = `${event.clientY - rect.top - radius}px`
			circle.classList.add(styles.ripple, styles.clicked)
			circle.setAttribute('aria-hidden', 'true')
			circles.current.add(circle)
			element.appendChild(circle)
		},
		onPointerUp: finish,
		onPointerLeave: finish,
		onPointerCancel: finish
	}
}
