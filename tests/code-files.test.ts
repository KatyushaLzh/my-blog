import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
	collectCodeFilesFromDir,
	getLabelFromExt,
	getLangFromExt,
} from "../src/utils/code-files.ts";

describe("code file collection", () => {
	it("collects Go files with the same code-viewer metadata path as C files", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-files-"));
		const postsDir = path.join(tmpDir, "posts");
		const sourceDir = path.join(postsDir, "os2026", "ebpf-rca");
		fs.mkdirSync(sourceDir, { recursive: true });
		fs.writeFileSync(
			path.join(sourceDir, "main.go"),
			"package main\n\nfunc main() {}\n",
		);
		fs.writeFileSync(
			path.join(sourceDir, "main.c"),
			"int main(void) { return 0; }\n",
		);
		fs.writeFileSync(path.join(sourceDir, "notes.md"), "# ignored\n");

		const files = collectCodeFilesFromDir(postsDir);
		const ids = files.map((file) => file.id).sort();

		assert.deepEqual(ids, [
			"os2026/ebpf-rca/main.c",
			"os2026/ebpf-rca/main.go",
		]);

		const goFile = files.find((file) => file.name === "main.go");
		assert.equal(goFile?.ext, ".go");
		assert.equal(goFile?.content, "package main\n\nfunc main() {}\n");
		assert.equal(getLangFromExt(".go"), "go");
		assert.equal(getLabelFromExt(".go"), "Go Source File");
	});
});
