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
