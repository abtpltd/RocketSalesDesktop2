/** The one account that may add app users and change an app user's status, as on the web page. The server checks it again. */
export const SUPPORT_EMAIL = 'care4growth@gmail.com';
export const isSupport = (email: string | undefined | null): boolean => (email ?? '').trim().toLowerCase() === SUPPORT_EMAIL;
