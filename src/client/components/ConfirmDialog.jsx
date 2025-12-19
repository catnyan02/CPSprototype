import React from 'react';

const ConfirmDialog = ({
  open,
  title = 'Are you sure?',
  message = '',
  confirmText = 'Continue',
  cancelText = 'Cancel',
  onConfirm,
  onCancel
}) => {
  if (!open) return null;

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="confirm-card">
        <div className="confirm-header">
          <h4 id="confirm-title">{title}</h4>
        </div>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>
            {cancelText}
          </button>
          <button type="button" className="save-btn wide" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
