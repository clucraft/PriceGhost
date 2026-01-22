import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: number) => void;
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        .toast-container {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          z-index: 9999;
          pointer-events: none;
        }

        .toast {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1.25rem;
          border-radius: 0.5rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          font-size: 0.9375rem;
          font-weight: 500;
          pointer-events: auto;
          animation: toast-slide-in 0.3s ease-out;
          max-width: 360px;
        }

        @keyframes toast-slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .toast.toast-success {
          background: #10b981;
          color: white;
        }

        .toast.toast-error {
          background: #ef4444;
          color: white;
        }

        .toast.toast-info {
          background: #6366f1;
          color: white;
        }

        .toast-icon {
          font-size: 1.125rem;
          flex-shrink: 0;
        }

        .toast-message {
          flex: 1;
        }

        .toast-close {
          background: none;
          border: none;
          color: inherit;
          opacity: 0.7;
          cursor: pointer;
          padding: 0.25rem;
          font-size: 1.125rem;
          line-height: 1;
          flex-shrink: 0;
        }

        .toast-close:hover {
          opacity: 1;
        }

        @media (max-width: 480px) {
          .toast-container {
            left: 1rem;
            right: 1rem;
            bottom: 1rem;
          }

          .toast {
            max-width: none;
          }
        }
      `}</style>
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span className="toast-icon">
              {toast.type === 'success' && '✓'}
              {toast.type === 'error' && '✕'}
              {toast.type === 'info' && 'ℹ'}
            </span>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close" onClick={() => onRemove(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
