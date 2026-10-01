import { createHash } from "node:crypto";
import {
    cp,
    lstat,
    mkdir,
    readdir,
    readFile,
    rename,
    rm,
    writeFile,
} from "node:fs/promises";
import {
    basename,
    dirname,
    isAbsolute,
    join,
    relative,
    resolve,
    sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(scriptDirectory, "..");
const currentDirectory = resolve(repositoryDirectory, "current");
const distDirectory = resolve(repositoryDirectory, "dist");
const yearDirectoryPattern = /^\d{4}$/;

function assertInsideRepository(targetPath, label) {
    const relativePath = relative(repositoryDirectory, targetPath);

    if (
        relativePath === "" ||
        relativePath === ".." ||
        relativePath.startsWith(`..${sep}`) ||
        isAbsolute(relativePath)
    ) {
        throw new Error(`${label} must stay inside ${repositoryDirectory}`);
    }
}

async function assertRegularTree(targetPath, label) {
    const stats = await lstat(targetPath);

    if (stats.isSymbolicLink()) {
        throw new Error(`Symlinks are not allowed in ${label}: ${targetPath}`);
    }

    if (stats.isDirectory()) {
        const entries = await readdir(targetPath, { withFileTypes: true });
        for (const entry of entries) {
            await assertRegularTree(
                join(targetPath, entry.name),
                `${label}/${entry.name}`,
            );
        }
        return;
    }

    if (!stats.isFile()) {
        throw new Error(
            `Unsupported filesystem entry in ${label}: ${targetPath}`,
        );
    }
}

async function assertRegularFile(targetPath, label) {
    const stats = await lstat(targetPath);

    if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new Error(`${label} must be a regular file: ${targetPath}`);
    }
}

async function listYearDirectories() {
    const entries = await readdir(repositoryDirectory, { withFileTypes: true });
    const directories = [];

    for (const entry of entries) {
        if (!yearDirectoryPattern.test(entry.name)) {
            continue;
        }

        const directoryPath = join(repositoryDirectory, entry.name);
        await assertRegularTree(directoryPath, entry.name);
        directories.push(directoryPath);
    }

    return directories.sort();
}

async function removeExistingDist() {
    try {
        const stats = await lstat(distDirectory);

        if (stats.isSymbolicLink() || !stats.isDirectory()) {
            throw new Error(
                `dist must be a real directory before cleanup: ${distDirectory}`,
            );
        }

        await rm(distDirectory, { force: true, recursive: true });
    } catch (error) {
        if (error?.code !== "ENOENT") {
            throw error;
        }
    }
}

async function copyDirectoryContents(sourceDirectory, targetDirectory) {
    const entries = await readdir(sourceDirectory, { withFileTypes: true });

    for (const entry of entries) {
        await cp(
            join(sourceDirectory, entry.name),
            join(targetDirectory, entry.name),
            { force: false, recursive: true },
        );
    }
}

async function removeCurrentArchiveNotice() {
    const htmlNotice =
        '<aside class="archive-notice" aria-label="保存版のご案内"><span>2026年 保存版</span></aside>';
    const scriptNotice =
        '(0,n.jsx)("aside",{className:"archive-notice","aria-label":"保存版のご案内",children:(0,n.jsx)("span",{children:"2026年 保存版"})})';
    const textFiles = [];
    const renamedChunks = [];

    async function collectTextFiles(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                await collectTextFiles(path);
            } else if (/\.(?:html|txt|js)$/.test(entry.name)) {
                textFiles.push(path);
            }
        }
    }

    await collectTextFiles(distDirectory);
    for (let index = 0; index < textFiles.length; index++) {
        const path = textFiles[index];
        const original = await readFile(path, "utf8");
        const updated = path.endsWith(".html")
            ? original.replaceAll(htmlNotice, "")
            : path.endsWith(".js")
              ? original.replaceAll(scriptNotice, "null")
              : original;
        if (updated === original) continue;

        let outputPath = path;
        if (path.endsWith(".js")) {
            // Use a new URL so cached layout chunks cannot restore the notice.
            const hash = createHash("sha256")
                .update(updated)
                .digest("hex")
                .slice(0, 16);
            outputPath = path.replace(/-[a-f0-9]+\.js$/, `-${hash}.js`);
            if (outputPath === path)
                throw new Error(`Expected a hashed chunk: ${path}`);
            await rename(path, outputPath);
            textFiles[index] = outputPath;
            renamedChunks.push([basename(path), basename(outputPath)]);
        }
        await writeFile(outputPath, updated);
    }

    for (const path of textFiles) {
        const original = await readFile(path, "utf8");
        let updated = original;
        for (const [oldName, newName] of renamedChunks) {
            updated = updated.replaceAll(oldName, newName);
        }
        if (updated !== original) await writeFile(path, updated);
    }
}

async function countFiles(targetPath) {
    const stats = await lstat(targetPath);

    if (stats.isFile()) {
        return 1;
    }

    const entries = await readdir(targetPath, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
        count += await countFiles(join(targetPath, entry.name));
    }
    return count;
}

assertInsideRepository(currentDirectory, "current");
assertInsideRepository(distDirectory, "dist");

await assertRegularTree(currentDirectory, "current");
const currentEntries = await readdir(currentDirectory, { withFileTypes: true });
if (currentEntries.length === 0) {
    throw new Error("current must contain the static archive files");
}

const yearDirectories = await listYearDirectories();
const workerPath = join(repositoryDirectory, "_worker.js");
const routesPath = join(repositoryDirectory, "_routes.json");
await assertRegularFile(workerPath, "_worker.js");
await assertRegularFile(routesPath, "_routes.json");

await removeExistingDist();
await mkdir(distDirectory, { recursive: true });
await copyDirectoryContents(currentDirectory, distDirectory);
// Transform only yearless output; copy the archived years unchanged afterward.
await removeCurrentArchiveNotice();

for (const yearDirectory of yearDirectories) {
    await cp(
        yearDirectory,
        join(distDirectory, yearDirectory.split(sep).at(-1)),
        { force: false, recursive: true },
    );
}

await cp(workerPath, join(distDirectory, "_worker.js"), { force: false });
await cp(routesPath, join(distDirectory, "_routes.json"), { force: false });

console.log(
    `Built ${distDirectory} from current (${await countFiles(distDirectory)} files, ${yearDirectories.length} year directories).`,
);
