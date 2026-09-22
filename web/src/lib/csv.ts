/** Build a CSV string. Nulls become empty cells, never zeros. */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    if (v === null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

export function downloadText(filename: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
