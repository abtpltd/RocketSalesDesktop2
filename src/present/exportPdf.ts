import { jsPDF } from 'jspdf';
import { toJpeg } from 'html-to-image';

/** Draws each slide (already rendered in `nodes`, 16:9) into one landscape PDF and returns it as base64. */
export async function deckToPdf(nodes: HTMLElement[]): Promise<string> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [960, 540] });
  for (let i = 0; i < nodes.length; i++) {
    const img = await toJpeg(nodes[i], { quality: 0.92, pixelRatio: 2, backgroundColor: '#ffffff' });
    if (i > 0) pdf.addPage([960, 540], 'landscape');
    pdf.addImage(img, 'JPEG', 0, 0, 960, 540);
  }
  const dataUri = pdf.output('datauristring');
  return dataUri.split(',', 2)[1] ?? '';
}

export const fileName = (name: string, ext: string) => `${name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'presentation'}.${ext}`;
