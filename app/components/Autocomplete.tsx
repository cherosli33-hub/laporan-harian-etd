'use client';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { suggestionStore, type SuggestionKind } from '../lib/suggestionStore';

type Props = { kind: SuggestionKind; value: string; onChange: (value: string) => void; placeholder?: string; 'aria-label'?: string };
export default function Autocomplete({ kind, value, onChange, placeholder, 'aria-label': label }: Props) {
 const id = useId(), input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
 const interactingWithList = useRef(false);
 const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(-1);
 const [position, setPosition] = useState<CSSProperties>({});
 const options = open ? suggestionStore.values(kind, query, Infinity) : [];
 const showSuggestions = open && options.length > 0;
 useEffect(() => {
  if (!open) return;
  const place = () => {
   if (!input.current) return;
   const rect = input.current.getBoundingClientRect(), viewport = window.visualViewport;
   const top = viewport?.offsetTop || 0, bottom = top + (viewport?.height || window.innerHeight);
   const below = bottom - rect.bottom - 8, above = rect.top - top - 8;
   const height = Math.max(0, Math.min(240, Math.max(below, above)));
   setPosition({ left: rect.left, width: rect.width, maxHeight: height, ...(below >= Math.min(240, above) ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }) });
  };
  place();
  const outside = (event: PointerEvent) => {
   if (event.target !== input.current && !list.current?.contains(event.target as Node)) { interactingWithList.current = false; setOpen(false); }
  };
  document.addEventListener('pointerdown', outside);
  window.addEventListener('resize', place);
  const scroll = (event: Event) => { if (!list.current?.contains(event.target as Node)) place(); };
  window.addEventListener('scroll', scroll, true);
  window.visualViewport?.addEventListener('resize', place);
  window.visualViewport?.addEventListener('scroll', place);
  return () => {
   document.removeEventListener('pointerdown', outside);
   window.removeEventListener('resize', place); window.removeEventListener('scroll', scroll, true);
   window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place);
  };
 }, [open]);
 useEffect(() => { if (active >= 0) list.current?.children[active]?.scrollIntoView({ block: 'nearest' }); }, [active]);
 const choose = (option: string) => { interactingWithList.current = false; onChange(option); input.current?.focus(); setOpen(false); setActive(-1); };
 return <div className="etd-autocomplete">
  <input ref={input} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={showSuggestions} aria-controls={showSuggestions ? id : undefined} aria-activedescendant={showSuggestions && active >= 0 ? `${id}-${active}` : undefined} autoComplete="off" value={value} placeholder={placeholder}
   onFocus={() => { setQuery(''); setActive(-1); setOpen(true); }}
   onClick={() => { if (!open) { setQuery(''); setActive(-1); setOpen(true); } }}
   onChange={event => { onChange(event.target.value); setQuery(event.target.value); setActive(-1); setOpen(true); }}
   onBlur={event => { if (!interactingWithList.current && !list.current?.contains(event.relatedTarget as Node)) setOpen(false); }}
   onKeyDown={event => {
    if (event.key === 'Escape') { setOpen(false); setActive(-1); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
     event.preventDefault(); setOpen(true);
     setActive(index => options.length ? (event.key === 'ArrowDown' ? (index + 1) % options.length : (index <= 0 ? options.length - 1 : index - 1)) : -1);
    } else if (event.key === 'Enter' && open) {
     event.preventDefault(); if (active >= 0 && options[active]) choose(options[active]); else setOpen(false);
    } else if (event.key === 'Tab') setOpen(false);
   }} />
  {showSuggestions && createPortal(<div ref={list} id={id} role="listbox" onPointerDown={() => { interactingWithList.current = true; }} onPointerCancel={() => { interactingWithList.current = false; }} aria-label={label || placeholder} className="etd-autocomplete-options no-print" style={position}>
   {options.map((option, index) => <button type="button" role="option" aria-selected={active === index} id={`${id}-${index}`} key={option} tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>{option}</button>)}
  </div>, document.body)}
 </div>;
}
