const CONTACT_ENDPOINT='https://hmsldwpcaupanooestfr.supabase.co/functions/v1/plansentry-contact';
const form=document.querySelector('#contact-form');
const submit=document.querySelector('#contact-submit');
const status=document.querySelector('#contact-status');

form?.addEventListener('submit',async(event)=>{
  event.preventDefault();
  submit.disabled=true;
  submit.textContent='Sending…';
  status.className='contact-status';
  status.textContent='Sending your message…';
  const values=Object.fromEntries(new FormData(form).entries());
  try{
    const response=await fetch(CONTACT_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(values)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Unable to send your message.');
    form.reset();
    status.className='contact-status success';
    status.textContent='Message sent. We’ll get back to you soon.';
  }catch(error){
    status.className='contact-status error';
    status.textContent=error.message||'Unable to send. Email hello@plansentry.com instead.';
  }finally{
    submit.disabled=false;
    submit.textContent='Send message →';
  }
});
