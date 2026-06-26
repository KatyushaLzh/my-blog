import type { MusicPlayerConfig } from "../types/config";

const defaultMetingApi = import.meta.env.PROD
	? "/api/meting?server=:server&type=:type&id=:id&r=:r"
	: "https://api.injahow.cn/meting/?server=:server&type=:type&id=:id&r=:r";
const configuredMetingApi = import.meta.env.PUBLIC_METING_API;
const isInvalidProductionMetingApi =
	configuredMetingApi?.includes("localhost") ||
	configuredMetingApi?.includes("127.0.0.1");
const shouldUseConfiguredMetingApi =
	configuredMetingApi &&
	(!import.meta.env.PROD || !isInvalidProductionMetingApi);

export const musicPlayerConfig: MusicPlayerConfig = {
	enable: true,
	showFloatingPlayer: true,
	floatingEntryMode: "fab",
	mode: "meting",
	meting_api: shouldUseConfiguredMetingApi
		? configuredMetingApi
		: defaultMetingApi,
	id: "18093458299",
	server: "netease",
	type: "playlist",
};
