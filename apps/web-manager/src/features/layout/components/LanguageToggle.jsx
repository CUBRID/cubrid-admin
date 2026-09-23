import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { setUiLocale } from '../../user/userSlice';
import { useCM, getStoredLocale } from '../../../constants/useCM';

const btn =
  'h-full px-2.5 flex items-center justify-center text-12 font-bold uppercase tracking-wider transition-colors rounded-sm';

export default function LanguageToggle({ className = '' }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const locale = useSelector(
    (state) => state.user?.preferences?.uiLocale ?? getStoredLocale(),
    shallowEqual
  );

  const setLocale = (next) => {
    if (next === locale) return;
    dispatch(setUiLocale(next));
  };

  return (
    <div
      className={`h-8 flex items-center rounded-sm border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-white/5 p-0.5 gap-0.5 ${className}`}
      role="group"
      aria-label={CM.language}
    >
      <button
        type="button"
        className={`${btn} ${
          locale === 'en'
            ? 'bg-white dark:bg-white/15 text-amber-600 dark:text-amber-400 shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
        onClick={() => setLocale('en')}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
      <button
        type="button"
        className={`${btn} ${
          locale === 'ko'
            ? 'bg-white dark:bg-white/15 text-amber-600 dark:text-amber-400 shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
        onClick={() => setLocale('ko')}
        aria-pressed={locale === 'ko'}
      >
        KR
      </button>
    </div>
  );
}
