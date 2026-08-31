/**
 * Turn a picked file into a data URI small enough to send.
 *
 * A modern phone camera produces 3–8 MB. Nothing on the receiving end needs
 * more than 1600px to judge a pothole, the API caps the upload at 8 MB, and
 * base64 adds another third on the wire — so sending the original would make
 * "submit" the slowest thing in the app on exactly the connection least able
 * to afford it.
 *
 * Every failure path falls back to the original file rather than throwing. A
 * slightly slow upload is a much better outcome than a lost photo, and canvas
 * is exactly the sort of API that is missing or restricted in some webviews.
 */

/** Long edge, px. Enough to judge a defect, small enough to send on 3G. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/** Below this there is nothing to gain by re-encoding. */
const REENCODE_ABOVE_BYTES = 2_000_000;

export async function toDownscaledDataUri(file: File): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('could not read the photo'));
    reader.readAsDataURL(file);
  });

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('could not decode the photo'));
      element.src = original;
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    if (scale === 1 && original.length < REENCODE_ABOVE_BYTES) return original;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return original;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch {
    return original;
  }
}
