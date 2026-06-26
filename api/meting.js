import {
	createJsonHeaders,
	handleMetingUrl,
} from "../meting-api/src/core.mjs";

function writeJson(response, status, payload) {
	const headers = createJsonHeaders(status);
	for (const [key, value] of Object.entries(headers)) {
		response.setHeader(key, value);
	}
	response.status(status).send(JSON.stringify(payload));
}

function getReferer(url) {
	if (!url) return "";
	const hostname = new URL(url).hostname;
	if (hostname.includes("music.163.com") || hostname.includes("126.net")) {
		return "https://music.163.com/";
	}
	if (hostname.includes("qq.com") || hostname.includes("qpic.cn")) {
		return "https://y.qq.com/";
	}
	if (hostname.includes("kugou.com")) {
		return "https://www.kugou.com/";
	}
	return "";
}

export default async function handler(request, response) {
	if (request.method === "OPTIONS") {
		writeJson(response, 204, {});
		return;
	}

	if (request.method !== "GET") {
		writeJson(response, 405, { error: "Method not allowed" });
		return;
	}

	const host = request.headers.host ?? "localhost";
	const url = new URL(request.url ?? "/", `https://${host}`);

	const server = url.searchParams.get("server") ?? "";
	const type = url.searchParams.get("type") ?? "";

	if (server === "proxy" && type === "audio") {
		const targetUrl = url.searchParams.get("url") ?? "";
		if (!targetUrl) {
			writeJson(response, 400, { error: "Missing url parameter" });
			return;
		}

		try {
			const decoded = decodeURIComponent(targetUrl);
			const referer = getReferer(decoded);
			const headers = {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
			};
			if (referer) {
				headers.Referer = referer;
			}

			const upstream = await fetch(decoded, {
				headers,
				redirect: "follow",
			});

			if (!upstream.ok) {
				response.status(upstream.status).send("Upstream fetch failed");
				return;
			}

			const contentType =
				upstream.headers.get("content-type") ?? "audio/mpeg";
			const contentLength = upstream.headers.get("content-length");
			const cacheControl = upstream.headers.get("cache-control") ?? "public, max-age=3600";

			response.setHeader("Content-Type", contentType);
			response.setHeader("Cache-Control", cacheControl);
			response.setHeader("Accept-Ranges", "bytes");
			if (contentLength) {
				response.setHeader("Content-Length", contentLength);
			}

			const arrayBuffer = await upstream.arrayBuffer();
			response.status(200).send(Buffer.from(arrayBuffer));
		} catch (error) {
			console.error("Audio proxy error:", error);
			writeJson(response, 502, {
				error: "Failed to proxy audio",
				message: error instanceof Error ? error.message : String(error),
			});
		}
		return;
	}

	try {
		const result = await handleMetingUrl(url);
		writeJson(response, result.status, result.payload);
	} catch (error) {
		console.error(error);
		writeJson(response, 502, {
			error: "Failed to fetch music data",
			message: error instanceof Error ? error.message : String(error),
		});
	}
}
