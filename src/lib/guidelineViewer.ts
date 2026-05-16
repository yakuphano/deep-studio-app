export type GuidelineFileKind = 'pdf' | 'image' | 'office' | 'text' | 'other';

export function detectGuidelineKind(
  url: string,
  fileName?: string | null
): GuidelineFileKind {
  const name = (fileName ?? url).toLowerCase();
  if (/\.(pdf)(\?|#|$)/i.test(name)) return 'pdf';
  if (/\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(name)) return 'image';
  if (/\.(docx?|pptx?|xlsx?)(\?|#|$)/i.test(name)) return 'office';
  if (/\.(txt|md|rtf)(\?|#|$)/i.test(name)) return 'text';
  return 'other';
}

/** Web iframe / embed kaynağı */
export function getGuidelineEmbedUrl(url: string, fileName?: string | null): string {
  const kind = detectGuidelineKind(url, fileName);
  if (kind === 'office') {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }
  if (kind === 'pdf') {
    return `${url}${url.includes('#') ? '' : '#toolbar=0'}`;
  }
  return url;
}
