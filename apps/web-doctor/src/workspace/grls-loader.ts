import { decodeGrlsPayload } from "./grls-decoder";
import catalogUrl from "./grls-catalog.json.gz?url";
import manifest from "./grls-manifest.json" with { type: "json" };
import { grlsCatalog, type MedicineCatalogData } from "./grls";
let pending: Promise<void> | undefined;
export function loadGrlsCatalog(): Promise<void> {
  if (grlsCatalog.ready) return Promise.resolve();
  if (!pending)
    pending = (async () => {
      const response = await fetch(catalogUrl);
      if (!response.ok)
        throw new Error(
          "Не удалось загрузить справочник препаратов. Повторите загрузку.",
        );
      const bytes = await response.arrayBuffer();
      const data = (await decodeGrlsPayload(
        new Uint8Array(bytes),
        manifest.artifactSha256,
        manifest.contentSha256,
      )) as MedicineCatalogData;
      if (
        data.sourceVersion !== manifest.sourceVersion ||
        data.records.length !== manifest.currentRecords
      )
        throw new Error("Неполный справочник ГРЛС.");
      grlsCatalog.install(data);
    })().catch((error) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
export const grlsSource = manifest;
