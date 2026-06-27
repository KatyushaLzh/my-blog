import Key from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";

import {
	DEFAULT_SONG,
	LOCAL_PLAYLIST,
	SKIP_ERROR_DELAY,
	STORAGE_KEY_VOLUME,
} from "@/components/widgets/music-player/constants";
import type { RepeatMode, Song } from "@/components/widgets/music-player/types";
import { musicPlayerConfig } from "@/config";

export interface MusicPlayerState {
	currentSong: Song;
	playlist: Song[];
	currentIndex: number;
	isPlaying: boolean;
	isLoading: boolean;
	currentTime: number;
	duration: number;
	volume: number;
	isMuted: boolean;
	isShuffled: boolean;
	isRepeating: RepeatMode;
	showPlaylist: boolean;
	errorMessage: string;
	showError: boolean;
	isExpanded: boolean;
	isHidden: boolean;
	autoplayFailed: boolean;
	willAutoPlay: boolean;
}

function getAssetPath(path: string): string {
	const normalizedPath = path.trim();
	if (!normalizedPath) {
		return "";
	}
	if (
		normalizedPath.startsWith("http://") ||
		normalizedPath.startsWith("https://")
	) {
		return normalizedPath;
	}
	if (normalizedPath.startsWith("/")) {
		return normalizedPath;
	}
	return `/${normalizedPath}`;
}

function readString(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim()) {
		return value;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	if (Array.isArray(value)) {
		const parts = value
			.map((item) => readString(item))
			.filter((item): item is string => Boolean(item));
		return parts.length > 0 ? parts.join(" / ") : undefined;
	}
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		return (
			readString(record.name) ??
			readString(record.url) ??
			readString(record.picUrl) ??
			readString(record.src)
		);
	}
	return undefined;
}

function readNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

class MusicPlayerStore {
	private audio: HTMLAudioElement | null = null;
	private state: MusicPlayerState;
	private isInitialized = false;
	private unregisterInteraction: (() => void) | undefined;
	private skipErrorTimer: ReturnType<typeof setTimeout> | undefined;
	private failedSongIndexes = new Set<number>();
	private listeners = new Set<(state: MusicPlayerState) => void>();

	constructor() {
		this.state = this.createInitialState();
	}

	private createInitialState(): MusicPlayerState {
		return {
			currentSong: { ...DEFAULT_SONG },
			playlist: [],
			currentIndex: 0,
			isPlaying: false,
			isLoading: false,
			currentTime: 0,
			duration: 0,
			volume: 0.7,
			isMuted: false,
			isShuffled: false,
			isRepeating: 0,
			showPlaylist: false,
			errorMessage: "",
			showError: false,
			isExpanded: false,
			isHidden: false,
			autoplayFailed: false,
			willAutoPlay: false,
		};
	}

	private createSnapshot(): MusicPlayerState {
		return {
			...this.state,
			currentSong: { ...this.state.currentSong },
			playlist: this.state.playlist.map((song) => ({ ...song })),
		};
	}

	getState(): MusicPlayerState {
		return this.createSnapshot();
	}

	getAudio(): HTMLAudioElement | null {
		return this.audio;
	}

	subscribe(listener: (state: MusicPlayerState) => void): () => void {
		this.listeners.add(listener);
		listener(this.createSnapshot());
		return () => {
			this.listeners.delete(listener);
		};
	}

	async initialize(): Promise<void> {
		if (typeof window === "undefined" || this.isInitialized) {
			return;
		}
		this.isInitialized = true;

		if (!musicPlayerConfig.enable) {
			return;
		}

		this.audio = new Audio();
		this.setupAudioListeners();
		this.loadVolumeFromStorage();
		this.registerInteractionHandler();
		await this.loadPlaylist();
	}

