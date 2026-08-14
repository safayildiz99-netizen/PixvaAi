import { useMemo, useState } from 'react';
import { BadgeCheck, Check, CircleDollarSign, Crown, LoaderCircle, LockKeyhole, ShieldCheck, Sparkles, Video, WandSparkles } from 'lucide-react';
import { api } from '../api.js';
import { formatPlanPrice, getPlan, getPlanCatalog, normalizeSubscription } from '../plans.js';

const planIcons = { free: ShieldCheck, creator: WandSparkles, studio: Crown };

export default function Subscriptions({
  user,
  isGuest = false,
  subscription,
  onSubscriptionChanged,
  onRequireLogin,
  uiText = {},
  planPrices = {},
  betaPlanPrices = {},
  customPlans = [],
  billingSettings = {}
}) {
  const catalog = useMemo(() => getPlanCatalog(customPlans), [customPlans]);
  const current = normalizeSubscription(subscription, customPlans);
  const [busyPlan, setBusyPlan] = useState('');
  const [status, setStatus] = useState('');
  const currentPlan = useMemo(() => getPlan(current.planId, customPlans), [current.planId, customPlans]);
  const displayPrice = (plan) => Number(planPrices?.[plan.id] ?? plan.examplePrice ?? 0);
  const betaPrice = (plan) => Number(betaPlanPrices?.[plan.id] ?? plan.betaPrice ?? 0);
  const paymentsEnabled = billingSettings?.paymentsEnabled === true && billingSettings?.paymentProvider === 'paypal';
  const paidAccessDays = Math.max(1, Number(billingSettings?.paidAccessDays || 30));
  const merchantLabel = String(billingSettings?.paymentMerchantLabel || '').trim();
  const purchasable = (plan) => plan.id !== 'free' && billingSettings?.planPurchasable?.[plan.id] === true && displayPrice(plan) > 0;

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

    const plan = getPlan(planId, customPlans);
    if (paymentsEnabled && plan.id !== 'free') {
      if (!purchasable(plan)) {
        setStatus('Dieses Abo zeigt seinen Preis, ist vom Admin aber derzeit nicht zum Kauf freigegeben.');
        return;
      }
      setBusyPlan(planId);
      try {
        const result = await api('/api/billing?action=create-order', {
          method:'POST',
          body:JSON.stringify({
            planId,
            requestId:globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
          })
        });
        if (!result?.approveUrl) throw new Error('PayPal hat keinen sicheren Zahlungslink geliefert.');
        window.location.assign(result.approveUrl);
      } catch (error) {
        setStatus(error.message || 'Die PayPal-Zahlung konnte nicht gestartet werden.');
        setBusyPlan('');
      }
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
      setStatus(`${plan.name} wurde im kostenlosen Modus aktiviert. Es wurde nichts berechnet.`);
    } catch (error) {
      setStatus(error.message || 'Das Abo konnte nicht aktiviert werden. Bitte zuerst das V9.2-Supabase-Update ausführen.');
    } finally {
      setBusyPlan('');
    }
  }

  return <section className="subscriptions-page">
    <div className="subscription-hero">
      <div>
        <span className="subscription-kicker"><Sparkles size={16}/> PIXVA</span>
        <h2>{uiText.plansTitle || 'Wähle den passenden Zugang.'}</h2>
        <p><strong>{paymentsEnabled ? 'Sichere Zahlung über PayPal.' : (uiText.plansSubtitle || 'Alle Beta-Abos können ohne Zahlung getestet werden.')}</strong><br/>
          {paymentsEnabled
            ? `Bezahlte Zugänge gelten jeweils ${paidAccessDays} Tage. Nach dem Klick wirst du zu PayPal weitergeleitet; PIXVA erhält keine PayPal-Passwörter oder Kartendaten.`
            : 'Der kostenlose Modus bleibt aktiv. Der Admin kann Zahlungen später einschalten, ohne die angezeigten Preise zu entfernen.'}
        </p>
      </div>
      <div className="beta-price-card">
        <CircleDollarSign size={28}/>
        <span>{paymentsEnabled ? 'PayPal' : 'Kostenloser Modus'}</span>
        <b>{paymentsEnabled ? 'Sicher zahlen' : '0,00 €'}</b>
        <small>{paymentsEnabled ? `${paidAccessDays} Tage Zugang` : 'Keine Zahlungsdaten nötig'}</small>
      </div>
    </div>

    {status && <div className="status-line subscription-status">{status}</div>}

    <div className="plan-grid">
      {catalog.map((plan) => {
        const Icon = planIcons[plan.id] || BadgeCheck;
        const active = current.planId === plan.id && current.status === 'active';
        const canBuy = purchasable(plan);
        const shownPrice = paymentsEnabled ? displayPrice(plan) : betaPrice(plan);
        return <article className={`plan-card ${plan.recommended ? 'recommended' : ''} ${active ? 'active' : ''}`} key={plan.id}>
          {plan.recommended && <div className="plan-ribbon">Empfohlen</div>}
          <div className="plan-title-row"><div className="plan-icon"><Icon size={22}/></div><div><span>{plan.eyebrow}</span><h3>{plan.name}</h3></div></div>
          <p>{plan.description}</p>
          <div className="plan-price">
            {paymentsEnabled && <span className="example-price">Listenpreis</span>}
            {!paymentsEnabled && <span className="example-price">später z. B. {formatPlanPrice(displayPrice(plan))} / Monat</span>}
            <strong>{formatPlanPrice(shownPrice)}</strong>
            <small>{paymentsEnabled ? (plan.id === 'free' ? 'dauerhaft kostenlos' : `für ${paidAccessDays} Tage`) : 'im kostenlosen Modus'}</small>
          </div>
          <ul>{plan.features.map((feature) => <li key={feature}><Check size={16}/><span>{feature}</span></li>)}</ul>
          <button
            className={active ? 'current-plan-btn' : paymentsEnabled && canBuy ? 'primary-btn' : 'primary-btn'}
            disabled={Boolean(busyPlan) || active || (paymentsEnabled && plan.id !== 'free' && !canBuy)}
            onClick={() => choosePlan(plan.id)}
          >
            {busyPlan === plan.id ? <LoaderCircle className="spin" size={17}/> : active ? <BadgeCheck size={17}/> : plan.id === 'studio' ? <Crown size={17}/> : <Sparkles size={17}/>}
            {active
              ? 'Aktueller Zugang'
              : isGuest
                ? 'Mit Konto fortfahren'
                : paymentsEnabled
                  ? plan.id === 'free'
                    ? 'Free aktivieren'
                    : canBuy
                      ? `Mit PayPal bezahlen · ${formatPlanPrice(displayPrice(plan))}`
                      : 'Preis sichtbar · derzeit nicht kaufbar'
                  : 'Kostenlos aktivieren · 0,00 €'}
          </button>
          {paymentsEnabled && merchantLabel && plan.id !== 'free' && <div className="payment-merchant-note">Zahlung an: {merchantLabel}</div>}
        </article>;
      })}
    </div>

    <div className="subscription-facts">
      <article><LockKeyhole size={20}/><div><b>Sicherer PayPal-Checkout</b><span>{paymentsEnabled ? 'Die Zahlung erfolgt auf der PayPal-Seite. PIXVA speichert keine vollständigen Zahlungsdaten.' : 'Zahlungen sind derzeit ausgeschaltet.'}</span></div></article>
      <article><Video size={20}/><div><b>Medienkosten bleiben getrennt</b><span>OpenAI- und Sora-Kosten sind keine Abo-Kosten. Der Admin kontrolliert weiterhin Limits und Kostenabfragen.</span></div></article>
      <article><ShieldCheck size={20}/><div><b>Serverseitig bestätigt</b><span>Der Zugang wird erst aktiviert, nachdem PayPal den bezahlten Betrag als abgeschlossen bestätigt hat.</span></div></article>
    </div>

    <div className="current-plan-summary">
      <span>Aktuell:</span>
      <b>{currentPlan.name} · {current.status === 'active' ? 'aktiv' : 'gekündigt'}{current.paidUntil ? ` · bezahlt bis ${new Date(current.paidUntil).toLocaleDateString('de-DE')}` : ''}{user?.role === 'admin' ? ' · Adminrechte bleiben erhalten' : ''}</b>
    </div>
  </section>;
}
