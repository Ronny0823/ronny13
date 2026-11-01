create or replace function public.pull_erp_record_changes(
  p_after timestamptz default '1970-01-01 00:00:00+00',
  p_after_id text default '',
  p_limit integer default 500
)
returns table (
  record_id text,
  record_type text,
  payload jsonb,
  client_updated_at timestamptz,
  server_updated_at timestamptz,
  deleted_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    r.record_id,
    r.record_type,
    r.payload,
    r.client_updated_at,
    r.server_updated_at,
    r.deleted_at
  from public.erp_records r
  where r.user_id = (select auth.uid())
    and (r.server_updated_at, r.record_id) >
        (coalesce(p_after, '1970-01-01 00:00:00+00'::timestamptz), coalesce(p_after_id, ''))
  order by r.server_updated_at asc, r.record_id asc
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$function$;

revoke all on function public.pull_erp_record_changes(timestamptz, text, integer) from public;
revoke all on function public.pull_erp_record_changes(timestamptz, text, integer) from anon;
grant execute on function public.pull_erp_record_changes(timestamptz, text, integer) to authenticated;
