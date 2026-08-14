const CHECKOUT_URLS={
  pro:{monthly:'https://buy.stripe.com/28E9ATgje5Yf7xs7XjaEE08',annual:'https://buy.stripe.com/9B6fZhd720DVbNI3H3aEE09'},
};
const PLAN_PRICING={
  pro:{monthly:{price:'$5',suffix:'/mo',detail:'Billed monthly. Cancel anytime.'},annual:{price:'$29',suffix:'/yr',detail:'<strong>$2.42/mo effective</strong> · save $31 versus monthly'}},
};
const monthlyBtn=document.querySelector('[data-billing="monthly"]');
const annualBtn=document.querySelector('[data-billing="annual"]');

// If the person is signed in on this browser, thread their Supabase user id
// through Stripe Checkout as client_reference_id. The webhook then matches
// the resulting subscription back to this exact account (see
// pricewatcher-stripe-webhook), instead of relying solely on a
// case-insensitive email match, which silently fails whenever the checkout
// email differs from the account email or no account exists yet.
function checkoutUrlFor(plan,mode){
  const base=CHECKOUT_URLS[plan][mode];
  const userId=localStorage.getItem('pw_user_id');
  if(!userId)return base;
  const url=new URL(base);
  url.searchParams.set('client_reference_id',userId);
  return url.toString();
}

function setBilling(mode){
  const annual=mode==='annual';
  monthlyBtn?.classList.toggle('active',!annual);
  annualBtn?.classList.toggle('active',annual);
  monthlyBtn?.setAttribute('aria-pressed',String(!annual));
  annualBtn?.setAttribute('aria-pressed',String(annual));
  const selected=PLAN_PRICING.pro[mode];
  const price=document.querySelector('#pro-price');
  const suffix=document.querySelector('#pro-suffix');
  const detail=document.querySelector('#pro-detail');
  const cta=document.querySelector('#pro-cta');
  if(price)price.textContent=selected.price;
  if(suffix)suffix.textContent=selected.suffix;
  if(detail)detail.innerHTML=selected.detail;
  if(cta){cta.href=checkoutUrlFor('pro',mode);cta.textContent=`Choose ${annual?'annual':'monthly'} Pro →`;}
}
monthlyBtn?.addEventListener('click',()=>setBilling('monthly'));
annualBtn?.addEventListener('click',()=>setBilling('annual'));
setBilling('monthly');
