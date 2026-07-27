import React,{useEffect,useState} from 'react';
import { api,euro,id } from '../api';
import { supabase } from '../supabase';
import { Button,Card,Notice,Spinner,StatusBadge } from '../components';

export default function PricingPage(){
  const [settings,setSettings]=useState(null);
  const [products,setProducts]=useState([]);
  const [subscription,setSubscription]=useState(null);
  const [purchases,setPurchases]=useState([]);
  const [loading,setLoading]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  async function load(){
    const [{data:settingsData},{data:productData},{data:subscriptionData},{data:purchaseData}]=await Promise.all([
      supabase.from('app_settings').select('*').eq('id',1).single(),
      supabase.from('products').select('*').eq('visible',true).eq('active',true).order('sort_order'),
      supabase.from('subscriptions').select('*').maybeSingle(),
      supabase.from('purchases').select('*').eq('status','paid')
    ]);
    setSettings(settingsData);setProducts(productData||[]);setSubscription(subscriptionData);setPurchases(purchaseData||[]);
  }

  useEffect(()=>{
    (async()=>{
      const params=new URLSearchParams(location.search);
      try{
        if(params.get('paypal')==='capture'&&params.get('token')){
          setLoading('paypal-capture');
          await api(`/api/billing/paypal-capture?orderId=${encodeURIComponent(params.get('token'))}`,{method:'POST',body:'{}'});
          setMessage('PayPal-Zahlung wurde bestätigt.');
          history.replaceState({},'',location.pathname);
        }else if(params.get('payment')==='success'){
          setMessage('Zahlung wurde abgeschlossen. Die Freischaltung erfolgt sicher über den Zahlungs-Webhook.');
          history.replaceState({},'',location.pathname);
        }else if(params.get('payment')==='cancel'){
          setMessage('Der Bezahlvorgang wurde abgebrochen. Es wurde nichts gekauft.');
          history.replaceState({},'',location.pathname);
        }else if(params.get('paypal')==='subscription-success'){
          setMessage('Das PayPal-Abo wurde bestätigt. Die Freischaltung erfolgt über den PayPal-Webhook.');
          history.replaceState({},'',location.pathname);
        }
      }catch(e){setError(e.message)}finally{setLoading('');await load()}
    })();
  },[]);

  async function buy(product){
    setLoading(product.id);setError('');setMessage('');
    try{const result=await api('/api/billing/checkout',{method:'POST',body:JSON.stringify({productId:product.id,requestId:id()})});location.href=result.checkoutUrl}
    catch(e){setError(e.message);setLoading('')}
  }
  async function portal(){try{const result=await api('/api/billing/portal',{method:'POST',body:'{}'});location.href=result.url}catch(e){setError(e.message)}}
  async function cancel(){if(!confirm('Abo wirklich kündigen?'))return;try{const result=await api('/api/billing/cancel',{method:'POST',body:'{}'});setMessage(result.message);await load()}catch(e){setError(e.message)}}
  async function download(product){setLoading(`download-${product.id}`);try{const result=await api(`/api/billing/download?productId=${encodeURIComponent(product.id)}`);window.open(result.signedUrl,'_blank','noopener,noreferrer')}catch(e){setError(e.message)}finally{setLoading('')}}
  const owns=product=>purchases.some(p=>p.product_id===product.id&&p.status==='paid');

  return <div className="stack">
    <Card>
      <h1>Preise und sichere Zahlungen</h1>
      <p>Aktiver Zahlungsanbieter: <strong>{settings?.active_payment_provider||'–'}</strong>{settings?.payment_account_label?` · ${settings.payment_account_label}`:''}</p>
      <Notice>Kreditkartennummern werden ausschließlich auf der sicheren Stripe-Bezahlseite eingegeben. Yildiz AI speichert keine vollständigen Kartendaten.</Notice>
      {!settings?.payments_enabled&&<Notice type="warning">Zahlungen sind abgeschaltet. Preise bleiben sichtbar, aber Produkte können nicht gekauft werden.</Notice>}
      {message&&<Notice>{message}</Notice>}{error&&<Notice type="error">{error}</Notice>}
    </Card>
    {settings?.prices_visible===false?<Card><Notice>Preise sind derzeit ausgeblendet.</Notice></Card>:<div className="pricing-grid">{products.map(product=>{
      const current=subscription?.product_id===product.id&&['active','trialing','past_due','paused'].includes(subscription?.status);
      const paidUpdate=product.kind==='update'&&owns(product);
      return <Card key={product.id} className={current?'current-plan':''}>
        <span className="product-kind">{product.kind==='update'?'Einmaliges Update':'Abo'}</span>
        <h2>{product.name}</h2><p>{product.description}</p>
        <div className="price">{euro(product.price_cents)}{product.billing_interval&&<small> / {product.billing_interval==='month'?'Monat':'Jahr'}</small>}</div>
        <ul>{Object.entries(product.features||{}).filter(([,value])=>value===true).map(([key])=><li key={key}>{key}</li>)}</ul>
        {current?<><StatusBadge status={subscription.status}/><Button disabled>Aktueller Zugang</Button></>:paidUpdate?<Button onClick={()=>download(product)} disabled={loading===`download-${product.id}`}>{loading===`download-${product.id}`?<Spinner/>:'Gekauftes Update herunterladen'}</Button>:<Button onClick={()=>buy(product)} disabled={loading===product.id||!settings?.payments_enabled||!product.purchasable}>{loading===product.id?<Spinner/>:settings?.payments_enabled&&product.purchasable?'Jetzt sicher bezahlen':'Derzeit nicht kaufbar'}</Button>}
      </Card>
    })}</div>}
    {subscription?.provider==='stripe'&&<Card><div className="inline"><Button className="secondary" onClick={portal}>Zahlungsmethode verwalten</Button><Button className="danger" onClick={cancel}>Abo kündigen</Button></div></Card>}
    {subscription?.provider==='paypal'&&['active','trialing','past_due','paused'].includes(subscription.status)&&<Card><Button className="danger" onClick={cancel}>PayPal-Abo kündigen</Button></Card>}
  </div>
}
