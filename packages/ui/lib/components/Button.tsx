import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../utils';

export type ButtonProps = {
  theme?: 'light' | 'dark';
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
} & ComponentPropsWithoutRef<'button'>;

export function Button({ theme, variant = 'primary', className, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'py-1 px-4 rounded transition-all',
        {
          // Primary — Oracle Red
          'bg-[#C74634] hover:bg-[#9E3929] text-white':
            variant === 'primary' && !disabled && theme !== 'dark',
          'bg-[#C74634] hover:bg-[#9E3929] text-white':
            variant === 'primary' && !disabled && theme === 'dark',
          'bg-[#E0DDD5] text-[#A09A94] cursor-not-allowed': variant === 'primary' && disabled,

          // Secondary — warm neutral
          'bg-[#F8F7F3] hover:bg-[#E0DDD5] text-[#2D2B29] border border-[#E0DDD5]': variant === 'secondary' && !disabled,
          'bg-[#F8F7F3] text-[#C4BFBA] cursor-not-allowed border border-[#E0DDD5]': variant === 'secondary' && disabled,

          // Danger — red outline style
          'bg-red-600 hover:bg-red-700 text-white':
            variant === 'danger' && !disabled && theme !== 'dark',
          'bg-red-500 hover:bg-red-600 text-white':
            variant === 'danger' && !disabled && theme === 'dark',
          'bg-red-200 text-red-400 cursor-not-allowed': variant === 'danger' && disabled,
        },
        className,
      )}
      disabled={disabled}
      {...props}>
      {children}
    </button>
  );
}
