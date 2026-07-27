import { useMemo, useState } from 'react';
import { BadgeCheck, Check, CircleDollarSign, Crown, LoaderCircle, LockKeyhole, ShieldCheck, Sparkles, Video, WandSparkles } from 'lucide-react';
import { api } from '../api.js';
import { PLAN_CATALOG, formatPlanPrice, getPlan, normalizeSubscription } from '../plans.js';

const planIcons = { free: ShieldCheck, creator: WandSparkles, studio: Crown };

export default function Subscriptions({ user, isGuest = false, subscription, onSubscriptionChanged, onRequireLogin, uiText = {} }) {
  const current = normalizeSubscription(subscription);
  const [busyPlan, setBusyPlan] = useState('');
  const [status, setStatus] = useState('');
  const currentPlan = useMemo(() => getPlan(current.planId), [current.planId]);

  async function choosePlan(planId) {
    setStatus('');
    if (isGuest || !user || user.role === 'guest') {
      onRequireLogin?.();
      return;
    }
    if (user.role === 'admin') {
      setStatus('Admin-Konten haben bereits Zugriff auf alle Bereiche.');
      return;
    }
    if (planId === current.planId && current.status === 'active') {
      setStatus(`${getPlan(planId).name} ist bereits aktiv.`);
      return;
    }
    setBusyPlan(planId);
    try {
      const result = await api('/api/subscription/select', {
        method: 'POST',
        body: JSON.stringify({ planId })
      });
      const next = normalizeSubscription(result.subscription);
      onSubscriptionChanged?.(next);
      setStatus(`${getPlan(planId).name} wurde für die Beta sofort aktiviert. Es wurde nichts berechnet.`);
    } catch (error) {
      setStatus(error.message || 'Das Abo konnte nicht aktiviert werden.');
    } finally {
      setBusyPlan('');
    }
  }

  return <section className="subscriptions-page">
    <div className="subscription-hero">
      <div>
        <span className="subscription-kicker"><Sparkles size={16}/> Yildiz AI Beta</span>
        <h2>{uiText.plansTitle || 'Wähle den passenden Zugang.'}</h2>
        <p><strong>{uiText.plansSubtitle || 'Free, Creator und Studio Pro – während der Beta ohne Zahlung.'}</strong><br/>Die Preise sind Beispielpreise für später. Jeder angemeldete Account kann während der Beta jederzeit Free, Creator und Studio Pro ohne Zahlung testen und wechseln. Kosten können nur durch echte OpenAI-Bilder oder Sora-Videos entstehen – davor erscheint weiterhin eine deutliche Kostenbestätigung.</p>
      </div>
      <div className="beta-price-card">
        <CircleDollarSign size={28}/>
        <span>Beta-Preis</span>
        <b>0,00 €</b>
        <small>Keine Zahlungsdaten nötig</small>
      </div>
    </div>

    {status && <div className="status-line subscription-status">{status}</div>}

    <div className="plan-grid">
      {PLAN_CATALOG.map((plan) => {
        const Icon = planIcons[plan.id] || BadgeCheck;
        const active = user?.role === 'admin' ? plan.id === 'studio' : current.planId === plan.id && current.status === 'active';
        return <article className={`plan-card ${plan.recommended ? 'recommended' : ''} ${active ? 'active' : ''}`} key={plan.id}>
          {plan.recommended && <div className="plan-ribbon">Empfohlen</div>}
          <div className="plan-title-row"><div className="plan-icon"><Icon size={22}/></div><div><span>{plan.eyebrow}</span><h3>{plan.name}</h3></div></div>
          <p>{plan.description}</p>
          <div className="plan-price">
            <span className="example-price">später z. B. {formatPlanPrice(plan.examplePrice)} / Monat</span>
            <strong>{formatPlanPrice(plan.betaPrice)}</strong>
            <small>während der Beta</small>
          </div>
          <ul>{plan.features.map((feature) => <li key={feature}><Check size={16}/><span>{feature}</span></li>)}</ul>
          <button className={active ? 'current-plan-btn' : 'primary-btn'} disabled={Boolean(busyPlan) || active} onClick={() => choosePlan(plan.id)}>
            {busyPlan === plan.id ? <LoaderCircle className="spin" size={17}/> : active ? <BadgeCheck size={17}/> : plan.id === 'studio' ? <Crown size={17}/> : <Sparkles size={17}/>}
            {active ? 'Aktueller Zugang' : isGuest ? 'Mit Konto aktivieren' : 'In der Beta kostenlos aktivieren'}
          </button>
        </article>;
      })}
    </div>

    <div className="subscription-facts">
      <article><LockKeyhole size={20}/><div><b>Keine automatische Zahlung</b><span>Die Beta speichert nur deine Auswahl. Es gibt keinen Zahlungsanbieter und keine Abbuchung.</span></div></article>
      <article><Video size={20}/><div><b>Medienkosten bleiben sichtbar</b><span>Echte OpenAI-Bilder und Sora-Videos verbrauchen weiterhin das API-Guthaben des Betreibers. Ohne Bestätigung startet nichts.</span></div></article>
      <article><ShieldCheck size={20}/><div><b>Jederzeit kündbar</b><span>Unter „Mein Konto“ kannst du sofort auf Free zurückwechseln.</span></div></article>
    </div>

    <div className="current-plan-summary"><span>Aktuell:</span><b>{user?.role === 'admin' ? 'Admin · alle Funktionen' : `${currentPlan.name} · ${current.status === 'active' ? 'aktiv' : 'gekündigt'}`}</b></div>
  </section>;
}
