import type { Song } from "./types";

export const STORAGE_KEY_VOLUME = "music-player-volume";

export const DEFAULT_VOLUME = 0.7;

export const LOCAL_PLAYLIST: Song[] = [
	{
		id: 1,
		title: "More One Night",
		artist: "久保ユリカ,水瀬いのり",
		cover: "/favicon/favicon.ico",
		url: "assets/music/url/久保ユリカ,水瀬いのり - More One Night.mp3",
		duration: 0,
	},
	{
		id: 2,
		title: "world.execute (me) ;",
		artist: "Mili",
		cover: "/favicon/favicon.ico",
		url: "assets/music/url/Mili - world.execute (me) ;.mp3",
		duration: 0,
	},
	{
		id: 3,
		title: "world.search (you) ;",
		artist: "Mili",
		cover: "/favicon/favicon.ico",
		url: "assets/music/url/Mili - world.search (you) ;.mp3",
		duration: 0,
	},
	{
		id: 4,
		title: "すろーりーないと (feat. 初音ミク)",
		artist: "MIMI,初音ミク",
		cover: "/favicon/favicon.ico",
		url: "assets/music/url/MIMI,初音ミク - すろーりーないと (feat. 初音ミク).mp3",
		duration: 0,
	},
	{
		id: 5,
		title: "ハナタバ",
		artist: "MIMI,可不",
		cover: "/favicon/favicon.ico",
		url: "assets/music/url/MIMI,可不 - ハナタバ.mp3",
		duration: 0,
	},
	{
		id: 6,
		title: "ミュージック (feat. 可不)",
		artist: "MIMI,可不",
		cover: "/favicon/favicon.ico",
		url: "assets/music/url/MIMI,可不 - ミュージック (feat. 可不).mp3",
		duration: 0,
	},
	{
		id: 7,
		title: "サイエンス (feat. 重音テト)",
		artist: "MIMI,重音テト",
		cover: "/favicon/favicon.ico",
		url: "assets/music/url/MIMI,重音テト - サイエンス (feat. 重音テト).mp3",
		duration: 0,
	},
	{
		id: 8,
		title: "Hands Up to the Sky",
		artist: "SawanoHiroyuki[nZk],Laco",
		cover: "/favicon/favicon.ico",
		url: "assets/music/url/SawanoHiroyuki[nZk],Laco - Hands Up to the Sky.mp3",
		duration: 0,
	},
	{
		id: 9,
		title: "アマデウス",
		artist: "いとうかなこ",
		cover: "/favicon/favicon.ico",
		url: "assets/music/url/いとうかなこ - アマデウス.mp3",
		duration: 0,
	},
	{
		id: 10,
		title: "ファティマ",
		artist: "いとうかなこ",
		cover: "/favicon/favicon.ico",
		url: "assets/music/url/いとうかなこ - ファティマ.mp3",
		duration: 0,
	},
	{
		id: 11,
		title: "熱異常 (feat. 足立レイ)",
		artist: "いよわ,足立レイ",
		cover: "/favicon/favicon.ico",
		url: "assets/music/url/いよわ,足立レイ - 熱異常 (feat. 足立レイ).mp3",
		duration: 0,
	},
];

export const DEFAULT_SONG: Song = {
	title: "Sample Song",
	artist: "Sample Artist",
	cover: "/favicon/favicon.ico",
	url: "",
	duration: 0,
	id: 0,
};

export const DEFAULT_METING_API =
	"https://www.bilibili.uno/api?server=:server&type=:type&id=:id&auth=:auth&r=:r";
export const DEFAULT_METING_ID = "14164869977";
export const DEFAULT_METING_SERVER = "netease";
export const DEFAULT_METING_TYPE = "playlist";

export const ERROR_DISPLAY_DURATION = 3000;
export const SKIP_ERROR_DELAY = 1000;
