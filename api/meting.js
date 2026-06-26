import {
	createJsonHeaders,
	handleMetingUrl,
} from "../meting-api/src/core.mjs";

function jsonResponse(status, payload) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: createJsonHeaders(status),
	});
}

export default {
	async fetch(request) {
		if (request.method === "OPTIONS") {
			return jsonResponse(204, {});
		}

		if (request.method !== "GET") {
			return jsonResponse(405, { error: "Method not allowed" });
		}

		try {
			const result = await handleMetingUrl(new URL(request.url));
			return jsonResponse(result.status, result.payload);
		} catch (error) {
			console.error(error);
			return jsonResponse(502, {
				error: "Failed to fetch music data",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	},
};
