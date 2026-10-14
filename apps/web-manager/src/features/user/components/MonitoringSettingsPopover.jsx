import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { updatePreferences } from '../userSlice';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { useCM } from '../../../constants/useCM';

export default function MonitoringSettingsPopover() {
  const CM = useCM();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);
  const dispatch = useDispatch();
  const { preferences, actionLoading } = useSelector((state) => state.user, shallowEqual);
  
  const [localPrefs, setLocalPrefs] = useState(preferences);
  const [customDashboardText, setCustomDashboardText] = useState('');
  const [customBrokerText, setCustomBrokerText] = useState('');
  const [dashboardPresetActive, setDashboardPresetActive] = useState(true);
  const [brokerPresetActive, setBrokerPresetActive] = useState(true);

  const intervals = [
    { label: CM.statusOff, value: 0 },
    { label: '1s', value: 1 },
    { label: '3s', value: 3 },
    { label: '5s', value: 5 },
    { label: '10s', value: 10 },
    { label: '30s', value: 30 },
  ];

  useEffect(() => {
    const clampInterval = (value) => Math.min(Math.max(value, 0), MAX_INTERVAL);

    const rawDashVal = preferences.dashboardInterval;
    const dashVal = clampInterval(typeof rawDashVal === 'number' ? rawDashVal : (parseInt(rawDashVal, 10) || 0));

    const rawBrokerVal = preferences.brokerStatusInterval;
    const brokerVal = clampInterval(typeof rawBrokerVal === 'number' ? rawBrokerVal : (parseInt(rawBrokerVal, 10) || 0));

    setLocalPrefs({
      ...preferences,
      dashboardInterval: dashVal,
      brokerStatusInterval: brokerVal,
    });

    setCustomDashboardText(dashVal === 0 ? '' : dashVal.toString());
    setDashboardPresetActive(intervals.some(opt => opt.value === dashVal));

    setCustomBrokerText(brokerVal === 0 ? '' : brokerVal.toString());
    setBrokerPresetActive(intervals.some(opt => opt.value === brokerVal));
  }, [preferences]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = () => {
    dispatch(updatePreferences(localPrefs));
    setIsOpen(false);
  };

  const MAX_INTERVAL = 86400; // 24 hours in seconds (well below browser timer limit of 2147483s)

  const handleDashboardPresetClick = (val) => {
    setLocalPrefs(prev => ({ ...prev, dashboardInterval: val }));
    setCustomDashboardText(val === 0 ? '' : val.toString());
    setDashboardPresetActive(true);
  };

  const handleDashboardCustomChange = (e) => {
    let valStr = e.target.value;
    valStr = valStr.replace(/\D/g, '');
    setDashboardPresetActive(false);

    if (valStr !== '') {
      let parsed = parseInt(valStr, 10);
      if (parsed > MAX_INTERVAL) {
        parsed = MAX_INTERVAL;
        valStr = MAX_INTERVAL.toString();
      }
      setCustomDashboardText(valStr);
      setLocalPrefs(prev => ({ ...prev, dashboardInterval: parsed }));
    } else {
      setCustomDashboardText(valStr);
      setLocalPrefs(prev => ({ ...prev, dashboardInterval: 0 }));
    }
  };

  const handleBrokerPresetClick = (val) => {
    setLocalPrefs(prev => ({ ...prev, brokerStatusInterval: val }));
    setCustomBrokerText(val === 0 ? '' : val.toString());
    setBrokerPresetActive(true);
  };

  const handleBrokerCustomChange = (e) => {
    let valStr = e.target.value;
    valStr = valStr.replace(/\D/g, '');
    setBrokerPresetActive(false);

    if (valStr !== '') {
      let parsed = parseInt(valStr, 10);
      if (parsed > MAX_INTERVAL) {
        parsed = MAX_INTERVAL;
        valStr = MAX_INTERVAL.toString();
      }
      setCustomBrokerText(valStr);
      setLocalPrefs(prev => ({ ...prev, brokerStatusInterval: parsed }));
    } else {
      setCustomBrokerText(valStr);
      setLocalPrefs(prev => ({ ...prev, brokerStatusInterval: 0 }));
    }
  };

  const hasActiveMonitoring = (Number(preferences.dashboardInterval) > 0 || Number(preferences.brokerStatusInterval) > 0);

  return (
    <div className="relative" ref={popoverRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all active:scale-[0.98] relative group
          ${isOpen 
            ? 'bg-amber-500/10 text-amber-500 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]' 
            : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-500 hover:border-amber-500/30 hover:bg-white dark:hover:bg-white/5 shadow-xs'
          }`}
        title={CM.monitoringSync}
      >
        <Icon name="timer" size="19px" weight={300} />

        {hasActiveMonitoring && (
          <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-green-500 rounded-full border border-white dark:border-background-dark ring-2 ring-green-500/20"></div>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-12 right-0 w-80 bg-white dark:bg-background-dark border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl z-110 overflow-hidden animate-in fade-in zoom-in-95 duration-200 backdrop-blur-xl">
          <div className="px-5 py-3.5 bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-900 dark:text-white uppercase tracking-widest">{CM.globalHeartbeat}</Typography>
            <div className="flex items-center gap-1.5">
               <div className={`w-1.5 h-1.5 rounded-full ${hasActiveMonitoring ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
               <span className="text-10 font-black uppercase text-slate-400 tracking-tighter">{hasActiveMonitoring ? CM.active : CM.manualLabel}</span>
            </div>
          </div>
          
          <div className="p-5 space-y-6">
            {/* Dashboard Interval */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Typography variant="caption" className="font-bold text-slate-500 uppercase tracking-tight">{CM.resourceDashboard}</Typography>
                <span className="text-12 text-amber-500 font-black px-1.5 py-0.5 rounded-md bg-amber-500/5 border border-amber-500/10 min-w-[32px] text-center font-mono">
                  {localPrefs.dashboardInterval > 0 ? `${localPrefs.dashboardInterval}s` : CM.statusOff.toUpperCase()}
                </span>
              </div>
              <div className="flex p-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200/50 dark:border-white/5">
                {intervals.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleDashboardPresetClick(opt.value)}
                    className={`flex-1 py-1.5 text-12 font-black rounded-lg transition-all active:scale-95
                      ${dashboardPresetActive && localPrefs.dashboardInterval === opt.value 
                        ? 'bg-amber-500 text-slate-900 shadow-md transform scale-[1.02]' 
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="pt-1">
                <Input
                  type="number"
                  size="sm"
                  placeholder={CM.customIntervalPlaceholder}
                  value={customDashboardText}
                  onChange={handleDashboardCustomChange}
                  suffix={CM.secondsSuffix}
                  min="0"
                  max="86400"
                  disabled={actionLoading}
                />
              </div>

              <p className="text-11 text-slate-400 italic px-1">{CM.syncDbThroughputMsg}</p>
            </div>

            {/* Broker Interval */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Typography variant="caption" className="font-bold text-slate-500 uppercase tracking-tight">{CM.brokerInfrastructure}</Typography>
                <span className="text-12 text-amber-500 font-black px-1.5 py-0.5 rounded-md bg-amber-500/5 border border-amber-500/10 min-w-[32px] text-center font-mono">
                  {localPrefs.brokerStatusInterval > 0 ? `${localPrefs.brokerStatusInterval}s` : CM.statusOff.toUpperCase()}
                </span>
              </div>
              <div className="flex p-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200/50 dark:border-white/5">
                {intervals.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleBrokerPresetClick(opt.value)}
                    className={`flex-1 py-1.5 text-12 font-black rounded-lg transition-all active:scale-95
                      ${brokerPresetActive && localPrefs.brokerStatusInterval === opt.value 
                        ? 'bg-amber-500 text-slate-900 shadow-md transform scale-[1.02]' 
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="pt-1">
                <Input
                  type="number"
                  size="sm"
                  placeholder={CM.customIntervalPlaceholder}
                  value={customBrokerText}
                  onChange={handleBrokerCustomChange}
                  suffix={CM.secondsSuffix}
                  min="0"
                  max="86400"
                  disabled={actionLoading}
                />
              </div>

              <p className="text-11 text-slate-400 italic px-1">{CM.propagatesConnectionMsg}</p>
            </div>
          </div>

          <div className="px-5 py-4 bg-slate-50 dark:bg-white/2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
            <Typography variant="caption" className="text-slate-400 font-medium">{CM.sessionPreferences}</Typography>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>{CM.dismiss}</Button>
              <Button 
                size="sm" 
                onClick={handleSave}
                loading={actionLoading}
                className="shadow-lg shadow-amber-500/20 px-5"
              >
                {CM.apply}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
