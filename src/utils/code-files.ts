import fs from "node:fs";
import path from "node:path";

export interface CodeFile {
	id: string;
	name: string;
	ext: string;
	content: string;
}

export const CODE_EXTENSIONS = [
	".c",
	".h",
	".cpp",
	".py",
	".java",
	".go",
	".rs",
	".js",
	".ts",
	".sh",
	".txt",
];

const EXT_LANG_MAP: Record<string, string> = {
	".c": "c",
	".h": "c",
	".cpp": "cpp",
	".py": "python",
	".java": "java",
	".go": "go",
	".rs": "rust",
	".js": "javascript",
	".ts": "typescript",
	".sh": "bash",
	".txt": "text",
};

const EXT_LABEL_MAP: Record<string, string> = {
	".c": "C Source File",
	".h": "C Header File",
	".cpp": "C++ Source File",
	".py": "Python Script",
	".java": "Java Source File",
	".go": "Go Source File",
	".rs": "Rust Source File",
	".js": "JavaScript File",
	".ts": "TypeScript File",
	".sh": "Shell Script",
	".txt": "Text File",
};

export function getLangFromExt(ext: string): string {
	return EXT_LANG_MAP[ext] || "text";
}

export function getLabelFromExt(ext: string): string {
	return EXT_LABEL_MAP[ext] || "Code File";
}

let _codeFilesCache: CodeFile[] | null = null;

export function getCodeFiles(): CodeFile[] {
	_codeFilesCache = null; // always rebuild to pick up new files
	if (_codeFilesCache) return _codeFilesCache;

	const postsDir = path.resolve("src/content/posts");
	const result: CodeFile[] = [];

	function walk(dir: string, relativePath: string) {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const full = path.join(dir, entry.name);
			const rel = relativePath ? `${relativePath}/${entry.name}` : entry.name;

			if (entry.isDirectory()) {
				walk(full, rel);
			} else {
				const ext = path.extname(entry.name).toLowerCase();
				if (ext === ".md" || ext === ".mdx") continue;
				if (!CODE_EXTENSIONS.includes(ext)) continue;

				let content = "";
				try {
					content = fs.readFileSync(full, "utf-8");
				} catch {
					content = "[binary file]";
				}
				result.push({
					id: rel.replace(/\\/g, "/").toLowerCase().replace(/\s+/g, "-"),
					name: entry.name,
					ext,
					content,
				});
			}
		}
	}

	walk(postsDir, "");
	_codeFilesCache = result;
	return result;
}

export function getCodeFilesInDir(dirSlug: string): CodeFile[] {
	const files = getCodeFiles();
	const normalizedDir = dirSlug.toLowerCase();
	if (!normalizedDir) {
		return files.filter((f) => !f.id.includes("/"));
	}
	return files.filter((f) => {
		const lastSlash = f.id.lastIndexOf("/");
		if (lastSlash < 0) return false;
		return f.id.substring(0, lastSlash) === normalizedDir;
	});
}
