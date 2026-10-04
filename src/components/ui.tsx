import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Check, Inbox, X, type LucideIcon } from 'lucide-react';
import { money, type Currency } from '../lib/workspace';

export function Panel({ children, className = '', title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) { return <section className={`panel ${className}`}>{(title || action) && <div className="panel-heading"><h2>{title}</h2>{action}</div>}{children}</section>; }
export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: LucideIcon; title: string; description: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon"><Icon size={25}/></div><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const generated = useId();
  let controlId = generated;
  const content = Children.toArray(children).map(child => {
    if (!isValidElement(child) || typeof child.type !== 'string' || !['input','select','textarea'].includes(child.type)) return child;
    const control = child as ReactElement<{id?:string}>;
    controlId = control.props.id || generated;
    return cloneElement(control,{id:controlId});
  });
  return <div className="field"><label htmlFor={controlId}>{label}</label>{content}</div>;
}
export function Money({ value, currency = 'BRL' }: { value: number; currency?: Currency }) { return <span className="money">{money(value, currency)}</span>; }
export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) { return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="page-heading-action">{action}</div>}</div>; }
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { const dialog = useRef<HTMLDialogElement>(null); const closeRef = useRef(onClose); closeRef.current = onClose; const id = useRef(crypto.randomUUID());
  useEffect(() => { const node = dialog.current; node?.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { node?.close(); document.body.style.overflow = previous; }; }, []);
  return <dialog ref={dialog} className="modal" aria-labelledby={id.current} onCancel={event => { event.preventDefault(); closeRef.current(); }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeRef.current(); } }}><div className="modal-heading"><h2 id={id.current}>{title}</h2><button type="button" className="icon-button" aria-label="Fechar janela" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
const ToastContext = createContext<(message: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) { const [message, setMessage] = useState(''); const timer = useRef<number | undefined>(undefined); useEffect(() => () => clearTimeout(timer.current), []); const notify = (value: string) => { clearTimeout(timer.current); setMessage(value); timer.current = window.setTimeout(() => setMessage(''), 5000); }; return <ToastContext.Provider value={notify}>{children}{message && <div className="toast" role="status"><Check size={18}/><span>{message}</span><button className="icon-button" aria-label="Fechar aviso" onClick={() => setMessage('')}><X size={16}/></button></div>}</ToastContext.Provider>; }
export function useToast() { return useContext(ToastContext); }
