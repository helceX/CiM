/**
 * SVG → PNG for visual exports. `sharp` is a native module: if it is missing on a machine the PNG (and the picture
 * inside an Excel export) is simply left out — the SVG, HTML, CSV and the Excel table still work.
 */
export type VisualPng = { data: Buffer; width: number; height: number };

export async function svgToPng(svg: string): Promise<VisualPng | null> {
  try {
    const { default: sharp } = await import("sharp");
    // 2× density so the picture stays sharp when pasted into a slide or document.
    const { data, info } = await sharp(Buffer.from(svg), { density: 144 }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch (error) {
    console.error("[visuals] PNG rendering is unavailable:", error);
    return null;
  }
}
