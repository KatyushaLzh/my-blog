const SUPPORTED_SERVERS = new Set([
	"netease",
	"tencent",
	"kugou",
	"baidu",
	"kuwo",
]);
const SUPPORTED_TYPES = new Set([
	"song",
	"playlist",
	"album",
	"artist",
	"search",
]);

const CACHE_TTL_MS = Number.parseInt(
	process.env.METING_CACHE_TTL_MS ?? "600000",
	10,
);
const MAX_TRACKS = Number.parseInt(process.env.METING_MAX_TRACKS ?? "80", 10);
const ENRICH_CONCURRENCY = Number.parseInt(
	process.env.METING_ENRICH_CONCURRENCY ?? "4",
	10,
);
const DEFAULT_BITRATE = Number.parseInt(process.env.METING_BITRATE ?? "320", 10);
const DEFAULT_PIC_SIZE = Number.parseInt(
	process.env.METING_PIC_SIZE ?? "300",
	10,
);

const cache = new Map();

let MetingCtorPromise;

async function getMetingCtor() {
	if (!MetingCtorPromise) {
		MetingCtorPromise = import("@meting/core").then((mod) => mod.default);
	}
	return MetingCtorPromise;
}

function parseJson(value, fallback) {
	if (typeof value !== "string") {
		return value ?? fallback;
	}
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
}

