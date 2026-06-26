import { createServer } from "node:http";

import { createJsonHeaders, handleMetingUrl } from "./core.mjs";

const PORT = Number.parseInt(process.env.PORT ?? "4010", 10);

function writeJson(res, status, payload) {
	res.writeHead(status, createJsonHeaders(status));
	res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
	if (req.method === "OPTIONS") {
		writeJson(res, 204, {});
		return;
	}

	const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

	if (req.method !== "GET" || url.pathname !== "/api") {
		writeJson(res, 404, { error: "Not found" });
		return;
	}

	try {
		const result = await handleMetingUrl(url);
		writeJson(res, result.status, result.payload);
	} catch (error) {
		console.error(error);
		writeJson(res, 502, {
			error: "Failed to fetch music data",
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

server.listen(PORT, () => {
	console.log(`Meting API listening on http://127.0.0.1:${PORT}/api`);
});
