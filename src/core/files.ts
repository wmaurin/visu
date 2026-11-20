/** Hands a text file to the browser as a download. */
export function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Give the browser time to start the download before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a user chosen file as text. Rejects files above `maxBytes`. */
export async function readTextFile(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) throw new Error(`File is larger than ${Math.round(maxBytes / 1024)} KB.`);
  return file.text();
}
