// src/modules/project-agreements/services/imageGuard.ts
//
// IS THIS ACTUALLY AN IMAGE A BROWSER CAN DRAW?
//
// The upload path used to trust the data: URI's declared MIME type, which comes
// from the browser, which takes it from the file EXTENSION. A photo exported
// from an iPhone and renamed to .png is announced as image/png, passes every
// check, uploads happily, and is stored with Content-Type: image/png — and then
// renders as a broken image on every document, because the bytes are HEIC and
// no browser decodes HEIC.
//
// That failure is silent and lands on a contract, so the bytes get checked
// here. The magic numbers are short and stable; this is not a parser, it only
// answers "will Chrome draw this?".

/** Formats every browser renders, and which the PDF printer can therefore embed. */
const SIGNATURES: Array<{ name: string; test: (b: Buffer) => boolean }> = [
  { name: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { name: 'jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { name: 'gif', test: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  {
    name: 'webp',
    test: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  // SVG is text, so sniff the markup rather than a byte signature.
  { name: 'svg', test: (b) => /^\s*(<\?xml|<svg)/i.test(b.subarray(0, 200).toString('utf8')) },
];

/**
 * Formats we can NAME when refusing, so the message is actionable instead of
 * "invalid image". Everything here is a real image — just not one a browser
 * will draw.
 */
const UNRENDERABLE: Array<{ name: string; test: (b: Buffer) => boolean }> = [
  {
    // ISO-BMFF: ....ftyp<brand>. HEIC and AVIF share the container.
    name: 'HEIC (iPhone photo)',
    test: (b) =>
      b.subarray(4, 8).toString('latin1') === 'ftyp' &&
      /heic|heix|hevc|hevx|mif1|msf1/.test(b.subarray(8, 12).toString('latin1')),
  },
  {
    name: 'AVIF',
    test: (b) =>
      b.subarray(4, 8).toString('latin1') === 'ftyp' &&
      /avif|avis/.test(b.subarray(8, 12).toString('latin1')),
  },
  { name: 'TIFF', test: (b) => /^(II\*\0|MM\0\*)/.test(b.subarray(0, 4).toString('latin1')) },
  { name: 'BMP', test: (b) => b.subarray(0, 2).toString('latin1') === 'BM' },
  { name: 'PDF', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
];

export class UnsupportedImageError extends Error {}

/**
 * Throw unless the DECODED BYTES are a format a browser draws.
 *
 * Returns the format it found, so callers can log what was actually uploaded
 * rather than what it claimed to be.
 */
export function assertRenderableImage(dataUri: string): string {
  /**
   * data:[<mime>][;param]*[;base64],<payload>
   *
   * The parameter list has to be matched loosely. An earlier version only
   * allowed ";base64" and so rejected "data:image/svg+xml;utf8,..." — a
   * perfectly valid URI that browsers and our own renderer both produce.
   */
  const match = /^data:([^;,]*)((?:;[^;,]*)*),([\s\S]*)$/.exec(dataUri.trim());
  if (!match) {
    throw new UnsupportedImageError('That does not look like an image file.');
  }

  const declared = (match[1] || '').toLowerCase();
  const isBase64 = /(^|;)base64($|;)/i.test(match[2] || '');
  const bytes = isBase64
    ? Buffer.from(match[3], 'base64')
    : Buffer.from(decodeURIComponent(match[3]), 'utf8');

  if (bytes.length < 12) {
    throw new UnsupportedImageError('That image file looks empty or truncated.');
  }

  const good = SIGNATURES.find((s) => s.test(bytes));
  if (good) return good.name;

  const known = UNRENDERABLE.find((s) => s.test(bytes));
  if (known) {
    throw new UnsupportedImageError(
      `That file is ${known.name}, which browsers cannot display — so it would ` +
        `print as a broken image. Convert it to PNG or JPEG and upload again.` +
        (declared && declared !== 'image/heic'
          ? ` (It was named ${declared}, but the contents are ${known.name}.)`
          : '')
    );
  }

  throw new UnsupportedImageError(
    'That file is not a PNG, JPEG, GIF, WebP or SVG. Convert it and upload again.'
  );
}
