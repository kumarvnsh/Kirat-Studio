import { useState, type ReactNode } from 'react';
import type { ConstructionType } from '../domain/project.ts';
import { constructionReferences } from './constructionReferences.ts';
export function ConstructionReference({ type, fallback, className = 'c-icon3d' }: { type: ConstructionType; fallback?: ReactNode; className?: string }) {
  const reference = constructionReferences[type];
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (!reference || failedSource === reference.src) return <>{fallback}</>;
  return <img className={className} src={reference.src} alt={reference.alt} loading="lazy" decoding="async" onError={() => setFailedSource(reference.src)} />;
}
