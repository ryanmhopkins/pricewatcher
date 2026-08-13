-- Tighten non-plan pricing signals after live launch validation.
do $migration$
declare definition text; updated text;
begin
  select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='parse_pricewatcher_discounts';
  updated := replace(definition,$$clean:=trim(regexp_replace(line,E'\\s+',' ','g'));$$,$$clean:=trim(regexp_replace(line,E'\\s+',' ','g')); m:=regexp_match(clean,'(annual billing[^.]{0,220})','i'); if m is not null then clean:=m[1]; end if;$$);
  updated := replace(updated,$$(annual|annually|yearly|per year|/year|/yr|billed yearly|billed annually|save|off|months? free)$$,$$(annually|yearly|per year|/year|/yr|billed yearly|billed annually|annual billing|save|off|months? free)$$);
  if updated = definition then raise exception 'Discount parser signature changed; migration not applied'; end if;
  execute updated;
end $migration$;

do $migration$
declare definition text; updated text;
begin
  select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='parse_pricewatcher_packaging';
  updated := replace(definition, 'char_length(clean) > 300', 'char_length(clean) > 180');
  if updated = definition then raise exception 'Packaging parser signature changed; migration not applied'; end if;
  execute updated;
end $migration$;
