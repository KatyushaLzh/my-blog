interface TerminalDirectory {
	type: "directory";
	name: string;
	path: string;
	url: string;
	children: TerminalEntry[];
}

interface TerminalFile {
	type: "file";
	name: string;
	path: string;
	fileType: "post" | "code";
	label: string;
	url: string;
	meta: string[];
}

type TerminalEntry = TerminalDirectory | TerminalFile;

interface TerminalOutputEntry {
	cwd: string;
	time: string;
	command: string;
	lines: string[];
}

interface TerminalState {
	cwd: string;
	output: TerminalOutputEntry[];
	history: string[];
}

interface TerminalElements {
	root: HTMLElement;
	output: HTMLElement;
	input: HTMLInputElement;
	cwd: HTMLElement;
	time: HTMLElement;
	fs: TerminalDirectory;
	initialPath: string;
}

const STORAGE_KEY = "mizuki:blog-terminal:v1";
const INTRO_STORAGE_KEY = "mizuki:blog-terminal:intro-seen";
const SCROLL_STORAGE_KEY = "mizuki:blog-terminal:preserved-scroll-y";
const COMMANDS = ["ls", "cd", "pwd", "cat", "clear"];
const MAX_OUTPUT = 80;
const MAX_HISTORY = 100;
const INTRO_LINES = [
	"Mizuki shell ready. Commands: ls, pwd, cat, cd, clear. Use Tab for completion and ArrowUp/ArrowDown for history.",
];

