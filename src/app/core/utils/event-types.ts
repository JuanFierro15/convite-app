export type EventType =
  | 'baby_shower'
  | 'baptism'
  | 'birthday'
  | 'wedding'
  | 'anniversary'
  | 'other';

export const EVENT_TYPE_OPTIONS: readonly { value: EventType; label: string }[] = [
  { value: 'baby_shower', label: 'Baby shower' },
  { value: 'baptism', label: 'Bautizo' },
  { value: 'birthday', label: 'Cumpleaños' },
  { value: 'wedding', label: 'Boda' },
  { value: 'anniversary', label: 'Aniversario' },
  { value: 'other', label: 'Otro' },
];

export const HONOREE_NAME_MAX = 60;

const VALID_EVENT_TYPES: ReadonlySet<string> = new Set(
  EVENT_TYPE_OPTIONS.map((option) => option.value),
);

export function toEventType(value: unknown): EventType {
  if (typeof value === 'string' && VALID_EVENT_TYPES.has(value)) {
    return value as EventType;
  }
  return 'other';
}