	private setupAudioListeners(): void {
		if (!this.audio) {
			return;
		}

		this.audio.volume = this.state.volume;
		this.audio.muted = this.state.isMuted;

		this.audio.addEventListener("play", () => {
			this.state.isPlaying = true;
			this.broadcastState();
		});

		this.audio.addEventListener("pause", () => {
			this.state.isPlaying = false;
			this.broadcastState();
		});

		this.audio.addEventListener("timeupdate", () => {
			if (this.audio) {
				this.state.currentTime = this.audio.currentTime;
				this.broadcastState();
			}
		});

		this.audio.addEventListener("ended", () => {
			this.handleAudioEnded();
		});

		this.audio.addEventListener("error", () => {
			this.handleAudioError();
		});

		this.audio.addEventListener("loadeddata", () => {
			this.handleAudioLoaded();
		});

		this.audio.addEventListener("loadstart", () => {
			this.state.isLoading = true;
			this.broadcastState();
		});
	}

	private handleAudioEnded(): void {
		if (this.state.isRepeating === 1) {
			if (this.audio) {
				this.audio.currentTime = 0;
				this.audio.play().catch(() => {});
			}
		} else {
			this.next(true);
		}
	}

	private handleAudioError(): void {
		this.state.isLoading = false;

		if (!this.state.willAutoPlay && !this.state.isPlaying) {
			this.broadcastState();
			return;
		}

		this.failedSongIndexes.add(this.state.currentIndex);

		if (this.state.playlist.length <= 1) {
			this.showError(i18n(Key.musicPlayerErrorEmpty));
			this.stopAfterPlaybackFailure();
			return;
		}

		if (this.failedSongIndexes.size >= this.state.playlist.length) {
			this.showError(i18n(Key.musicPlayerErrorAllSongs));
			this.stopAfterPlaybackFailure();
			return;
		}

		this.showError(i18n(Key.musicPlayerErrorSong));
		this.clearSkipErrorTimer();
		this.skipErrorTimer = setTimeout(
			() => this.next(true, false),
			SKIP_ERROR_DELAY,
		);
		this.broadcastState();
	}

	private handleAudioLoaded(): void {
		this.state.isLoading = false;
		if (this.audio?.duration && this.audio.duration > 1) {
			this.state.duration = Math.floor(this.audio.duration);
			this.state.currentSong = {
				...this.state.currentSong,
				duration: this.state.duration,
			};
		}

		if (this.state.willAutoPlay && !this.state.isPlaying) {
			this.playCurrentAudio();
		}
		this.broadcastState();
	}

	private playCurrentAudio(): void {
		if (!this.audio) {
			return;
		}
		const playPromise = this.audio.play();
		if (playPromise === undefined) {
			return;
		}
		playPromise.catch((error: unknown) => {
			if (
				typeof DOMException !== "undefined" &&
				error instanceof DOMException &&
				error.name === "NotAllowedError"
			) {
				this.state.autoplayFailed = true;
				this.state.isPlaying = false;
				this.state.willAutoPlay = false;
				this.broadcastState();
			}
		});
	}

	private stopAfterPlaybackFailure(): void {
		this.clearSkipErrorTimer();
		this.state.isPlaying = false;
		this.state.isLoading = false;
		this.state.willAutoPlay = false;
		this.state.autoplayFailed = false;
		if (this.audio) {
			this.audio.pause();
		}
		this.broadcastState();
	}

	private clearSkipErrorTimer(): void {
		if (this.skipErrorTimer) {
			clearTimeout(this.skipErrorTimer);
			this.skipErrorTimer = undefined;
		}
	}

	private loadVolumeFromStorage(): void {
		if (typeof localStorage !== "undefined") {
			const savedVolume = localStorage.getItem(STORAGE_KEY_VOLUME);
			if (savedVolume) {
				const volume = Number.parseFloat(savedVolume);
				if (!Number.isNaN(volume) && volume >= 0 && volume <= 1) {
					this.state.volume = volume;
					this.state.isMuted = volume === 0;
					if (this.audio) {
						this.audio.volume = volume;
						this.audio.muted = this.state.isMuted;
					}
				}
			}
		}
	}

