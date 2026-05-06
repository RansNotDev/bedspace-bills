/**
 * Format a number as Philippine Peso
 */
export function formatPHP(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

/**
 * Format a date in Philippine locale (Asia/Manila)
 */
export function formatPHDate(date, options = {}) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  });
}

/**
 * Get month name from month number (1-12)
 */
export function getMonthName(month) {
  return new Date(2000, month - 1).toLocaleString('en-PH', { month: 'long' });
}

/**
 * Get month label like "May 2025"
 */
export function getMonthLabel(month, year) {
  return new Date(year, month - 1).toLocaleString('en-PH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

/**
 * Check if a date is past deadline
 */
export function isPastDeadline(deadline) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

/**
 * Get current month and year in PH timezone
 */
export function getCurrentMonthYear() {
  const now = new Date();
  const phDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  return {
    month: phDate.getMonth() + 1,
    year: phDate.getFullYear(),
  };
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return true;
  }
}
