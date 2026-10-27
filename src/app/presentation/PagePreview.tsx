import { useEffect, useRef, useState } from 'react';
import type { LayoutPage } from '../../presentation/pageLayout.ts';
import type { BookletFont } from '../../presentation/bookletFont.ts';
import { pageCanvas } from '../../presentation/pageCanvas.ts';
export function PagePreview({
  page,
  font,
  images,
  draft,
}: {
  page: LayoutPage | undefined;
  font: BookletFont;
  images: Record<string, string>;
  draft: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    if (!page) {
      host.current?.replaceChildren();
      return;
    }
    pageCanvas(page, font, images, draft, 1400)
      .then((c) => {
        if (live && host.current) {
          c.setAttribute('role', 'img');
          c.setAttribute('aria-label', `Booklet page: ${page.title}`);
          host.current.replaceChildren(c);
        }
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [page, font, images, draft]);
  return (
    <>
      <div className="booklet-page-canvas" ref={host} />
      {error && <p role="alert">{error}</p>}
    </>
  );
}
