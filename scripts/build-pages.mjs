import { cp, lstat, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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
