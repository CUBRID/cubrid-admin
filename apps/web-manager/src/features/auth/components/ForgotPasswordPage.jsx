import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Input } from '../../../components/ds/forms/Input';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { useCM } from '../../../constants/useCM';

export default function ForgotPasswordPage() {
  const CM = useCM();
  const [email, setEmail]       = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setSubmitted(true); setLoading(false); }, 1500);
  };

  const inputBase  = 'w-full h-11 text-15 font-medium bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/10 rounded-xl outline-hidden transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 dark:text-white';
  const inputFocus = 'focus:border-amber-500/50 dark:focus:border-amber-500/40 focus:bg-amber-500/2 dark:focus:bg-amber-500/3';
  const inputNorm  = 'hover:border-slate-300 dark:hover:border-white/20';

  return (
    <div className="h-screen flex bg-white dark:bg-[#0d0d0f] font-sans selection:bg-amber-500/20 overflow-hidden">


      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col overflow-hidden bg-[#080809]">

        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />

        {/* Glow blobs — rose-tinted for recovery context */}
        <div className="absolute top-[-5%] right-[-5%]   w-[460px] h-[460px] bg-rose-500/6   rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[380px] h-[380px] bg-amber-500/4 rounded-full blur-[120px] pointer-events-none" />

        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-24 h-24 border-l-2 border-t-2 border-amber-500/20 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-24 h-24 border-r-2 border-b-2 border-amber-500/20 pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full justify-between p-14">
          <div>
            {/* Back nav */}
            <Link
              to="/login"
              className="inline-flex items-center gap-2 mb-14 group text-slate-600 hover:text-white transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-white/4 border border-white/[0.07] flex items-center justify-center group-hover:bg-white/10 transition-colors">
                <Icon name="arrow_back" size="15px" weight={300} className="text-slate-500 group-hover:text-white" />
              </div>
              <span className="text-13 font-bold uppercase tracking-[0.2em]">{CM.backToLogin}</span>
            </Link>

            {/* Brand */}
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg">
                <img src="/cubrid-logo.png" alt="CUBRID" className="w-7 h-7 object-contain" />
              </div>
              <div>
                <p className="text-white font-bold text-lg leading-none tracking-tight">CUBRID <span className="text-amber-400 font-light">Manager</span></p>
                <p className="text-12 text-slate-600 uppercase tracking-[0.2em] font-semibold mt-0.5">{CM.enterpriseSuite}</p>
              </div>
            </div>

            {/* Headline */}
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-px bg-rose-500/60" />
                <span className="text-12 font-bold uppercase tracking-[0.25em] text-rose-500/80 font-mono">{CM.accountRecovery}</span>
              </div>
              <h1 className="text-5xl font-black text-white leading-[1.08] tracking-tighter mb-5">
                {CM.resetAccessCredentials}
              </h1>
              <p className="text-17 text-slate-500 font-light leading-relaxed max-w-md">
                {CM.recoverySecurityDesc}
              </p>
            </div>

            {/* Security protocol info card */}
            <div className="p-5 rounded-xl bg-white/2 border border-white/6 max-w-sm">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Icon name="shield_lock" size="sm" weight={300} className="text-amber-400" />
                </div>
                <p className="text-13 font-bold text-white uppercase tracking-widest">{CM.securityProtocol}</p>
              </div>
              <p className="text-14 text-slate-500 leading-relaxed">
                {CM.recoveryProtocolDesc}
              </p>

              {/* 3 step flow */}
              <div className="mt-4 space-y-2">
                {[
                  { step: '01', label: CM.submitEmailStep },
                  { step: '02', label: CM.checkInboxStep },
                  { step: '03', label: CM.setNewPasswordStep },
                ].map((s) => (
                  <div key={s.step} className="flex items-center gap-3">
                    <span className="text-12 font-mono font-bold text-amber-500/60 w-5 shrink-0">{s.step}</span>
                    <div className="h-px w-3 bg-white/10" />
                    <span className="text-13 text-slate-600">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="text-12 font-bold text-slate-700 uppercase tracking-[0.3em] mt-10">
            {CM.securityInfrastructure}
          </p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="w-full lg:w-[48%] flex flex-col items-center justify-center px-8 sm:px-14 md:px-20 bg-white dark:bg-[#0d0d0f] relative overflow-hidden">

        {/* Ambient glows */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/3   rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-amber-500/3 rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-[360px] relative z-10">

          {/* Mobile brand */}
          <div className="flex lg:hidden items-center gap-2.5 mb-10">
            <div className="w-8 h-8 bg-slate-900 dark:bg-white rounded-lg flex items-center justify-center">
              <img src="/cubrid-logo.png" alt="CUBRID" className="w-5 h-5 object-contain dark:brightness-0" />
            </div>
            <span className="text-slate-900 dark:text-white font-bold text-base">CUBRID <span className="text-amber-500">Manager</span></span>
          </div>

          {!submitted ? (
            <>
              {/* Header */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-5 bg-rose-500 rounded-full" />
                  <span className="text-12 font-bold uppercase tracking-[0.2em] text-slate-400 font-mono">{CM.recoveryLabel}</span>
                </div>
                <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none mb-2">{CM.forgotPasswordLabel}</h2>
                <p className="text-15 text-slate-500 dark:text-slate-400 leading-relaxed">
                  {CM.enterEmailInstruction}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label={CM.emailAddressLabel}
                  type="email"
                  required
                  icon="alternate_email"
                  placeholder={CM.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 mt-2 bg-slate-900 dark:bg-amber-500 text-white dark:text-black text-15 font-bold rounded-xl shadow-md hover:shadow-lg hover:bg-slate-800 dark:hover:bg-amber-400 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 group"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/20 dark:border-black/20 border-t-white dark:border-t-black rounded-full animate-spin" />
                  ) : (
                    <>
                      <span className="tracking-wide">{CM.sendRecoveryLink}</span>
                      <Icon name="send" size="sm" weight={300} className="group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
              </form>

              {/* Back to login */}
              <p className="mt-7 text-center text-14 text-slate-500 dark:text-slate-400">
                {CM.rememberPasswordQuestion}{' '}
                <Link to="/login" className="font-bold text-slate-900 dark:text-amber-500 hover:underline underline-offset-4">{CM.signIn}</Link>
              </p>
            </>
          ) : (
            /* ── Success state ── */
            <div className="text-center animate-in zoom-in-95 fade-in duration-300">
              {/* Icon */}
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                <Icon name="mark_email_read" size="sm" weight={300} className="text-2xl text-emerald-500" />
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className="w-1.5 h-5 bg-emerald-500 rounded-full" />
                  <span className="text-12 font-bold uppercase tracking-[0.2em] text-slate-400 font-mono">{CM.linkSent}</span>
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2">{CM.checkInbox}</h2>
                <p className="text-15 text-slate-500 dark:text-slate-400 leading-relaxed">
                  {CM.recoveryInstructionsSent}{' '}
                  <span className="text-slate-900 dark:text-white font-bold">{email}</span>.
                </p>
              </div>

              {/* Expiry warning */}
              <div className="my-6 text-left">
                <InfoBanner variant="warning" title={CM.linkExpiry} icon="timer">
                  {CM.checkSpamMsg}
                </InfoBanner>
              </div>

              <button
                onClick={() => { setSubmitted(false); setEmail(''); }}
                className="w-full h-10 text-14 font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/4 border border-slate-200 dark:border-white/8 rounded-xl hover:border-slate-300 dark:hover:border-white/15 hover:text-slate-700 dark:hover:text-slate-200 transition-all"
              >
                {CM.resendRecoveryEmail}
              </button>

              <Link
                to="/login"
                className="mt-5 inline-flex items-center gap-1.5 text-14 font-bold text-slate-900 dark:text-amber-500 hover:underline underline-offset-4"
              >
                <Icon name="arrow_back" size="15px" weight={300} />
                {CM.backToSignIn}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
