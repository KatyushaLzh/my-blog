import type { CollectionEntry } from "astro:content";
import {
	type CategoryNode,
	getCategoryTree,
	parseCategorySegments,
} from "./category-tree";
import { getCodeFiles, getLabelFromExt } from "./code-files";
import { getSortedPosts } from "./content-utils";
import { getPostUrl, removeFileExtension, url } from "./url-utils";

export interface TerminalDirectory {
	type: "directory";
	name: string;
	path: string;
	url: string;
	children: TerminalEntry[];
}

export interface TerminalFile {
	type: "file";
	name: string;
	path: string;
	fileType: "post" | "code";
	label: string;
	url: string;
	meta: string[];
}

export type TerminalEntry = TerminalDirectory | TerminalFile;

function joinTerminalPath(parentPath: string, name: string): string {
	if (parentPath === "/") {
		return `/${name}`;
	}
	return `${parentPath}/${name}`;
}

function normalizePathKey(path: string): string {
	return path.toLowerCase();
}

function normalizeFileName(name: string): string {
	return name.trim().replace(/\s+/g, "-");
}

function getDirectoryUrl(path: string): string {
	if (path === "/") {
		return url("/");
	}
	return url(`/posts/${path.slice(1)}/`);
}

function createDirectory(name: string, path: string): TerminalDirectory {
	return {
		type: "directory",
		name,
		path,
		url: getDirectoryUrl(path),
		children: [],
	};
}

function ensureDirectory(
	root: TerminalDirectory,
	dirs: Map<string, TerminalDirectory>,
	segments: string[],
): TerminalDirectory {
	let current = root;
	for (const segment of segments) {
		const nextPath = joinTerminalPath(current.path, segment);
		const key = normalizePathKey(nextPath);
		let next = dirs.get(key);
		if (!next) {
			next = createDirectory(segment, nextPath);
			dirs.set(key, next);
			current.children.push(next);
		}
		current = next;
	}
	return current;
}

function addCategoryDirectories(
	root: TerminalDirectory,
	dirs: Map<string, TerminalDirectory>,
	nodes: CategoryNode[],
): void {
	for (const node of nodes) {
		ensureDirectory(root, dirs, node.fullPath.split("/"));
		addCategoryDirectories(root, dirs, node.children);
	}
}

function addPostFile(
	root: TerminalDirectory,
	dirs: Map<string, TerminalDirectory>,
	post: CollectionEntry<"posts">,
): void {
	const slug = removeFileExtension(post.id);
	const segments = parseCategorySegments(post.id);
	const parent = ensureDirectory(root, dirs, segments);
	const rawName = slug.split("/").pop() || slug;
	const name = normalizeFileName(rawName);
	const path = joinTerminalPath(parent.path, name);
	const published = post.data.published.toISOString().slice(0, 10);
	const tags = post.data.tags?.length ? post.data.tags.join(", ") : "none";

	parent.children.push({
		type: "file",
		name,
		path,
		fileType: "post",
		label: post.data.title,
		url: getPostUrl(post),
		meta: [
			"type: post",
			`title: ${post.data.title}`,
			`published: ${published}`,
			`tags: ${tags}`,
			`url: ${getPostUrl(post)}`,
		],
	});
}

function addCodeFiles(
	root: TerminalDirectory,
	dirs: Map<string, TerminalDirectory>,
): void {
	for (const file of getCodeFiles()) {
		const parts = file.id.split("/");
		const name = normalizeFileName(parts.pop() || file.name);
		const parent = ensureDirectory(root, dirs, parts);
		const fileUrl = url(`/posts/${file.id}/`);
		parent.children.push({
			type: "file",
			name,
			path: joinTerminalPath(parent.path, name),
			fileType: "code",
			label: file.name,
			url: fileUrl,
			meta: [
				`type: ${getLabelFromExt(file.ext)}`,
				`name: ${file.name}`,
				`lines: ${file.content.split("\n").length}`,
				`extension: ${file.ext.replace(".", "").toUpperCase()}`,
				`url: ${fileUrl}`,
			],
		});
	}
}

function sortDirectory(directory: TerminalDirectory): void {
	directory.children.sort((a, b) => {
		if (a.type !== b.type) {
			return a.type === "directory" ? -1 : 1;
		}
		return a.name.localeCompare(b.name);
	});

	for (const child of directory.children) {
		if (child.type === "directory") {
			sortDirectory(child);
		}
	}
}

export async function buildTerminalFs(): Promise<TerminalDirectory> {
	const root = createDirectory("/", "/");
	const dirs = new Map<string, TerminalDirectory>([["/", root]]);

	const tree = await getCategoryTree();
	addCategoryDirectories(root, dirs, tree);

	const posts = await getSortedPosts();
	for (const post of posts) {
		addPostFile(root, dirs, post);
	}

	addCodeFiles(root, dirs);
	sortDirectory(root);

	return root;
}

export function getInitialTerminalPath(directorySlug?: string): string {
	if (!directorySlug) {
		return "/";
	}

	const segments = directorySlug.split("/").filter(Boolean);
	return segments.length > 0 ? `/${segments.join("/")}` : "/";
}
