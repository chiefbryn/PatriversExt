import { cn } from '@/lib/utils';
import logo from '@/assets/patrivers-logo.png';

export const BRAND_NAME = 'Patrivers Pharmacy';
export const BRAND_LOGO = logo;

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Patrivers Pharmacy logo mark. */
export function BrandMark({ size = 'md', className }: BrandMarkProps) {
  const box = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  return (
    <img
      src={logo}
      alt={`${BRAND_NAME} logo`}
      className={cn('shrink-0 object-contain select-none', box, className)}
    />
  );
}
