// Optional real SMS delivery via Twilio. No messages are sent without valid credentials.
const READY = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
async function sendEmergencySMS(phone, text) {
  if (!phone) return 'no_contact';
  if (!READY()) return 'not_configured';
  const account=process.env.TWILIO_ACCOUNT_SID;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),7000);
  try {
    const body=new URLSearchParams({To:phone,From:process.env.TWILIO_FROM,Body:text});
    const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`,{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',
        'Authorization':'Basic '+Buffer.from(`${account}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')},
      body:body.toString(),signal:controller.signal});
    return response.ok ? 'submitted_to_provider' : 'failed';
  }catch(_){return 'failed';}finally{clearTimeout(timer);}
}
module.exports={sendEmergencySMS, smsReady:READY};
