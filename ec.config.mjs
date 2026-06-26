import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import { defineEcConfig } from "astro-expressive-code";

import { pluginCustomCopyButton } from "./src/plugins/expressive-code/custom-copy-button.js";
import { pluginLanguageBadge } from "./src/plugins/expressive-code/language-badge.js";

export default defineEcConfig({
	themes: ["github-light", "github-dark"],
	plugins: [
		pluginCollapsibleSections(),
		pluginLineNumbers(),
		pluginLanguageBadge(),
		pluginCustomCopyButton(),
	],
	defaultProps: {
		wrap: true,
		overridesByLang: {
			shellsession: { showLineNumbers: false },
			bash: { frame: "code" },
			shell: { frame: "code" },
			sh: { frame: "code" },
			zsh: { frame: "code" },
		},
	},
	styleOverrides: {
		codeBackground: "var(--codeblock-bg)",
		borderRadius: "0.75rem",
		borderColor: "none",
		codeFontSize: "0.875rem",
		codeFontFamily:
			"'MapleMono NF Light', 'JetBrains Mono Variable', SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', 'Microsoft JhengHei', '微軟正黑體', 'Microsoft YaHei', '微软雅黑', 'Noto Sans HK', 'Noto Sans TC', 'Noto Sans JP', 'Noto Sans SC', 'Noto Sans KR', ui-monospace, monospace",
		codeLineHeight: "1.5rem",
		frames: {
			editorBackground: "var(--codeblock-bg)",
			terminalBackground: "var(--codeblock-bg)",
			terminalTitlebarBackground: "var(--codeblock-bg)",
			editorTabBarBackground: "var(--codeblock-bg)",
			editorActiveTabBackground: "none",
			editorActiveTabIndicatorBottomColor: "var(--primary)",
			editorActiveTabIndicatorTopColor: "none",
			editorTabBarBorderBottomColor: "var(--codeblock-bg)",
			terminalTitlebarBorderBottomColor: "none",
		},
		textMarkers: {
			delHue: 0,
			insHue: 180,
			markHue: 250,
		},
	},
	frames: {
		showCopyToClipboardButton: false,
	},
});
