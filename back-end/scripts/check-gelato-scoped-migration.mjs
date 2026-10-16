import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The forward migration deliberately copies three shared functions. Fail if the
// canonical definition changes without carrying its fixes into that migration.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const foundation = fs.readFileSync(path.join(root, 'database/migration-print-provider-fields.sql'), 'utf8');
const scoped = fs.readFileSync(path.join(root, 'database/migration-gelato-scoped-engineering-windows.sql'), 'utf8');
function definition(sql, name) {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(.*?END \\$\\$;`, 's'));
  assert.ok(match, `Missing canonical function ${name}`);
  return match[0];
}
for (const name of ['claim_gelato_print_submission', 'begin_gelato_print_submission', 'authorize_gelato_print_send']) {
  let expected = definition(foundation, name);
  if (name === 'claim_gelato_print_submission') {
    const gate = "  IF NOT gate_open THEN RETURN jsonb_build_object('dispatch',false,'reason','gate_closed'); END IF;";
    assert.equal(expected.split(gate).length, 2);
    expected = expected.replace(gate, '  gate_open := gate_open OR public.gelato_engineering_dispatch_allowed(root_id,ids);\n' + gate);
  } else {
    const gate = "  IF NOT coalesce((SELECT enabled FROM public.print_provider_dispatch_gates WHERE provider = 'gelato' FOR SHARE),false) THEN RAISE EXCEPTION 'Gelato dispatch disabled'; END IF;\n";
    assert.equal(expected.split(gate).length, 2);
    expected = expected.replace(gate, '').replace(
      'DECLARE s public.print_provider_submissions%ROWTYPE; current_refs text[];',
      'DECLARE s public.print_provider_submissions%ROWTYPE; current_refs text[]; normal_gate boolean;',
    ).replace('  PERFORM public.lock_gelato_submission_root(p_submission_id);',
      "  SELECT enabled INTO normal_gate FROM public.print_provider_dispatch_gates WHERE provider='gelato' FOR SHARE;\n  PERFORM public.lock_gelato_submission_root(p_submission_id);").replace(
      '  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id = p_submission_id FOR UPDATE;\n',
      "  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id = p_submission_id FOR UPDATE;\n  -- Recheck after blocking locks: an authorization may expire while waiting.\n  IF NOT (coalesce(normal_gate,false) OR public.gelato_engineering_submission_allowed(p_submission_id,p_token)) THEN RAISE EXCEPTION 'Gelato dispatch disabled'; END IF;\n",
    );
  }
  assert.equal(definition(scoped, name), expected, `Carry canonical ${name} changes into scoped migration`);
}
console.log('Scoped forward migration preserves the three canonical contracts except reviewed authorization changes');
