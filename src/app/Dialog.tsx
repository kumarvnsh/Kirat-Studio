import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Dialog({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={'studio-dialog' + (wide ? ' wide' : '')}
    aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose(); }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dialog-heading"><div><span className="eyebrow">KIRAT STUDIO</span><h2 id={titleId}>{title}</h2></div>
      <button onClick={onClose} aria-label="Close dialog">Close ×</button></div>
    {children}
  </dialog>;
}
