interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  variant?: 'primary' | 'muted';
}

export function Toggle({ label, checked, onChange, variant = 'primary' }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle toggle-${variant}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      {label}
    </button>
  );
}
