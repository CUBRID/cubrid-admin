import React, { useState, useCallback, useRef } from 'react';
import { ConfirmDialog } from '../../components/ds/layout/ConfirmDialog';

import { ConfirmContext } from './confirmContextValue';

export const ConfirmProvider = ({ children }) => {
  const [dialogConfig, setDialogConfig] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((config) => {
    setDialogConfig(config);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolveRef.current) resolveRef.current(true);
    setDialogConfig(null);
  }, []);

  const handleCancel = useCallback(() => {
    if (resolveRef.current) resolveRef.current(false);
    setDialogConfig(null);
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {dialogConfig && (
        <ConfirmDialog
          isOpen={true}
          title={dialogConfig.title}
          description={dialogConfig.description}
          confirmLabel={dialogConfig.confirmLabel}
          cancelLabel={dialogConfig.cancelLabel}
          variant={dialogConfig.variant}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
};
