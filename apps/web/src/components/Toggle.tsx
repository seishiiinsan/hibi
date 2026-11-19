import type { LucideIcon } from 'lucide-react';

interface ToggleProps {
  label: string;
  icon: LucideIcon;
  checked: boolean;
  onChange: (v: boolean) => void;
  variant?: 'primary' | 'muted';
}

export function Toggle({ label, icon: Icon, checked, onChange, variant = 'primary' }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle toggle-${variant}`}
      onClick={() => onChange(!checked)}
    >
      <Icon size={20} aria-hidden="true" />
      {label}
    </button>
  );
}
