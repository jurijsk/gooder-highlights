/**
 * ids.ts: a highlight's id (`h…`) and a custom colour's (`p…`): the prefix, the time in milliseconds and four random characters, in base 36. They sort by when they were made; the random part
 * keeps apart two made in the same millisecond (two people, two views, several added at once).
 */
export function newId(prefix: 'h' | 'p', now: number = Date.now(), random: () => number = Math.random): string {
	let tail = '';
	for (let i = 0; i < 4; i += 1) {
		tail += Math.floor(random() * 36).toString(36);
	}
	return `${prefix}${now.toString(36)}${tail}`;
}
