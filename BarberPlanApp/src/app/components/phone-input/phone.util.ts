export interface PhoneCountry {
  dialCode: string;
  flag: string;
  name: string;
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { dialCode: '+34', flag: '🇪🇸', name: 'España' },
  { dialCode: '+351', flag: '🇵🇹', name: 'Portugal' },
  { dialCode: '+33', flag: '🇫🇷', name: 'Francia' },
  { dialCode: '+39', flag: '🇮🇹', name: 'Italia' },
  { dialCode: '+44', flag: '🇬🇧', name: 'Reino Unido' },
  { dialCode: '+1', flag: '🇺🇸', name: 'Estados Unidos' },
  { dialCode: '+52', flag: '🇲🇽', name: 'México' },
  { dialCode: '+54', flag: '🇦🇷', name: 'Argentina' },
  { dialCode: '+57', flag: '🇨🇴', name: 'Colombia' }
];

// Separa un teléfono guardado como "+34666666666" en su prefijo de país y el
// resto del número, para mostrarlo legible ("+34 666666666") en vez de todo junto.
export function splitPhoneValue(value: string): { dialCode: string; nationalNumber: string } {
  const raw = (value || '').trim();
  if (!raw) {
    return { dialCode: PHONE_COUNTRIES[0].dialCode, nationalNumber: '' };
  }

  if (raw.startsWith('+')) {
    const match = [...PHONE_COUNTRIES]
      .sort((a, b) => b.dialCode.length - a.dialCode.length)
      .find((country) => raw.startsWith(country.dialCode));
    if (match) {
      return { dialCode: match.dialCode, nationalNumber: raw.slice(match.dialCode.length).trim() };
    }
  }

  // Sin prefijo reconocido (números guardados antes de este selector): se asumen de España.
  return { dialCode: PHONE_COUNTRIES[0].dialCode, nationalNumber: raw };
}

export function formatPhoneForDisplay(value: string): string {
  const { dialCode, nationalNumber } = splitPhoneValue(value);
  return nationalNumber ? `${dialCode} ${nationalNumber}` : '';
}
