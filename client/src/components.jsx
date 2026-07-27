import React from 'react';
export function Button({children,className='',...props}){return <button className={`btn ${className}`} {...props}>{children}</button>}
export function Card({children,className=''}){return <section className={`card ${className}`}>{children}</section>}
export function Field({label,children,hint}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export function Notice({children,type='info'}){return <div className={`notice ${type}`}>{children}</div>}
export function Spinner(){return <span className="spinner" aria-label="Lädt"/>}
export function Modal({open,onClose,title,children,wide=false}){if(!open)return null;return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal ${wide?'wide':''}`} onMouseDown={e=>e.stopPropagation()}><header><h2>{title}</h2><button className="icon-btn" onClick={onClose}>×</button></header>{children}</div></div>}
export function StatusBadge({status}){return <span className={`badge ${String(status).replace(/_/g,'-')}`}>{status}</span>}
