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

/**
 * Opens the browser's file dialog. Resolves with the chosen file, or null
 * when the dialog is cancelled. Must run from a user action such as a click.
 */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/** Reads a user chosen file as text. Rejects files above `maxBytes`. */
export async function readTextFile(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) throw new Error(`File is larger than ${Math.round(maxBytes / 1024)} KB.`);
  return file.text();
}
