const CHECKOUT_URLS={
  plus:{monthly:'https://buy.stripe.com/9B6eVd9UQbizeZUdhDaEE05',annual:'https://buy.stripe.com/5kQ6oH4Aw1HZ6to0uRaEE06'},
  pro:{monthly:'https://buy.stripe.com/7sY00jeb61HZ6toelHaEE01',annual:'https://buy.stripe.com/3cIcN51ok86n4lg1yVaEE04'},
};
const PLAN_PRICING={
  plus:{monthly:{price:'$9',suffix:'/mo',detail:'Billed monthly. Cancel anytime.'},annual:{price:'$49',suffix:'/yr',detail:'<strong>$4.08/mo effective</strong> · billed $49 annually · <s>$108</s>'}},
  pro:{monthly:{price:'$19',suffix:'/mo',detail:'Billed monthly. Cancel anytime.'},annual:{price:'$99',suffix:'/yr',detail:'<strong>$8.25/mo effective</strong> · billed $99 annually · <s>$228</s>'}},
};
const monthlyBtn=document.querySelector('[data-billing="monthly"]');
const annualBtn=document.querySelector('[data-billing="annual"]');
function setBilling(mode){
  const annual=mode==='annual';
  monthlyBtn?.classList.toggle('active',!annual);
  annualBtn?.classList.toggle('active',annual);
  monthlyBtn?.setAttribute('aria-pressed',String(!annual));
  annualBtn?.setAttribute('aria-pressed',String(annual));
  for(const plan of ['plus','pro']){
    const selected=PLAN_PRICING[plan][mode];
    const price=document.querySelector(`#${plan}-price`);
    const suffix=document.querySelector(`#${plan}-suffix`);
    const detail=document.querySelector(`#${plan}-detail`);
    const cta=document.querySelector(`#${plan}-cta`);
    if(price)price.textContent=selected.price;
    if(suffix)suffix.textContent=selected.suffix;
    if(detail)detail.innerHTML=selected.detail;
    if(cta){cta.href=CHECKOUT_URLS[plan][mode];cta.textContent=`Choose ${annual?'annual':'monthly'} ${plan[0].toUpperCase()+plan.slice(1)} →`;}
  }
}
monthlyBtn?.addEventListener('click',()=>setBilling('monthly'));
annualBtn?.addEventListener('click',()=>setBilling('annual'));
setBilling('monthly');