	private registerInteractionHandler(): void {
		const handler = () => {
			if (this.state.autoplayFailed && this.audio) {
				const playPromise = this.audio.play();
				if (playPromise !== undefined) {
					playPromise
						.then(() => {
							this.state.autoplayFailed = false;
						})
						.catch(() => {});
				}
			}
		};
		document.addEventListener("click", handler, { once: true });
		document.addEventListener("keydown", handler, { once: true });
		this.unregisterInteraction = () => {
			document.removeEventListener("click", handler);
			document.removeEventListener("keydown", handler);
		};
	}

	private async loadPlaylist(): Promise<void> {
		const mode = musicPlayerConfig.mode ?? "meting";
		const meting_api =
			musicPlayerConfig.meting_api ??
			"https://www.bilibili.uno/api?server=:server&type=:type&id=:id&auth=:auth&r=:r";
		const meting_id = musicPlayerConfig.id ?? "14164869977";
		const meting_server = musicPlayerConfig.server ?? "netease";
		const meting_type = musicPlayerConfig.type ?? "playlist";

		if (mode === "meting") {
			await this.fetchMetingPlaylist(
				meting_api,
				meting_server,
				meting_type,
				meting_id,
			);
		} else {
			this.loadLocalPlaylist();
		}
	}

	private async fetchMetingPlaylist(
		api: string,
		server: string,
		type: string,
		id: string,
	): Promise<void> {
		if (!api || !id) {
			return;
		}

		this.state.isLoading = true;
		this.broadcastState();

		const apiUrl = api
			.replace(":server", server)
			.replace(":type", type)
			.replace(":id", id)
			.replace(":auth", "")
			.replace(":r", Date.now().toString());

		try {
			const res = await fetch(apiUrl);
			if (!res.ok) {
				throw new Error("meting api error");
			}
			const payload = await res.json();
			const list = Array.isArray(payload)
				? payload
				: Array.isArray(payload?.data)
					? payload.data
					: [];
			this.state.playlist = list
				.map((song: Record<string, unknown>) => this.convertMetingSong(song))
				.filter((song: Song) => Boolean(song.url));
			this.state.isLoading = false;

			if (this.state.playlist.length > 0) {
				this.loadSong(this.state.playlist[0], false);
			} else {
				this.showError(i18n(Key.musicPlayerErrorEmpty));
			}
		} catch (_e) {
			this.showError(i18n(Key.musicPlayerErrorPlaylist));
			this.state.isLoading = false;
		}
		this.broadcastState();
	}

	private convertMetingSong(song: Record<string, unknown>): Song {
		const name = readString(song.name);
		const songTitle = readString(song.title);
		const title = name ?? songTitle ?? i18n(Key.unknownSong);
		const artistField = readString(song.artist);
		const author = readString(song.author);
		const artist = artistField ?? author ?? i18n(Key.unknownArtist);
		let dur =
			readNumber(song.duration) ??
			readNumber(song.dur) ??
			readNumber(song.dt) ??
			readNumber(song.time) ??
			0;
		if (dur > 10000) {
			dur = Math.floor(dur / 1000);
		}
		if (!Number.isFinite(dur) || dur <= 0) {
			dur = 0;
		}

		return {
			id: readNumber(song.id) ?? 0,
			title,
			artist,
			cover:
				readString(song.pic) ??
				readString(song.cover) ??
				readString(song.picUrl) ??
				"",
			url: getAssetPath(
				readString(song.url) ??
					readString(song.src) ??
					readString(song.link) ??
					"",
			),
			duration: dur,
		};
	}

	private loadLocalPlaylist(): void {
		this.state.playlist = LOCAL_PLAYLIST.map((song) => ({
			...song,
			url: getAssetPath(song.url),
		})).filter((song) => Boolean(song.url));
		if (this.state.playlist.length === 0) {
			this.showError("本地播放列表为空");
		} else {
			this.loadSong(this.state.playlist[0], false);
		}
	}

