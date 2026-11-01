import { posix } from 'node:path'

const severities = ['info', 'low', 'moderate', 'high', 'critical']
const scopes = ['full', 'production']
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const requireValue = (condition, message) => {
	if (!condition) throw new Error(message)
}
const isText = value => typeof value === 'string' && value.trim().length > 0
const isDate = value =>
	typeof value === 'string' &&
	/^\d{4}-\d{2}-\d{2}$/.test(value) &&
	Number.isFinite(Date.parse(value)) &&
	new Date(value).toISOString().slice(0, 10) === value
const isPackagePath = value =>
	isText(value) &&
	value.startsWith('node_modules/') &&
	posix.normalize(value) === value &&
	!value.includes('\\') &&
	!value.includes('..') &&
	!/[*?\s]/.test(value)
const identity = value =>
	JSON.stringify([value.scope, value.package, value.advisory, value.path, value.version, value.severity])

export function validatePolicy(policy, today = new Date().toISOString().slice(0, 10)) {
	requireValue(isDate(today), 'Invalid audit policy date')
	requireValue(
		isRecord(policy) && policy.schemaVersion === 1 && Array.isArray(policy.exceptions),
		'Invalid audit policy schema'
	)
	const keys = new Set()
	for (const entry of policy.exceptions) {
		requireValue(isRecord(entry) && scopes.includes(entry.scope), 'Exception needs an exact audit scope')
		requireValue(
			isText(entry.package) && /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(entry.package),
			'Exception needs an exact package'
		)
		requireValue(
			typeof entry.advisory === 'string' && /^(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|npm:\d+)$/.test(entry.advisory),
			'Exception needs an advisory ID'
		)
		requireValue(
			isPackagePath(entry.path) && entry.path.endsWith('/' + entry.package),
			'Exception needs an exact installed package path'
		)
		requireValue(
			isText(entry.version) && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(entry.version),
			'Exception needs an exact version'
		)
		requireValue(['high', 'critical'].includes(entry.severity), 'Exception severity must be high or critical')
		requireValue(isText(entry.owner) && isText(entry.reason), 'Exception needs an owner and reason')
		requireValue(isDate(entry.expiresOn) && today < entry.expiresOn, 'Expired or invalid audit exception')
		const key = identity(entry)
		requireValue(!keys.has(key), 'Duplicate audit exception')
		keys.add(key)
	}
	return policy.exceptions
}

function advisoryIdentity(advisory) {
	requireValue(
		isRecord(advisory) &&
			Number.isSafeInteger(advisory.source) &&
			advisory.source > 0 &&
			isText(advisory.name) &&
			isText(advisory.url) &&
			severities.includes(advisory.severity),
		'Invalid advisory entry'
	)
	requireValue(URL.canParse(advisory.url) && new URL(advisory.url).protocol === 'https:', 'Invalid advisory URL')
	const match = /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})$/.exec(advisory.url)
	return match?.[1] ?? 'npm:' + advisory.source
}

/** Validate the complete report before deciding whether its findings are allowed. */
export function inspectAudit(report, lock, scope) {
	requireValue(scopes.includes(scope), 'Invalid audit scope')
	requireValue(
		isRecord(report) &&
			!report.error &&
			report.auditReportVersion === 2 &&
			isRecord(report.vulnerabilities) &&
			isRecord(report.metadata?.vulnerabilities),
		'Missing or invalid npm audit report'
	)
	requireValue(isRecord(lock?.packages) && lock.lockfileVersion >= 2, 'Missing package-lock package versions')
	const vulnerabilities = report.vulnerabilities
	const counts = Object.fromEntries(severities.map(severity => [severity, 0]))
	for (const [name, entry] of Object.entries(vulnerabilities)) {
		requireValue(
			isRecord(entry) &&
				entry.name === name &&
				severities.includes(entry.severity) &&
				Array.isArray(entry.via) &&
				entry.via.length > 0 &&
				Array.isArray(entry.nodes) &&
				entry.nodes.length > 0,
			'Invalid vulnerability: ' + name
		)
		counts[entry.severity]++
		for (const via of entry.via) {
			if (typeof via === 'string') requireValue(Object.hasOwn(vulnerabilities, via), 'Unresolved vulnerability: ' + via)
			else advisoryIdentity(via)
		}
		for (const path of entry.nodes) {
			requireValue(isPackagePath(path) && isText(lock.packages[path]?.version), 'Missing installed version: ' + path)
		}
	}
	counts.total = Object.keys(vulnerabilities).length
	for (const [severity, count] of Object.entries(counts)) {
		requireValue(report.metadata.vulnerabilities[severity] === count, 'Inconsistent audit counts: ' + severity)
	}
	function sources(name) {
		const pending = [name],
			visited = new Set(),
			causes = new Map()
		while (pending.length) {
			const current = pending.pop()
			if (visited.has(current)) continue
			visited.add(current)
			for (const via of vulnerabilities[current].via) {
				if (typeof via === 'string') pending.push(via)
				else causes.set(JSON.stringify([advisoryIdentity(via), via.name, via.severity]), via)
			}
		}
		return [...causes.values()]
	}
	const findings = new Map()
	for (const [name, entry] of Object.entries(vulnerabilities)) {
		const causes = sources(name)
		requireValue(causes.length > 0, 'No advisory behind vulnerability: ' + name)
		for (const cause of causes) {
			const severity = severities[Math.max(severities.indexOf(entry.severity), severities.indexOf(cause.severity))]
			for (const path of entry.nodes) {
				const finding = {
					scope,
					package: name,
					advisory: advisoryIdentity(cause),
					path,
					version: lock.packages[path].version,
					severity,
					sourcePackage: cause.name,
					sourceSeverity: cause.severity,
					url: cause.url
				}
				findings.set(identity(finding), finding)
			}
		}
	}
	return { counts, findings: [...findings.values()].sort((a, b) => identity(a).localeCompare(identity(b))) }
}

/** Exact exceptions cannot hide a different advisory, version, location, or severity. */
export function evaluateAudit(inspection, exceptions) {
	const allowed = new Map(exceptions.map(entry => [identity(entry), entry]))
	const blocked = [],
		accepted = []
	for (const finding of inspection.findings) {
		if (!['high', 'critical'].includes(finding.severity)) continue
		const exception = allowed.get(identity(finding))
		if (exception) accepted.push({ ...finding, exception })
		else blocked.push(finding)
	}
	return { status: blocked.length ? 'blocked' : 'passed', ...inspection, blocked, accepted }
}
