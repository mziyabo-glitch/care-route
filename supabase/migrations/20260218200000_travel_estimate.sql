-- PART D: estimateTravelMinutes (outward code heuristic, no external API)

create or replace function public.estimate_travel_minutes(p_postcode_a text, p_postcode_b text)
returns int
language plpgsql
immutable
as $$
declare
  v_a text;
  v_b text;
  v_out_a text;
  v_out_b text;
  v_pre_a text;
  v_pre_b text;
begin
  v_a := upper(trim(coalesce(p_postcode_a, '')));
  v_b := upper(trim(coalesce(p_postcode_b, '')));
  if v_a = '' or v_b = '' then return 15; end if;
  v_out_a := split_part(v_a, ' ', 1);
  v_out_b := split_part(v_b, ' ', 1);
  if v_out_a = '' or v_out_b = '' then return 15; end if;
  if v_out_a = v_out_b then return 10; end if;
  v_pre_a := left(v_out_a, 2);
  v_pre_b := left(v_out_b, 2);
  if v_pre_a = v_pre_b then return 18; end if;
  return 25;
end;
$$;

revoke all on function public.estimate_travel_minutes(text, text) from public;
grant execute on function public.estimate_travel_minutes(text, text) to authenticated;
