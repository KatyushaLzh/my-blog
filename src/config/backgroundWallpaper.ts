import type { FullscreenWallpaperConfig } from "../types/config";

const desktopBannerImages = [
	"/assets/desktop-banner/03.webp",
	"/assets/desktop-banner/wallhaven-e8wj18_2560x960.webp",
	"/assets/desktop-banner/wallhaven-l8dewr_2560x960.webp",
	"/assets/desktop-banner/wallhaven-o3ezl9_2560x960.webp",
	"/assets/desktop-banner/wallhaven-qddpp5_2560x960.webp",
	"/assets/desktop-banner/wallhaven-vm6378_2560x960.webp",
	"/assets/desktop-banner/wallhaven-yqvp1x_2560x960.webp",
];

export const fullscreenWallpaperConfig: FullscreenWallpaperConfig = {
	enable: true,
	src: {
		desktop: desktopBannerImages,
		mobile: desktopBannerImages,
	},
	position: "center",
	carousel: {
		enable: true,
		interval: 5,
	},
	zIndex: -1,
	opacity: 0.8,
	blur: 1,
	switchable: true,
	overlay: {
		opacity: 0.8, // 壁纸不透明度，0-1
		blur: 1.5, // 背景模糊半径（px）
		cardOpacity: 0.8, // 卡片不透明度，0-1
		switchable: {
			opacity: true,
			blur: true,
			cardOpacity: true,
		},
	},
	fullscreen: {
		switchable: {
			opacity: true,
			blur: true,
		},
	},
};
