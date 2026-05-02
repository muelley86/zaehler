import { cx } from './cx';

export function Switch({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full border-hairline transition-colors',
        checked ? 'border-transparent bg-gradient-primary' : 'border-border bg-fill',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span
        className={cx(
          'inline-block h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.18)] transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}
