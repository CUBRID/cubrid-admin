import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { loginStart, loginSuccess, loginFailure } from '../authSlice';
import { toggleTheme } from '../../layout/layoutSlice';
import { authApi } from '../authApi';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Input } from '../../../components/ds/forms/Input';
import LanguageToggle from '../../layout/components/LanguageToggle';
import { useCM } from '../../../constants/useCM';

export default function LoginPage() {
  const CM = useCM();
  const containerRef = useRef(null);

  useEffect(() => {
    let frameId;
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const x = e.clientX;
      const y = e.clientY;
      
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.style.setProperty('--mouse-x', `${x}px`);
          containerRef.current.style.setProperty('--mouse-y', `${y}px`);
        }
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(frameId);
    };
  }, []);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading } = useSelector((state) => state.auth, shallowEqual);
  const { theme } = useSelector((state) => state.layout, shallowEqual);

  const validate = () => {
    const errs = {};
    if (!username.trim()) errs.username = CM.usernameRequired;
    if (!password) errs.password = CM.passwordRequired;
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setApiError('');
    dispatch(loginStart());
    try {
      const response = await authApi.login(username, password);
      if (!response?.token || !response?.refreshToken) {
        throw new Error('Login response missing access/refresh token');
      }
      dispatch(loginSuccess({
        token: response.token,
        refreshToken: response.refreshToken,
        user: { id: username },
      }));
      navigate('/home', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || CM.loginFailedMsg;
      dispatch(loginFailure(msg));
      setApiError(msg);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-[#070709] font-sans selection:bg-amber-500/20 relative overflow-hidden"
    >
      
      {/* Glow dot matrix background */}
      <div 
        className="absolute inset-0 pointer-events-none bg-[radial-gradient(rgba(0,0,0,0.08)_1.3px,transparent_1.3px)] dark:bg-[radial-gradient(rgba(245,158,11,0.11)_1.3px,transparent_1.3px)] [background-size:20px_20px]" 
        style={{
          maskImage: 'radial-gradient(circle at center, white 30%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(circle at center, white 30%, transparent 80%)',
        }}
      />

      {/* Ambient glowing blobs centered behind the login card */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-sky-500/[0.06] dark:bg-sky-500/[0.05] rounded-full blur-[130px] pointer-events-none" />
      
      {/* Interactive mouse-following glow */}
      <div 
        className="absolute top-0 left-0 w-[500px] h-[500px] bg-amber-500/[0.08] dark:bg-amber-500/[0.07] rounded-full blur-[120px] pointer-events-none transition-transform duration-500 ease-out"
        style={{
          transform: 'translate3d(calc(var(--mouse-x, 50vw) - 50%), calc(var(--mouse-y, 50vh) - 50%), 0)',
        }}
      />

      {/* Centered Login Card */}
      <div className="w-full max-w-[380px] bg-white/90 dark:bg-[#121215]/90 backdrop-blur-xl border border-slate-200/80 dark:border-white/10 rounded-2xl shadow-[0_24px_60px_-15px_rgba(0,0,0,0.08),0_0_40px_rgba(245,158,11,0.04)] dark:shadow-[0_24px_60px_-15px_rgba(0,0,0,0.6),0_0_50px_rgba(245,158,11,0.08)] relative z-10 overflow-hidden p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-500">
        
        {/* Top Accent Gradient Border with Subtle Glow */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-500/40 via-amber-400 to-amber-500/40 shadow-[0_1px_8px_rgba(245,158,11,0.25)]" />

        {/* Language + theme toggles */}
        <div className="flex items-center justify-end gap-2 mb-4">
          <LanguageToggle />
          <button
            type="button"
            data-testid="login-theme-toggle"
            onClick={() => dispatch(toggleTheme())}
            title={theme === 'light' ? CM.switchToDarkMode : CM.switchToLightMode}
            className="h-8 w-8 flex items-center justify-center rounded-sm border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <Icon name={theme === 'light' ? 'dark_mode' : 'light_mode'} size="19px" weight={300} />
          </button>
        </div>

        {/* Brand header */}
        <div className="flex items-center gap-3 justify-center mb-6">
          <div className="w-9 h-9 bg-slate-900 dark:bg-white rounded-xl flex items-center justify-center shadow-md shrink-0">
            <img src="/cubrid-logo.png" alt="CUBRID" className="w-6 h-6 object-contain dark:brightness-100" />
          </div>
          <div>
            <h1 className="text-slate-900 dark:text-white font-extrabold text-base leading-none tracking-tight">CUBRID <span className="text-amber-500 font-light">Manager</span></h1>
            <p className="text-12 text-slate-400 dark:text-slate-500 font-medium mt-0.5">{CM.signIn}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            data-testid="login-username-input"
            label={CM.username}
            icon="account_circle"
            placeholder={CM.username}
            value={username}
            onChange={(e) => { setUsername(e.target.value); if (errors.username) setErrors({ ...errors, username: '' }); if (apiError) setApiError(''); }}
            error={errors.username}
            autoComplete="username"
          />

          <Input
            data-testid="login-password-input"
            label={CM.password}
            labelExtra={<Link to="/forgot-password" title={CM.recoverPassword} className="text-amber-500 hover:text-amber-400 transition-colors">{CM.forgotLink}</Link>}
            icon="lock"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({ ...errors, password: '' }); if (apiError) setApiError(''); }}
            error={errors.password || apiError}
            autoComplete="current-password"
            suffix={
              <button
                type="button"
                data-testid="login-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1 flex items-center justify-center"
              >
                <Icon name={showPassword ? 'visibility_off' : 'visibility'} size="sm" weight={300} />
              </button>
            }
          />

          {/* Submit */}
          <button
            type="submit"
            data-testid="login-submit-btn"
            disabled={loading}
            className="w-full h-10 mt-1 bg-slate-900 dark:bg-amber-500 text-white dark:text-black text-15 font-bold rounded-xl shadow-md hover:shadow-[0_0_12px_rgba(245,158,11,0.3)] hover:bg-slate-800 dark:hover:bg-amber-400 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 group cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 dark:border-black/20 border-t-white dark:border-t-black rounded-full animate-spin" />
            ) : (
              <>
                <span className="tracking-wide">{CM.authorizeAccess}</span>
                <Icon name="arrow_forward" size="sm" weight={300} className="group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* Create account link */}
        <p className="mt-5 text-center text-14 text-slate-500 dark:text-slate-400">
          {CM.newToCubrid}{' '}
          <Link to="/register" className="font-bold text-slate-900 dark:text-amber-500 hover:underline underline-offset-4">{CM.createAccount}</Link>
        </p>

        {typeof window !== 'undefined' &&
          (window.location.protocol === 'app:' ||
            window.desktopConfig?.isDesktop ||
            window.desktopBridge) && (
          <p className="mt-2.5 text-center text-14 text-slate-500 dark:text-slate-400">
            <Link to="/desktop/workspace" className="font-semibold text-slate-700 dark:text-slate-300 hover:text-amber-500">
              {CM.workspaceSettings}
            </Link>
          </p>
        )}

        {/* Legal footer */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-11 font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          <div className="flex gap-4">
            <a href="https://www.cubrid.org" target="_blank" rel="noreferrer" className="hover:text-amber-500 transition-colors">{CM.website}</a>
            <a href="https://github.com/CUBRID" target="_blank" rel="noreferrer" className="hover:text-amber-500 transition-colors">{CM.github}</a>
          </div>
          <span className="font-mono text-slate-400 dark:text-slate-600">v12.4.0</span>
        </div>

      </div>
    </div>
  );
}