function formatTime(date = new Date()): string {
	return `${String(date.getHours()).padStart(2, "0")}:${String(
		date.getMinutes(),
	).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function displayPath(path: string): string {
	return path;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function readState(initialPath: string): TerminalState {
	const shouldShowIntro = localStorage.getItem(INTRO_STORAGE_KEY) !== "true";
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<TerminalState>;
			const output = Array.isArray(parsed.output) ? parsed.output : [];
			if (shouldShowIntro) {
				localStorage.setItem(INTRO_STORAGE_KEY, "true");
				output.unshift({
					cwd: parsed.cwd || initialPath,
					time: formatTime(),
					command: "",
					lines: INTRO_LINES,
				});
			}
			return {
				cwd: parsed.cwd || initialPath,
				output,
				history: Array.isArray(parsed.history) ? parsed.history : [],
			};
		}
	} catch {
		// Ignore corrupt session state and rebuild a clean terminal state.
	}

	localStorage.setItem(INTRO_STORAGE_KEY, "true");
	return {
		cwd: initialPath,
		output: [
			{
				cwd: initialPath,
				time: formatTime(),
				command: "",
				lines: INTRO_LINES,
			},
		],
		history: [],
	};
}

function writeState(state: TerminalState): void {
	sessionStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({
			...state,
			output: state.output.slice(-MAX_OUTPUT),
			history: state.history.slice(-MAX_HISTORY),
		}),
	);
}

function normalizeAbsolutePath(path: string): string {
	const parts: string[] = [];
	for (const part of path.split("/")) {
		if (!part || part === ".") {
			continue;
		}
		if (part === "..") {
			parts.pop();
			continue;
		}
		parts.push(part);
	}
	return parts.length > 0 ? `/${parts.join("/")}` : "/";
}

function resolvePath(cwd: string, target = "."): string {
	if (!target || target === ".") {
		return cwd;
	}
	if (target === "~") {
		return "/";
	}
	if (target.startsWith("~/")) {
		return normalizeAbsolutePath(`/${target.slice(2)}`);
	}
	if (target.startsWith("/")) {
		return normalizeAbsolutePath(target);
	}
	return normalizeAbsolutePath(`${cwd}/${target}`);
}

function findEntry(root: TerminalDirectory, path: string): TerminalEntry | null {
	const normalized = normalizeAbsolutePath(path);
	if (normalized === "/") {
		return root;
	}

	let current: TerminalEntry = root;
	for (const segment of normalized.slice(1).split("/")) {
		if (current.type !== "directory") {
			return null;
		}
		const next: TerminalEntry | undefined = current.children.find(
			(child) => child.name.toLowerCase() === segment.toLowerCase(),
		);
		if (!next) {
			return null;
		}
		current = next;
	}
	return current;
}

function canonicalPath(root: TerminalDirectory, path: string): string | null {
	const entry = findEntry(root, path);
	return entry ? entry.path : null;
}

function hasUnsupportedSyntax(input: string): boolean {
	return /[|<>]/.test(input);
}

function hasOption(args: string[]): string | null {
	return args.find((arg) => arg.startsWith("-")) || null;
}

function listDirectory(directory: TerminalDirectory): string[] {
	if (directory.children.length === 0) {
		return ["."];
	}

	return [
		directory.children
			.map((child) => (child.type === "directory" ? `${child.name}/` : child.name))
			.join("  "),
	];
}

function renderOutputLine(line: string): string {
	return line
		.split(/(\s+)/)
		.map((part) => {
			if (/^\s+$/.test(part)) {
				return part;
			}
			const escaped = escapeHtml(part);
			if (part.endsWith("/") && part.length > 1) {
				return `<span class="blog-terminal-dir">${escaped}</span>`;
			}
			return escaped;
		})
		.join("");
}

function render(elements: TerminalElements, state: TerminalState): void {
	elements.cwd.textContent = displayPath(state.cwd);
	elements.time.textContent = formatTime();
	elements.output.innerHTML = state.output
		.map((entry) => {
			const lines = entry.lines
				.map(
					(line) =>
						`<div class="blog-terminal-line">${renderOutputLine(line)}</div>`,
				)
				.join("");
			return `<div class="blog-terminal-history mb-3">
				<div class="blog-terminal-powerline">
					<div class="blog-terminal-left">
						<span class="terminal-segment terminal-segment-user">
							<span class="terminal-segment-icon terminal-glyph">●</span>
							<span>katyusha</span>
						</span>
						<span class="terminal-segment terminal-segment-host">
							<span class="terminal-segment-icon terminal-glyph">▱</span>
							<span>Katyusha-PC</span>
						</span>
						<span class="terminal-segment terminal-segment-path">
							<span class="terminal-segment-icon terminal-glyph">▰</span>
							<span class="terminal-path-text">${escapeHtml(displayPath(entry.cwd))}</span>
						</span>
					</div>
					<div class="blog-terminal-right">
						<span class="terminal-segment terminal-segment-time">
							<span>${escapeHtml(entry.time)}</span>
							<span class="terminal-segment-icon terminal-glyph">◴</span>
						</span>
					</div>
				</div>
				${entry.command ? `<div class="flex items-start gap-2">
					<span class="text-green-500 font-bold shrink-0">&gt;</span>
					<span class="whitespace-pre-wrap break-words">${escapeHtml(entry.command)}</span>
				</div>` : ""}
				<div class="blog-terminal-result">${lines}</div>
			</div>`;
		})
		.join("");
	elements.output.scrollTop = elements.output.scrollHeight;
}

function focusTerminalInput(input: HTMLInputElement): void {
	requestAnimationFrame(() => {
		input.focus({ preventScroll: true });
		window.setTimeout(() => input.focus({ preventScroll: true }), 60);
	});
}

function pushOutput(
	state: TerminalState,
	command: string,
	lines: string[],
	cwd = state.cwd,
): void {
	state.output.push({
		cwd,
		time: formatTime(),
		command,
		lines,
	});
	state.output = state.output.slice(-MAX_OUTPUT);
}

function preserveCurrentScroll(): void {
	sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
}

function restorePreservedScroll(): void {
	const raw = sessionStorage.getItem(SCROLL_STORAGE_KEY);
	if (raw === null) {
		return;
	}
	sessionStorage.removeItem(SCROLL_STORAGE_KEY);

	const scrollY = Number(raw);
	if (!Number.isFinite(scrollY)) {
		return;
	}

	requestAnimationFrame(() => {
		window.scrollTo({ top: scrollY, left: window.scrollX, behavior: "auto" });
		window.setTimeout(() => {
			window.scrollTo({ top: scrollY, left: window.scrollX, behavior: "auto" });
		}, 80);
	});
}

function navigateTo(url: string, preserveScroll = false): void {
	if (preserveScroll) {
		preserveCurrentScroll();
	}
	if (window.swup?.navigate) {
		window.swup.navigate(url);
		return;
	}
	window.location.href = url;
}

function executeCommand(
	elements: TerminalElements,
	state: TerminalState,
	commandText: string,
): void {
	const trimmed = commandText.trim();
	if (!trimmed) {
		return;
	}

	const commandCwd = state.cwd;
	if (hasUnsupportedSyntax(trimmed)) {
		pushOutput(state, trimmed, [
			"zsh: unsupported syntax: pipes and redirects are not available",
		], commandCwd);
		return;
	}

	const [command, ...args] = trimmed.split(/\s+/);
	const option = hasOption(args);
	if (option) {
		pushOutput(
			state,
			trimmed,
			[`${command}: options are not supported: ${option}`],
			commandCwd,
		);
		return;
	}

	switch (command) {
		case "pwd": {
			if (args.length > 0) {
				pushOutput(state, trimmed, ["pwd: too many arguments"], commandCwd);
				return;
			}
			pushOutput(state, trimmed, [state.cwd], commandCwd);
			return;
		}
		case "ls": {
			const targetPath = resolvePath(state.cwd, args[0] || ".");
			const entry = findEntry(elements.fs, targetPath);
			if (!entry) {
				pushOutput(state, trimmed, [`ls: no such file or directory: ${args[0]}`], commandCwd);
				return;
			}
			pushOutput(
				state,
				trimmed,
				entry.type === "directory" ? listDirectory(entry) : [entry.name],
				commandCwd,
			);
			return;
		}
		case "cd": {
			if (args.length > 1) {
				pushOutput(state, trimmed, ["cd: too many arguments"], commandCwd);
				return;
			}
			const targetPath = resolvePath(state.cwd, args[0] || "/");
			const entry = findEntry(elements.fs, targetPath);
			if (!entry) {
				pushOutput(state, trimmed, [`cd: no such file or directory: ${args[0]}`], commandCwd);
				return;
			}
			if (entry.type !== "directory") {
				pushOutput(state, trimmed, [`cd: not a directory: ${args[0]}`], commandCwd);
				return;
			}
			state.cwd = entry.path;
			pushOutput(state, trimmed, [], commandCwd);
			writeState(state);
			render(elements, state);
			window.setTimeout(() => navigateTo(entry.url, true), 80);
			return;
		}
		case "cat": {
			if (args.length === 0) {
				pushOutput(state, trimmed, ["cat: missing file operand"], commandCwd);
				return;
			}
			if (args.length > 1) {
				pushOutput(state, trimmed, ["cat: too many arguments"], commandCwd);
				return;
			}
			const targetPath = resolvePath(state.cwd, args[0]);
			const entry = findEntry(elements.fs, targetPath);
			if (!entry) {
				pushOutput(state, trimmed, [`cat: no such file or directory: ${args[0]}`], commandCwd);
				return;
			}
			if (entry.type !== "file") {
				pushOutput(state, trimmed, [`cat: ${args[0]}: Is a directory`], commandCwd);
				return;
			}
			pushOutput(state, trimmed, entry.meta, commandCwd);
			writeState(state);
			render(elements, state);
			window.setTimeout(() => navigateTo(entry.url, true), 160);
			return;
		}
		case "clear": {
			if (args.length > 0) {
				pushOutput(state, trimmed, ["clear: too many arguments"], commandCwd);
				return;
			}
			state.output = [];
			return;
		}
		default:
			pushOutput(state, trimmed, [`zsh: command not found: ${command}`], commandCwd);
	}
}

function commonPrefix(values: string[]): string {
	if (values.length === 0) {
		return "";
	}
	let prefix = values[0];
	for (const value of values.slice(1)) {
		while (!value.toLowerCase().startsWith(prefix.toLowerCase())) {
			prefix = prefix.slice(0, -1);
			if (!prefix) {
				return "";
			}
		}
	}
	return prefix;
}

function replaceInputToken(
	input: HTMLInputElement,
	tokenStart: number,
	tokenEnd: number,
	replacement: string,
): void {
	const value = input.value;
	input.value = `${value.slice(0, tokenStart)}${replacement}${value.slice(tokenEnd)}`;
	const caret = tokenStart + replacement.length;
	input.setSelectionRange(caret, caret);
}

function completePath(
	elements: TerminalElements,
	state: TerminalState,
	command: string,
	token: string,
): { replacement?: string; candidates?: string[] } {
	const slashIndex = token.lastIndexOf("/");
	const baseToken = slashIndex >= 0 ? token.slice(0, slashIndex + 1) : "";
	const prefix = slashIndex >= 0 ? token.slice(slashIndex + 1) : token;
	const basePath = slashIndex >= 0 ? resolvePath(state.cwd, baseToken || "/") : state.cwd;
	const baseEntry = findEntry(elements.fs, basePath);

	if (!baseEntry || baseEntry.type !== "directory") {
		return {};
	}

	const allowFiles = command !== "cd";
	const allowDirectories = command !== "cat";
	const candidates = baseEntry.children
		.filter((entry) => {
			if (entry.type === "directory" && !allowDirectories) {
				return false;
			}
			if (entry.type === "file" && !allowFiles) {
				return false;
			}
			return entry.name.toLowerCase().startsWith(prefix.toLowerCase());
		})
		.map((entry) => (entry.type === "directory" ? `${entry.name}/` : entry.name));

	if (candidates.length === 0) {
		return {};
	}
	if (candidates.length === 1) {
		return { replacement: `${baseToken}${candidates[0]}` };
	}

	const shared = commonPrefix(candidates);
	if (shared.length > prefix.length) {
		return { replacement: `${baseToken}${shared}` };
	}
	return { candidates };
}

function handleTab(
	elements: TerminalElements,
	state: TerminalState,
	input: HTMLInputElement,
): void {
	const caret = input.selectionStart ?? input.value.length;
	const beforeCaret = input.value.slice(0, caret);
	const match = beforeCaret.match(/(\S*)$/);
	const token = match?.[1] || "";
	const tokenStart = caret - token.length;
	const tokenEnd = caret;
	const parts = beforeCaret.trimStart().split(/\s+/).filter(Boolean);

	if (parts.length <= 1 && tokenStart === 0) {
		const candidates = COMMANDS.filter((cmd) => cmd.startsWith(token));
		if (candidates.length === 1) {
			replaceInputToken(input, tokenStart, tokenEnd, `${candidates[0]} `);
		} else if (candidates.length > 1) {
			const shared = commonPrefix(candidates);
			if (shared.length > token.length) {
				replaceInputToken(input, tokenStart, tokenEnd, shared);
			} else {
				pushOutput(state, input.value, candidates);
				writeState(state);
				render(elements, state);
			}
		}
		return;
	}

	const command = parts[0] || "";
	const completion = completePath(elements, state, command, token);
	if (completion.replacement) {
		replaceInputToken(input, tokenStart, tokenEnd, completion.replacement);
		return;
	}
	if (completion.candidates?.length) {
		pushOutput(state, input.value, completion.candidates);
		writeState(state);
		render(elements, state);
	}
}

function parseFs(root: HTMLElement): TerminalDirectory | null {
	const script = root.querySelector<HTMLScriptElement>(
		"script[data-blog-terminal-fs]",
	);
	if (!script?.textContent) {
		return null;
	}
	try {
		return JSON.parse(script.textContent) as TerminalDirectory;
	} catch {
		return null;
	}
}

function collectElements(root: HTMLElement): TerminalElements | null {
	const output = root.querySelector<HTMLElement>("[data-terminal-output]");
	const input = root.querySelector<HTMLInputElement>("[data-terminal-input]");
	const cwd = root.querySelector<HTMLElement>("[data-terminal-cwd]");
	const time = root.querySelector<HTMLElement>("[data-terminal-time]");
	const fs = parseFs(root);
	if (!output || !input || !cwd || !time || !fs) {
		return null;
	}
	return {
		root,
		output,
		input,
		cwd,
		time,
		fs,
		initialPath: root.dataset.currentPath || "/",
	};
}

function initTerminal(root: HTMLElement): void {
	if (root.dataset.blogTerminalInitialized === "true") {
		return;
	}

	const elements = collectElements(root);
	if (!elements) {
		return;
	}

	root.dataset.blogTerminalInitialized = "true";
	const state = readState(elements.initialPath);
	const canonicalInitialPath = canonicalPath(elements.fs, elements.initialPath);
	if (canonicalInitialPath) {
		state.cwd = canonicalInitialPath;
	}

	const canonical = canonicalPath(elements.fs, state.cwd);
	if (canonical) {
		state.cwd = canonical;
	} else {
		state.cwd = elements.initialPath;
	}

	let historyIndex: number | null = null;
	let draftInput = "";

	const tick = window.setInterval(() => {
		if (!root.isConnected) {
			window.clearInterval(tick);
			return;
		}
		elements.time.textContent = formatTime();
	}, 1_000);

	root.addEventListener("click", () => {
		elements.input.focus();
	});

	elements.input.addEventListener("input", () => {
		historyIndex = null;
		draftInput = "";
	});

	elements.input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			const command = elements.input.value;
			elements.input.value = "";
			historyIndex = null;
			draftInput = "";
			if (command.trim()) {
				state.history.push(command);
				state.history = state.history.slice(-MAX_HISTORY);
			}
			executeCommand(elements, state, command);
			writeState(state);
			render(elements, state);
			return;
		}

		if (event.key === "ArrowUp") {
			if (state.history.length === 0) {
				return;
			}
			event.preventDefault();
			if (historyIndex === null) {
				draftInput = elements.input.value;
				historyIndex = state.history.length - 1;
			} else {
				historyIndex = Math.max(0, historyIndex - 1);
			}
			elements.input.value = state.history[historyIndex] || "";
			return;
		}

		if (event.key === "ArrowDown") {
			if (historyIndex === null) {
				return;
			}
			event.preventDefault();
			historyIndex += 1;
			if (historyIndex >= state.history.length) {
				historyIndex = null;
				elements.input.value = draftInput;
			} else {
				elements.input.value = state.history[historyIndex] || "";
			}
			return;
		}

		if (event.key === "Tab") {
			event.preventDefault();
			handleTab(elements, state, elements.input);
		}
	});

	window.addEventListener(
		"beforeunload",
		() => {
			window.clearInterval(tick);
		},
		{ once: true },
	);

	writeState(state);
	render(elements, state);
	focusTerminalInput(elements.input);
}

function initBlogTerminals(): void {
	document
		.querySelectorAll<HTMLElement>("[data-blog-terminal]")
		.forEach(initTerminal);
}

function hookSwup(): void {
	if (window.__mizukiBlogTerminalSwupHooked) {
		return;
	}
	window.__mizukiBlogTerminalSwupHooked = true;

	const initSoon = () => window.setTimeout(initBlogTerminals, 0);
	const restoreSoon = () => window.setTimeout(restorePreservedScroll, 0);
	document.addEventListener("swup:page:view", initSoon);
	document.addEventListener("swup:page:view", restoreSoon);
	document.addEventListener("DOMContentLoaded", initSoon);
	document.addEventListener("DOMContentLoaded", restoreSoon);

	if (window.swup?.hooks) {
		window.swup.hooks.on("content:replace", initSoon);
		window.swup.hooks.on("page:view", initSoon);
		window.swup.hooks.on("page:view", restoreSoon);
	} else {
		document.addEventListener("swup:enable", () => {
			window.swup?.hooks.on("content:replace", initSoon);
			window.swup?.hooks.on("page:view", initSoon);
			window.swup?.hooks.on("page:view", restoreSoon);
		});
	}
}

window.__mizukiInitBlogTerminals = initBlogTerminals;
hookSwup();
initBlogTerminals();
restorePreservedScroll();
