import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'artifacts/pages')
const html = readFileSync(join(root, 'index.html'), 'utf8')
const assets = new Set([...html.matchAll(/(?:href|src|content)="(dist\/[^"?#]+)"/g)].map(match => match[1]))
assets.add('dist/main.js.LICENSE.txt')
const allowed = new Set(['index.html', ...assets])

// Fail on unexpected files, including leftovers from an earlier build. Never copy the repository root.
function inspect(directory) {
	if (!existsSync(directory)) return
	if (lstatSync(directory).isSymbolicLink()) throw new Error(`Symlink in Pages output: ${directory}`)
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name)
		const name = relative(output, path).replaceAll('\\', '/')
		if (entry.isSymbolicLink()) throw new Error(`Symlink in Pages output: ${name}`)
		if (entry.isDirectory()) {
			if (![...allowed].some(asset => asset.startsWith(`${name}/`)))
				throw new Error(`Unexpected Pages directory: ${name}`)
			inspect(path)
		} else if (!allowed.has(name)) throw new Error(`Unexpected Pages file: ${name}`)
	}
}
inspect(output)
for (const asset of assets) {
	if (
		!/^dist\/(main\.(js|css|js\.LICENSE\.txt)|favicons\/stencil\/(web|android|ios|windows)\/icons8-\d+\.png)$/.test(
			asset
		)
	) {
		throw new Error(`Unexpected asset reference: ${asset}`)
	}
	const source = asset.startsWith('dist/main.')
		? join(root, 'artifacts/pages-build', asset.slice('dist/'.length))
		: join(root, asset)
	if (!existsSync(source)) throw new Error(`Missing Pages asset: ${source}`)
	const destination = join(output, asset)
	mkdirSync(dirname(destination), { recursive: true })
	copyFileSync(source, destination)
}
copyFileSync(join(root, 'index.html'), join(output, 'index.html'))
inspect(output)
console.log(`Pages artifact verified: ${allowed.size} files in ${output}`)
