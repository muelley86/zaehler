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
  'inline-flex items-center justify-center gap-2 rounded-ios font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 select-none';

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-ios-footnote',
  md: 'h-11 px-4 text-ios-body',
  lg: 'h-12 px-5 text-ios-headline',
};

const variantClasses: Record<Variant, string> = {
  filled: 'bg-ios-blue text-white hover:brightness-110 active:brightness-95',
  tinted: 'bg-ios-blue/15 text-ios-blue hover:bg-ios-blue/25 active:bg-ios-blue/30',
  plain: 'text-ios-blue hover:bg-ios-blue/10 active:bg-ios-blue/15',
  destructive: 'bg-ios-red text-white hover:brightness-110 active:brightness-95',
  bordered:
    'border border-ios-separator bg-transparent text-ios-label hover:bg-ios-elevated/40 active:bg-ios-elevated/60',
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
