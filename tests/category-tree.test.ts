import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
	buildCategoryTreeFromEntries,
	collectCategoryPosts,
	findCategoryNode,
	getCategoryCardMeta,
	type CategoryNode,
} from "../src/utils/category-tree.ts";

function makePost(
	id: string,
	published: string,
	image = "",
	filePath = `src/content/posts/${id}.md`,
) {
	return {
		id,
		filePath,
		data: {
			published: new Date(published),
			image,
		},
	} as never;
}

describe("collectCategoryPosts", () => {
	it("collects direct and nested posts", () => {
		const node: CategoryNode = {
			name: "root",
			fullPath: "root",
			depth: 0,
			children: [
				{
					name: "child",
					fullPath: "root/child",
					depth: 1,
					children: [],
					posts: [makePost("root/child/b", "2026-01-02")],
					count: 1,
					postCount: 1,
					codeFileCount: 0,
				},
			],
			posts: [makePost("root/a", "2026-01-01")],
			count: 2,
			postCount: 2,
			codeFileCount: 0,
		};

		assert.deepEqual(
			collectCategoryPosts(node).map((post) => post.id),
			["root/a", "root/child/b"],
		);
	});
});

describe("buildCategoryTreeFromEntries", () => {
	it("adds directories that only contain code files", () => {
		const tree = buildCategoryTreeFromEntries(
			[makePost("others/OS2026/learning", "2026-06-30")],
			[
				"others/os2026/ebpf-rca/cmd/ebpf-rca/main.go",
				"others/os2026/ebpf-rca/bpf/cpu.bpf.c",
			],
		);

		const osNode = findCategoryNode(tree, ["others", "os2026"]);
		const rcaNode = findCategoryNode(tree, [
			"others",
			"os2026",
			"ebpf-rca",
		]);
		const cmdNode = findCategoryNode(tree, [
			"others",
			"os2026",
			"ebpf-rca",
			"cmd",
		]);

		assert.equal(osNode?.count, 1);
		assert.equal(osNode?.postCount, 1);
		assert.equal(osNode?.codeFileCount, 2);
		assert.equal(rcaNode?.count, 0);
		assert.equal(rcaNode?.postCount, 0);
		assert.equal(rcaNode?.codeFileCount, 2);
		assert.equal(cmdNode?.postCount, 0);
		assert.equal(cmdNode?.codeFileCount, 1);
		assert.equal(cmdNode?.fullPath, "others/OS2026/ebpf-rca/cmd");
	});
});

describe("getCategoryCardMeta", () => {
	it("picks the newest post and the current folder cover file", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "category-tree-"));
		const contentPostsDir = path.join(tmpDir, "posts");
		const categoryDir = path.join(contentPostsDir, "root");
		fs.mkdirSync(categoryDir, { recursive: true });
		fs.writeFileSync(path.join(categoryDir, "cover.webp"), "");

		const node: CategoryNode = {
			name: "root",
			fullPath: "root",
			depth: 0,
			children: [
				{
					name: "child",
					fullPath: "root/child",
					depth: 1,
					children: [],
					posts: [
						makePost(
							"root/child/b",
							"2026-01-03",
							"./cover.webp",
							"src/content/posts/root/child/index.md",
						),
					],
					count: 1,
					postCount: 1,
					codeFileCount: 0,
				},
			],
			posts: [makePost("root/a", "2026-01-04")],
			count: 2,
			postCount: 2,
			codeFileCount: 0,
		};

		const meta = getCategoryCardMeta(node, contentPostsDir);

		assert.equal(meta.newestPost?.id, "root/a");
		assert.deepEqual(meta.cover, {
			image: "cover.webp",
			basePath: "content/posts/root",
		});
	});

	it("returns the real cover directory casing from disk", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "category-tree-"));
		const contentPostsDir = path.join(tmpDir, "posts");
		const categoryDir = path.join(contentPostsDir, "CS149");
		fs.mkdirSync(categoryDir, { recursive: true });
		fs.writeFileSync(path.join(categoryDir, "cover.png"), "");

		const node: CategoryNode = {
			name: "cs149",
			fullPath: "cs149",
			depth: 0,
			children: [],
			posts: [makePost("cs149/a", "2026-01-01")],
			count: 1,
			postCount: 1,
			codeFileCount: 0,
		};

		const meta = getCategoryCardMeta(node, contentPostsDir);

		assert.deepEqual(meta.cover, {
			image: "cover.png",
			basePath: "content/posts/CS149",
		});
	});
});
