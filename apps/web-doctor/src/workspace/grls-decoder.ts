export async function decodeGrlsPayload(
  bytes: Uint8Array,
  artifactHash: string,
  contentHash: string,
): Promise<unknown> {
  const compressed = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const data = new Uint8Array(bytes).buffer;
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== (compressed ? artifactHash : contentHash))
    throw new Error(
      "Версия файла ГРЛС не совпадает со сборкой. Обновите приложение.",
    );
  if (!compressed) return JSON.parse(new TextDecoder().decode(data));
  return new Response(
    new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).json();
}
