import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from './cx';

type Variant = 'filled' | 'tinted' | 'plain' | 'destructive' | 'bordered';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
}

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition-[background,box-shadow,opacity] disabled:cursor-not-allowed disabled:opacity-40 select-none tracking-tight';

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-caption',
  md: 'h-10 px-4 text-body',
  lg: 'h-12 px-5 text-headline',
};

const variantClasses: Record<Variant, string> = {
  filled:
    'text-white bg-gradient-primary shadow-glow-primary hover:brightness-105 active:brightness-95',
  tinted:
    'text-primary-deep bg-[color-mix(in_oklch,var(--primary),transparent_82%)] hover:bg-[color-mix(in_oklch,var(--primary),transparent_72%)] active:bg-[color-mix(in_oklch,var(--primary),transparent_62%)]',
  plain:
    'text-primary-deep hover:bg-[color-mix(in_oklch,var(--primary),transparent_88%)] active:bg-[color-mix(in_oklch,var(--primary),transparent_78%)]',
  destructive:
    'text-white bg-[linear-gradient(135deg,var(--red),color-mix(in_oklch,var(--red),black_15%))] shadow-[0_4px_12px_oklch(0.65_0.20_25/0.55)] hover:brightness-105 active:brightness-95',
  bordered:
    'text-label bg-fill border-hairline border-border hover:bg-fill-strong active:bg-fill-strong',
};

export function Button({
  variant = 'tinted',
  size = 'md',
  fullWidth = false,
  leftIcon,
  rightIcon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        baseClasses,
        sizeClasses[size],
        variantClasses[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}
