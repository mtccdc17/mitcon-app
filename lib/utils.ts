import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

export function formatVNDShort(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} tỷ`
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(0)} triệu`
  return formatVND(amount)
}

export function calcVAT(amount: number, rate: 'vat_10' | 'vat_8' | 'no_vat'): number {
  if (rate === 'vat_10') return Math.round(amount / 1.1 * 0.1)
  if (rate === 'vat_8') return Math.round(amount / 1.08 * 0.08)
  return 0
}

export function calcTNCN(amount: number): number {
  return Math.round(amount * 0.1)
}
