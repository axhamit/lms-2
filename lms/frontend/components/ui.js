export function Progress({ value }) {
  return <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><div style={{ width: value + '%' }} /><span>{value}%</span></div>;
}

const LABEL = { upcoming: 'Upcoming', live: 'Live now', completed: 'Completed' };
export function StatusTag({ status }) {
  return <span className={'tag ' + status}>{LABEL[status]}</span>;
}

export function LoadingSpinner({ size = 'medium' }) {
  const sizeClass = size === 'small' ? 'spinner-small' : size === 'large' ? 'spinner-large' : 'spinner-medium';
  return <div className={`spinner ${sizeClass}`} aria-label="Loading" />;
}

export function ErrorMessage({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="error-message">
      <span className="error-icon">⚠️</span>
      <span className="error-text">{message}</span>
      {onDismiss && <button className="error-close" onClick={onDismiss} aria-label="Dismiss">×</button>}
    </div>
  );
}

export function EmptyState({ icon, title, description }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3 className="empty-title">{title}</h3>
      <p className="empty-description">{description}</p>
    </div>
  );
}
