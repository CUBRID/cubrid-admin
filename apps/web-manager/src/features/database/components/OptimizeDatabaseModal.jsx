import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeOptimizeDatabaseModal } from '../databaseSlice';
import { dbKey } from '../dbKey';
import { databaseApi } from '../databaseApi';
import { databaseJobApi } from '../databaseJobApi';
import { useCmsJob } from '../../../infrastructure/hooks/useCmsJob';
import { getCmsJobLoadingSubtitle } from '../../../infrastructure/cmsJob/cmsJobUi';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Spinner } from '../../../components/ds/foundation/Spinner';
import { EmptyState } from '../../../components/ds/feedback/EmptyState';
import { useCM } from '../../../constants/useCM';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import {
  ModalStatusLoading,
  ModalStatusSuccess,
  ModalStatusError,
} from '../../../components/ds/feedback/ActionStatus';
import {
  CaDialogField,
  CaDialogFieldGrid,
  CaDialogGroup,
} from '../../../components/ds/layout/CaDialogLayout';

/**
 * Custom Dropdown for Class Selection
 */
const ClassSelect = ({ value, userClasses, onChange, disabled, isLoading }) => {
  const CM = useCM();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({});

  const filteredClasses = useMemo(() => 
    userClasses.filter(c => c.classname.toLowerCase().includes(search.toLowerCase())),
    [userClasses, search]
  );

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const margin = 24; // space from bottom of viewport
      const maxHeight = Math.min(360, window.innerHeight - rect.bottom - margin);
      
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: maxHeight > 120 ? maxHeight : 360,
        zIndex: 9999,
      });
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedContainer = containerRef.current && containerRef.current.contains(event.target);
      const clickedDropdown = dropdownRef.current && dropdownRef.current.contains(event.target);
      if (!clickedContainer && !clickedDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) setSearch('');
  }, [isOpen]);

  const hasResults = filteredClasses.length > 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || isLoading}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-10 px-3.5 flex items-center justify-between bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/10 rounded-xl transition-all text-left outline-hidden ${
          isOpen ? 'border-amber-500 ring-4 ring-amber-500/10' : 'hover:border-slate-300 dark:hover:border-white/20'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Icon 
            name={value ? 'table_view' : 'database'} 
            size="md" 
            weight={300} 
            className={value ? 'text-amber-500' : 'text-slate-400'} 
          />
          <span className={`text-15 font-medium truncate ${value ? 'text-slate-900 dark:text-slate-200' : 'text-slate-400'}`}>
            {value ? value : CM.allTables}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isLoading && <Spinner size="xs" />}
          <Icon name="expand_more" size="md" weight={300} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-amber-500' : ''}`} />
        </div>
      </button>

      {isOpen && createPortal(
        <div 
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white dark:bg-[#1A1C1E] border border-slate-200 dark:border-white/10 rounded-lg shadow-[0_12px_40px_rgba(0,0,0,0.35)] z-110 overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col"
        >
          {/* Search Header */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-white/2">
            <Input 
              size="sm"
              icon="search"
              placeholder={CM.filterObjects}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pb-2">
            {search === '' && (
              <button
                type="button"
                onClick={() => { onChange(''); setIsOpen(false); }}
                className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors border-b border-slate-100 dark:border-slate-800/40 group ${
                  value === '' ? 'bg-amber-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <div className={`w-2 h-2 rounded-full transition-all ${value === '' ? 'bg-amber-500 scale-125 shadow-[0_0_8px_rgba(255,188,4,0.6)]' : 'bg-slate-300 dark:bg-slate-700 group-hover:bg-amber-500/40'}`}></div>
                <span className={`text-12 font-black uppercase tracking-[0.15em] ${value === '' ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400'}`}>{CM.allTables}</span>
              </button>
            )}

            {!hasResults && !isLoading && (
              <div className="py-8">
                <EmptyState
                  icon="search_off"
                  title={CM.noMatches}
                  subtitle={`No tables matching "${search}" were found.`}
                />
              </div>
            )}

            {isLoading && (
              <div className="py-12 text-center space-y-4">
                <Spinner size="md" className="mx-auto" />
                <p className="text-12 text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em]">{CM.processing}</p>
              </div>
            )}

            {filteredClasses.length > 0 && (
              <div className="py-1 px-1.5 space-y-0.5">
                {filteredClasses.map((cls) => (
                  <button
                    key={cls.classname}
                    type="button"
                    onClick={() => { onChange(cls.classname); setIsOpen(false); }}
                    className={`w-full px-3 py-1.5 flex items-center gap-3 text-left transition-all rounded-xl group ${
                      value === cls.classname 
                        ? 'bg-amber-500 text-status-dark font-bold shadow-lg shadow-amber-500/10' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-amber-500/5 hover:text-amber-500'
                    }`}
                  >
                    <Icon name="table" size="sm" weight={300} className={value === cls.classname ? 'text-status-dark' : 'text-slate-400 group-hover:text-amber-500'} />
                    <span className="text-14 font-medium truncate leading-none select-none flex-1 lowercase">{cls.classname}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default function OptimizeDatabaseModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isOptimizeDatabaseModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase, activeDatabases, loggedInDatabases } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);

  const {
    error,
    startAction,
    endSuccess,
    endError,
    resetAction,
    isLoading,
    isSuccess,
    isError,
  } = useActionState();
  const { runJob, background, wasBackgrounded } = useCmsJob();
  const [selectedClassName, setSelectedClassName] = useState('');
  const [jobStatus, setJobStatus] = useState(null);
  const [dbuser, setDbuser] = useState('dba');
  const [dbpasswd, setDbpasswd] = useState('');

  // Direct state for classes to follow user requirement for direct getClassInfo usage
  const [classesData, setClassesData] = useState({ userclass: [] });
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);

  const isActive = selectedDatabase && activeDatabases.includes(selectedDatabase);
  // optimizedb only needs credentials while online, and only to satisfy CMS's
  // per-connection login cache — if a prior "Login Database" already
  // populated that cache for this db, there's nothing new to authenticate.
  const alreadyLoggedIn = isActive && loggedInDatabases.includes(dbKey(selectedHostUid, selectedDatabase));

  const fetchClasses = useCallback(async () => {
    if (!selectedHostUid || !selectedDatabase) return;
    setIsLoadingClasses(true);
    try {
      const dbstatus = isActive ? 'on' : 'off';
      const res = await databaseApi.getClassInfo(selectedHostUid, selectedDatabase, dbstatus);
      
      const rawUser = res.userclass?.[0]?.class || res.userclass || [];
      
      setClassesData({
        userclass: rawUser.filter(c => c.virtual !== 'view')
      });
    } catch (err) {
      console.error('Failed to fetch optimized classes:', err);
    } finally {
      setIsLoadingClasses(false);
    }
  }, [selectedHostUid, selectedDatabase, isActive]);

  useEffect(() => {
    if (isOptimizeDatabaseModalOpen && selectedDatabase) {
      setSelectedClassName('');
      // Blank when a prior login already covers this db — leaving it blank
      // tells the backend to reuse that cache instead of logging in again.
      setDbuser(alreadyLoggedIn ? '' : 'dba');
      setDbpasswd('');
      resetAction();
      fetchClasses();
    }
  }, [isOptimizeDatabaseModalOpen, selectedDatabase, alreadyLoggedIn, fetchClasses, resetAction]);

  if (!isOptimizeDatabaseModalOpen) return null;

  const handleOptimize = async () => {
    if (!selectedHostUid || !selectedDatabase) return;

    // CMS authorizes optimizedb against a per-connection credential cache
    // populated by dbmtuserlogin — required whenever the database is
    // online (see database-management.service.ts's loginIfCredentialsProvided),
    // unless a prior Login Database already populated that cache.
    if (isActive && !alreadyLoggedIn && !dbuser.trim()) {
      endError(CM.dbUserRequiredWhileOnlineMsg);
      return;
    }

    startAction();
    try {
      const payload = {
        ...(selectedClassName && { classname: selectedClassName }),
        ...(isActive && dbuser.trim() && { dbuser: dbuser.trim(), dbpasswd }),
      };

      await runJob(
        () => databaseJobApi.submitOptimize(selectedHostUid, selectedDatabase, payload),
        { onProgress: (j) => setJobStatus(j.jobStatus ?? j.status) }
      );

      if (!wasBackgrounded()) endSuccess();
    } catch (err) {
      if (!wasBackgrounded()) endError(typeof err === 'string' ? err : (err.message || 'Optimization was interrupted. Check the database connection and try again.'));
    }
  };

  const handleClose = () => {
    dispatch(closeOptimizeDatabaseModal());
    resetAction();
  };

  // Mirrors the footer button's disabled={isLoadingClasses} gate, which
  // handleOptimize itself doesn't check.
  const handleFormSubmit = () => {
    if (isLoadingClasses) return;
    handleOptimize();
  };

  /* ─── LOADING view ─── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.optimizeDatabase} icon="auto_fix_high" onClose={handleClose} maxWidth="480px">
        <ModalStatusLoading
          title={CM.regeneratingStatistics}
          subtitle={getCmsJobLoadingSubtitle(selectedClassName || selectedDatabase, jobStatus, CM)}
          onBackground={() => { background(); handleClose(); }}
        />
      </Modal>
    );
  }

  /* ─── SUCCESS view ─── */
  if (isSuccess) {
    return (
      <Modal isOpen title={CM.optimizeDatabase} icon="auto_fix_high" iconVariant="success" onClose={handleClose} maxWidth="480px">
        <ModalStatusSuccess
          title={CM.optimizationSuccess}
          message={selectedClassName || selectedDatabase}
          onConfirm={handleClose}
          confirmText={CM.close}
        />
      </Modal>
    );
  }

  /* ─── ERROR view ─── */
  if (isError) {
    return (
      <Modal isOpen title={CM.optimizeDatabase} icon="auto_fix_high" iconVariant="danger" onClose={handleClose} maxWidth="480px">
        <ModalStatusError
          title={CM.optimizationFailed}
          error={error}
          guidance={CM.optimizeDbGuidance}
          onRetry={handleOptimize}
          onCancel={handleClose}
          retryText={CM.retryOptimization}
          cancelText={CM.dismiss}
        />
      </Modal>
    );
  }

  /* ─── FORM view ─── */
  return (
    <Modal
      isOpen={isOptimizeDatabaseModalOpen}
      onClose={handleClose}
      title={CM.optimizeDatabase}
      subtitle={CM.msgOptimizeDbInformation}
      icon="auto_fix_high"
      maxWidth="480px"
      testId="optimize-database"
      onSubmit={handleFormSubmit}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="optimize-database-cancel-btn" variant="secondary" onClick={handleClose}>
            {CM.cancel}
          </Button>
          <Button
            data-testid="optimize-database-run-btn"
            variant="primary"
            onClick={handleOptimize}
            icon="play_circle"
            disabled={isActive || isLoadingClasses}
            className="min-w-[140px]"
          >
            {CM.ok}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {isActive && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2.5 text-amber-700 dark:text-amber-400 text-xs">
            <Icon name="warning" size="sm" />
            <span>Database optimization can only be performed when the database is stopped.</span>
          </div>
        )}
        <CaDialogGroup>
          <CaDialogFieldGrid labelWidth="130px">
            <CaDialogField label={CM.lblOptimizeDbName}>
              <Input 
                value={selectedDatabase || ''}
                disabled
                icon="database"
              />
            </CaDialogField>
            <CaDialogField label={CM.lblOptimizeClassName}>
              <ClassSelect
                 value={selectedClassName}
                 userClasses={classesData.userclass}
                 onChange={setSelectedClassName}
                 isLoading={isLoadingClasses}
               />
            </CaDialogField>
          </CaDialogFieldGrid>
        </CaDialogGroup>

        <CaDialogGroup title={CM.grpOptimizeDesc}>
          <Typography variant="p" className="text-14 leading-relaxed text-slate-600 dark:text-slate-400">
            {CM.lblOptimizeDesc}
          </Typography>
        </CaDialogGroup>
      </div>
    </Modal>
  );
}
