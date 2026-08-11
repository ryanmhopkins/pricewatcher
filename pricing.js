const MONTHLY_URL='https://buy.stripe.com/7sY00jeb61HZ6toelHaEE01';
const ANNUAL_URL='https://buy.stripe.com/bJebJ1d720DV5pkcdzaEE03';
const monthlyBtn=document.querySelector('[data-billing="monthly"]');
const annualBtn=document.querySelector('[data-billing="annual"]');
const price=document.querySelector('#pro-price');
const suffix=document.querySelector('#pro-suffix');
const detail=document.querySelector('#pro-detail');
const cta=document.querySelector('#pro-cta');
function setBilling(mode){
  const annual=mode==='annual';
  monthlyBtn?.classList.toggle('active',!annual);
  annualBtn?.classList.toggle('active',annual);
  monthlyBtn?.setAttribute('aria-pressed',String(!annual));
  annualBtn?.setAttribute('aria-pressed',String(annual));
  if(price)price.textContent=annual?'$114':'$19';
  if(suffix)suffix.textContent=annual?'/yr':'/mo';
  if(detail)detail.innerHTML=annual?'<strong>$9.50/mo effective</strong> · billed $114 annually · <s>$228</s>':'Billed monthly. Cancel anytime.';
  if(cta){cta.href=annual?ANNUAL_URL:MONTHLY_URL;cta.textContent=annual?'Choose annual Pro →':'Choose monthly Pro →';}
}
monthlyBtn?.addEventListener('click',()=>setBilling('monthly'));
annualBtn?.addEventListener('click',()=>setBilling('annual'));
setBilling('monthly');
