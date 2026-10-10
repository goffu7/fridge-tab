/**
 * Downscales a photo in the browser before upload: receipts are read fine at ~1600px,
 * and payment slips are stored, so they are kept small.
 */
export async function shrinkImage(file: Blob, maxSide: number, maxBytes: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // e.g. HEIC on browsers that can't decode it: send as-is
  let side = maxSide;
  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const q of [0.82, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= maxBytes) {
        bitmap.close();
        return blob;
      }
    }
    side = Math.round(side * 0.75);
  }
  bitmap.close();
  throw new Error("Image too large");
}
