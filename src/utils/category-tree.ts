import fs from "node:fs";
import path from "node:path";
import type { CollectionEntry } from "astro:content";

export interface CategoryNode {
	name: string;
	fullPath: string;
	depth: number;
	children: CategoryNode[];
	posts: CollectionEntry<"posts">[];
	count: number;
}

export interface CategoryCardMeta {
	newestPost?: CollectionEntry<"posts">;
	cover?: {
		image: string;
		basePath: string;
	};
}

const CATEGORY_COVER_FILENAMES = ["cover.jpg", "cover.png", "cover.webp"];

function resolvePathSegmentsCase(
	rootDir: string,
	segments: string[],
): string[] | undefined {
	const resolved: string[] = [];
	let currentDir = rootDir;

	for (const segment of segments) {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(currentDir, { withFileTypes: true });
		} catch {
			return undefined;
		}

		const matched =
			entries.find((entry) => entry.isDirectory() && entry.name === segment) ??
			entries.find(
				(entry) =>
					entry.isDirectory() &&
					entry.name.toLowerCase() === segment.toLowerCase(),
			);

		if (!matched) {
			return undefined;
		}

		resolved.push(matched.name);
		currentDir = path.join(currentDir, matched.name);
	}

	return resolved;
}

export function parseCategorySegments(id: string): string[] {
	const parts = id.split("/");
	if (parts.length <= 1) return [];
	return parts.slice(0, -1);
}

export function getCategoryPathFromId(id: string): string {
	return parseCategorySegments(id).join("/");
}

export function getCategoryAncestors(
	id: string,
): { name: string; path: string }[] {
	const segments = parseCategorySegments(id);
	return segments.map((seg, i) => ({
		name: seg,
		path: segments.slice(0, i + 1).join("/"),
	}));
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
	const { getCollection } = await import("astro:content");
	const allPosts = await getCollection("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	const nodeMap = new Map<string, CategoryNode>();
	const roots: CategoryNode[] = [];

	for (const post of allPosts) {
		const segments = parseCategorySegments(post.id);
		if (segments.length === 0) continue;

		for (let i = 0; i < segments.length; i++) {
			const path = segments.slice(0, i + 1).join("/");
			if (!nodeMap.has(path)) {
				const node: CategoryNode = {
					name: segments[i],
					fullPath: path,
					depth: i,
					children: [],
					posts: [],
					count: 0,
				};
				nodeMap.set(path, node);
				if (i === 0) {
					roots.push(node);
				} else {
					const parentPath = segments.slice(0, i).join("/");
					const parent = nodeMap.get(parentPath);
					if (parent) {
						parent.children.push(node);
					}
				}
			}
		}

		const catPath = segments.join("/");
		const node = nodeMap.get(catPath);
		if (node) {
			node.posts.push(post);
		}
	}

	function computeCount(node: CategoryNode): number {
		node.count = node.posts.length;
		for (const child of node.children) {
			node.count += computeCount(child);
		}
		return node.count;
	}
	for (const root of roots) {
		computeCount(root);
	}

	function sortTree(nodes: CategoryNode[]) {
		nodes.sort((a, b) => a.name.localeCompare(b.name));
		for (const node of nodes) {
			sortTree(node.children);
		}
	}
	sortTree(roots);

	return roots;
}

export function findCategoryNode(
	tree: CategoryNode[],
	segments: string[],
): CategoryNode | undefined {
	if (segments.length === 0) return undefined;
	for (const node of tree) {
		if (node.name === segments[0]) {
			if (segments.length === 1) return node;
			return findCategoryNode(node.children, segments.slice(1));
		}
	}
	return undefined;
}

export function flattenTree(tree: CategoryNode[]): CategoryNode[] {
	const result: CategoryNode[] = [];
	function walk(nodes: CategoryNode[]) {
		for (const node of nodes) {
			result.push(node);
			walk(node.children);
		}
	}
	walk(tree);
	return result;
}

export function collectCategoryPosts(node: CategoryNode): CollectionEntry<"posts">[] {
	const result = [...node.posts];
	for (const child of node.children) {
		result.push(...collectCategoryPosts(child));
	}
	return result;
}

function getCategoryCover(
	node: CategoryNode,
	contentPostsDir: string,
): CategoryCardMeta["cover"] {
	const segments = node.fullPath.split("/");
	const realSegments = resolvePathSegmentsCase(contentPostsDir, segments);
	if (!realSegments) {
		return undefined;
	}

	const dirPath = path.join(contentPostsDir, ...realSegments);
	const coverFile = CATEGORY_COVER_FILENAMES.find((filename) =>
		fs.existsSync(path.join(dirPath, filename)),
	);

	if (!coverFile) {
		return undefined;
	}

	return {
		image: coverFile,
		basePath: `content/posts/${realSegments.join("/")}`,
	};
}

export function getCategoryCardMeta(
	node: CategoryNode,
	contentPostsDir = path.join(process.cwd(), "src", "content", "posts"),
): CategoryCardMeta {
	const posts = collectCategoryPosts(node);
	if (posts.length === 0) {
		return {
			cover: getCategoryCover(node, contentPostsDir),
		};
	}

	const sortedPosts = [...posts].sort(
		(a, b) => b.data.published.getTime() - a.data.published.getTime(),
	);

	return {
		newestPost: sortedPosts[0],
		cover: getCategoryCover(node, contentPostsDir),
	};
}