	private loadSong(song: Song, autoPlay = true, resetFailures = false): void {
		if (!song) {
			return;
		}
		const normalizedUrl = getAssetPath(song.url);
		const normalizedSong = { ...song, url: normalizedUrl };
		if (resetFailures) {
			this.failedSongIndexes.clear();
		}
		this.clearSkipErrorTimer();
		this.state.currentSong = normalizedSong;
		this.state.currentTime = 0;
		this.state.duration =
			normalizedSong.duration > 0 ? normalizedSong.duration : 0;
		this.state.isLoading = Boolean(normalizedUrl);
		this.state.autoplayFailed = false;
		this.state.willAutoPlay = autoPlay;
		if (this.audio) {
			if (this.audio.src && normalizedUrl) {
				this.audio.src = "";
			}
			this.audio.src = normalizedUrl;
			if (normalizedUrl) {
				this.audio.load();
				if (autoPlay) {
					this.playCurrentAudio();
				}
			}
		}
		this.broadcastState();
	}

	private showError(message: string): void {
		this.state.errorMessage = message;
		this.state.showError = true;
		setTimeout(() => {
			this.state.showError = false;
			this.broadcastState();
		}, 3000);
		this.broadcastState();
	}

	hideError(): void {
		this.state.showError = false;
		this.broadcastState();
	}

	toggle(): void {
		if (!this.audio || !this.state.currentSong.url) {
			return;
		}
		if (this.state.isPlaying) {
			this.audio.pause();
		} else {
			this.failedSongIndexes.clear();
			this.state.willAutoPlay = true;
			this.playCurrentAudio();
		}
	}

	play(): void {
		if (!this.audio || !this.state.currentSong.url) {
			return;
		}
		this.failedSongIndexes.clear();
		this.state.willAutoPlay = true;
		this.playCurrentAudio();
	}

	pause(): void {
		if (!this.audio) {
			return;
		}
		this.audio.pause();
		this.state.willAutoPlay = false;
	}

	next(autoPlay = true, resetFailures = true): void {
		if (this.state.playlist.length <= 1) {
			return;
		}

		let newIndex: number | undefined;
		if (!resetFailures && this.failedSongIndexes.size > 0) {
			if (this.state.isShuffled) {
				const candidates = this.state.playlist
					.map((_, index) => index)
					.filter((index) => !this.failedSongIndexes.has(index));
				newIndex =
					candidates[Math.floor(Math.random() * candidates.length)];
			} else {
				for (
					let offset = 1;
					offset <= this.state.playlist.length;
					offset += 1
				) {
					const candidate =
						(this.state.currentIndex + offset) % this.state.playlist.length;
					if (!this.failedSongIndexes.has(candidate)) {
						newIndex = candidate;
						break;
					}
				}
			}
		} else if (this.state.isShuffled) {
			do {
				newIndex = Math.floor(Math.random() * this.state.playlist.length);
			} while (
				newIndex === this.state.currentIndex &&
				this.state.playlist.length > 1
			);
		} else {
			newIndex =
				this.state.currentIndex < this.state.playlist.length - 1
					? this.state.currentIndex + 1
					: 0;
		}

		if (newIndex === undefined) {
			this.showError(i18n(Key.musicPlayerErrorAllSongs));
			this.stopAfterPlaybackFailure();
			return;
		}

		this.state.currentIndex = newIndex;
		this.loadSong(this.state.playlist[newIndex], autoPlay, resetFailures);
	}

	prev(): void {
		if (this.state.playlist.length <= 1) {
			return;
		}
		const newIndex =
			this.state.currentIndex > 0
				? this.state.currentIndex - 1
				: this.state.playlist.length - 1;
		this.state.currentIndex = newIndex;
		this.loadSong(this.state.playlist[newIndex], true, true);
	}

