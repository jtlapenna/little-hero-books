SELECT print_provider, count(*) AS order_count FROM public.orders GROUP BY print_provider;
SELECT count(*) AS known_legacy_unassigned
FROM public.orders o
WHERE o.print_provider IS NULL AND public.legacy_print_book_id(to_jsonb(o)) IS NOT NULL
  AND o.created_at <= (SELECT created_at FROM public.print_provider_dispatch_gates WHERE provider = 'gelato');
SELECT count(*) AS unresolved_legacy_candidates
FROM public.orders o
WHERE o.print_provider IS NULL AND o.created_at <= (SELECT created_at FROM public.print_provider_dispatch_gates WHERE provider = 'gelato')
  AND o.execution_status IN ('ready_for_processing','processing') AND o.next_workflow IN ('4','4-aggregate');
SELECT provider, enabled FROM public.print_provider_dispatch_gates;
