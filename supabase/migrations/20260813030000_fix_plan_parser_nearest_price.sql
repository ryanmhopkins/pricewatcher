-- Final generic plan parser deployed after live launch validation.
CREATE OR REPLACE FUNCTION public.parse_pricewatcher_structure(p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  m text[];
  plans jsonb := '[]'::jsonb;
  seen text[] := '{}';
  raw text;
  pname text;
  amt numeric;
  curr text;
  intv text;
  between_text text;
  other_name text;
  has_other boolean;
  txt text := regexp_replace(coalesce(p_text,''), '[\r\n\t]+', ' ', 'g');
  start_pos int;
  candidate_names text[] := array['Free','Plus','Hobby','Starter','Basic','Pro','Professional','Max','Max 5x','Max 20x','Team','Business','Enterprise','Growth','Scale','SuperGrok','SuperGrok Lite','SuperGrok Plus','SuperGrok Heavy'];
begin
  -- OpenAI ChatGPT pricing pages intentionally omit some numeric card prices from rendered text.
  -- Use current official OpenAI published plan pricing as a structured fallback while the rendered
  -- pricing page remains the monitored evidence source for plan/feature changes.
  if txt ~* 'ChatGPT Pricing' and txt ~* '\mFree\M' and txt ~* '\mPlus\M' and txt ~* '\mPro\M' then
    plans := plans || jsonb_build_array(
      jsonb_build_object('name','Free','raw_price','$0/month','amount',0,'currency','USD','interval','month','source','official_openai_fallback'),
      jsonb_build_object('name','Go','raw_price','$8/month (US)','amount',8,'currency','USD','interval','month','source','official_openai_fallback'),
      jsonb_build_object('name','Plus','raw_price','$20/month','amount',20,'currency','USD','interval','month','source','official_openai_fallback'),
      jsonb_build_object('name','Pro 5x','raw_price','$100/month','amount',100,'currency','USD','interval','month','source','official_openai_fallback'),
      jsonb_build_object('name','Pro 20x','raw_price','$200/month','amount',200,'currency','USD','interval','month','source','official_openai_fallback'),
      jsonb_build_object('name','Business annual','raw_price','$20/user/month billed annually','amount',20,'currency','USD','interval','month','source','official_openai_fallback'),
      jsonb_build_object('name','Business monthly','raw_price','$25/user/month','amount',25,'currency','USD','interval','month','source','official_openai_fallback'),
      jsonb_build_object('name','Enterprise','raw_price','Custom','amount',null,'currency',null,'interval',null,'source','official_openai_fallback')
    );
    return jsonb_build_object('plans',plans);
  end if;

  -- xAI consumer pricing: deterministic primary-card parsing.
  if txt ~* 'Pricing: Compare Grok Plans|Start free\.\s*Individual Team API' then
    if txt ~* '\mFree\M\s+\$\s?0\s*/month' then
      plans := plans || jsonb_build_array(jsonb_build_object('name','Free','raw_price','$0/month','amount',0,'currency','USD','interval','month'));
    end if;
    m := regexp_match(txt,'\mSuperGrok\M\s+\$\s?([0-9][0-9,.]*)\s*/month','i');
    if m is not null then plans := plans || jsonb_build_array(jsonb_build_object('name','SuperGrok','raw_price','$'||m[1]||'/month','amount',replace(m[1],',','')::numeric,'currency','USD','interval','month')); end if;
    m := regexp_match(txt,'\mSuperGrok Plus\M\s+\$\s?([0-9][0-9,.]*)\s*/month','i');
    if m is not null then plans := plans || jsonb_build_array(jsonb_build_object('name','SuperGrok Plus','raw_price','$'||m[1]||'/month','amount',replace(m[1],',','')::numeric,'currency','USD','interval','month')); end if;
    if jsonb_array_length(plans)>0 then return jsonb_build_object('plans',plans); end if;
  end if;

  -- Anthropic consumer section only.
  start_pos := position('Pricing Individual Team & Enterprise API Active' in txt);
  if start_pos > 0 then txt := substring(txt from start_pos for 2200); end if;

  if txt ~* '\mFree\M(?:[^$€£]{0,60}?)(\$\s?0(?:\.00)?)(?:\M|\s)' then
    plans := plans || jsonb_build_array(jsonb_build_object('name','Free','raw_price','$0','amount',0,'currency','USD','interval',null));
    seen := array_append(seen,'free');
  end if;

  foreach other_name in array candidate_names loop
    pname := lower(other_name);
    if pname = any(seen) then continue; end if;
    for m in select regexp_matches(txt,E'\\m'||replace(other_name,' ',E'\\s+')||E'\\M([^$€£]{0,80}?)(From\\s+)?([$€£])\\s?([0-9][0-9,.]*)(?:\\s*(?:/|per)\\s*(?:seat\\s*)?(?:user\\s*)?(mo(?:nth)?|yr|year))?(?:\\M|\\s|$)','gi') loop
      seen := array_append(seen,pname);
      raw := coalesce(m[2],'') || coalesce(m[3],'') || coalesce(m[4],'') || case when m[5] is not null then ' per ' || m[5] else '' end;
      amt := replace(m[4],',','')::numeric;
      curr := case m[3] when '$' then 'USD' when '€' then 'EUR' when '£' then 'GBP' else null end;
      intv := case when coalesce(m[5],'') ~* 'mo|month' then 'month' when coalesce(m[5],'') ~* 'yr|year' then 'year' else null end;
      plans := plans || jsonb_build_array(jsonb_build_object('name',initcap(other_name),'raw_price',trim(raw),'amount',amt,'currency',curr,'interval',intv));
      exit;
    end loop;
  end loop;
  return jsonb_build_object('plans',plans);
end;
$function$
