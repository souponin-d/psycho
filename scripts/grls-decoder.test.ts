import { expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { decodeGrlsPayload } from "../apps/web-doctor/src/workspace/grls-decoder";
it("проверяет gzip как файл и как уже распакованный HTTP ответ", async () => {
  const plain = Buffer.from(
    JSON.stringify({ sourceVersion: "test", records: [] }),
  );
  const compressed = gzipSync(plain);
  const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
  expect(
    await decodeGrlsPayload(compressed, hash(compressed), hash(plain)),
  ).toEqual({ sourceVersion: "test", records: [] });
  expect(await decodeGrlsPayload(plain, hash(compressed), hash(plain))).toEqual(
    { sourceVersion: "test", records: [] },
  );
  await expect(
    decodeGrlsPayload(Buffer.from("{}"), hash(compressed), hash(plain)),
  ).rejects.toThrow(/Версия/);
});