	playIndex(index: number): void {
		if (index < 0 || index >= this.state.playlist.length) {
			return;
		}
		this.state.currentIndex = index;
		this.loadSong(this.state.playlist[index], true, true);
	}

	seek(time: number): void {
		if (!this.audio) {
			return;
		}
		if (time >= 0 && time <= this.state.duration) {
			this.audio.currentTime = time;
			this.state.currentTime = time;
			this.broadcastState();
		}
	}

	setVolume(volume: number): void {
		const clampedVolume = Math.max(0, Math.min(1, volume));
		this.state.volume = clampedVolume;
		this.state.isMuted = clampedVolume === 0;
		if (this.audio) {
			this.audio.volume = clampedVolume;
			this.audio.muted = this.state.isMuted;
		}
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(STORAGE_KEY_VOLUME, String(clampedVolume));
		}
		this.broadcastState();
	}

	toggleMute(): void {
		this.state.isMuted = !this.state.isMuted;
		if (this.audio) {
			this.audio.muted = this.state.isMuted;
		}
		this.broadcastState();
	}

	toggleShuffle(): void {
		this.state.isShuffled = !this.state.isShuffled;
		if (this.state.isShuffled) {
			this.state.isRepeating = 0;
		}
		this.broadcastState();
	}

	toggleRepeat(): void {
		this.state.isRepeating = ((this.state.isRepeating + 1) % 3) as RepeatMode;
		if (this.state.isRepeating !== 0) {
			this.state.isShuffled = false;
		}
		this.broadcastState();
	}

	toggleMode(): void {
		if (this.state.isShuffled) {
			this.toggleShuffle();
			return;
		}
		if (this.state.isRepeating === 2) {
			this.toggleRepeat();
			this.toggleShuffle();
			return;
		}
		this.toggleRepeat();
	}

	togglePlaylist(): void {
		this.state.showPlaylist = !this.state.showPlaylist;
		this.broadcastState();
	}

	toggleExpanded(): void {
		this.state.isExpanded = !this.state.isExpanded;
		// 保持与原先 usePlayerState.toggleExpandedUI 一致的联动行为：
		// 展开时强制取消隐藏，并关闭播放列表，避免状态组合异常
		if (this.state.isExpanded) {
			this.state.showPlaylist = false;
			this.state.isHidden = false;
		}
		this.broadcastState();
	}

	toggleHidden(): void {
		this.state.isHidden = !this.state.isHidden;
		// 保持与原先 usePlayerState.toggleHiddenUI 一致的联动行为：
		// 隐藏时收起播放器并关闭播放列表，防止展开 UI 悬挂在小球旁边
		if (this.state.isHidden) {
			this.state.isExpanded = false;
			this.state.showPlaylist = false;
		}
		this.broadcastState();
	}

	canSkip(): boolean {
		return this.state.playlist.length > 1;
	}

	setProgress(percent: number): void {
		if (!this.audio) {
			return;
		}
		const newTime = percent * this.state.duration;
		this.audio.currentTime = newTime;
		this.state.currentTime = newTime;
		this.broadcastState();
	}

	private broadcastState(): void {
		const snapshot = this.createSnapshot();

		for (const listener of this.listeners) {
			listener(snapshot);
		}

		if (typeof window === "undefined") {
			return;
		}
		window.dispatchEvent(
			new CustomEvent("music-sidebar:state", {
				detail: snapshot,
			}),
		);
	}

	destroy(): void {
		this.clearSkipErrorTimer();
		this.failedSongIndexes.clear();
		if (this.unregisterInteraction) {
			this.unregisterInteraction();
		}
		if (this.audio) {
			this.audio.pause();
			this.audio.src = "";
			this.audio = null;
		}
		this.isInitialized = false;
	}
}

export const musicPlayerStore = new MusicPlayerStore();
