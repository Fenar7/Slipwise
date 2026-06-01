export function deterministicFingerprint(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${k}:${stringifyValue(obj[k])}`);
  const hash = crc32(parts.join("|"));
  return hash;
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (Array.isArray(v)) return `[${v.map(stringifyValue).join(",")}]`;
  if (typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${k}:${stringifyValue((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return String(v);
}

function crc32(input: string): string {
  let crc = 0xffffffff;
  for (let i = 0; i < input.length; i++) {
    const byte = input.charCodeAt(i) & 0xff;
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
