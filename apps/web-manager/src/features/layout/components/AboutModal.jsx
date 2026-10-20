import React from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { setAboutCubrid } from '../appBarSlice';
import { Modal } from '../../../components/ds/layout/Modal';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Button } from '../../../components/ds/foundation/Button';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { useCM } from '../../../constants/useCM';

export default function AboutModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isAboutCubridOpen } = useSelector((state) => state.appBar, shallowEqual);

  if (!isAboutCubridOpen) return null;

  return (
    <Modal
      isOpen={isAboutCubridOpen}
      onClose={() => dispatch(setAboutCubrid(false))}
      title={CM.aboutCubrid}
      icon="info"
      maxWidth="420px"
      subtitle={CM.cubridWebManager}
      footer={
        <Button 
          variant="primary" 
          onClick={() => dispatch(setAboutCubrid(false))}
          className="min-w-[140px]"
        >
          {CM.close}
        </Button>
      }
    >
      <div className="flex flex-col items-center space-y-6 pt-2">
        {/* Logo Section */}
        <div className="w-24 h-24 p-3 bg-white dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/10 shadow-xs flex items-center justify-center animate-in zoom-in duration-300">
          <img src="/cubrid-logo.png" alt={CM.cubridLogoAlt} className="w-full h-auto object-contain" />
        </div>

        <div className="w-full space-y-5">
          {/* Main Info */}
          <div className="flex flex-col items-center text-center w-full">
            <SectionHeader title={CM.cubridWebManager} icon="verified" className="justify-center" />
            <Typography variant="p" className="text-slate-500 dark:text-slate-400 text-15 mt-1">
              {CM.aboutTagline}
            </Typography>
          </div>

          {/* Version */}
          <div className="flex flex-col items-center pt-2 pb-2">
            <Typography variant="p" className="font-mono font-black text-slate-800 dark:text-white tracking-tight text-18">
              0.0.1 Alpha
            </Typography>
          </div>

          {/* Copyright Section */}
          <div className="pt-4 border-t border-slate-50 dark:border-white/5 text-center">
            <Typography variant="caption" className="text-slate-400 dark:text-slate-500 text-12 tracking-widest uppercase">
              {CM.copyrightNotice}
            </Typography>
          </div>
        </div>
      </div>
    </Modal>
  );
}
