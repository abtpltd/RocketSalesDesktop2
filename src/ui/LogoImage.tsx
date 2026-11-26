import { useState } from 'react';
import { readJson, writeJson } from './prefsMath';

/**
 * How the company logo is drawn on this computer (sign-in screen and the setting preview):
 * - original: the picture as it is, on a see-through background;
 * - blend: the logo's own plain background (black on a dark theme, white on a light one) fades into the screen;
 * - theme: the logo's shape filled with the colour theme (best for a one-colour logo with a see-through background).
 */
export type LogoLook = 'original' | 'blend' | 'theme';
export const LOOKS: { value: LogoLook; label: string; hint: string }[] = [
  { value: 'original', label: 'Original', hint: 'The picture as it is' },
  { value: 'blend', label: 'Blend background', hint: "Fades the logo's own black or white background into the screen" },
  { value: 'theme', label: 'Theme colour', hint: 'Fills the logo shape with the colour theme; for a one-colour logo with a see-through background' },
];
const key = (company: string) => `rs:logo-look:${company.trim().toLowerCase()}`;
const ok = (v: unknown) => v === 'original' || v === 'blend' || v === 'theme';

export const readLogoLook = (company: string): LogoLook => readJson<LogoLook>(key(company), 'original', ok);

export function useLogoLook(company: string): [LogoLook, (l: LogoLook) => void] {
  const [look, setLook] = useState<LogoLook>(() => readLogoLook(company));
  return [look, (l) => { setLook(l); writeJson(key(company), l); }];
}

export function LogoImage({ src, look, alt = 'Company logo' }: { src: string; look: LogoLook; alt?: string }) {
  if (look === 'theme') {
    return <span role="img" aria-label={alt} className="logo-tint" style={{ WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` }}>
      <img src={src} alt="" aria-hidden /></span>;
  }
  return <img src={src} alt={alt} className={look === 'blend' ? 'logo-blend' : undefined} />;
}
