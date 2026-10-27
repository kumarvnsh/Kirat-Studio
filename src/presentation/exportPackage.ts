import type { LayoutPage } from './pageLayout.ts';
export type RenderAsset = {
  key: string;
  url: string;
  quality: 'preview' | 'final';
  blob?: Blob;
};
export function exportIssues(
  pages: LayoutPage[],
  assets: Record<string, RenderAsset>,
  draft: boolean,
  keys: Record<string, string> = {},
): string[] {
  if (!pages.length) return ['Include at least one booklet page.'];
  return pages.flatMap((p) =>
    [...new Set(p.items.flatMap((i) => (i.kind === 'image' ? [i.shotId] : [])))].flatMap((id) =>
      !assets[id]
        ? [`${p.title}: render an image first.`]
        : !draft && (assets[id].quality !== 'final' || !keys[id] || assets[id].key !== keys[id])
          ? [`${p.title}: a current final render is required.`]
          : [],
    ),
  );
}
export function fileName(index: number, title: string, extension: string) {
  const clean =
    title
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .trim()
      .replace(/[ _-]+/g, '-')
      .slice(0, 80) || 'render';
  return `${String(index).padStart(2, '0')}-${clean}.${extension}`;
}
export async function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
