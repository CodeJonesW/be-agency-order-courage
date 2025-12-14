/**
 * Cookie parsing utilities for Cloudflare Workers.
 * 
 * Uses the standard 'cookie' package for robust parsing and serialization.
 */

import { parse, serialize, type CookieSerializeOptions } from 'cookie';

/**
 * Gets a cookie value by name from the Cookie header, or returns null if not found.
 */
export function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  
  const cookies = parse(cookieHeader);
  return cookies[name] || null;
}

/**
 * Cookie options for setting cookies.
 */
export interface SetCookieOptions {
  /** Maximum age in seconds */
  maxAge?: number;
  /** Cookie path (default: '/') */
  path?: string;
  /** SameSite attribute (lowercase: 'strict', 'lax', 'none') */
  sameSite?: 'strict' | 'lax' | 'none';
  /** Secure flag (HTTPS only). Set to true in production. */
  secure?: boolean;
  /** HttpOnly flag (prevents JavaScript access). Default: true for session cookies. */
  httpOnly?: boolean;
  /** Domain for the cookie */
  domain?: string;
}

/**
 * Sets a cookie in a Response header.
 * Returns a new Headers object with the Set-Cookie header added.
 * 
 * Production-ready defaults:
 * - HttpOnly: true (prevents XSS)
 * - Secure: set explicitly in production (HTTPS only)
 * - SameSite: Lax (CSRF protection)
 */
export function setCookie(
  headers: Headers,
  name: string,
  value: string,
  options?: SetCookieOptions
): Headers {
  const newHeaders = new Headers(headers);
  
  const cookieOptions: CookieSerializeOptions = {
    path: options?.path ?? '/',
    maxAge: options?.maxAge,
    sameSite: options?.sameSite ?? 'lax',
    secure: options?.secure ?? false, // Set to true in production
    httpOnly: options?.httpOnly ?? true, // Default to true for security
    domain: options?.domain,
  };
  
  const cookieString = serialize(name, value, cookieOptions);
  newHeaders.append('Set-Cookie', cookieString);
  
  return newHeaders;
}
