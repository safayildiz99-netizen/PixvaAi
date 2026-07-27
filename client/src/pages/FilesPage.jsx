import React,{useEffect,useRef,useState} from 'react';
import { api,id,uploadPrivateFile } from '../api';
import { supabase } from '../supabase';
import { Button,Card,Field,Notice,Spinner } from '../components';

export default function FilesPage(){
  const [type,setType]=useState('pdf');
  const [title,setTitle]=useState('');
  const [content,setContent]=useState('');
  const [filename,setFilename]=useState('');
  const [rows,setRows]=useState('Produkt,Preis\nBeispiel,1.99');
  const [files,setFiles]=useState([]);
  const [loading,setLoading]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const uploadRef=useRef(null);

  async function load(){
    const {data,error:loadError}=await supabase.from('media_assets').select('*').order('created_at',{ascending:false});
    if(loadError)setError(loadError.message);else setFiles(data||[]);
  }
  useEffect(()=>{load()},[]);

  async function create(){
    setLoading(true);setError('');setMessage('');
    try{
      const body={requestId:id(),type,title,content,filename};
      if(type==='xlsx')body.rows=rows.split('\n').map(r=>r.split(',').map(x=>x.trim()));
      const result=await api('/api/files/create',{method:'POST',body:JSON.stringify(body)});
      if(!result.verified)throw new Error('Die erzeugte Datei konnte nicht verifiziert werden.');
      window.open(result.signedUrl,'_blank','noopener,noreferrer');
      setMessage('Datei wurde erstellt, geprüft und privat gespeichert.');
      await load();
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }

  async function uploadSelected(event){
    const file=event.target.files?.[0];
    if(!file)return;
    setUploading(true);setError('');setMessage('');
    try{
      const result=await uploadPrivateFile(file);
      setMessage(`${result.asset.original_name} wurde privat gespeichert und geprüft.`);
      await load();
    }catch(e){setError(e.message)}finally{
      setUploading(false);
      if(uploadRef.current)uploadRef.current.value='';
    }
  }

  async function open(asset){
    try{const result=await api(`/api/files/signed-url?assetId=${asset.id}`);window.open(result.signedUrl,'_blank','noopener,noreferrer')}
    catch(e){setError(e.message)}
  }

  return <div className="two-col">
    <div className="stack">
      <Card>
        <h1>Echte Dateien erstellen</h1>
        <Notice>Vor dem Download prüft der Server: Datei vorhanden, Größe größer als null, richtiger Nutzer und korrekter Dateityp.</Notice>
        <div className="segmented">
          <button className={type==='pdf'?'active':''} onClick={()=>setType('pdf')}>PDF</button>
          <button className={type==='docx'?'active':''} onClick={()=>setType('docx')}>Word</button>
          <button className={type==='xlsx'?'active':''} onClick={()=>setType('xlsx')}>Excel</button>
        </div>
        <Field label="Dateiname"><input value={filename} onChange={e=>setFilename(e.target.value)} placeholder={`angebot.${type}`}/></Field>
        <Field label="Titel"><input value={title} onChange={e=>setTitle(e.target.value)}/></Field>
        {type==='xlsx'?<Field label="Tabellendaten (Komma getrennt)"><textarea rows={9} value={rows} onChange={e=>setRows(e.target.value)}/></Field>:<Field label="Inhalt"><textarea rows={11} value={content} onChange={e=>setContent(e.target.value)}/></Field>}
        <Button onClick={create} disabled={loading}>{loading?<><Spinner/> Datei wird geprüft…</>:`${type.toUpperCase()} erstellen`}</Button>
      </Card>
      <Card>
        <h2>Eigene Datei hochladen</h2>
        <p>Bilder, Videos, PDF, Word, Excel, Text, CSV, JSON und HTML werden direkt in deinen privaten Supabase-Storage-Ordner geladen.</p>
        <input ref={uploadRef} type="file" onChange={uploadSelected} disabled={uploading}/>
        {uploading&&<p><Spinner/> Upload und Sicherheitsprüfung laufen…</p>}
      </Card>
      {message&&<Notice>{message}</Notice>}
      {error&&<Notice type="error">{error}</Notice>}
    </div>
    <Card>
      <h2>Meine privaten Dateien</h2>
      <div className="file-list">{files.map(file=><button key={file.id} onClick={()=>open(file)}><span>{file.original_name||file.storage_path.split('/').pop()}</span><small>{file.mime_type} · {(file.size_bytes/1024).toFixed(1)} KB</small></button>)}</div>
    </Card>
  </div>
}
