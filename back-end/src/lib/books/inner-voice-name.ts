export const INNER_VOICE_NAME_MAX_LENGTH = 30;

export function innerVoiceNameTooLong(value: string): boolean {
  return value.trim().length > INNER_VOICE_NAME_MAX_LENGTH;
}
