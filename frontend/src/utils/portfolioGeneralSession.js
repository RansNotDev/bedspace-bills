/** Super admin: browse dashboard in “all properties” mode without a bedspace-scoped JWT yet. */

export const PORTFOLIO_GENERAL_SESSION_KEY = 'portfolioGeneralSession';

export function setPortfolioGeneralSession(on) {
  try {
    if (on) sessionStorage.setItem(PORTFOLIO_GENERAL_SESSION_KEY, '1');
    else sessionStorage.removeItem(PORTFOLIO_GENERAL_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function clearPortfolioGeneralSession() {
  setPortfolioGeneralSession(false);
}

export function isPortfolioGeneralSession() {
  try {
    return sessionStorage.getItem(PORTFOLIO_GENERAL_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}
