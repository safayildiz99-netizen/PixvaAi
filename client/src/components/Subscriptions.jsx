import { useMemo, useState } from 'react';
import { BadgeCheck, Check, CircleDollarSign, Crown, LoaderCircle, LockKeyhole, ShieldCheck, Sparkles, Video, WandSparkles } from 'lucide-react';
import { api } from '../api.js';
import { formatPlanPrice, getPlan, getPlanCatalog, normalizeSubscription } from '../plans.js';

const planIcons = { free: ShieldCheck, creator: WandSparkles, studio: Crown };

export default function Subscriptions({ user, isGuest = false, subscription, onSubscriptionChanged, onRequireLogin, uiText = {}, planPrices = {}, betaPlanPrices = {}, customPlans = [] }) {
  const catalog = useMemo(() => getPlanCatalog(customPlans), [customPlans]);
  const current = normalizeSubscription(subscription, customPlans);
  const [busyPlan, setBusyPlan] = useState('');
  const [status, setStatus] = useState('');
  const currentPlan = useMemo(() => getPlan(current.planId, customPlans), [current.planId, customPlans]);
  const displayPrice = (plan) => Number(planPrices?.[plan.id] ?? plan.examplePrice ?? 0);
  const betaPrice = (plan) => Number(betaPlanPrices?.[plan.id] ?? plan.betaPrice ?? 0);

  async function choosePlan(planId) {
    setStatus('');
    if (isGuest || !user || user.role === 'guest') {
      onRequireLogin?.();
      return;
    }
    if (planId === current.planId && current.status === 'active') {
      setStatus(`${getPlan(planId, customPlans).name} ist bereits aktiv.`);
      return;
    }
    setBusyPlan(planId);
    try {
      const result = await api('/api/subscription/select', {
        method: 'POST',
        body: JSON.stringify({ planId })
      });
      const next = normalizeSubscription(result.subscription, customPlans);
      onSubscriptionChanged?.(next);
      setStatus(`${getPlan(planId, customPlans).name} wurde für die Beta sofort aktiviert. Es wurde nichts berechnet.`);
    } catch (error) {
      setStatus(error.message || 'Das Abo konnte nicht aktiviert werden. Bitte zuerst das V9-Supabase-Update ausführen.');
    } finally {
      setBusyPlan('');
    }
  }

  return <section className="subscriptions-page">
    <div className="subscription-hero">
      <div>
        <span className="subscription-kicker"><Sparkles size={16}/> Yildiz AI Beta</span>
        <h2>{uiText.plansTitle || 'Wähle den passenden Zugang.'}</h2>
        <p><strong>{uiText.plansSubtitle || 'Alle Beta-Abos können ohne Zahlung getestet werden.'}</strong><br/>Jeder angemeldete Account – auch ein Admin – kann während der Beta jeden Zugang aktivieren und wechseln. Die angezeigten Preise sind Beispielpreise für später. Echte OpenAI-Bilder oder Sora-Videos können weiterhin API-Guthaben des Betreibers verbrauchen.</p>
      </div>
      <div className="beta-price-card">
        <CircleDollarSign size={28}/>
        <span>Beta-Abo</span>
        <b>0,00 €</b>
        <small>Keine Zahlungsdaten nötig</small>
      </div>
    </div>

    {status && <div className="status-line subscription-status">{status}</div>}

    <div className="plan-grid">
      {catalog.map((plan) => {
        const Icon = planIcons[plan.id] || BadgeCheck;
        const active = current.planId === plan.id && current.status === 'active';
        return <article className={`plan-card ${plan.recommended ? 'recommended' : ''} ${active ? 'active' : ''}`} key={plan.id}>
          {plan.recommended && <div className="plan-ribbon">Empfohlen</div>}
          <div className="plan-title-row"><div className="plan-icon"><Icon size={22}/></div><div><span>{plan.eyebrow}</span><h3>{plan.name}</h3></div></div>
          <p>{plan.description}</p>
          <div className="plan-price">
            <span className="example-price">später z. B. {formatPlanPrice(displayPrice(plan))} / Monat</span>
            <strong>{formatPlanPrice(betaPrice(plan))}</strong>
            <small>während der Beta</small>
          </div>
          <ul>{plan.features.map((feature) => <li key={feature}><Check size={16}/><span>{feature}</span></li>)}</ul>
          <button className={active ? 'current-plan-btn' : 'primary-btn'} disabled={Boolean(busyPlan) || active} onClick={() => choosePlan(plan.id)}>
            {busyPlan === plan.id ? <LoaderCircle className="spin" size={17}/> : active ? <BadgeCheck size={17}/> : plan.id === 'studio' ? <Crown size={17}/> : <Sparkles size={17}/>} 
            {active ? 'Aktueller Zugang' : isGuest ? 'Mit Konto aktivieren' : 'Beta-Zugang aktivieren · 0,00 €'}
          </button>
        </article>;
      })}
    </div>

    <div className="subscription-facts">
      <article><LockKeyhole size={20}/><div><b>Keine automatische Zahlung</b><span>Die Beta speichert nur deine Auswahl. Es gibt keinen Zahlungsanbieter und keine Abbuchung.</span></div></article>
      <article><Video size={20}/><div><b>Medienkosten bleiben getrennt</b><span>OpenAI- und Sora-Kosten sind keine Abo-Kosten. Der Admin kann die Kostenabfrage global oder je Konto einstellen.</span></div></article>
      <article><ShieldCheck size={20}/><div><b>Jederzeit kündbar</b><span>Unter „Mein Konto“ kannst du sofort auf Free zurückwechseln.</span></div></article>
    </div>

    <div className="current-plan-summary"><span>Aktuell:</span><b>{currentPlan.name} · {current.status === 'active' ? 'aktiv' : 'gekündigt'}{user?.role === 'admin' ? ' · Adminrechte bleiben erhalten' : ''}</b></div>
  </section>;
}