function readString(value) {
	if (typeof value === "string" && value.trim()) {
		return value;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	if (Array.isArray(value)) {
		const parts = value.map(readString).filter(Boolean);
		return parts.length > 0 ? parts.join(" / ") : undefined;
	}
	if (value && typeof value === "object") {
		return (
			readString(value.name) ??
			readString(value.url) ??
			readString(value.picUrl) ??
			readString(value.src)
		);
	}
	return undefined;
}

function readNumber(value) {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function normalizeResourceUrl(value) {
	const raw = readString(value) ?? "";
	if (raw.startsWith("http://")) {
		return `https://${raw.slice("http://".length)}`;
	}
	return raw;
}

function encodeProxyUrl(rawUrl, basePath) {
	if (!rawUrl) return "";
	if (!basePath) return normalizeResourceUrl(rawUrl);
	const encoded = encodeURIComponent(rawUrl);
	return `${basePath}?url=${encoded}`;
}

function normalizeTrack(raw, server) {
	return {
		id: readString(raw.id) ?? "",
		name: readString(raw.name) ?? readString(raw.title) ?? "Unknown Song",
		artist:
			readString(raw.artist) ?? readString(raw.author) ?? "Unknown Artist",
		album: readString(raw.album) ?? "",
		pic_id: readString(raw.pic_id) ?? readString(raw.picId) ?? "",
		url_id:
			readString(raw.url_id) ??
			readString(raw.urlId) ??
			readString(raw.id) ??
			"",
		lyric_id:
			readString(raw.lyric_id) ??
			readString(raw.lyricId) ??
			readString(raw.id) ??
			"",
		pic: normalizeResourceUrl(raw.pic ?? raw.cover ?? raw.picUrl),
		url: normalizeResourceUrl(raw.url ?? raw.src),
		duration:
			readNumber(raw.duration) ??
			readNumber(raw.dur) ??
			readNumber(raw.dt) ??
			0,
		source: readString(raw.source) ?? server,
	};
}

function normalizeTrackList(payload, server) {
	const data = Array.isArray(payload)
		? payload
		: Array.isArray(payload?.data)
			? payload.data
			: payload
				? [payload]
				: [];
	return data.map((track) => normalizeTrack(track, server));
}

function extractResourceUrl(payload) {
	const data = parseJson(payload, payload);
	if (Array.isArray(data)) {
		return extractResourceUrl(data[0]);
	}
	if (typeof data === "string") {
		return normalizeResourceUrl(data);
	}
	if (data && typeof data === "object") {
		return normalizeResourceUrl(
			data.url ?? data.pic ?? data.src ?? data.data,
		);
	}
	return "";
}

async function mapWithConcurrency(items, limit, mapper) {
	const results = new Array(items.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await mapper(items[index], index);
		}
	}

	const workers = Array.from(
		{ length: Math.max(1, Math.min(limit, items.length)) },
		worker,
	);
	await Promise.all(workers);
	return results;
}

async function loadTracks(meting, server, type, id, limit) {
	if (type === "song") {
		return normalizeTrackList(parseJson(await meting.song(id), []), server);
	}
	if (type === "album") {
		return normalizeTrackList(parseJson(await meting.album(id), []), server);
	}
	if (type === "artist") {
		return normalizeTrackList(
			parseJson(await meting.artist(id, limit), []),
			server,
		);
	}
	if (type === "search") {
		return normalizeTrackList(
			parseJson(await meting.search(id, { page: 1, limit }), []),
			server,
		);
	}
	return normalizeTrackList(parseJson(await meting.playlist(id), []), server);
}

async function enrichTrack(meting, track, bitrate, picSize) {
	const [url, pic] = await Promise.all([
		track.url
			? Promise.resolve(track.url)
			: meting
					.url(track.url_id || track.id, bitrate)
					.then(extractResourceUrl)
					.catch(() => ""),
		track.pic
			? Promise.resolve(track.pic)
			: track.pic_id
				? meting
						.pic(track.pic_id, picSize)
						.then(extractResourceUrl)
						.catch(() => "")
				: Promise.resolve(""),
	]);

	return {
		id: track.id,
		name: track.name,
		title: track.name,
		artist: track.artist,
		author: track.artist,
		album: track.album,
		pic: normalizeResourceUrl(pic),
		url: normalizeResourceUrl(url),
		duration: track.duration,
		source: track.source,
	};
}

export async function handleMetingUrl(url) {
	const server = url.searchParams.get("server") ?? "netease";
	const type = url.searchParams.get("type") ?? "playlist";
	const id = url.searchParams.get("id") ?? "";
	const bitrate = Number.parseInt(
		url.searchParams.get("bitrate") ?? String(DEFAULT_BITRATE),
		10,
	);
	const picSize = Number.parseInt(
		url.searchParams.get("pic_size") ?? String(DEFAULT_PIC_SIZE),
		10,
	);
	const onlyPlayable = url.searchParams.get("only_playable") === "true";
	const proxyEnabled = url.searchParams.get("proxy") === "true";
	const proxyBase = proxyEnabled
		? `${url.pathname}?server=proxy&type=audio`
		: "";
	const limit = Math.max(
		1,
		Math.min(
			Number.parseInt(url.searchParams.get("limit") ?? String(MAX_TRACKS), 10),
			MAX_TRACKS,
		),
	);

	if (!SUPPORTED_SERVERS.has(server)) {
		return { status: 400, payload: { error: `Unsupported server: ${server}` } };
	}
	if (!SUPPORTED_TYPES.has(type)) {
		return { status: 400, payload: { error: `Unsupported type: ${type}` } };
	}
	if (!id) {
		return { status: 400, payload: { error: "Missing id" } };
	}

	const cacheKey = `${server}:${type}:${id}:${bitrate}:${picSize}:${limit}:${onlyPlayable}:${proxyEnabled}`;
	const cached = cache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) {
		return { status: 200, payload: cached.payload };
	}

	const Meting = await getMetingCtor();
	const meting = new Meting(server);
	meting.format(true);

	const tracks = (await loadTracks(meting, server, type, id, limit)).slice(
		0,
		limit,
	);
	const enriched = await mapWithConcurrency(
		tracks,
		ENRICH_CONCURRENCY,
		(track) => enrichTrack(meting, track, bitrate, picSize),
	);
	const filtered = onlyPlayable
		? enriched.filter((track) => Boolean(track.url))
		: enriched;
	const payload = proxyEnabled
		? filtered.map((track) => ({
				...track,
				url: encodeProxyUrl(track.url, proxyBase),
			}))
		: filtered;

	cache.set(cacheKey, {
		expiresAt: Date.now() + CACHE_TTL_MS,
		payload,
	});

	return { status: 200, payload };
}

export function createJsonHeaders(status) {
	return {
		"Content-Type": "application/json; charset=utf-8",
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Cache-Control": status === 200 ? "s-maxage=300, stale-while-revalidate=300" : "no-store",
	};
}
