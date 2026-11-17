/** Deployment explicitly preserves the reviewed production cutover flag; closed until SMTP and users are verified. */
export const ADMIN_AUTH_RUNTIME_FLAG = 'ADMIN_SUPABASE_AUTH_ENABLED';
export function adminAuthBindingValue(settings) {
  const setting = settings[ADMIN_AUTH_RUNTIME_FLAG];
  if (setting === undefined) return 'false';
  if (!setting || setting.type !== 'plain_text' || !['true', 'false'].includes(setting.value)) throw Error('Invalid managed admin runtime flag');
  return setting.value;
}
export function applyAdminAuthBinding(text, value) {
  if (!['true', 'false'].includes(value)) throw Error('Invalid managed admin runtime flag');
  const name = ADMIN_AUTH_RUNTIME_FLAG;
  const assignments = [...text.matchAll(new RegExp(`^[^#\\r\\n]*\\b${name}\\b[^=\\r\\n]*=.*$`, 'gm'))];
  const section = /^\[vars\][ \t]*\r?$/m.exec(text);
  if (!section || assignments.length !== 1 || assignments[0].index < section.index + section[0].length) throw Error('Managed admin flag requires one vars assignment');
  const tail = text.slice(section.index + section[0].length), next = tail.search(/^\[/m);
  if (next >= 0 && assignments[0].index >= section.index + section[0].length + next) throw Error('Managed admin flag requires one vars assignment');
  const pattern = new RegExp(`^([ \\t]*${name}[ \\t]*=[ \\t]*)"false"([ \\t]*(?:#.*)?)(\\r?)$`, 'm');
  if (!pattern.test(assignments[0][0])) throw Error('Managed admin source flag must be closed');
  return text.replace(pattern, (_, prefix, suffix, cr) => `${prefix}"${value}"${suffix}${cr}`);
}
