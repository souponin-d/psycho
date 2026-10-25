import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("../", import.meta.url)),
  assets = join(app, "assets"),
  catalog = join(assets, "catalog-v04.json");
const unix = (p) => p.split(sep).join("/");
const hash = (b) => createHash("sha256").update(b).digest("hex");
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
}
const usage = new Map();
function use(path, source) {
  if (!path.startsWith(assets + sep)) return;
  const key = unix(relative(assets, path));
  usage.set(key, [...(usage.get(key) ?? []), source]);
}
for (const path of walk(join(app, "src")).filter((p) => /\.[tj]sx?$/.test(p)))
  for (const match of readFileSync(path, "utf8").matchAll(
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ))
    use(resolve(dirname(path), match[1]), unix(relative(app, path)));
const config = JSON.parse(readFileSync(join(app, "app.json"), "utf8"));
function configAssets(value) {
  if (typeof value === "string" && value.startsWith("./assets/"))
    use(resolve(app, value), "app.json");
  else if (value && typeof value === "object")
    Object.values(value).forEach(configAssets);
}
configAssets(config);
const files = walk(assets)
  .filter((p) => p !== catalog)
  .map((path) => {
    const bytes = readFileSync(path),
      name = unix(relative(assets, path));
    return {
      path: name,
      bytes: bytes.length,
      sha256: hash(bytes),
      role: usage.has(name)
        ? "runtime"
        : name.startsWith("sources/")
          ? "source"
          : "retained-reference",
      usedBy: [...new Set(usage.get(name) ?? [])].sort(),
      ...(path.endsWith(".png")
        ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
        : {}),
    };
  });
for (const name of usage.keys())
  if (!files.some((f) => f.path === name)) throw Error("Нет ресурса: " + name);
const expected = {
  version: JSON.parse(readFileSync(join(app, "package.json"), "utf8")).version,
  files,
};
if (process.argv.includes("--write"))
  writeFileSync(catalog, JSON.stringify(expected, null, 2) + "\n");
else {
  const saved = JSON.parse(readFileSync(catalog, "utf8"));
  if (JSON.stringify(saved) !== JSON.stringify(expected))
    throw Error(
      "Каталог ассетов изменился. Проверьте изменения и обновите: node apps/mobile-patient/scripts/catalog-assets.mjs --write",
    );
  const origin = JSON.parse(
    readFileSync(join(assets, "sources/v04/provenance.json"), "utf8"),
  );
  for (const row of [
    ...origin.animationSheets.map((s) => ({
      original: s.original,
      originalSha256: s.sha256,
    })),
    ...origin.generatedResources,
  ]) {
    const path = resolve(assets, row.original);
    if (
      !path.startsWith(assets + sep) ||
      hash(readFileSync(path)) !== row.originalSha256
    )
      throw Error("Не совпал исходник: " + row.original);
  }
}
console.log(
  `Каталог0.4: ${files.length} файлов, ${files.filter((f) => f.role === "runtime").length} runtime-ресурсов; размеры, ссылки и SHA256 ${process.argv.includes("--write") ? "сохранены" : "проверены"}.`,
);
