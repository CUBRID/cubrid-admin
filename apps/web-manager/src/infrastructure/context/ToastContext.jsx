import React, { useState, useCallback } from 'react';
import { Toast } from '../../components/ds/feedback/Toast';

import { ToastContext } from './toastContextValue';

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, variant = 'info', options = {}) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, variant, ...options }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const success = useCallback((msg, opts) => addToast(msg, 'success', opts), [addToast]);
  const error = useCallback((msg, opts) => addToast(msg, 'error', opts), [addToast]);
  const warning = useCallback((msg, opts) => addToast(msg, 'warning', opts), [addToast]);
  const info = useCallback((msg, opts) => addToast(msg, 'info', opts), [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, success, error, warning, info }}>
      {children}
      <div className="fixed bottom-4 right-4 z-9999 flex flex-col pointer-events-none">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onClose={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
