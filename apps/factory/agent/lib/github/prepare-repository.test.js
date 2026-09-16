import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareRepositoryCommand } from "./prepare-repository.js";

const directories = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

const git = (directory, args) => {
  const result = Bun.spawnSync(["git", "-C", directory, ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
};

const commit = async (directory, content) => {
  await writeFile(path.join(directory, "README.md"), content);
  git(directory, ["add", "README.md"]);
  git(directory, [
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-m",
    content,
  ]);
  return git(directory, ["rev-parse", "HEAD"]);
};

const fixture = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "solos-factory-checkout-"));
  directories.push(root);
  const source = path.join(root, "source");
  git(root, ["init", "--initial-branch=main", source]);
  await commit(source, "original");
  const directory = path.join(root, "station's checkout");
  return { source, directory, url: source };
};

const prepare = (options) => Bun.spawnSync(["bash", "-lc", prepareRepositoryCommand(options)]);

describe("factory checkout bootstrap [integration]", () => {
  test("resumes a retained clone after failed setup and refreshes the setup revision", async () => {
    const options = await fixture();
    expect(prepare(options).exitCode).toBe(0);
    await writeFile(path.join(options.directory, "partial-setup-cache"), "keep");
    const head = await commit(options.source, "fixed setup");
    const retried = prepare(options);
    expect(retried.stderr.toString()).not.toContain("already exists");
    expect(retried.exitCode).toBe(0);
    expect(git(options.directory, ["rev-parse", "HEAD"])).toBe(head);
    expect(await readFile(path.join(options.directory, "partial-setup-cache"), "utf8")).toBe(
      "keep",
    );
  });

  test("refuses a checkout of another repository without changing its files", async () => {
    const options = await fixture();
    expect(prepare(options).exitCode).toBe(0);
    git(options.directory, ["remote", "set-url", "origin", "https://example.com/other.git"]);
    const result = prepare(options);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("different repository");
    expect(await readFile(path.join(options.directory, "README.md"), "utf8")).toBe("original");
  });

  test("preserves unfinished tracked edits in a retained checkout", async () => {
    const options = await fixture();
    expect(prepare(options).exitCode).toBe(0);
    await writeFile(path.join(options.directory, "README.md"), "unfinished work");
    expect(prepare(options).exitCode).not.toBe(0);
    expect(await readFile(path.join(options.directory, "README.md"), "utf8")).toBe(
      "unfinished work",
    );
  });

  test("preserves a non-Git directory occupying the checkout path", async () => {
    const options = await fixture();
    await mkdir(options.directory);
    await writeFile(path.join(options.directory, "keep.txt"), "unrelated");
    expect(prepare(options).exitCode).not.toBe(0);
    expect(await readFile(path.join(options.directory, "keep.txt"), "utf8")).toBe("unrelated");
  });
});
