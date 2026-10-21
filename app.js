const defaultState={
 view:'sales', selectedProgram:null, selectedSlot:null, paid:false, parentName:'', childName:'', childPhoto:null,
 email:'', phone:'', attendance:0,totalSessions:0,rewardPoints:0, votes:{},userVote:null,publishedMVP:null,managerOverride:null,
 economics:'parent', consent:false, privacyOpen:false, attendanceByProgram:{}, currentCheckinDate:null,
 rewards:[], ledger:[], programs:[], players:[], activeChildId:null, pointsByChild:{}, ledgerByChild:{},
 managerChildren:[], managerEnrollments:[], managerSessions:[], votesBySession:{}, userVotesBySession:{}, publishedMVPBySession:{}, teamChildrenByProgram:{}, managerProgramId:null, activeManagerChildByProgram:{}, activeProgramByChild:{},
 rewardModeByProgram:{}, attendedSessionDates:{}, expandedPrograms:{}, enrolledPrograms:[], children:[], people:[],
 simulationOffsetDays:0, simulationBaseDate:new Date().toISOString().slice(0,10),
 authMode:null, authUser:null, authRole:null, registerRole:'parent', paymentMethod:null, authError:'', authMessage:'', authEmail:'',
 childModalOpen:false, childEditingId:null, childForm:{name:'',date_of_birth:'',sex:''}, rewardImagePreview:'', rewardEditingId:null, rewardImageChoice:'', locationSearch:[], scheduleDraft:{}
};
let savedState=null;
try{savedState=JSON.parse(localStorage.getItem('dailyRollMVP')||'null')}catch(_e){savedState=null}
const LOCAL_CACHE_VERSION='10.9.3';
let cacheCandidate=savedState&&typeof savedState==='object'&&savedState.cacheVersion===LOCAL_CACHE_VERSION?savedState:null;
if(savedState&&savedState.cacheVersion!==LOCAL_CACHE_VERSION){try{localStorage.removeItem('dailyRollMVP')}catch(_e){}}
const state=Object.assign(JSON.parse(JSON.stringify(defaultState)),cacheCandidate||{});
state.cacheVersion=LOCAL_CACHE_VERSION;
state.simulationBaseDate=state.simulationBaseDate||new Date().toISOString().slice(0,10);
state.simulationOffsetDays=Math.max(0,Math.min(400,Number(state.simulationOffsetDays)||0));
state.pointsByChild=state.pointsByChild||{}; state.ledgerByChild=state.ledgerByChild||{};
state.votesBySession=state.votesBySession||{}; state.userVotesBySession=state.userVotesBySession||{}; state.publishedMVPBySession=state.publishedMVPBySession||{};
state.rewardModeByProgram=state.rewardModeByProgram||{}; state.attendedSessionDates=state.attendedSessionDates||{};
state.expandedPrograms=state.expandedPrograms||{}; state.enrolledPrograms=state.enrolledPrograms||[]; state.children=state.children||[];
state.managerChildren=state.managerChildren||[]; state.managerEnrollments=state.managerEnrollments||[]; state.managerSessions=state.managerSessions||[]; state.teamChildrenByProgram=state.teamChildrenByProgram||{}; state.activeManagerChildByProgram=state.activeManagerChildByProgram||{}; state.activeProgramByChild=state.activeProgramByChild||{}; state.people=state.people||[];
state.scheduleDraft=state.scheduleDraft||{}; state.locationSearch=state.locationSearch||[]; state.cacheVersion=LOCAL_CACHE_VERSION; state.deletedPrograms=state.deletedPrograms||[];
// localStorage is a cache only; never trust it as proof of authentication.
state.authUser=null; state.authRole=null;
let rewardImageFile=null;
let appBooted=false;

// ---- Supabase connection ----
const SUPABASE_URL = 'https://pzgzzbjeyrxpuqkuizyr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YESJdmGbaOkMT0_0Yor9Dg_qkHj_GVv';
const OWNER_EMAIL = 'gurpsb@icloud.com';
const PRODUCTION_SITE_URL = 'https://the-daily-roll-mvp.vercel.app/';
function authRedirectUrl(){try{const o=window.location.origin;if(/^https:\/\//i.test(o)&&!/localhost|127\.0\.0\.1/i.test(o))return o+'/'}catch(_e){}return PRODUCTION_SITE_URL;}
const PAYMENT_VARIANT = 'cash';
const APP_VERSION = '10.9.3';
const PAYMENT_DEFAULT = 'emt';
let supabaseClient = null;
let supabaseReady = false;

function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function isUuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||''))}
function setBusy(btn,busy,label){if(!btn)return;btn.disabled=busy;btn.dataset.originalText=btn.dataset.originalText||btn.textContent;if(busy)btn.textContent=label||'Saving…';else btn.textContent=btn.dataset.originalText}
function cacheThenRender(){saveLocalOnly();render()}
function currentChildForId(childId){return (state.children||[]).find(c=>String(c.id)===String(childId))||null}
function activeProgramForChild(childId){
 const id=String(childId||activeChild()?.id||'');
 const enrolled=(state.programs||[]).filter(p=>isEnrolled(p.dbId||p.id,id));
 const preferred=state.activeProgramByChild?.[id]||state.selectedProgram;
 return enrolled.find(p=>String(p.dbId||p.id)===String(preferred))||enrolled[0]||null;
}
function attendanceStateKey(pr,childId){return `${String(programDbId(pr)||pr?.id||'')}:${String(childId||activeChild()?.id||'')}`}
function computeLocalBalance(childId){return childLedger(childId).reduce((sum,row)=>sum+Number(row.amount||0),0)}
function resetTransientRewardImage(){rewardImageFile=null;state.rewardImagePreview=''}

function detectEmailReturn(){
  try{
    const u=new URL(location.href),h=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
    const err=u.searchParams.get('error_description')||h.get('error_description');
    const resetPending=localStorage.getItem('dr_reset_pending')==='1';
    const isRecovery=h.get('type')==='recovery'||resetPending;
    if(err&&!isRecovery){state.authMode='confirm';state.authError='That confirmation link has expired or was already used. If you already confirmed, just log in. Otherwise enter your email below and press “Resend the email”.';return;}
    if((u.searchParams.has('code')||h.get('type')==='signup'||h.has('access_token'))&&!isRecovery){
      state.emailReturn=true;
      // If the link was opened in a different browser or app than the one used to sign up, no login happens,
      // but the email IS confirmed. Tell the person plainly.
      setTimeout(()=>{if(state.emailReturn&&!state.authUser&&state.authMode!=='recovery'){state.emailReturn=false;state.authMode='login';state.authError='';state.authMessage='Your email is confirmed ✓ Log in with your email and password to continue.';render();}},3500);
    }
  }catch(_e){}
}
async function initSupabase(){
  detectEmailReturn();
  try {
    if (!window.supabase || !window.supabase.createClient) return;
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
    supabaseReady = true;
    // Register the auth listener before fetching the current session so PASSWORD_RECOVERY is never missed.
    supabaseClient.auth.onAuthStateChange((event, session)=>{
      if(event==='PASSWORD_RECOVERY'){
        try{localStorage.removeItem('dr_reset_pending')}catch(_e){}state.emailReturn=false;
        state.authUser=session?.user||state.authUser; state.authMode='recovery'; state.authError=''; state.authMessage=''; render(); return;
      }
      if(event==='SIGNED_OUT'){ state.authUser=null; state.authRole=null; state.children=[]; state.enrolledPrograms=[]; state.authMode=null; render(); return; }
      if(event==='SIGNED_IN' && session?.user && String(state.authUser?.id||'')!==String(session.user.id)){
        setTimeout(async()=>{ try{ if(String(state.authUser?.id||'')!==String(session.user.id)){ await setAuthenticatedUser(session.user); if(state.emailReturn){state.emailReturn=false;state.authMode='welcome';} render(); } }catch(err){ console.error(err); } },0);
      }
    });
    await pullSupabaseData();
  } catch(err){ console.warn('Supabase connection failed; local demo mode remains available.', err); }
}
async function pullSupabaseData(){
 if(!supabaseClient)return;
 try{
   const q=await supabaseClient.from('programs').select('id,name,sport,sessions,price,attendance_payback,schedule,details,spots,venue_id,manager_id,rewards_enabled,venues(name,address)').is('deleted_at',null).order('created_at');
   if(q.error){console.warn('Public program load failed:',q.error.message);return;}
   state.programs=(q.data||[]).map((p,i)=>{
     const dates=extractDatesFromSchedule(p.schedule);
     return {id:i+1,dbId:p.id,managerId:p.manager_id||null,venueId:p.venue_id||null,name:p.name,sport:p.sport||'Sports',sessions:Number(p.sessions||0),price:Number(p.price||0),attendancePayback:Number(p.attendance_payback||0),rewardsEnabled:!!p.rewards_enabled,venue:[p.venues?.name,p.venues?.address].filter(Boolean).join(' • ')||'Venue TBD',details:p.details||'',scheduleWeeks:dates,firstDate:dates[0]||null,slots:[{id:'db-'+p.id,label:(String(p.schedule||'').split(' • ')[0]||'Schedule to be announced'),spots:Number(p.spots||0),capacity:Number(p.spots||0)}],managerName:'Program manager'};
   });
   if(state.programs.length){const mids=[...new Set(state.programs.map(p=>p.managerId).filter(isUuid))]; if(mids.length){const mq=await supabaseClient.from('program_manager_names').select('manager_id,name').in('manager_id',mids); if(!mq.error){const names=Object.fromEntries((mq.data||[]).map(x=>[x.manager_id,x.name])); state.programs=state.programs.map(p=>({...p,managerName:names[p.managerId]||'Program manager'}));}}}
 }catch(err){console.warn('Public Supabase read failed.',err)}
}
function saveLocalOnly(){
 state.cacheVersion=LOCAL_CACHE_VERSION;
 const copy={...state,authUser:null,authRole:null,children:state.children||[],managerChildren:state.managerChildren||[],managerEnrollments:state.managerEnrollments||[],teamChildrenByProgram:state.teamChildrenByProgram||{}};
 delete copy.demoEnabled; delete copy.gameday; delete copy.childModalOpen; delete copy.rewardImagePreview;
 try{localStorage.setItem('dailyRollMVP',JSON.stringify(copy))}catch(err){console.warn('Local cache unavailable.',err)}
}
async function syncStateToSupabase(){return true}
function save(){saveLocalOnly()}
function toast(msg){const d=document.createElement('div');d.className='toast';d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),2300)}
function money(n){return new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(n)}
function checkout(p){const kids=state.children||[];const active=activeChild();if(!state.authUser||!isParentLike())return `<div class="card" style="margin-top:20px"><div class="notice">Log in as a parent to join this program and select a child.</div></div>`;return `<div class="section-title"><div><h2>Join ${esc(p.name)}</h2><span class="muted">Select the child, choose the payback destination and payment method.</span></div></div><div class="checkout-layout"><div class="card"><h3>Enrollment</h3><div class="formgrid"><div class="full"><div class="label">Child</div><select class="input" id="checkoutChild">${kids.map(c=>`<option value="${esc(c.id)}" ${String(c.id)===String(active?.id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div><div class="label">Parent name</div><input class="input" id="parent" value="${esc(state.parentName)}" maxlength="100"></div><div><div class="label">Email</div><input class="input" id="email" type="email" value="${esc(state.email)}" placeholder="you@example.com"></div><div><div class="label">Phone</div><input class="input" id="phone" type="tel" value="${esc(state.phone)}" placeholder="416-555-1234"></div></div><div class="notice" style="margin-top:18px">Child photo can be added later. Birthday and sex stay on the child profile and are not shown here.</div></div><div class="card sticky-summary"><h3>Payment summary</h3><div class="statrow"><span>Program</span><b>${money(p.price)}</b></div><div class="statrow"><span>Attendance payback</span><b>${money(p.attendancePayback||0)}</b></div><div class="statrow"><span>Reward catalog</span><b>${rewardMode(p)==='catalog'?'Manager catalog enabled':'No rewards by default'}</b></div><div class="divider"></div><div class="statrow total"><span>Total</span><b>${money(p.price)}</b></div><div style="margin-top:14px"><div class="label">Attendance payback goes to</div><select class="input" id="paybackDestination"><option value="parent">Parent</option><option value="kid">Kid wallet</option></select></div><div style="margin-top:14px"><div class="label">Payment method</div><select class="input" id="paymentMethod"><option value="cash">Cash</option><option value="emt">EMT</option>${PAYMENT_VARIANT==='stripe'?'<option value="stripe">Credit card</option>':''}</select></div><button class="btn green" style="width:100%;margin-top:14px" onclick="openPrivacy()">Continue</button><p class="small muted">Next you will sign the waiver (once per child) and review exactly what you are paying. Nothing is charged until you confirm.</p></div></div>`}

function legacyPrivacyModal(){return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">Required acknowledgement</span><h2>Privacy & video acknowledgement</h2></div><button class="icon-btn" onclick="closePrivacy()">×</button></div><p>The Daily Roll may use cameras and AI video processing during sessions to provide session recordings, live viewing and, in the future, child-specific highlights.</p><p class="muted">This MVP uses a placeholder acknowledgement. Before launch, this should link to your final privacy policy, consent language and applicable legal terms.</p><div class="policy-box"><b>What you're acknowledging</b><ul><li>Session video may be recorded and processed.</li><li>Authorized family members may access session video.</li><li>Future AI features may analyze session footage.</li></ul><label class="check"><input type="checkbox" ${state.consent?'checked':''} onchange="state.consent=this.checked;save();render()"> I acknowledge the privacy/video terms and want to continue.</label></div><button class="btn green" style="width:100%" ${state.consent?'':'disabled'} onclick="continueToPayment()">Proceed to payment</button></div></div>`}
function mvpTable(p){const prog=p||currentTrackedProgram(),s=prog&&currentSessionForProgram(prog);if(!s||!isUuid(String(s.id||s.dbId)))return '';const rows=(state.managerChildren||[]).filter(c=>isManagerEnrolled(prog.dbId||prog.id,c.id)).map(c=>{const n=state.votesBySession?.[String(s.id||s.dbId)]?.[String(c.id)]||0;return {id:c.id,name:c.name,votes:n}}).sort((a,b)=>b.votes-a.votes);const chosen=state.publishedMVPBySession?.[String(s.id||s.dbId)]||'';return `<div class="card"><h3>🏆 MVP voting • ${fmtDate(s.date)}</h3>${rows.length?`<table class="table"><thead><tr><th>Player</th><th>Votes</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.votes}</td></tr>`).join('')}</tbody></table><div style="margin-top:12px"><div class="label">Manager override</div><select class="input" id="mvpSelect-${prog.id}"><option value="">Use vote leader</option>${rows.map(r=>`<option value="${esc(r.id)}" ${String(chosen)===String(r.id)?'selected':''}>${esc(r.name)}</option>`).join('')}</select><button class="btn green" style="margin-top:10px" onclick="publishMVP(${prog.id})">Publish MVP</button></div>${chosen?`<div class="success" style="margin-top:12px">Published MVP: <b>${esc((state.managerChildren||[]).find(c=>String(c.id)===String(chosen))?.name||chosen)}</b></div>`:''}`:'<div class="notice">No enrolled teammates are available for this session yet.</div>'}</div>`}

function rewardsInfo(){return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>How rewards work</h2><button class="icon-btn" onclick="closeModal()">×</button></div><div class="reward-explain"><div class="big-number">1</div><div><b>1 point = $1</b><p class="muted">Kids earn points for attendance, effort, teamwork and achievements. Points can be spent on rewards set by the manager.</p></div></div><button class="btn green" style="width:100%" onclick="closeModal()">Got it</button></div></div>`}
function spendModal(){const p=currentTrackedProgram();const catalog=rewardCatalogForProgram(p);return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">Spend points</span><h2>${childPoints(activeChild()?.id)} points available</h2></div><button class="icon-btn" onclick="closeModal()">×</button></div>${catalog.length?`<div class="catalog">${catalog.map(r=>`<button class="reward-card" onclick="buyReward('${esc(r.id||r.dbId)}')">${r.image?`<img src="${esc(r.image)}" alt=""/>`:'<div class="reward-icon">🎁</div>'}<div><b>${esc(r.name)}</b><p class="small muted">${esc(r.description)}</p></div><strong>${r.cost} pts</strong></button>`).join('')}</div>`:'<div class="notice">No rewards are enabled for this program.</div>'}</div></div>`}

function openRewardsInfo(){state.privacyOpen='rewards';render()}function openSpend(){state.privacyOpen='spend';render()}function openVideo(){toast('Demo video room: live stream and full-session download will connect here.')}function closeModal(){state.privacyOpen=false;render()}
function selectSlot(pid,sid){state.selectedProgram=pid;state.selectedSlot=sid;save();render();document.getElementById('programs').scrollIntoView({behavior:'smooth'})}
function selectProgram(pid){state.selectedProgram=pid;state.selectedSlot=null;save();render();document.getElementById('programs').scrollIntoView({behavior:'smooth'})}
function deselectProgram(){state.selectedProgram=null;state.selectedSlot=null;save();render()}
function openPrivacy(){state.parentName=document.getElementById('parent')?.value.trim()||state.parentName||'';state.email=document.getElementById('email')?.value.trim().toLowerCase()||state.email||'';state.phone=document.getElementById('phone')?.value.trim()||state.phone||'';state.activeChildId=document.getElementById('checkoutChild')?.value||state.activeChildId;const c=activeChild();if(c)state.childName=c.name;state.paymentMethod=document.getElementById('paymentMethod')?.value||PAYMENT_DEFAULT;state.economics=document.getElementById('paybackDestination')?.value||'parent';const _c=activeChild();state.signOnly=false;state.agree={insurance:false,presence:false,video:null,name:''};state.checkoutStep=state.waiver?((_c&&waiverSigned(_c.id))?'summary':'agree'):'legacy';state.privacyOpen=true;state.consent=false;saveLocalOnly();render()}
/* ===== Waiver, parent-presence agreement, video consent and payment explainer ===== */
async function loadWaiverData(){
 if(!supabaseClient||!state.authUser)return;
 try{
  const w=await supabaseClient.from('waiver_versions').select('version,title,body,presence_text,video_text').eq('active',true).maybeSingle();
  state.waiver=(!w.error&&w.data)?w.data:null;
  const g=await supabaseClient.from('waiver_signatures').select('id,parent_id,child_id,waiver_version,signer_name,video_consent,video_consent_updated_at,signed_at');
  state.waiverSigs=g.error?[]:(g.data||[]);
 }catch(_e){state.waiver=null;state.waiverSigs=[]}
}
function waiverSigFor(childId){if(!state.waiver)return null;return (state.waiverSigs||[]).find(x=>String(x.child_id)===String(childId)&&Number(x.waiver_version)===Number(state.waiver.version)&&String(x.parent_id)===String(state.authUser?.id))||null}
function waiverSigned(childId){return !state.waiver||!!waiverSigFor(childId)}
function waiverOnFile(childId){return !state.waiver||(state.waiverSigs||[]).some(x=>String(x.child_id)===String(childId)&&Number(x.waiver_version)===Number(state.waiver.version))}
function waiverBodyHtml(t){return String(t||'').split(/\n+/).filter(Boolean).map(l=>l.startsWith('# ')?`<h4 style="margin:14px 0 4px">${esc(l.slice(2))}</h4>`:`<p style="margin:0 0 6px">${esc(l)}</p>`).join('')}
function agreeOk(){const a=state.agree||{};return !!(a.insurance&&a.presence&&(a.video===true||a.video===false)&&String(a.name||'').trim().length>=2)}
function agreeUpdate(){const b=document.getElementById('agreeBtn');if(b)b.disabled=!agreeOk()}
function agreeSet(k,v){state.agree=state.agree||{};state.agree[k]=v;agreeUpdate()}
function agreementsModal(){
 const w=state.waiver,c=activeChild(),a=state.agree||{};
 return `<div class="modal-backdrop"><div class="modal" style="max-width:660px;max-height:92vh;overflow:auto"><div class="modal-head"><div><span class="pill">${state.signOnly?'Required by our insurance':'Step 1 of 2 • Required before payment'}</span><h2>Agreements for ${esc(c?.name||'your child')}</h2></div><button class="icon-btn" onclick="closePrivacy()">×</button></div>
 <p class="muted" style="margin-top:8px">Please read and sign. Our insurance requires every parent to agree to these before a child can take part. You only do this once per child.</p>
 <div class="label" style="margin-top:14px">1. ${esc(w.title)}</div>
 <div class="policy-box" style="max-height:230px;overflow:auto;margin:6px 0 0">${waiverBodyHtml(w.body)}</div>
 <label class="check"><input type="checkbox" ${a.insurance?'checked':''} onchange="agreeSet('insurance',this.checked)"> I have read and agree to the waiver above.</label>
 <div class="label" style="margin-top:18px">2. Parent or guardian present at every session</div>
 <div class="policy-box" style="margin:6px 0 0">${esc(w.presence_text)}</div>
 <label class="check"><input type="checkbox" ${a.presence?'checked':''} onchange="agreeSet('presence',this.checked)"> I agree to be present as described.</label>
 <div class="label" style="margin-top:18px">3. Video recording and privacy</div>
 <div class="policy-box" style="margin:6px 0 0">${esc(w.video_text)}</div>
 <div class="radio-stack" style="margin-top:10px"><label><input type="radio" name="videoChoice" ${a.video===true?'checked':''} onchange="agreeSet('video',true)"> Yes, ${esc(c?.name||'my child')} may be recorded and appear in session video and statistics.</label><label><input type="radio" name="videoChoice" ${a.video===false?'checked':''} onchange="agreeSet('video',false)"> No, please do not include ${esc(c?.name||'my child')} in recordings or statistics.</label></div>
 <div class="label" style="margin-top:18px">Sign: type your full name</div>
 <input class="input" id="agreeName" value="${esc(a.name||'')}" placeholder="Parent or guardian full name" maxlength="100" autocomplete="name" oninput="agreeSet('name',this.value)">
 <p class="small muted" style="margin:6px 0 0">Typing your name is your electronic signature. We record the date and time and the exact wording you agreed to.</p>
 <button id="agreeBtn" class="btn green" style="width:100%;margin-top:16px" ${agreeOk()?'':'disabled'} onclick="signWaiver()">${state.signOnly?'Sign':'Sign and continue to payment'}</button></div></div>`;
}
async function signWaiver(){
 if(!agreeOk())return toast('Please tick both boxes, choose a video option and type your full name.');
 const c=activeChild();if(!c||!supabaseClient)return toast('Choose a child first.');
 const a=state.agree,btn=document.getElementById('agreeBtn');setBusy(btn,true,'Signing…');
 try{
  const q=await supabaseClient.rpc('sign_waiver',{p_child:c.id,p_name:String(a.name).trim(),p_accept_insurance:!!a.insurance,p_accept_presence:!!a.presence,p_video_consent:a.video===true});
  if(q.error){toast('Could not save your signature: '+q.error.message);return}
  await loadWaiverData();state.agree=null;
  if(state.signOnly){state.signOnly=false;state.privacyOpen=false;toast('Thank you. The waiver is signed.');render();return}
  state.checkoutStep='summary';render();
 }finally{setBusy(btn,false)}
}
function openAgreements(childId){state.activeChildId=childId;const c=activeChild();if(c)state.childName=c.name;state.signOnly=true;state.agree={insurance:false,presence:false,video:null,name:''};state.checkoutStep='agree';state.privacyOpen=true;render()}
async function changeVideoConsent(childId,val){
 if(!supabaseClient)return;const q=await supabaseClient.rpc('set_video_consent',{p_child:childId,p_consent:!!val});
 if(q.error)return toast('Could not change the video choice: '+q.error.message);
 await loadWaiverData();toast(val?'Video recording allowed.':'Video recording turned off for this child.');render();
}
function agreementRows(child){
 if(!state.waiver)return '';
 const s=waiverSigFor(child.id);
 if(!s)return `<div class="notice" style="margin:10px 0"><b>Waiver not signed</b><div class="small muted" style="margin:4px 0 8px">Our insurance requires a signed waiver before ${esc(child.name)} can be registered or take part.</div><button class="btn green" type="button" onclick="openAgreements('${esc(child.id)}')">Sign waiver now</button></div>`;
 return `<div class="statrow"><span>Waiver</span><b>Signed ${esc(fmtDate(String(s.signed_at).slice(0,10)))} by ${esc(s.signer_name)} ✓</b></div><div class="statrow"><span>Video recording</span><b>${s.video_consent?'Allowed':'Not allowed'}</b></div><div class="button-row" style="margin-top:6px"><button class="btn light" type="button" onclick="changeVideoConsent('${esc(child.id)}',${!s.video_consent})">${s.video_consent?'Turn video recording off':'Allow video recording'}</button></div>`;
}
function waiverBanner(){
 if(!state.waiver||!state.authUser||!isParentLike())return '';
 const need=(state.children||[]).filter(c=>!waiverSigned(c.id));
 if(!need.length)return '';
 return `<div class="notice" style="margin-bottom:18px;border:1px solid #f0c36d;background:#fff8e6"><b>Waiver needed</b><div class="small muted" style="margin:4px 0 10px">Our insurance requires a signed waiver for: ${need.map(c=>esc(c.name)).join(', ')}. ${need.length?'It takes a minute.':''}</div><div class="button-row">${need.map(c=>`<button class="btn green" type="button" onclick="openAgreements('${esc(c.id)}')">Sign for ${esc(c.name)}</button>`).join('')}</div></div>`;
}
function managerWaiverRow(kids){
 if(!state.waiver||!(kids||[]).length)return '';
 const missing=kids.filter(c=>!waiverOnFile(c.id));
 return `<div class="statrow"><span>Waivers signed</span><b>${kids.length-missing.length} of ${kids.length}${missing.length?' • missing: '+missing.map(c=>esc(c.name)).join(', '):' ✓'}</b></div>`;
}
function selectedProgramForPayment(){return (state.programs||[]).find(x=>String(x.id)===String(state.selectedProgram)||String(x.dbId)===String(state.selectedProgram))||currentTrackedProgram()}
function paymentSummaryModal(){
 const p=selectedProgramForPayment(),c=activeChild();if(!p||!c)return legacyPrivacyModal();
 const price=Number(p.price||0),pay=Number(p.attendancePayback||0),n=Number(p.sessions||0),m=state.paymentMethod||PAYMENT_DEFAULT,dest=state.economics==='kid'?'kid':'parent';
 const methodName=m==='stripe'?'Credit card':m==='emt'?'EMT e-Transfer':'Cash';
 const methodText=m==='stripe'?'You will be taken to Stripe’s secure page to pay by card. Your child’s spot is confirmed once Stripe confirms the payment.':m==='emt'?'Send an EMT e-Transfer to the program manager. Your child’s spot shows as pending until the manager confirms the payment arrived.':'Pay the program manager in cash. Your child’s spot shows as pending until the manager confirms they received it.';
 const sig=waiverSigFor(c.id);
 const rewards=rewardMode(p)==='catalog';
 const paybackBox=pay>0?`<div class="policy-box" style="margin:14px 0"><b>How attendance payback works</b><ul style="margin:8px 0 0;padding-left:20px"><li>Come to <b>every one of the ${n} sessions</b> and you get <b>${money(pay)} back</b>.</li><li>Attendance is recorded by check-in at each session.</li><li>If ${esc(c.name)} misses a session, no payback is paid for this program.</li><li>${dest==='kid'?`The payback goes into ${esc(c.name)}’s wallet as ${pay} points${rewards?' to spend on this program’s rewards':''}.`:'The payback goes to you, the parent.'}</li><li>If every session is attended, your real cost is <b>${money(Math.max(0,price-pay))}</b>.</li></ul></div>`:`<div class="policy-box" style="margin:14px 0"><b>Attendance payback</b><div class="small muted" style="margin-top:6px">This program has no attendance payback.</div></div>`;
 return `<div class="modal-backdrop"><div class="modal" style="max-height:92vh;overflow:auto"><div class="modal-head"><div><span class="pill">${state.waiver?'Step 2 of 2':'Review'}</span><h2>Review your payment</h2></div><button class="icon-btn" onclick="closePrivacy()">×</button></div>
 <div style="margin-top:12px"><div class="statrow"><span>Child</span><b>${esc(c.name)}</b></div><div class="statrow"><span>Program</span><b>${esc(p.name)}</b></div><div class="statrow"><span>Sessions</span><b>${n}${p.slots?.[0]?.label?' • '+esc(p.slots[0].label):''}</b></div><div class="statrow"><span>Payment method</span><b>${esc(methodName)}</b></div><div class="divider"></div><div class="statrow total"><span>You pay today</span><b>${price>0?money(price):'Free'}</b></div></div>
 <p class="muted" style="margin:10px 0 0">${esc(methodText)}</p>
 ${paybackBox}
 ${sig?`<div class="small muted">✓ Waiver signed by ${esc(sig.signer_name)} on ${esc(fmtDate(String(sig.signed_at).slice(0,10)))}.</div>`:''}
 <div class="button-row" style="margin-top:14px"><button class="btn light" type="button" onclick="closePrivacy()">Back</button><button id="payNowBtn" class="btn green" type="button" onclick="payNow()">${m==='stripe'?'Continue to card payment':'Confirm enrollment'}${price>0?' • '+money(price):''}</button></div></div></div>`;
}
function payNow(){const b=document.getElementById('payNowBtn');if(b)b.disabled=true;state.privacyOpen=false;state.consent=true;saveLocalOnly();render();setTimeout(()=>processSelectedPayment(),50)}
function privacyModal(){if(state.checkoutStep==='summary')return paymentSummaryModal();if(state.checkoutStep==='agree'&&state.waiver)return agreementsModal();return legacyPrivacyModal()}

function closePrivacy(){state.privacyOpen=false;render()}
function continueToPayment(){if(!state.consent)return;state.privacyOpen=false;state.paymentMethod=document.getElementById('paymentMethod')?.value||PAYMENT_DEFAULT;state.economics=document.getElementById('paybackDestination')?.value||'parent';saveLocalOnly();render();setTimeout(()=>processSelectedPayment(),50)}
async function completePurchase(method='cash'){
 if(state.paymentProcessing)return;
 const p=(state.programs||[]).find(x=>String(x.id)===String(state.selectedProgram)||String(x.dbId)===String(state.selectedProgram))||currentTrackedProgram();const c=activeChild();
 if(!p||!c)return toast('Choose a child and program first.');
 if(!supabaseClient||!state.authUser)return toast('Log in before enrolling.');
 if(!['cash','emt'].includes(method))return toast('Choose Cash or EMT.');
 state.paymentProcessing=true;
 try{
   const q=await supabaseClient.rpc('start_cash_emt_enrollment',{p_program_id:p.dbId,p_child_id:c.id,p_method:method,p_payback_destination:state.economics||'parent'});
   if(q.error){if(String(q.error.message||'').includes('WAIVER_REQUIRED')){await loadWaiverData();state.checkoutStep='agree';state.agree={insurance:false,presence:false,video:null,name:''};state.privacyOpen=true;render();return toast('Please sign the waiver for this child first.')}return toast('Could not save the enrollment: '+q.error.message);}
   await loadUserData();state.activeProgramByChild=state.activeProgramByChild||{};state.activeProgramByChild[String(c.id)]=String(p.dbId||p.id);state.selectedProgram=null;state.selectedSlot=null;setView('parent');toast(method==='emt'?'Enrollment saved — EMT payment is pending confirmation.':'Enrollment saved — cash payment is pending confirmation.');render();
 }catch(err){toast('Could not save the enrollment: '+(err?.message||'unknown error'))}
 finally{state.paymentProcessing=false;}
}

function voteStateKey(sessionId,childId){return `${String(sessionId||'')}:${String(childId||'')}`}
function setActiveKidProgram(programId){const c=activeChild();if(!c)return toast('Select a child first.');const p=(state.programs||[]).find(x=>String(x.dbId||x.id)===String(programId)||String(x.id)===String(programId));if(!p||!isEnrolled(p.dbId||p.id,c.id))return toast('Choose a program this child is enrolled in.');state.activeProgramByChild=state.activeProgramByChild||{};state.activeProgramByChild[String(c.id)]=String(p.dbId||p.id);state.currentVote=null;state.currentVoteChildId=null;saveLocalOnly();render()}
function castVote(childId){const c=activeChild();state.currentVote=childId?String(childId):null;state.currentVoteChildId=c?.id||null;render()}
async function submitVote(){const c=activeChild(),p=c&&activeProgramForChild(c.id),s=p&&currentSessionForProgram(p);if(!p||!c||!s||!isUuid(String(s.id||s.dbId)))return toast('Voting is only available on a real session day.');if(!state.currentVote)return toast('Pick a teammate first.');if(state.currentVoteChildId&&String(state.currentVoteChildId)!==String(c.id))return toast('Select your teammate again for this child.');const roster=teamChildrenForProgram(p.dbId||p.id);const nominee=roster.find(x=>String(x.id)===String(state.currentVote))||(state.children||[]).find(x=>String(x.id)===String(state.currentVote));if(!nominee)return toast('That teammate is not available.');const prev=state.userVotesBySession[voteStateKey(s.id||s.dbId,c.id)];if(prev&&String(prev)===String(nominee.id))return toast('That is already your vote.');const q=prev?await supabaseClient.from('session_votes').update({nominee_child_id:nominee.id}).eq('session_id',s.id||s.dbId).eq('voter_child_id',c.id).select('id,session_id,voter_child_id,nominee_child_id').single():await supabaseClient.from('session_votes').insert({session_id:s.id||s.dbId,voter_child_id:c.id,nominee_child_id:nominee.id}).select('id,session_id,voter_child_id,nominee_child_id').single();if(q.error){return toast('Could not record vote: '+q.error.message)}state.userVotesBySession[voteStateKey(s.id||s.dbId,c.id)]=String(nominee.id);state.currentVote=null;state.currentVoteChildId=null;toast(prev?'Vote changed':'Vote recorded for this session');await loadUserData();render();}
async function publishMVP(pid){const p=(state.programs||[]).find(x=>String(x.id)===String(pid)||String(x.dbId)===String(pid))||currentTrackedProgram();const s=p&&currentSessionForProgram(p);if(!p||!s||!isUuid(String(s.id||s.dbId)))return toast('No database session is selected.');const chosen=document.getElementById(`mvpSelect-${p.id}`)?.value||null;const sessionId=s.id||s.dbId;let childId=null;if(chosen){const cc=(state.managerChildren||[]).find(x=>String(x.id)===String(chosen));childId=cc?.id||chosen}else{const rows=await supabaseClient.from('session_votes').select('nominee_child_id').eq('session_id',sessionId);if(rows.error)return toast('Could not read the vote tally: '+rows.error.message);const counts={};for(const x of rows.data||[])counts[x.nominee_child_id]=(counts[x.nominee_child_id]||0)+1;childId=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;}if(!childId)return toast('No vote leader to publish yet.');const q=await supabaseClient.from('session_mvp').upsert({session_id:sessionId,child_id:childId,override:!!chosen,published_by:state.authUser.id,published_at:new Date().toISOString()},{onConflict:'session_id'});if(q.error)return toast('Could not publish MVP: '+q.error.message);state.publishedMVPBySession[String(sessionId)]=childId;toast('MVP published for this session');render();}
function setEconomics(v){state.economics=v;save();toast(`Payment preference saved: ${v==='kid'?'kid':'parent'}`)}
function adjustAttendance(){const pr=currentTrackedProgram();if(!pr)return toast('No program available.');const a=attendanceProgress(pr);setProgramAttendance(pr,Math.min(a.total,a.attended+1),'manager');}
async function addReward(){return saveRewardRecord();}
function previewRewardImage(event){const file=event?.target?.files?.[0];if(!file){resetTransientRewardImage();return render()}if(!file.type.startsWith('image/')){event.target.value='';return toast('Choose an image file.')}if(file.size>5*1024*1024){event.target.value='';return toast('Reward images must be 5 MB or smaller.')}rewardImageFile=file;const reader=new FileReader();reader.onload=()=>{state.rewardImagePreview=String(reader.result||'');render()};reader.readAsDataURL(file)}
async function buyReward(id){
 const r=state.rewards.find(x=>String(x.id)===String(id)||String(x.dbId)===String(id));const c=activeChild();const p=c&&activeProgramForChild(c.id);
 if(!r||!c||!p)return toast('Choose an enrolled child and program first.');
 if(rewardMode(p)!=='catalog')return toast('Rewards are not enabled for this program.');
 if(childPoints(c.id)<Number(r.cost))return toast('Not enough points.');
 const q=await insertPointsLedger({childId:c.id,programId:p.dbId,managerId:p.managerId,amount:-Number(r.cost),description:`Reward purchase — ${r.name}`,type:'spent',rewardId:r.dbId,sourceKey:`purchase-${crypto.randomUUID()}`});
 if(q.error)return toast('Could not purchase reward: '+q.error.message);
 toast(`${r.name} purchased`);render();
}

function resetDemo(){localStorage.removeItem('dailyRollMVP');location.reload()}
function setView(v){const allowed=['sales','parent','kid','manager'];if(!allowed.includes(v))return;state.view=v;saveLocalOnly();render();window.scrollTo({top:0,behavior:'smooth'})}
function renderModalSpecial(){if(state.privacyOpen==='rewards')return rewardsInfo();if(state.privacyOpen==='spend')return spendModal();return null}


// ---- Clean product flow / auth / program management v3 ----
state.expandedPrograms = state.expandedPrograms || {};
state.authMode = state.authMode || null;
state.authUser = state.authUser || null;
state.authRole = state.authRole || null;
state.enrolledPrograms = state.enrolledPrograms || [];
state.children = state.children || [];
state.people = state.people || [];
state.registerRole = state.registerRole || 'parent';

function publicPrograms(){ return state.programs||[]; }
function isOwner(){return !!state.authUser && (String(state.authUser.email||'').toLowerCase()===OWNER_EMAIL || state.authRole==='owner');}
function authButtons(){
  if(state.authUser) return `<span class="small" style="color:#dbe6f6">${state.authUser.email||''}</span><button class="btn light" onclick="logout()">Log out</button>`;
  return `<button class="btn light" onclick="openAuth('login')">Log in</button><button class="btn green" onclick="openAuth('register')">Register</button>`;
}
function authRequired(){const pending=state.authRole==='manager_pending';return `<div class="card" style="max-width:620px;margin:50px auto;text-align:center"><span class="pill">${pending?'Manager approval pending':'Account required'}</span><h2>${pending?'Your manager account is awaiting approval':'Log in to The Daily Roll'}</h2><p class="muted">${pending?'You registered as a manager. The owner needs to approve your account before Manager View is available.':'Parents can manage children and programs. Owners can also use the Parent View for testing.'}</p><div class="button-row" style="justify-content:center"><button class="btn blue" onclick="${pending?'logout()':'openAuth(\'login\')'}">${pending?'Log out':'Log in'}</button>${pending?'':'<button class="btn green" onclick="openAuth(\'register\')">Create account</button>'}</div></div>`}

function authModal(){
  if(state.authMode==='recovery'){return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">Password recovery</span><h2>Set a new password</h2></div></div><p class="muted">Choose a new password for your Daily Roll account.</p>${state.authError?`<div class="auth-error" role="alert"><b>${esc(state.authError)}</b></div>`:''}${state.authMessage?`<div class="auth-success" role="status">${esc(state.authMessage)}</div>`:''}<div class="label">New password</div><input class="input" id="recoveryPassword" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"><div class="label" style="margin-top:12px">Confirm password</div><input class="input" id="recoveryPassword2" type="password" autocomplete="new-password" minlength="8" placeholder="Re-enter your password"><button class="btn green" style="width:100%;margin-top:18px" onclick="finishPasswordReset()">Update password</button></div></div>`;}
  if(state.authMode==='welcome'){return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">Email confirmed ✓</span><h2>You’re all set</h2></div></div><div class="auth-success" role="status"><b>Your email is confirmed and you’re signed in${state.authUser?.email?' as '+esc(state.authUser.email):''}.</b></div><p class="muted">${state.authRole==='manager_pending'?'Your manager application is waiting for the owner’s approval. Manager View unlocks once you’re approved.':isParentLike()?'Next step: add your child, then pick a program to register them.':'Welcome to The Daily Roll.'}</p><button class="btn green" style="width:100%;margin-top:12px" onclick="state.authMode=null;setView(isParentLike()?'parent':state.view)">Continue</button></div></div>`;}
  if(state.authMode==='confirm'){const em=esc(state.authEmail||'');return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">Almost there</span><h2>Check your email</h2></div><button class="icon-btn" onclick="closeAuth()">×</button></div>${state.authError?`<div class="auth-error" role="alert"><b>${esc(state.authError)}</b></div>`:`<div class="auth-success" role="status"><b>We sent a confirmation link to ${em}.</b></div>`}${state.authMessage?`<div class="auth-success" role="status" style="margin-top:8px">${esc(state.authMessage)}</div>`:''}<ol class="muted" style="margin:10px 0 0 18px;padding:0;line-height:1.6"><li>Open the email from The Daily Roll. It can take a minute and may land in spam or promotions.</li><li>Tap the link in it. That confirms your email.</li><li>You’ll come back to this site. In the same browser you’ll be signed in automatically; if it opens somewhere else (like your phone), just log in with your email and password.</li></ol><p class="muted">Your account can’t be used until you do this.${state.authEmail?'':`<div class="label" style="margin-top:12px">Your email</div><input class="input" id="authEmail" type="email" placeholder="you@example.com">`}${state.confirmRole==='manager'?' Because you applied as a manager, the owner also has to approve you before Manager View unlocks.':''}</p><button class="btn green" style="width:100%;margin-top:12px" onclick="openAuth('login')">I confirmed it — log in</button><button class="btn light" style="width:100%;margin-top:8px" onclick="resendConfirmation()">Resend the email</button></div></div>`;}
  const reg=state.authMode==='register', forgot=state.authMode==='forgot';
  return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">The Daily Roll account</span><h2>${reg?'Create your account':forgot?'Reset your password':'Welcome back'}</h2></div><button class="icon-btn" onclick="closeAuth()">×</button></div>${state.authError?`<div class="auth-error" role="alert" aria-live="assertive"><div class="auth-error-title">${forgot?'Reset failed':reg?'Registration failed':'Invalid credentials'}</div><div>${esc(state.authError)}</div>${!reg&&!forgot?'<div class="small" style="margin-top:7px">Please check your email and password. You can use “Forgot password?” below if needed.</div>':''}</div>`:''}${state.authMessage?`<div class="auth-success" role="status">${esc(state.authMessage)}</div>`:''}${forgot?`<p class="muted">Enter your account email. We'll send you a link to set a new password.</p><div class="label">Email</div><input class="input ${state.authError && !reg && !forgot ? 'input-error' : ''}" id="authEmail" type="email" autocomplete="username" value="${esc(state.authEmail||'')}" placeholder="you@example.com"><button class="btn green" style="width:100%;margin-top:18px" onclick="sendPasswordReset()">Send reset link</button><button class="btn light" style="width:100%;margin-top:8px" onclick="openAuth('login')">Back to login</button>`:`${reg?`<div class="notice" style="margin-bottom:16px"><b>Choose your account type</b><div class="small muted" style="margin-top:4px">Managers can register normally, but the owner must approve the account before Manager View is unlocked.</div></div><div class="label">Account type</div><select class="input" id="authRole" onchange="state.registerRole=this.value;saveLocalOnly()"><option value="parent" ${state.registerRole==='parent'?'selected':''}>Parent</option><option value="manager" ${state.registerRole==='manager'?'selected':''}>Manager</option></select>`:''}<div class="label" style="margin-top:12px">Email</div><input class="input ${state.authError && !reg && !forgot ? 'input-error' : ''}" id="authEmail" type="email" autocomplete="username" value="${esc(state.authEmail||'')}" placeholder="you@example.com"><div class="label" style="margin-top:12px">Password</div><input class="input ${state.authError && !reg && !forgot ? 'input-error' : ''}" id="authPassword" type="password" autocomplete="current-password" placeholder="Your password" onkeydown="if(event.key==='Enter'){${reg?'registerAccount':'loginAccount'}()}">${reg?`<div class="label" style="margin-top:12px">Name</div><input class="input" id="authName" placeholder="Your name">`:''}<button class="btn ${reg?'green':'blue'}" style="width:100%;margin-top:18px" onclick="${reg?'registerAccount()':'loginAccount()'}">${reg?'Create account':'Log in'}</button>${reg?'':'<button class="btn light" type="button" style="width:100%;margin-top:8px" onclick="openAuth(\'forgot\')">Forgot password?</button>'}<p class="small muted" style="margin-top:12px">${reg?'Your account type is saved to your profile. The owner email is automatically recognized as the owner account.':'Use the email and password you registered with.'}</p>`}</div></div>`;
}
function openAuth(mode){state.authMode=mode;state.authError='';state.authMessage='';if(mode==='register'){state.authRole='parent';state.registerRole='parent';}else{state.authRole=null;}render()}
function closeAuth(){state.authMode=null;state.authError='';state.authMessage='';render()}
async function sendPasswordReset(){
 if(!supabaseClient)return state.authError='Supabase is not connected.',render();
 const email=document.getElementById('authEmail')?.value.trim().toLowerCase(); state.authEmail=email||''; state.authError=''; state.authMessage='';
 if(!email)return state.authError='Enter the email address for your Daily Roll account.',render();
 try{localStorage.setItem('dr_reset_pending','1')}catch(_e){}
 const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:PRODUCTION_SITE_URL});
 if(error){state.authError=error.message;return render();}
 state.authMessage='Reset link sent. Check your email and open the link on the Daily Roll website.';
 render();
}
async function finishPasswordReset(){
 if(!supabaseClient)return state.authError='Supabase is not connected.',render();
 const p1=document.getElementById('recoveryPassword')?.value||'',p2=document.getElementById('recoveryPassword2')?.value||'';
 state.authError='';state.authMessage='';
 if(p1.length<8)return state.authError='Password must be at least 8 characters.',render();
 if(p1!==p2)return state.authError='The passwords do not match.',render();
 const {error}=await supabaseClient.auth.updateUser({password:p1});
 if(error){state.authError=error.message;return render();}
 // Sign out first; SIGNED_OUT clears auth state, so set the success state afterwards.
 try{await supabaseClient.auth.signOut()}catch(_e){}
 state.authUser=null;state.authRole=null;state.authMode='login';state.authError='';state.authMessage='Password updated successfully. Log in with your new password.';
 try{history.replaceState({},'',location.pathname)}catch(_e){}
 render();
}

async function registerAccount(){
 if(!supabaseClient){state.authError='Supabase is not connected.';return render();}
 const email=document.getElementById('authEmail')?.value.trim().toLowerCase()||'';const password=document.getElementById('authPassword')?.value||'';const name=document.getElementById('authName')?.value.trim()||'';const requestedRole=document.getElementById('authRole')?.value==='manager'?'manager':'parent'; state.authEmail=email; state.authError=''; state.authMessage='';
 const owner=email===OWNER_EMAIL;
 if(!email||!password||password.length<8||!name){state.authError='Enter your name, email and a password of at least 8 characters.';return render();}
 const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{name,requested_role:owner?'owner':requestedRole},emailRedirectTo:authRedirectUrl()}});
 if(error){state.authError=error.message;return render();}
 if(data.user&&Array.isArray(data.user.identities)&&data.user.identities.length===0){state.authError='An account with this email already exists. Log in instead, or use “Forgot password?”.';return render();}
 if(data.session?.user){state.authMode=null;await setAuthenticatedUser(data.user);toast(owner?'Owner account created':'Account created');render();return;}
 state.authMode='confirm';state.authEmail=email;state.confirmRole=requestedRole;render();
}
async function resendConfirmation(){
 const email=state.authEmail||document.getElementById('authEmail')?.value.trim().toLowerCase()||'';
 if(!supabaseClient||!email)return toast('Enter your email first.');
 const {error}=await supabaseClient.auth.resend({type:'signup',email,options:{emailRedirectTo:authRedirectUrl()}});
 if(error)return toast('Could not resend: '+error.message);
 state.authMessage='Another confirmation email is on its way to '+email+'.';render();
}

async function loginAccount(){
 if(!supabaseClient){state.authError='Supabase is not connected.';return render();}
 const email=document.getElementById('authEmail')?.value.trim().toLowerCase()||'',password=document.getElementById('authPassword')?.value||''; state.authEmail=email;state.authError='';state.authMessage='';
 if(!email||!password){state.authError='Enter both your email address and password.';return render();}
 const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
 if(error){
   const msg=String(error.message||'').toLowerCase();
   state.authError=(msg.includes('invalid login credentials')||msg.includes('invalid credentials')||msg.includes('email not confirmed'))?
     (msg.includes('email not confirmed')?(state.authMode='confirm','Your email has not been confirmed yet. Check your email for the confirmation link.'):'The email or password is incorrect. Check both and try again.') : error.message;
   return render();
 }
 state.authError='';state.authMessage='';await setAuthenticatedUser(data.user);state.authMode=null;render();
}
async function setAuthenticatedUser(user){
 state.authUser=user;state.email=user.email||'';state.authMode=null;
 let profileQ=await supabaseClient.from('profiles').select('id,name,role,email').eq('id',user.id).maybeSingle();
 let profile=profileQ.data||null;
 const normalizedEmail=String(user.email||'').toLowerCase();
 if(!profile){const desiredRole=normalizedEmail===OWNER_EMAIL?'owner':'parent';const ins=await supabaseClient.from('profiles').insert({id:user.id,name:user.user_metadata?.name||user.email?.split('@')[0]||'Parent',role:desiredRole,email:user.email});if(ins.error&&ins.error.code!=='23505')console.warn('Profile creation failed:',ins.error.message);profile=(await supabaseClient.from('profiles').select('id,name,role,email').eq('id',user.id).maybeSingle()).data||null;}
 if(normalizedEmail===OWNER_EMAIL){state.authRole='owner';state.parentName=profile?.name||user.user_metadata?.name||'Owner';if(profile?.role!=='owner'){await supabaseClient.from('profiles').update({role:'owner',email:user.email}).eq('id',user.id)}}
 else{state.authRole=profile?.role||'parent';state.parentName=profile?.name||user.user_metadata?.name||user.email?.split('@')[0]||'Parent';}
 state.demoEnabled=false;try{const dq=await supabaseClient.from('profiles').select('demo_enabled').eq('id',user.id).maybeSingle();state.demoEnabled=!dq.error&&dq.data?.demo_enabled===true}catch(_e){}
 state.view=(state.authRole==='manager'||state.authRole==='owner')?'manager':'sales';
 await loadUserData();saveLocalOnly();
}

async function loadUserData(){
 if(!supabaseClient||!state.authUser)return;
 try{
   const uid=state.authUser.id; const parentLike=isParentLike(); state.userVotesBySession={}; state.publishedMVPBySession={};
   if(parentLike){
     state.rewards=[];state.payments=[];state.sessions=[];state.teamChildrenByProgram={};state.managerChildren=[];state.attendanceByProgram={};state.attendedSessionDates={};
     const linksQ=await supabaseClient.from('parent_children').select('child_id').eq('parent_id',uid);
     if(linksQ.error)throw new Error('Could not load children: '+linksQ.error.message);
     const ids=(linksQ.data||[]).map(x=>x.child_id).filter(isUuid);
     if(ids.length){
       const cq=await supabaseClient.from('children').select('id,name,date_of_birth,sex,photo_url,created_by').in('id',ids).order('name');
       if(cq.error)throw new Error('Could not load child profiles: '+cq.error.message);
       state.children=cq.data||[];
       if(!state.activeChildId||!ids.some(x=>String(x)===String(state.activeChildId)))state.activeChildId=ids[0];
       const c=activeChild(); if(c){state.childName=c.name;state.rewardPoints=childPoints(c.id);state.ledger=childLedger(c.id)}
       const enroll=await supabaseClient.from('program_children').select('program_id,child_id,payment_id,payment_status,enrollment_status,payback_destination,payback_awarded_at').in('child_id',ids);
       if(enroll.error)throw new Error('Could not load enrollments: '+enroll.error.message);
       state.enrolledPrograms=enroll.data||[];
       state.teamChildrenByProgram={};
       state.managerChildren=[];
       for(const pid of [...new Set((state.enrolledPrograms||[]).map(x=>x.program_id).filter(isUuid))]){
         const roster=await supabaseClient.rpc('get_team_roster',{p_program_id:pid});
         if(!roster.error){
           state.teamChildrenByProgram[String(pid)]=(roster.data||[]).map(x=>({id:x.child_id,name:x.name,photo_url:x.photo_url||null}));
           for(const x of state.teamChildrenByProgram[String(pid)]){if(!state.managerChildren.some(c=>String(c.id)===String(x.id)))state.managerChildren.push(x)}
         }
       }
       const lq=await supabaseClient.from('points_ledger').select('id,child_id,program_id,manager_id,amount,description,type,reward_id,created_at').in('child_id',ids).order('created_at',{ascending:true});
       if(lq.error)throw new Error('Could not load points: '+lq.error.message);
       state.pointsByChild={};state.ledgerByChild={};
       for(const row of (lq.data||[])){
         const key=String(row.child_id); state.ledgerByChild[key]=state.ledgerByChild[key]||[];
         state.ledgerByChild[key].push({dbId:row.id,date:row.created_at||simulationDate(),description:row.description||'Points',amount:Number(row.amount||0),type:row.type||'earned',programId:row.program_id,rewardId:row.reward_id});
       }
       ids.forEach(id=>{state.pointsByChild[String(id)]=computeLocalBalance(id)});
       const pids=[...new Set((state.enrolledPrograms||[]).map(x=>x.program_id).filter(isUuid))];
       if(pids.length){
         const sq=await supabaseClient.from('sessions').select('id,name,sport,session_date,start_time,end_time,status,description,max_players,program_id,venue_id,venues(name,address)').in('program_id',pids).order('session_date');
         if(!sq.error)state.sessions=(sq.data||[]).map(s=>({id:s.id,dbId:s.id,name:s.name,sport:s.sport||'',date:s.session_date,start:s.start_time||'',end:s.end_time||'',status:String(s.status||'Committed').toLowerCase(),description:s.description||'',maxPlayers:Number(s.max_players||0),programId:s.program_id,venue:[s.venues?.name,s.venues?.address].filter(Boolean).join(' • ')||'Venue TBD'}));
       }
       if(pids.length && ids.length){const vq=await supabaseClient.from('session_votes').select('session_id,voter_child_id,nominee_child_id').in('voter_child_id',ids).in('session_id',(state.sessions||[]).map(x=>x.id));if(!vq.error){state.userVotesBySession={};for(const v of vq.data||[]){state.userVotesBySession[voteStateKey(v.session_id,v.voter_child_id)]=String(v.nominee_child_id)}}
         const mv=await supabaseClient.from('session_mvp').select('session_id,child_id').in('session_id',(state.sessions||[]).map(x=>x.id));if(!mv.error){state.publishedMVPBySession={};for(const x of mv.data||[])state.publishedMVPBySession[String(x.session_id)]=x.child_id;}}
       const [checkQ,overrideQ,paybackQ,paymentQ]=await Promise.all([
         supabaseClient.from('session_checkins').select('session_id,child_id,checked_in_at,sessions(program_id,session_date,status)').in('child_id',ids),
         pids.length?supabaseClient.from('attendance_overrides').select('program_id,child_id,attended_count,reason,updated_at').in('program_id',pids).in('child_id',ids):Promise.resolve({data:[],error:null}),
         supabaseClient.from('attendance_paybacks').select('id,program_id,child_id,amount,destination,status,awarded_at').in('child_id',ids),
         supabaseClient.from('payments').select('id,program_id,child_id,amount,currency,method,status,receipt_number,stripe_checkout_session_id,receipt_url,paid_at,created_at').eq('user_id',uid).order('created_at',{ascending:false})
       ]);
       applyAttendanceRows(checkQ.data||[],overrideQ.data||[],paybackQ.data||[]);
       state.payments=paymentQ.error?[]:(paymentQ.data||[]);
       for(const p of state.programs||[]){p.rewardsEnabled=!!p.rewardsEnabled;}
       // Load only reward catalogs belonging to enrolled programs that opted in.
       const rewardManagerIds=[...new Set((state.enrolledPrograms||[]).map(e=>(state.programs||[]).find(p=>String(p.dbId)===String(e.program_id))?.managerId).filter(isUuid))];
       if(rewardManagerIds.length){const rr=await supabaseClient.from('rewards').select('id,name,description,cost,icon,image_url,image_path,manager_id').eq('active',true).in('manager_id',rewardManagerIds).order('created_at');if(!rr.error)state.rewards=(rr.data||[]).map((x,i)=>({id:i+1,dbId:x.id,name:x.name,description:x.description||'',cost:Number(x.cost||0),icon:x.icon||'🎁',image:x.image_url||'',image_path:x.image_path||null,managerId:x.manager_id}));}
     }else{state.children=[];state.enrolledPrograms=[];state.pointsByChild={};state.ledgerByChild={};state.rewardPoints=0;state.ledger=[];state.payments=[];}
   }
   if(state.authRole==='manager'||state.authRole==='owner'){
     state.managerChildren=[];state.managerEnrollments=[];state.managerSessions=[];state.managerPayments=[];state.rewards=[];state.votesBySession={};state.publishedMVPBySession={};
     let pq=supabaseClient.from('programs').select('id,name,sport,sessions,price,attendance_payback,schedule,details,spots,venue_id,manager_id,rewards_enabled,deleted_at,deleted_by,venues(name,address)').order('created_at'); if(state.authRole==='manager')pq=pq.eq('manager_id',uid);
     const q=await pq;if(q.error)throw new Error('Could not load manager programs: '+q.error.message);
     state.deletedPrograms=(q.data||[]).filter(p=>p.deleted_at).map(p=>({dbId:p.id,managerId:p.manager_id||null,deletedBy:p.deleted_by||null,deletedAt:p.deleted_at,name:p.name,schedule:String(p.schedule||'').split(' • ')[0]||'',venue:[p.venues?.name,p.venues?.address].filter(Boolean).join(' • ')||'Venue TBD'}));
     state.programs=(q.data||[]).filter(p=>!p.deleted_at).map((p,i)=>{const dates=extractDatesFromSchedule(p.schedule);return {id:i+1,dbId:p.id,managerId:p.manager_id,venueId:p.venue_id||null,name:p.name,sport:p.sport||'Sports',sessions:Number(p.sessions||0),price:Number(p.price||0),attendancePayback:Number(p.attendance_payback||0),rewardsEnabled:!!p.rewards_enabled,venue:[p.venues?.name,p.venues?.address].filter(Boolean).join(' • ')||'Venue TBD',details:p.details||'',scheduleWeeks:dates,firstDate:dates[0]||null,slots:[{id:'db-'+p.id,label:(String(p.schedule||'').split(' • ')[0]||'Schedule to be announced'),spots:Number(p.spots||0),capacity:Number(p.spots||0)}],managerName:'Program manager'};});
     const mids=[...new Set(state.programs.map(p=>p.managerId).filter(isUuid))];if(mids.length){const mq=await supabaseClient.from('program_manager_names').select('manager_id,name').in('manager_id',mids);if(!mq.error){const names=Object.fromEntries((mq.data||[]).map(x=>[x.manager_id,x.name]));state.programs=state.programs.map(p=>({...p,managerName:names[p.managerId]||'Program manager'}));}}
     let rq=supabaseClient.from('rewards').select('id,name,description,cost,icon,image_url,image_path,manager_id').eq('active',true);if(state.authRole==='manager')rq=rq.eq('manager_id',uid);const rr=await rq.order('created_at');if(!rr.error)state.rewards=(rr.data||[]).map((x,i)=>({id:i+1,dbId:x.id,name:x.name,description:x.description||'',cost:Number(x.cost||0),icon:x.icon||'🎁',image:x.image_url||'',image_path:x.image_path||null,managerId:x.manager_id}));
     const pids=state.programs.map(p=>p.dbId).filter(isUuid);
     if(pids.length){const sq=await supabaseClient.from('sessions').select('id,name,sport,session_date,start_time,end_time,status,description,max_players,program_id,venue_id,venues(name,address)').in('program_id',pids).order('session_date');if(!sq.error)state.managerSessions=(sq.data||[]).map(s=>({id:s.id,dbId:s.id,name:s.name,sport:s.sport||'',date:s.session_date,start:s.start_time||'',end:s.end_time||'',status:String(s.status||'Committed').toLowerCase(),description:s.description||'',maxPlayers:Number(s.max_players||0),programId:s.program_id,venue:[s.venues?.name,s.venues?.address].filter(Boolean).join(' • ')||'Venue TBD'}));state.sessions=state.managerSessions;
       const pc=await supabaseClient.from('program_children').select('program_id,child_id,payment_status,enrollment_status').in('program_id',pids);state.managerEnrollments=pc.error?[]:(pc.data||[]);const childIds=[...new Set(state.managerEnrollments.map(x=>x.child_id).filter(isUuid))];if(childIds.length){const cq=await supabaseClient.from('children').select('id,name,date_of_birth,sex,photo_url,created_by').in('id',childIds).order('name');if(!cq.error)state.managerChildren=cq.data||[];}
       const vq=await supabaseClient.from('session_votes').select('session_id,voter_child_id,nominee_child_id,created_at').in('session_id',(state.managerSessions||[]).map(s=>s.id));if(!vq.error){state.managerVoteRows=vq.data||[];state.votesBySession={};for(const v of vq.data||[]){state.votesBySession[v.session_id]=state.votesBySession[v.session_id]||{};const n=String(v.nominee_child_id);state.votesBySession[v.session_id][n]=(state.votesBySession[v.session_id][n]||0)+1;}}
       const mv=await supabaseClient.from('session_mvp').select('session_id,child_id').in('session_id',(state.managerSessions||[]).map(s=>s.id));if(!mv.error)for(const x of mv.data||[])state.publishedMVPBySession[String(x.session_id)]=x.child_id;
     }
     state.attendanceByProgram={};state.attendedSessionDates={};
     const managerChildIds=[...new Set((state.managerChildren||[]).map(c=>c.id).filter(isUuid))];
     if(managerChildIds.length){
       const [managerCheckQ,managerOverrideQ,managerPaybackQ]=await Promise.all([
         supabaseClient.from('session_checkins').select('session_id,child_id,checked_in_at,sessions(program_id,session_date,status)').in('child_id',managerChildIds),
         pids.length?supabaseClient.from('attendance_overrides').select('program_id,child_id,attended_count,reason,updated_at').in('program_id',pids).in('child_id',managerChildIds):Promise.resolve({data:[],error:null}),
         pids.length?supabaseClient.from('attendance_paybacks').select('id,program_id,child_id,amount,destination,status,awarded_at').in('program_id',pids).in('child_id',managerChildIds):Promise.resolve({data:[],error:null})
       ]);
       if(managerCheckQ.error)throw new Error('Could not load session attendance: '+managerCheckQ.error.message);
       if(managerOverrideQ.error)throw new Error('Could not load attendance adjustments: '+managerOverrideQ.error.message);
       if(managerPaybackQ.error)throw new Error('Could not load attendance paybacks: '+managerPaybackQ.error.message);
       applyAttendanceRows(managerCheckQ.data||[],managerOverrideQ.data||[],managerPaybackQ.data||[]);
     }
     const payq=await supabaseClient.from('payments').select('id,program_id,child_id,amount,currency,method,status,receipt_number,paid_at,created_at').in('program_id',pids).order('created_at',{ascending:false});state.managerPayments=payq.error?[]:(payq.data||[]);
     if(isOwner()){const people=await supabaseClient.from('profiles').select('id,name,email,role,created_at').order('created_at',{ascending:false});if(!people.error)state.people=people.data||[];try{const dq=await supabaseClient.from('profiles').select('id,demo_enabled');if(!dq.error){const m=Object.fromEntries((dq.data||[]).map(x=>[x.id,x.demo_enabled===true]));state.people=(state.people||[]).map(p=>({...p,demo_enabled:!!m[p.id]}))}}catch(_e){}}
   }
   await loadWaiverData();await loadGamedayData();
   saveLocalOnly();render();
 }catch(err){console.error('Authenticated data load failed:',err);toast(err.message||'Could not load account data.');}
}

async function setDemoForUser(userId,on){
 if(!isOwner())return toast('Owner access required.');
 const target=(state.people||[]).find(p=>p.id===userId);if(!target)return toast('User not found.');
 const {error}=await supabaseClient.from('profiles').update({demo_enabled:!!on}).eq('id',userId);
 if(error)return toast('Could not change demo view: '+error.message);
 state.people=state.people.map(p=>p.id===userId?{...p,demo_enabled:!!on}:p);
 toast(on?'Demo view is On for '+(target.email||'that account')+'.':'Demo view is Off for '+(target.email||'that account')+'.');render();
}
async function changeUserRole(userId,newRole){
 if(!isOwner())return toast('Owner access required.');
 const allowed=['parent','manager_pending','manager']; if(!allowed.includes(newRole))return toast('Invalid role.');
 const target=(state.people||[]).find(p=>p.id===userId); if(!target)return toast('User not found.');
 if(String(target.email||'').toLowerCase()===OWNER_EMAIL)return toast('The owner account cannot be changed here.');
 const {error}=await supabaseClient.from('profiles').update({role:newRole}).eq('id',userId);
 if(error)return toast('Could not update role: '+error.message);
 state.people=state.people.map(p=>p.id===userId?{...p,role:newRole}:p);
 toast(newRole==='manager'?'Manager approved.':newRole==='parent'?'Changed to Parent.':'Set to pending manager.');render();
}
function ownerPeoplePanel(){
 const on=state.demoMode!==false;
 const demoCard=`<div class="card" style="margin-top:18px"><div class="section-title" style="margin-bottom:0"><div><span class="pill">Owner controls</span><h3>Demo mode</h3><p class="muted">${on?'Demo features are showing: the demo clock and the “jump to next session” buttons.':'Demo features are hidden. The app is running on today’s real date.'}</p></div><button class="btn ${on?'danger':'green'}" type="button" onclick="setDemoMode(${!on})">${on?'Hide demo features':'Show demo features'}</button></div></div>`;
 const people=(state.people||[]).filter(p=>String(p.email||'').toLowerCase()!==OWNER_EMAIL);
 return demoCard+`<div class="card" style="margin-top:18px"><div class="section-title" style="margin-bottom:12px"><div><span class="pill">Owner controls</span><h3>Manager approvals & accounts</h3><p class="muted">Managers register normally. You decide who is approved as a manager.</p></div></div>${people.length?`<table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Change</th><th>Demo view</th></tr></thead><tbody>${people.map(p=>`<tr><td><b>${esc(p.name||'Unnamed')}</b></td><td>${esc(p.email||'—')}</td><td>${p.role==='manager_pending'?'<span class="pill">Pending manager</span>':esc(p.role)}</td><td><select class="input" onchange="changeUserRole('${esc(p.id)}',this.value)" style="min-width:150px"><option value="${esc(p.role)}" selected>${p.role==='manager_pending'?'Pending manager':esc(p.role)}</option><option value="parent">Parent</option><option value="manager_pending">Pending manager</option><option value="manager">Manager</option></select></td><td><button class="btn ${p.demo_enabled?'green':'light'}" type="button" onclick="setDemoForUser('${esc(p.id)}',${!p.demo_enabled})">${p.demo_enabled?'On':'Off'}</button></td></tr>`).join('')}</tbody></table><p class="small muted" style="margin-top:8px">Demo view: when On, that person sees the demo clock after they log in, so you can test through their account. Turn it Off when you are done.</p>`:'<div class="notice">No other accounts yet. When someone registers as a manager, their application will appear here.</div>'}</div>`;
}
async function logout(){if(supabaseClient)await supabaseClient.auth.signOut();state.authUser=null;state.authRole=null;state.demoEnabled=false;state.children=[];state.enrolledPrograms=[];state.view='sales';saveLocalOnly();render();toast('Logged out')}
function toggleProgram(id){state.expandedPrograms[id]=!state.expandedPrograms[id];render()}
function scheduleSection(pr,childId){
 const pid=String(pr?.dbId||'');if(!pid)return '';
 const key='sched-'+pid+'-'+String(childId||'');
 const open=!!state.expandedPrograms[key];
 const list=(state.sessions||[]).filter(s=>String(s.programId)===pid).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 const today=simulationDate();
 const next=list.find(s=>s.date>=today&&s.status!=='cancelled');
 const attended=(state.attendedSessionDates||{})[attendanceStateKey(pr,childId)]||{};
 const rows=weeklyBreakdown(pr,list,{role:'family',attended,today});
 return `<div class="card" style="margin-bottom:10px"><button class="program-collapse" type="button" aria-expanded="${open?'true':'false'}" onclick="toggleProgram('${esc(key)}')"><span><b>Schedule</b><span class="small muted">${esc(pr.name)} • ${list.length} session${list.length===1?'':'s'}${next?' • next: '+esc(next.date):''}</span></span><span>${open?'−':'+'}</span></button>${open?`<div class="program-expanded"><div class="button-row" style="margin-top:0"><button class="btn light" type="button" onclick="downloadProgramICS('${esc(pid)}')">Add to calendar</button></div><div style="margin-top:14px">${rows}</div></div>`:''}</div>`;
}
function fmtClock(t){const m=String(t||'').match(/^(\d{1,2}):(\d{2})/);if(!m)return '';let h=Number(m[1]);const ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+m[2]+' '+ap}
function weeklyBreakdown(pr,list,opts){
 opts=opts||{};
 const today=opts.today||simulationDate();
 const flagFor=iso=>{const y=Number(String(iso).slice(0,4));return ({...hdsbFlags(y),...ontarioHolidayFlags(y)})[iso]||null};
 const sorted=(list||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 const planned=Number(pr?.sessions||0);
 if(!sorted.length)return `<div class="notice">${planned?`No sessions have been created yet for this program (${planned} planned).${opts.role==='manager'?' Press “Fill missing sessions” to create them.':' The manager has not finished setting up the schedule.'}`:'No sessions have been scheduled yet.'}</div>`;
 const rows=[];let n=0;
 for(let i=0;i<sorted.length;i++){
  const s=sorted[i];
  if(i>0){let d=addDays(sorted[i-1].date,7);let guard=0;while(d<s.date&&guard<30){const fl=flagFor(d);rows.push(`<div class="week-row removed"><div><b>Week off</b><span class="small muted" style="margin-left:8px">${esc(fmtDate(d))}</span></div><div>${fl?`<span class="pill">⚠ ${esc(fl)}</span>`:'<span class="small muted">No session this week</span>'}</div><div><span class="tag">Off</span></div></div>`);d=addDays(d,7);guard++}}
  n++;
  const cancelled=s.status==='cancelled';const fl=flagFor(s.date);
  const att=(opts.attended&&s.date<=today)?opts.attended[s.date]:null;
  const edit=opts.role==='manager'&&opts.editChild&&!cancelled&&s.date<=today;
  const cancelPill=cancelled?'<span class="pill">Counts as attended ✓</span>':'';
  const badge=opts.role==='manager'?(edit?`<button class="btn ${att?'green':'light'}" type="button" onclick="toggleAttendance('${esc(s.dbId||s.id)}','${esc(opts.editChild)}',${att?'false':'true'})">${att?'Present ✓':'Absent'}</button>`:cancelPill):cancelled?cancelPill:att?'<span class="pill">Attended ✓</span>':s.date===today?'<span class="pill">Today</span>':s.date<today?'<span class="tag">Missed</span>':'<span class="tag">Upcoming</span>';
  const when=fmtClock(s.start)&&fmtClock(s.end)?fmtClock(s.start)+'–'+fmtClock(s.end):'';
  rows.push(`<div class="week-row ${cancelled?'removed':'included'}"><div><b>Week ${n}</b><span class="small muted" style="margin-left:8px">${esc(fmtDate(s.date))}</span></div><div>${fl?`<span class="pill">⚠ ${esc(fl)}</span>`:'<span class="small muted">Normal week</span>'}<div class="small muted">${esc([when,s.venue].filter(Boolean).join(' • '))}</div></div><div style="display:flex;gap:6px;align-items:center;justify-content:flex-end">${badge}<span class="pill">${esc(s.status)}</span></div></div>`);
 }
 const made=sorted.filter(s=>s.status!=='cancelled').length;
 const missing=planned>made?`<div class="notice" style="margin-top:8px">${made} of ${planned} planned sessions have been created.${opts.role==='manager'?' Press “Fill missing sessions” to add the rest.':' The manager is still setting up the rest of the schedule.'}</div>`:'';
 return `<div class="schedule-planner">${rows.join('')}</div>${missing}`;
}
function childNameById(programId,id){const t=(teamChildrenForProgram(programId)||[]).find(c=>String(c.id)===String(id));if(t)return t.name;const m=(state.children||[]).find(c=>String(c.id)===String(id));return m?m.name:'a teammate'}
function toggleHistory(key){state.expandedPrograms[key]=!(state.expandedPrograms[key]!==false);render()}
function historySection(pr,child){
 const pid=String(pr?.dbId||'');if(!pid||!child)return '';
 const key='hist-'+pid+'-'+String(child.id);
 const open=state.expandedPrograms[key]!==false;
 const today=simulationDate();
 const all=(state.sessions||[]).filter(s=>String(s.programId)===pid).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 const attended=(state.attendedSessionDates||{})[attendanceStateKey(pr,child.id)]||{};
 const past=all.map((s,i)=>({s,week:i+1})).filter(x=>x.s.date<=today).reverse();
 const held=past;
 const went=held.filter(x=>x.s.status==='cancelled'||attended[x.s.date]).length;
 const lastMvp=held.map(x=>(state.publishedMVPBySession||{})[String(x.s.id||x.s.dbId)]).find(Boolean);
 const who=id=>String(id)===String(child.id)?'You!':childNameById(pid,id);
 const rows=past.map(({s,week})=>{
  const cancelled=s.status==='cancelled';
  const mvpId=(state.publishedMVPBySession||{})[String(s.id||s.dbId)];
  const att=cancelled?'<span class="pill">Cancelled • counts as attended ✓</span>':attended[s.date]?'<span class="pill">Attended ✓</span>':s.date===today?'<span class="pill">Today</span>':'<span class="tag">Missed</span>';
  const mvp=cancelled?'':mvpId?`<span class="pill">🏆 MVP: ${esc(who(mvpId))}</span>`:'<span class="small muted">MVP not announced</span>';
  return `<div class="week-row ${cancelled?'removed':'included'}"><div><b>Week ${week}</b><span class="small muted" style="margin-left:8px">${esc(fmtDate(s.date))}</span></div><div>${mvp}</div><div style="display:flex;gap:6px;align-items:center;justify-content:flex-end">${att}</div></div>`}).join('');
 return `<div class="card" style="margin-bottom:10px"><button class="program-collapse" type="button" aria-expanded="${open?'true':'false'}" onclick="toggleHistory('${esc(key)}')"><span><b>Session history</b><span class="small muted">${esc(pr.name)} • ${held.length?`attended ${went} of ${held.length} so far`:'no sessions yet'}${lastMvp?` • last MVP: ${esc(who(lastMvp))}`:''}</span></span><span>${open?'−':'+'}</span></button>${open?`<div class="program-expanded"><div class="schedule-planner">${rows||'<div class="notice">No sessions have happened yet.'+(demoOn()?' Move the demo clock forward to a session day.':'')+'</div>'}</div></div>`:''}</div>`;
}
function kidNextSessionNote(pr,child){
 if(!pr)return '';
 const today=simulationDate();
 const mine=(state.sessions||[]).filter(s=>String(s.programId)===String(pr.dbId||'')&&s.status!=='cancelled').slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 const other=(state.programs||[]).filter(p=>String(p.dbId)!==String(pr.dbId)&&child&&isEnrolled(p.dbId||p.id,child.id)).find(p=>(state.sessions||[]).some(s=>String(s.programId)===String(p.dbId)&&s.date===today&&s.status!=='cancelled'));
 if(other)return `<p class="small muted" style="margin:8px 0">${esc(other.name)} has a session today. Choose it under Current program above.</p>`;
 const next=mine.find(s=>s.date>today);
 if(!next)return `<p class="small muted" style="margin:8px 0">${mine.length?'No more sessions are scheduled for '+esc(pr.name)+'.':'No sessions are loaded for '+esc(pr.name)+' yet.'}</p>`;
 const diff=Math.round((new Date(next.date+'T12:00:00')-new Date(today+'T12:00:00'))/86400000);
 const target=Math.min(400,Number(state.simulationOffsetDays||0)+diff);
 return `<p class="small muted" style="margin:8px 0">Next session for ${esc(pr.name)}: ${esc(fmtDate(next.date))}</p>${demoOn()?`<button class="btn blue" type="button" style="margin-bottom:8px" onclick="setSimulationDays(${target})">Jump demo clock to ${esc(fmtDate(next.date))}</button>`:''}`;
}
function enrolledForChild(childId){return (state.enrolledPrograms||[]).filter(x=>String(x.child_id)===String(childId)&&coalesceStatusActive(x)).map(x=>String(x.program_id));}
function coalesceStatusActive(row){return String(row?.enrollment_status||'active')==='active' || String(row?.enrollment_status||'')===''}
function isEnrolled(programId,childId){return enrolledForChild(childId).includes(String(programId))}
function isManagerEnrolled(programId,childId){return (state.managerEnrollments||[]).some(x=>String(x.program_id)===String(programId)&&String(x.child_id)===String(childId)&&coalesceStatusActive(x))}
function teamChildrenForProgram(programId){return state.teamChildrenByProgram?.[String(programId)]||[]}
async function enrollInProgram(programId){if(!state.authUser)return openAuth('register');if(!isParentLike())return toast('Manager accounts cannot enroll children. Owner accounts can test parent enrollment.');const child=activeChild();const p=state.programs.find(x=>String(x.id)===String(programId)||String(x.dbId)===String(programId));if(!child)return toast('Add a child before joining.');if(!p)return toast('Program not found.');state.activeChildId=child.id;state.childName=child.name;state.selectedProgram=p.dbId||p.id;state.selectedSlot=p.slots?.[0]?.id||null;state.view='sales';saveLocalOnly();render();}
async function addChild(){if(!state.authUser||!isParentLike())return toast('Log in as a parent or owner to add a child.');state.childEditingId=null;state.childModalOpen=true;state.childForm={name:'',date_of_birth:'',sex:''};render()}
function openChildEdit(id){const c=currentChildForId(id);if(!c)return toast('Child not found.');state.childEditingId=c.id;state.childModalOpen=true;state.childForm={name:c.name||'',date_of_birth:c.date_of_birth||'',sex:c.sex||''};render()}
function childModal(){const f=state.childForm||{},editing=!!state.childEditingId;return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">Child profile</span><h2>${editing?'Edit child':'Add a child'}</h2></div><button class="icon-btn" onclick="closeChildModal()">×</button></div><p class="muted">Birthday and sex are stored on the child profile so children can be grouped appropriately later.</p><div class="label">Child name</div><input class="input" id="childNameForm" value="${esc(f.name)}" placeholder="Alex" maxlength="80"><div class="label" style="margin-top:12px">Birth month and year</div><input class="input" id="childDobForm" type="month" value="${esc(String(f.date_of_birth||'').slice(0,7))}" max="${new Date().toISOString().slice(0,7)}" placeholder="YYYY-MM"><div class="small muted" style="margin-top:4px">Only the month and year are kept. Format: YYYY-MM.</div><div class="label" style="margin-top:12px">Sex</div><select class="input" id="childSexForm"><option value="">Prefer not to specify</option><option value="Female" ${f.sex==='Female'?'selected':''}>Female</option><option value="Male" ${f.sex==='Male'?'selected':''}>Male</option><option value="Other" ${f.sex==='Other'?'selected':''}>Other</option></select><div class="button-row" style="margin-top:18px"><button class="btn green" onclick="saveChild()">${editing?'Save changes':'Save child'}</button><button class="btn light" onclick="closeChildModal()">Cancel</button></div></div></div>`}
function closeChildModal(){state.childModalOpen=false;state.childEditingId=null;render()}
async function saveChild(){if(!state.authUser||!isParentLike())return toast('Parent access required.');const name=document.getElementById('childNameForm')?.value.trim()||'',dobRaw=document.getElementById('childDobForm')?.value||'',dob=dobRaw?(/^\d{4}-(0[1-9]|1[0-2])$/.test(dobRaw)?dobRaw+'-01':'invalid'):null,sex=document.getElementById('childSexForm')?.value||null;if(!name)return toast('Enter the child’s name.');if(dob){const d=new Date(dob+'T12:00:00'),now=new Date(),min=new Date(now.getFullYear()-25,now.getMonth(),now.getDate());if(Number.isNaN(d.getTime())||d>now||d<min)return toast('Enter a valid birth month and year (YYYY-MM).')}const btn=document.querySelector('.modal .btn.green');setBusy(btn,true,'Saving…');try{if(state.childEditingId){const q=await supabaseClient.from('children').update({name,date_of_birth:dob,sex}).eq('id',state.childEditingId).select('id,name,date_of_birth,sex,photo_url,created_by').single();if(q.error)throw new Error(q.error.message);state.children=state.children.map(c=>String(c.id)===String(q.data.id)?q.data:c);state.childForm={name:'',date_of_birth:'',sex:''};state.childModalOpen=false;state.childEditingId=null;await loadUserData();toast('Child updated');render();}else{const q=await supabaseClient.from('children').insert({name,date_of_birth:dob,sex,created_by:state.authUser.id}).select('id,name,date_of_birth,sex,photo_url,created_by').single();if(q.error)throw new Error(q.error.message);const link=await supabaseClient.from('parent_children').select('child_id').eq('parent_id',state.authUser.id).eq('child_id',q.data.id).maybeSingle();if(link.error||!link.data)throw new Error('Child was created but the parent link was not confirmed: '+(link.error?.message||'unknown error'));state.children=[...(state.children||[]),q.data];state.activeChildId=q.data.id;state.pointsByChild[String(q.data.id)]=0;state.ledgerByChild[String(q.data.id)]=[];state.rewardPoints=0;state.ledger=[];state.childName=q.data.name;state.childModalOpen=false;await loadUserData();toast('Child added');render();}}catch(err){toast('Could not save child: '+(err?.message||'unknown error'))}finally{setBusy(btn,false)}}
async function removeChildFromAccount(id){if(!state.authUser||!isParentLike())return toast('Parent access required.');const c=currentChildForId(id);if(!c)return toast('Child not found.');if(!confirm(`Remove ${c.name} from your parent account? Their historical records are kept.`))return;const q=await supabaseClient.from('parent_children').delete().eq('parent_id',state.authUser.id).eq('child_id',id).select('child_id');if(q.error)return toast('Could not remove child: '+q.error.message);if(!q.data||!q.data.length)return toast('Could not remove child: nothing was removed. Refresh the page and try again.');state.children=state.children.filter(x=>String(x.id)!==String(id));if(String(state.activeChildId)===String(id))state.activeChildId=state.children[0]?.id||null;await loadUserData();toast(`${c.name} was removed from your account.`);render()}
function programSummary(pr,childId){const enrollmentRow=(state.enrolledPrograms||[]).find(x=>String(x.program_id)===String(pr.dbId||pr.id)&&String(x.child_id)===String(childId));const enrolled=isEnrolled(pr.dbId||pr.id,childId);const pending=enrollmentRow&&!enrolled&&String(enrollmentRow.enrollment_status||'')==='pending_payment';const canJoin=isParentLike()&&childId;return `<div class="card" style="margin-bottom:10px"><button class="program-collapse" onclick="toggleProgram('${esc(pr.id)}')"><span><b>${esc(pr.name)}</b><span class="small muted">${pr.sessions} sessions • ${money(pr.price)} • ${esc(pr.venue)}</span><span class="pill" style="margin-top:6px;display:inline-block">Manager: ${esc(pr.managerName||'Program manager')}</span></span><span>${state.expandedPrograms[pr.id]?'−':'+'}</span></button>${state.expandedPrograms[pr.id]?`<div class="program-expanded"><p>${esc(pr.details||'')}</p><div class="statrow"><span>Schedule</span><b>${esc(pr.slots?.[0]?.label||pr.schedule||'Schedule TBD')}</b></div><div class="statrow"><span>Attendance payback</span><b>${money(programAttendanceTotal(pr))} on full attendance</b></div><div class="statrow"><span>Rewards</span><b>${rewardMode(pr)==='catalog'?'Manager reward catalog enabled':'No catalog rewards by default'}</b></div><div class="statrow"><span>Status</span><b>${enrolled?'Registered':pending?'Payment pending':'Available'}</b></div>${childId&&canJoin?`<button class="btn ${enrolled||pending?'light':'green'}" ${enrolled||pending?'disabled':''} onclick="enrollInProgram('${esc(pr.dbId||pr.id)}')">${enrolled?'Registered':pending?'Payment pending':'Join this program'}</button>`:!state.authUser?'<button class="btn green" onclick="openAuth(\'register\')">Register to join</button>':'<div class="notice">Select a child in Parent View before joining.</div>'}${childId&&enrolled?`<div class="grid compact" style="margin-top:16px"><div class="card"><b>History</b><p class="muted">Completed sessions</p></div><div class="card"><b>Rewards</b><p>${childPoints(childId)} points</p></div><div class="card"><b>Videos</b><p class="muted">Session recordings</p></div><div class="card"><b>Accomplishments</b><p class="muted">Progress and badges</p></div></div>`:''}</div>`:''}</div>`}

function parseScheduleInput(raw){
 const text=String(raw||'').trim(); const low=text.toLowerCase();
 const dayMap={sun:0,sunday:0,sundays:0,mon:1,monday:1,mondays:1,tue:2,tues:2,tuesday:2,tuesdays:2,wed:3,wednesday:3,wednesdays:3,thu:4,thur:4,thurs:4,thursday:4,thursdays:4,fri:5,friday:5,fridays:5,sat:6,saturday:6,saturdays:6};
 let day=null; for(const k of Object.keys(dayMap)){if(new RegExp('\\b'+k+'\\b').test(low)){day=dayMap[k];break;}}
 const range=low.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
 if(day===null||!range)return null; let [,h1,m1,ap1,h2,m2,ap2]=range; m1=m1||'00';m2=m2||'00'; if(!ap1&&!ap2){const n=Number(h1); if(n>=1&&n<=7){ap1='pm';ap2='pm';} else {ap1='am';ap2='am';}} else {ap1=ap1||ap2;ap2=ap2||ap1;}
 const norm=(h,m,ap)=>{h=Number(h);if(ap){if(ap==='pm'&&h<12)h+=12;if(ap==='am'&&h===12)h=0;}return String(h).padStart(2,'0')+':'+m;};
 return {day,start:norm(h1,m1,ap1),end:norm(h2,m2,ap2),label:text};
}
function nextDateOnWeekday(startDate,weekday){const d=new Date(startDate+'T12:00:00');d.setDate(d.getDate()+((weekday-d.getDay()+7)%7));return d;}
function parseHolidayDates(raw){return new Set(String(raw||'').split(/[\s,;]+/).map(x=>x.trim()).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)));}
function schedulePreview(){const p=parseScheduleInput(document.getElementById('mSchedule')?.value),count=Math.max(1,Math.min(52,Number(document.getElementById('mSessionCount')?.value)||8)),first=document.getElementById('mFirstDate')?.value,holidays=parseHolidayDates(document.getElementById('mHolidays')?.value);if(!p||!first)return '<div class="notice">Enter a schedule such as <b>Tuesday 5–6 PM</b> and choose a first date. Common formats are accepted.</div>';let d=nextDateOnWeekday(first,p.day),dates=[],guard=0;while(dates.length<count&&guard<370){const iso=d.toISOString().slice(0,10);if(!holidays.has(iso))dates.push(iso);d.setDate(d.getDate()+7);guard++;}return `<div class="success"><b>${dates.length} sessions</b> will be created • ${dates[0]} → ${dates[dates.length-1]}${holidays.size?` • ${holidays.size} blackout date${holidays.size===1?'':'s'}`:''}</div>`;}
function refreshSchedulePreview(){const el=document.getElementById('schedulePreview');if(el)el.innerHTML=schedulePreview();}
function programDbId(pr){return pr?.dbId||pr?.id||null;}
function programAttendanceTotal(pr){return Math.max(0,Number(pr?.attendancePayback||0));}
function applyAttendanceRows(checkRows=[],overrideRows=[],paybackRows=[]){
 state.attendanceByProgram={};state.attendedSessionDates={};const seen=new Set();
 for(const x of checkRows||[]){const session=Array.isArray(x.sessions)?x.sessions[0]:x.sessions;if(!session?.program_id||!x.child_id)continue;const cancelled=String(session.status||'').toLowerCase()==='cancelled';const key=attendanceStateKey({dbId:session.program_id},x.child_id);if(!cancelled&&session.session_date){state.attendedSessionDates[key]=state.attendedSessionDates[key]||{};state.attendedSessionDates[key][session.session_date]=true;}const unique=`${key}:${x.session_id||session.session_date||''}`;if(!cancelled&&!seen.has(unique)){seen.add(unique);state.attendanceByProgram[key]=state.attendanceByProgram[key]||{attended:0,paybackIssued:false};state.attendanceByProgram[key].attended=(state.attendanceByProgram[key].attended||0)+1;}}
 for(const x of overrideRows||[]){const key=attendanceStateKey({dbId:x.program_id},x.child_id);state.attendanceByProgram[key]=state.attendanceByProgram[key]||{attended:0,paybackIssued:false};state.attendanceByProgram[key].attended=Math.max(0,Number(x.attended_count)||0);state.attendanceByProgram[key].override=true;state.attendanceByProgram[key].lastUpdated=x.updated_at||null;}
 for(const x of paybackRows||[]){if(String(x.status||'earned').toLowerCase()==='cancelled')continue;const key=attendanceStateKey({dbId:x.program_id},x.child_id);state.attendanceByProgram[key]=state.attendanceByProgram[key]||{attended:0,paybackIssued:false};state.attendanceByProgram[key].paybackIssued=true;state.attendanceByProgram[key].payoutDestination=x.destination;state.attendanceByProgram[key].paybackAmount=Number(x.amount||0);}
}
function programEndedByClock(pr){const sim=simulationDate();const ss=(state.sessions||[]).filter(s=>String(s.programId)===String(pr?.dbId||'')&&s.status!=='cancelled');return ss.length?ss.every(s=>s.date<=sim):true}
function cancelledDates(pr){const sim=simulationDate(),id=String(pr?.dbId||pr?.id||''),out=new Set();for(const x of [...(state.sessions||[]),...(state.managerSessions||[])]){if(String(x.programId)===id&&x.status==='cancelled'&&x.date<=sim)out.add(x.date)}return out}
function cancelledCreditCount(pr){return cancelledDates(pr).size}
function attendanceRecord(pr,childId=activeChild()?.id){const key=attendanceStateKey(pr,childId);const rec=state.attendanceByProgram?.[key]||{};const dates=Object.keys(state.attendedSessionDates?.[key]||{});const sim=simulationDate();const cx=cancelledDates(pr);const counted=(!rec.override&&dates.length)?dates.filter(d=>d<=sim&&!cx.has(d)).length:Number(rec.attended||0);return {attended:Math.max(0,counted+(rec.override?0:cancelledCreditCount(pr))),paybackIssued:!!rec.paybackIssued&&programEndedByClock(pr),payoutDestination:rec.payoutDestination||state.economics||'parent',paybackAmount:Number(rec.paybackAmount||programAttendanceTotal(pr)),override:!!rec.override,lastUpdated:rec.lastUpdated||null}}
function attendanceProgress(pr,childId=activeChild()?.id){const rec=attendanceRecord(pr,childId);const total=Math.max(0,Number(pr?.sessions??0)||0);return {attended:Math.min(rec.attended,total),total,payback:programAttendanceTotal(pr),qualified:total>0&&rec.attended>=total,payoutIssued:rec.paybackIssued,destination:rec.payoutDestination,override:rec.override}}
function currentTrackedProgram(){const c=activeChild();return c?activeProgramForChild(c.id):null;}
async function setProgramAttendance(programRef,attended,source='manager',childId=null){
 const prog=programRef&&typeof programRef==='object'?programRef:(state.programs||[]).find(p=>String(p.id)===String(programRef)||String(p.dbId)===String(programRef))||(programRef==null?currentTrackedProgram():null);
 if(!prog||!supabaseClient)return toast('Select a program first.');
 if(source==='manager'&&!['manager','owner'].includes(state.authRole))return toast('Manager access required.');
 const pid=String(prog.dbId||prog.id||'');if(!isUuid(pid))return toast('This program is missing a valid database ID. Refresh the app and try again.');
 const selected=childId||((source==='manager')?activeManagerChildForProgram(prog):activeChild()?.id);const cid=selected&&String(selected);
 if(!cid)return toast('Select an enrolled child first.');
 if(source==='manager'&&!isManagerEnrolled(pid,cid))return toast('Select a child enrolled in this program.');
 const total=Math.max(0,Number(prog.sessions||0));const n=Math.max(0,Math.min(total,Math.floor(Number(attended)||0)));
 const q=await supabaseClient.rpc('set_attendance_count',{p_program:pid,p_child:cid,p_count:n});
 if(q.error)return toast('Could not save attendance: '+q.error.message);
 await loadUserData();toast(`Attendance set to ${q.data??n} of ${total} sessions.`);render();
}
async function toggleAttendance(sessionId,childId,present){
 if(!supabaseClient||!['manager','owner'].includes(state.authRole))return toast('Manager access required.');
 const q=await supabaseClient.rpc('set_attendance',{p_session:sessionId,p_child:childId,p_present:!!present});
 if(q.error)return toast('Could not change attendance: '+q.error.message);
 await loadUserData();toast(present?'Marked present.':'Marked absent.');render();
}
async function adjustPoints(programId,childId,amount){
 if(!supabaseClient||!['manager','owner'].includes(state.authRole))return toast('Manager access required.');
 const n=Math.trunc(Number(amount));if(!n)return toast('Enter points to add (e.g. 10) or remove (e.g. -5).');
 if(!childId)return toast('Select a child first.');
 const q=await supabaseClient.rpc('adjust_points',{p_program:programId,p_child:childId,p_amount:n,p_note:n>0?'Manager added points':'Manager removed points'});
 if(q.error)return toast('Could not change points: '+q.error.message);
 await loadUserData();toast(n>0?`Added ${n} points.`:`Removed ${-n} points.`);render();
}
async function kidCheckIn(){const p=currentTrackedProgram();const c=activeChild();if(!p||!c)return toast('No enrolled program.');const s=currentSessionForProgram(p);if(!s||!isUuid(String(s.id||s.dbId)))return toast('No database session is available for today.');const already=state.attendedSessionDates?.[attendanceStateKey(p,c.id)]?.[s.date];if(already)return toast('Already checked in for this session.');const q=await supabaseClient.from('session_checkins').insert({session_id:s.id||s.dbId,child_id:c.id,source:'kid'}).select('id,session_id,child_id,checked_in_at').single();if(q.error){if(q.error.code==='23505')return toast('Already checked in for this session.');return toast('Could not check in: '+q.error.message)}await loadUserData();toast('Checked in');render();}
function managerProgramCard(pr){
 const pid=String(pr.dbId||pr.id),key=`mgr-${pid}`;
 const sessions=(state.managerSessions||state.sessions||[]).filter(s=>String(s.programId)===pid);
 const expanded=!!state.expandedPrograms[key];
 const kids=(state.managerChildren||[]).filter(c=>isManagerEnrolled(pid,c.id));
 const selectedChildId=activeManagerChildForProgram(pr,kids);
 const a=attendanceProgress(pr,selectedChildId);
 const childControlId=`manager-child-${pr.id}`;
 return `<div class="card" style="margin-bottom:10px"><button class="program-collapse" type="button" aria-expanded="${expanded?'true':'false'}" onclick="setManagerProgram('${esc(pid)}')"><span><b>${esc(pr.name)}</b><span class="small muted">${pr.sessions} sessions • ${money(pr.price)} • ${esc(pr.venue)} • ${money(programAttendanceTotal(pr))} payback</span><span class="pill" style="margin-top:6px;display:inline-block">Manager: ${esc(pr.managerName||'Program manager')}</span></span><span>${expanded?'−':'+'}</span></button>${expanded?`<div class="program-expanded"><p>${esc(pr.details||'No description yet.')}</p><div class="statrow"><span>Schedule</span><b>${esc(pr.slots?.[0]?.label||'Schedule TBD')}</b></div><div class="statrow"><span>Planned sessions</span><b>${pr.sessions}</b></div><div class="statrow"><span>Generated sessions</span><b>${sessions.length}</b></div><div class="statrow"><span>Reward catalog</span><select class="input" style="max-width:260px" onchange="setRewardMode('${esc(pid)}',this.value)"><option value="none" ${rewardMode(pr)==='none'?'selected':''}>No rewards (default)</option><option value="catalog" ${rewardMode(pr)==='catalog'?'selected':''}>Enabled</option></select></div><div class="statrow"><span>Attendance</span><b>${a.attended}/${a.total}${a.payoutIssued?' • payback awarded':''}</b></div>${managerWaiverRow(kids)}<div class="notice" style="margin:12px 0"><b>Attendance control</b>${kids.length?`<div class="button-row" style="margin-top:10px"><select class="input" id="${childControlId}" onchange="setManagerChildForProgram('${esc(pid)}',this.value)">${kids.map(c=>`<option value="${esc(c.id)}" ${String(selectedChildId)===String(c.id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select><input class="input" id="attendance-${pr.id}" type="number" min="0" max="${a.total}" value="${a.attended}" style="max-width:130px"><button class="btn green" type="button" onclick="setProgramAttendance('${esc(pid)}',document.getElementById('attendance-${pr.id}').value,'manager',document.getElementById('${childControlId}').value)">Save attendance</button><button class="btn light" type="button" onclick="setProgramAttendance('${esc(pid)}',${a.total},'manager',document.getElementById('${childControlId}').value)">Mark all attended</button></div>`:'<p class="small muted" style="margin-top:8px">No enrolled children are available for attendance adjustments yet.</p>'}</div><div class="notice" style="margin:12px 0"><b>Season points</b>${kids.length?`<div class="button-row" style="margin-top:10px"><button class="btn light" type="button" onclick="awardPoints('Enthusiasm',10,document.getElementById('${childControlId}').value,'${esc(pid)}')">+10 Enthusiasm</button><button class="btn light" type="button" onclick="awardPoints('Teamwork',10,document.getElementById('${childControlId}').value,'${esc(pid)}')">+10 Teamwork</button><input class="input" id="pts-${pr.id}" type="number" step="1" placeholder="+ or − points" style="max-width:130px"><button class="btn light" type="button" onclick="adjustPoints('${esc(pid)}',document.getElementById('${childControlId}').value,document.getElementById('pts-${pr.id}').value)">Add / remove points</button></div>`:'<p class="small muted" style="margin-top:8px">Enroll a child before awarding points.</p>'}</div><div class="button-row" style="margin-top:10px"><button class="btn light" type="button" onclick="downloadProgramICS(${pr.id})">Add to calendar</button><button class="btn blue" type="button" onclick="generateSessions(${pr.id})">Fill missing sessions</button><button class="btn danger" type="button" onclick="deleteProgram('${esc(pid)}')">Delete program</button></div><div style="margin-top:14px"><div class="label">Weekly schedule</div>${selectedChildId?`<p class="small muted" style="margin:4px 0 8px">Tap Present / Absent to correct a day for the child selected above.</p>`:''}${weeklyBreakdown(pr,sessions,{role:'manager',attended:state.attendedSessionDates?.[attendanceStateKey(pr,selectedChildId)]||{},editChild:selectedChildId||null})}</div></div>`:''}</div>`
}
const BUILTIN_REWARD_PICTURES=[
 {id:'drink',label:'Drink',path:'assets/rewards/drink.svg'},
 {id:'soccer',label:'Soccer ball',path:'assets/rewards/soccer.svg'},
 {id:'medal',label:'Medal',path:'assets/rewards/medal.svg'},
 {id:'trophy',label:'Trophy',path:'assets/rewards/trophy.svg'},
 {id:'snack',label:'Snack',path:'assets/rewards/snack.svg'},
 {id:'sticker',label:'Sticker',path:'assets/rewards/sticker.svg'},
 {id:'star',label:'Star',path:'assets/rewards/star.svg'},
 {id:'gift',label:'Gift',path:'assets/rewards/gift.svg'}
];
function rewardManager(){const editing=state.rewardEditingId?state.rewards.find(r=>String(r.dbId||r.id)===String(state.rewardEditingId)):null;return `<div class="card" style="margin-top:20px" id="rewardManagerForm"><div class="section-title" style="margin-bottom:8px"><div><h3>My Reward Catalog</h3><p class="muted">Starts empty. Create rewards only when you are ready. Programs are still set to no rewards by default.</p></div>${editing?`<button class="btn light" onclick="cancelRewardEdit()">Cancel edit</button>`:''}</div><div class="formgrid"><div><div class="label">Reward name</div><input class="input" id="rName" value="${esc(editing?.name||'')}" placeholder="Sports Drink" maxlength="100"></div><div><div class="label">Points cost</div><input class="input" id="rCost" type="number" min="1" max="100000" value="${editing?Number(editing.cost||0):''}" placeholder="5"></div><div class="full"><div class="label">Description</div><input class="input" id="rDesc" value="${esc(editing?.description||'')}" placeholder="Cold drink after practice" maxlength="240"></div><div class="full"><div class="label">Choose a picture</div><div class="reward-picture-grid">${BUILTIN_REWARD_PICTURES.map(x=>`<button type="button" class="reward-picture ${String(state.rewardImageChoice||editing?.image||'')===x.path?'selected':''}" onclick="selectRewardPicture('${esc(x.path)}')"><img src="${x.path}" alt="${esc(x.label)}"><span>${esc(x.label)}</span></button>`).join('')}</div><div class="small muted" style="margin-top:10px">Or upload your own JPG, PNG or WebP (5 MB max).</div><input class="input" id="rImage" type="file" accept="image/png,image/jpeg,image/webp" onchange="previewRewardImage(event)">${state.rewardImagePreview?`<div style="margin-top:8px"><img src="${state.rewardImagePreview}" alt="Reward preview" style="width:84px;height:84px;object-fit:cover;border-radius:12px;display:block"><button class="btn light" type="button" style="margin-top:6px" onclick="resetTransientRewardImage();render()">Remove uploaded picture</button></div>`:''}</div></div><button class="btn green" style="margin-top:12px" onclick="saveRewardRecord()">${editing?'Save reward':'Add reward'}</button><div class="catalog">${(state.rewards||[]).length?(state.rewards||[]).map(r=>`<div class="catalog-row"><div class="thumb">${r.image?`<img src="${esc(r.image)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px">`:(r.icon||'🎁')}</div><div style="flex:1"><b>${esc(r.name)}</b><div class="small muted">${esc(r.description)}</div></div><strong style="margin-right:10px">${Number(r.cost)||0} pts</strong><button class="btn light" type="button" onclick="editReward('${esc(r.dbId||r.id)}')">Edit</button><button class="btn danger" type="button" onclick="deleteReward('${esc(r.dbId||r.id)}')">Delete</button></div>`).join(''):`<div class="notice">No rewards yet. Create the first one when you're ready.</div>`}</div></div>`}
function selectRewardPicture(path){state.rewardImageChoice=path;state.rewardImagePreview='';rewardImageFile=null;render()}
function cancelRewardEdit(){state.rewardEditingId=null;state.rewardImageChoice='';resetTransientRewardImage();render()}
function editReward(id){const r=state.rewards.find(x=>String(x.dbId||x.id)===String(id));if(!r)return toast('Reward not found.');state.rewardEditingId=r.dbId||r.id;state.rewardImageChoice=r.image&&String(r.image).includes('assets/rewards/')?r.image:'';state.rewardImagePreview='';render()}
async function saveRewardRecord(){
 const name=document.getElementById('rName')?.value.trim()||'',desc=document.getElementById('rDesc')?.value.trim()||'',rawCost=document.getElementById('rCost')?.value||''; const cost=Math.floor(Number(rawCost));
 if(!name)return toast('Enter a reward name.'); if(rawCost===''||!Number.isFinite(cost)||cost<1)return toast('Enter a valid points cost.');
 if(!state.authUser||!['manager','owner'].includes(state.authRole))return toast('Approved manager access is required.');
 const editing=state.rewardEditingId?state.rewards.find(r=>String(r.dbId||r.id)===String(state.rewardEditingId)):null; const btn=document.querySelector('#rewardManagerForm .btn.green'); setBusy(btn,true,editing?'Saving…':'Adding…'); let uploadedPath=null;
 const oldImagePath=editing?.image_path||null;
 try{let imageUrl=state.rewardImageChoice||editing?.image||null,imagePath=editing?.image_path||null;
   if(rewardImageFile){const ext=(rewardImageFile.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';imagePath=`${state.authUser.id}/${crypto.randomUUID()}.${ext}`;const up=await supabaseClient.storage.from('reward-images').upload(imagePath,rewardImageFile,{cacheControl:'3600',contentType:rewardImageFile.type||'image/jpeg',upsert:false});if(up.error)throw new Error('Image upload failed: '+up.error.message);uploadedPath=imagePath;imageUrl=supabaseClient.storage.from('reward-images').getPublicUrl(imagePath).data.publicUrl;}
   else if(state.rewardImageChoice && state.rewardImageChoice.startsWith('assets/rewards/')) imagePath=null;
   let q;
   if(editing){q=supabaseClient.from('rewards').update({name,description:desc,cost,active:true,image_url:imageUrl,image_path:imagePath}).eq('id',editing.dbId);if(!isOwner())q=q.eq('manager_id',state.authUser.id);q=await q.select('id,name,description,cost,active,manager_id,image_url,image_path').single();}
   else{q=await supabaseClient.from('rewards').insert({name,description:desc,cost,active:true,manager_id:state.authUser.id,image_url:imageUrl,image_path:imagePath}).select('id,name,description,cost,active,manager_id,image_url,image_path').single();}
   if(q.error)throw new Error(q.error.message);
   if(oldImagePath && oldImagePath!==imagePath){const cleanup=await supabaseClient.storage.from('reward-images').remove([oldImagePath]);if(cleanup.error)console.warn('Old reward image cleanup failed:',cleanup.error.message)}
   if(editing){state.rewards=state.rewards.map(r=>String(r.dbId)===String(q.data.id)?{...r,dbId:q.data.id,name:q.data.name,description:q.data.description||'',cost:Number(q.data.cost||0),image:q.data.image_url||'',image_path:q.data.image_path||null,managerId:q.data.manager_id}:r);}else{state.rewards=[...(state.rewards||[]),{id:Date.now(),dbId:q.data.id,name:q.data.name,description:q.data.description||'',cost:Number(q.data.cost||0),icon:'🎁',image:q.data.image_url||'',image_path:q.data.image_path||null,managerId:q.data.manager_id}];}
   state.rewardEditingId=null;resetTransientRewardImage();state.rewardImageChoice='';saveLocalOnly();toast(editing?'Reward updated':'Reward added');render();
 }catch(err){if(uploadedPath){await supabaseClient.storage.from('reward-images').remove([uploadedPath])}toast('Could not save reward: '+(err?.message||'unknown error'));}finally{setBusy(btn,false)}
}
async function deleteReward(id){if(!state.authUser||!['manager','owner'].includes(state.authRole))return toast('Approved manager access is required.');const r=state.rewards.find(x=>String(x.dbId||x.id)===String(id));if(!r)return toast('Reward not found.');if(!confirm(`Delete “${r.name}”? This removes it from your reward catalog.`))return;let q=supabaseClient.from('rewards').delete().eq('id',r.dbId);if(!isOwner())q=q.eq('manager_id',state.authUser.id);q=await q;if(q.error)return toast('Could not delete reward: '+q.error.message);if(r.image_path){const cleanup=await supabaseClient.storage.from('reward-images').remove([r.image_path]);if(cleanup.error)console.warn('Reward image cleanup failed:',cleanup.error.message)}state.rewards=state.rewards.filter(x=>String(x.dbId)!==String(id));if(String(state.rewardEditingId)===String(id)){state.rewardEditingId=null;state.rewardImageChoice='';resetTransientRewardImage()}toast('Reward deleted');render()}
function showProgramForm(){const x=document.getElementById('programForm');if(x)x.style.display='block'}
function hideProgramForm(){const x=document.getElementById('programForm');if(x)x.style.display='none'}
async function generateSessions(programRef){const p=(state.programs||[]).find(x=>String(x.id)===String(programRef)||String(x.dbId)===String(programRef));if(!p||!supabaseClient)return toast('Program or Supabase connection missing.');if(!state.authUser||!['manager','owner'].includes(state.authRole))return toast('Approved manager access is required.');const programId=String(p.dbId||p.id||'');if(!isUuid(programId))return toast('This program is missing a valid database ID. Refresh the app and try again.');const dates=plannedDatesForProgram(p);const existing=[...(state.sessions||[]),...(state.managerSessions||[])].filter(s=>String(s.programId||s.program)===programId);const existingDates=new Set(existing.map(s=>s.date));const parsed=parseScheduleInput(p.slots?.[0]?.label||p.schedule||'');if(!parsed)return toast('Program schedule needs a valid weekday/time.');const rows=dates.filter(d=>!existingDates.has(d)).map(iso=>({name:p.name,sport:p.sport,session_date:iso,start_time:parsed.start,end_time:parsed.end,status:'Committed',description:p.details,max_players:p.slots?.[0]?.capacity||12,program_id:programId,venue_id:p.venueId||p.venue_id||null}));if(!rows.length)return toast('All planned sessions already exist.');const {data,error}=await supabaseClient.from('sessions').insert(rows).select();if(error)return toast('Could not generate sessions: '+error.message);const added=(data||[]).map(s=>({id:s.id,dbId:s.id,name:s.name,sport:s.sport,date:s.session_date,start:s.start_time,end:s.end_time,status:String(s.status||'Committed').toLowerCase(),description:s.description,maxPlayers:s.max_players,programId:s.program_id,program:p.name,venue:p.venue}));state.sessions=[...(state.sessions||[]),...added];state.managerSessions=[...(state.managerSessions||[]),...added];saveLocalOnly();toast(`${added.length} sessions created from the weekly planner.`);render()}


// ---- Canonical Daily Roll UI / behavior ----
function shell(content){return `<header class="topbar"><div class="brand"><div class="brand-mark">⚽</div>The Daily Roll <span class="small" style="opacity:.55">v10.12.1</span></div><nav class="nav">${state.authUser?['parent','kid',...(state.authRole==='manager'||state.authRole==='owner'?['manager']:[])].map(v=>`<button class="${state.view===v?'active':''}" onclick="setView('${v}')">${v[0].toUpperCase()+v.slice(1)} View</button>`).join(''):''}<button class="${state.view==='sales'?'active':''}" onclick="setView('sales')">Join a Program</button></nav><div style="display:flex;align-items:center;gap:8px">${authButtons()}</div></header><main class="wrap">${simulationBar()}${content}</main><div class="footer">The Daily Roll • Play • Improve • Earn</div>${state.privacyOpen===true?privacyModal():''}${renderModalSpecial()||''}${state.childModalOpen?childModal():''}${state.authMode?authModal():''}`}
function render(){const root=document.getElementById('app');if(!root)return;let content;if(state.view==='manager'&&(!state.authUser||!(state.authRole==='manager'||state.authRole==='owner')))content=authRequired();else if((state.view==='parent'||state.view==='kid')&&!state.authUser)content=authRequired();else content=state.view==='sales'?sales():state.view==='parent'?parent():state.view==='kid'?kid():manager();root.innerHTML=shell(content)}
function sales(){const programs=publicPrograms();return `<section class="hero"><div><span class="pill">Kids sports programs</span><h1>Kids play.<br>Kids improve.<br>Kids earn.</h1><p>Choose a program, see the manager, add your child and join.</p><button class="btn green" onclick="document.getElementById('programs').scrollIntoView({behavior:'smooth'})">See available programs</button></div><div class="hero-card"><div class="small">THE DAILY ROLL</div><div class="price">Play • Improve • Earn</div><p>Every program shows its manager. Each manager controls their own reward catalog.</p></div></section><div id="programs" class="section-title"><div><h2>Choose your program</h2><span class="muted">Programs are grouped by manager so parents know exactly who runs them.</span></div>${isParentLike()?'<button class="btn light" onclick="setView(\'parent\')">My children</button>':'<button class="btn light" onclick="openAuth(\'register\')">Register as parent</button>'}</div><div class="grid">${programs.length?programs.map(pr=>programSummary(pr,state.children[0]?.id)).join(''):'<div class="notice">No public programs are currently available.</div>'}</div>${state.selectedProgram?checkout(programs.find(p=>String(p.id)===String(state.selectedProgram)||String(p.dbId)===String(state.selectedProgram))||programs[0]):''}`}
function parent(){
 const kids=state.children||[],active=activeChild();
 return `<div class="section-title"><div><span class="pill">Parent portal${state.authRole==='owner'?' • Owner testing':''}</span><h2>Welcome, ${esc(state.parentName||'Parent')} 👋</h2><p class="muted">Manage children, enrollment and season progress.</p></div><div class="button-row"><button class="btn light" onclick="addChild()">+ Add child</button><button class="btn light" onclick="setView('sales')">Join a program</button></div></div>${waiverBanner()}${kids.length?`<div class="card" style="margin-bottom:18px"><div class="label">Active child</div><select class="input" onchange="selectChild(this.value)">${kids.map(c=>`<option value="${esc(c.id)}" ${String(active?.id)===String(c.id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>`:''}${kids.length?kids.map(child=>{const enrolledRows=(state.enrolledPrograms||[]).filter(x=>String(x.child_id)===String(child.id)&&['active','pending_payment'].includes(String(x.enrollment_status||'active')));const enrolled=publicPrograms().filter(p=>enrolledRows.some(e=>String(e.program_id)===String(p.dbId||p.id)));const open=!!state.expandedPrograms['child-'+child.id];const pts=childPoints(child.id);const payments=(state.payments||[]).filter(p=>String(p.child_id)===String(child.id));return `<div class="card" style="margin-bottom:18px"><div class="child-card-header"><button class="program-collapse" onclick="toggleProgram('child-${esc(child.id)}')"><span><b>${esc(child.name)}</b><span class="small muted">${enrolled.length} program${enrolled.length===1?'':'s'} • ${pts} points</span></span><span>${open?'−':'+'}</span></button><div class="button-row child-actions"><button class="btn light" type="button" onclick="openChildEdit('${esc(child.id)}')">Edit child</button><button class="btn danger" type="button" onclick="removeChildFromAccount('${esc(child.id)}')">Remove child</button></div></div>${open?`<div class="program-expanded"><div class="statrow"><span>Birth month</span><b>${child.date_of_birth?esc(fmtMonthYear(child.date_of_birth)):'Not provided'}</b></div><div class="statrow"><span>Sex</span><b>${esc(child.sex||'Not specified')}</b></div>${agreementRows(child)}${enrolled.length?enrolled.map(pr=>programSummary(pr,child.id)).join(''):'<div class="notice">This child is not registered in a program yet.</div>'}${payments.length?`<div class="notice" style="margin-top:14px"><b>Payment history</b>${payments.slice(0,3).map(pm=>`<div class="statrow"><span>${esc(pm.method)} • ${esc(pm.status)}</span><b>${money(pm.amount)}</b></div>`).join('')}</div>`:''}${enrolled.map(x=>scheduleSection(x,child.id)).join('')}${enrolled.map(x=>historySection(x,child)).join('')}<div class="grid compact" style="margin-top:14px"><div class="card"><b>Rewards</b><p>${pts} points</p><p class="small muted">Earned ${childLedger(child.id).filter(x=>x.amount>0).reduce((a,x)=>a+Number(x.amount||0),0)} • Spent ${Math.abs(childLedger(child.id).filter(x=>x.amount<0).reduce((a,x)=>a+Number(x.amount||0),0))}</p></div><div class="card"><b>Videos</b><p class="muted">Session recordings</p></div><div class="card"><b>Accomplishments</b><p class="muted">Progress and badges</p></div></div></div>`:''}</div>`}).join(''):'<div class="card"><div class="notice">No children yet. Click <b>+ Add child</b> to get started.</div></div>'}`
}
function kid(){
 const child=activeChild();
 const enrolled=publicPrograms().filter(p=>child&&isEnrolled(p.dbId||p.id,child.id));
 const pr=child&&activeProgramForChild(child.id);
 const a=pr?attendanceProgress(pr,child.id):{attended:0,total:0,payback:0,qualified:false,payoutIssued:false,destination:'parent'};
 const session=pr&&currentSessionForProgram(pr);
 const sessionId=session&&String(session.id||session.dbId);
 const voteKey=sessionId&&child?voteStateKey(sessionId,child.id):null;
 const voted=voteKey&&state.userVotesBySession[voteKey];
 const candidates=(pr?teamChildrenForProgram(pr.dbId||pr.id):(state.managerChildren||[])).filter(c=>String(c.id)!==String(child?.id));
 return `<div class="section-title"><div><span class="pill">Kid view</span><h2>Hey ${esc(child?.name||state.childName||'Player')}! 👋</h2><p class="muted">${fmtDate(simulationDate())} • Your programs, attendance, teamwork and enthusiasm.</p></div></div>${enrolled.length>1?`<div class="card" style="margin-bottom:12px"><label class="label" for="kidActiveProgram">Current program</label><select class="input" id="kidActiveProgram" aria-label="Choose current program" onchange="setActiveKidProgram(this.value)">${enrolled.map(x=>`<option value="${esc(x.dbId||x.id)}" ${String(x.dbId||x.id)===String(pr?.dbId||pr?.id)?'selected':''}>${esc(x.name)}</option>`).join('')}</select><p class="small muted" style="margin-bottom:0">Choose which program to check into and vote for today.</p></div>`:''}<div class="card"><button class="program-collapse" onclick="toggleProgram('kid-programs')"><span><b>My programs</b><span class="small muted">${enrolled.length} registered</span></span><span>${state.expandedPrograms['kid-programs']?'−':'+'}</span></button>${state.expandedPrograms['kid-programs']?`<div class="program-expanded">${enrolled.map(pr=>programSummary(pr,child.id)).join('')||'<div class="notice">No programs are registered yet.</div>'}</div>`:''}</div>${enrolled.map(x=>scheduleSection(x,child.id)).join('')}${enrolled.map(x=>historySection(x,child)).join('')}<div class="grid"><div class="card checkin-card"><h3>Session</h3><div class="big-check">✓</div><b>${session?'Session day':'No session today'}</b>${session?'':kidNextSessionNote(pr,child)}<div class="statrow" style="margin-top:10px"><span>Attendance</span><b>${a.attended}/${a.total}</b></div>${a.payback>0?`<div class="small" style="margin-top:6px;font-weight:700;color:${a.payoutIssued||a.qualified?'#15803d':'#b45309'}">${a.payoutIssued||a.qualified?`Payback earned: ${a.destination==='kid'?`+${a.payback} ⭐`:`${money(a.payback)} to parent`}`:`On track for ${money(a.payback)} payback`}</div>`:''}${(()=>{const done=session&&((state.attendedSessionDates||{})[attendanceStateKey(pr,child.id)]||{})[session.date];return `<button class="btn light" ${session&&!done?'':'disabled'} onclick="kidCheckIn()">${done?'Checked in ✓':session?'Check in for this session':'Check in unavailable'}</button>`})()}</div><div class="card"><h3>Rewards wallet</h3><div class="money">${childPoints(child?.id)} ⭐</div><p class="muted">1 point = $1</p><div class="small muted" style="margin-top:8px">Kids earn points on game day for <b>enthusiasm</b>, <b>fitness</b> and <b>teamwork</b>, even when a program has no reward catalog.</div>${rewardMode(pr)==='catalog'?`<button class="btn green" style="margin-top:12px" onclick="openSpend()">Spend catalog points</button>`:'<div class="notice" style="margin-top:12px">No reward catalog is enabled for this program.</div>'}</div><div class="card"><h3>🏆 MVP voting</h3><p class="muted">${session?'Vote for the teammate who tried the hardest today.':'Voting opens on session days.'}</p>${session?candidates.map(x=>`<button class="vote-card ${String(state.currentVote)===String(x.id)&&String(state.currentVoteChildId||child?.id)===String(child?.id)?'selected':''} ${(!(state.currentVote&&String(state.currentVoteChildId||child?.id)===String(child?.id))&&String(voted||'')===String(x.id))?'selected':''}" onclick="castVote('${esc(x.id)}')"><b>${esc(x.name)}</b></button>`).join(''):''}<button class="btn blue" style="margin-top:12px;width:100%" ${(!state.currentVote||String(state.currentVoteChildId||child?.id)!==String(child?.id)||String(voted||'')===String(state.currentVote)||!session)?'disabled':''} onclick="submitVote()">${voted?'Change vote':'Submit vote'}</button></div></div>`
}
function managerPayments(){const rows=state.managerPayments||[];if(!rows.length)return `<div class="card" style="margin-top:20px"><h3>Payments</h3><div class="notice">No payments yet.</div></div>`;return `<div class="card" style="margin-top:20px"><h3>Payments</h3><div class="catalog">${rows.map(p=>{const child=(state.managerChildren||[]).find(c=>String(c.id)===String(p.child_id));const prog=(state.programs||[]).find(x=>String(x.dbId)===String(p.program_id));return `<div class="catalog-row"><div><b>${esc(child?.name||'Child')}</b><div class="small muted">${esc(prog?.name||'Program')} • ${esc(p.method)} • ${money(p.amount)} • ${esc(p.status)}</div></div>${p.status==='pending'?`<button class="btn green" onclick="confirmCashEmtPayment('${esc(p.id)}')">Mark received</button>`:'<span class="pill">Confirmed</span>'}</div>`}).join('')}</div></div>`}
async function confirmCashEmtPayment(paymentId){if(!state.authUser||!(state.authRole==='manager'||state.authRole==='owner'))return toast('Manager access required.');const q=await supabaseClient.rpc('confirm_cash_emt_payment',{p_payment_id:paymentId});if(q.error)return toast('Could not confirm payment: '+q.error.message);await loadUserData();toast('Payment confirmed and enrollment activated.');render();}

async function loadGamedayData(){
 state.gameday={ready:false,points:{},awards:{},balance:{}};
 try{
  if(!supabaseClient||!['manager','owner'].includes(state.authRole))return;
  const pids=(state.programs||[]).map(p=>p.dbId).filter(isUuid);if(!pids.length)return;
  const pq=await supabaseClient.from('programs').select('id,points_enthusiasm,points_fitness,points_teamwork').in('id',pids);
  if(pq.error)return;
  const gd={ready:false,points:{},awards:{},balance:{}};
  for(const r of pq.data||[])gd.points[String(r.id)]={enthusiasm:Number(r.points_enthusiasm??1),fitness:Number(r.points_fitness??1),teamwork:Number(r.points_teamwork??1)};
  const lq=await supabaseClient.from('points_ledger').select('child_id,program_id,amount,source_key').in('program_id',pids).limit(5000);
  if(!lq.error)for(const r of lq.data||[]){const c=String(r.child_id);gd.balance[c]=(gd.balance[c]||0)+Number(r.amount||0);const sk=String(r.source_key||'');if(sk.startsWith('game:')){const p=sk.split(':');if(p.length===4)gd.awards[`${p[1]}:${p[2]}:${p[3]}`]=true}}
  gd.ready=true;state.gameday=gd;
 }catch(_e){}
}
const GAME_CATS=[['enthusiasm','Enthusiasm','🔥'],['fitness','Fitness','💪'],['teamwork','Teamwork','🤝']];
function gamedayPanel(){
 if(!['manager','owner'].includes(state.authRole))return '';
 const gd=state.gameday||{ready:false,points:{},awards:{},balance:{}},today=simulationDate();
 const items=(state.programs||[]).map(p=>{const s=(state.managerSessions||[]).find(x=>String(x.programId)===String(p.dbId)&&x.date===today);return s?{p,s}:null}).filter(Boolean);
 const head=`<div class="section-title"><div><span class="pill">Game day</span><h2>Today • ${esc(fmtDate(today))}</h2><p class="muted">Check kids in and give points for enthusiasm, fitness and teamwork.</p></div></div>`;
 if(!items.length)return `<div class="card" style="margin-bottom:18px">${head}<div class="notice">No sessions today.</div></div>`;
 return `<div class="card" id="gameday" style="margin-bottom:18px">${head}${!gd.ready?`<div class="notice" style="margin-bottom:12px">Points for enthusiasm, fitness and teamwork need the latest database update (rewards-gameday.sql). Check-in works now.</div>`:''}${items.map(({p,s})=>{
  const pid=String(p.dbId),sid=String(s.id),pv=gd.points[pid]||{enthusiasm:1,fitness:1,teamwork:1};
  const kids=(state.managerChildren||[]).filter(c=>isManagerEnrolled(pid,c.id));
  const here=c=>!!state.attendedSessionDates?.[attendanceStateKey(p,c.id)]?.[s.date];
  const n=kids.filter(here).length;
  if(s.status==='cancelled')return `<div class="notice" style="margin-bottom:12px"><b>${esc(p.name)}</b> — this session is cancelled. It counts as attended for every child.</div>`;
  return `<div style="margin-bottom:18px"><h3 style="margin:0 0 4px">${esc(p.name)}</h3><div class="small muted">${esc(s.start?String(s.start).slice(0,5):'')}${s.end?'–'+esc(String(s.end).slice(0,5)):''} • ${esc(p.venue)} • ${n} of ${kids.length} checked in</div>
  <div class="button-row" style="margin:10px 0">${n<kids.length?`<button class="btn light" type="button" onclick="gameCheckInAll('${sid}','${pid}')">Check everyone in</button>`:''}${gd.ready?GAME_CATS.map(([k,l,e])=>`<button class="btn light" type="button" ${n?'':'disabled'} onclick="gameAwardAll('${sid}','${k}')">Everyone +${pv[k]} ${e} ${l}</button>`).join(''):''}</div>
  ${kids.length?`<table class="table"><thead><tr><th>Player</th><th>Status</th>${gd.ready?'<th>Points</th><th>Awards</th>':''}</tr></thead><tbody>${kids.map(c=>{const h=here(c);return `<tr><td><b>${esc(c.name)}</b></td><td>${h?'<span class="pill">Checked in ✓</span>':`<button class="btn light" type="button" onclick="toggleAttendance('${sid}','${esc(c.id)}',true)">Check in</button>`}</td>${gd.ready?`<td>${gd.balance[String(c.id)]||0} ⭐</td><td>${h?GAME_CATS.map(([k,l,e])=>{const on=!!gd.awards[`${sid}:${c.id}:${k}`];return `<button class="btn ${on?'green':'light'}" type="button" onclick="gameAward('${sid}','${esc(c.id)}','${k}',${on?'false':'true'},'${pid}')">${e} ${l} ${on?'✓':'+'+pv[k]}</button>`}).join(' '):'<span class="small muted">Check in first</span>'}</td>`:''}</tr>`}).join('')}</tbody></table>`:'<div class="notice">No enrolled players yet.</div>'}
  ${gd.ready?`<div class="notice" style="margin-top:12px"><b>Points per category</b> (default 1 each; 1 point = $1)<div class="button-row" style="margin-top:8px;align-items:end">${GAME_CATS.map(([k,l,e])=>`<label class="small">${e} ${l}<input class="input" id="gp-${k}-${pid}" type="number" min="0" max="20" value="${pv[k]}" style="max-width:90px"></label>`).join('')}<button class="btn green" type="button" onclick="saveCategoryPoints('${pid}')">Save points</button></div></div>`:''}</div>`}).join('')}</div>`;
}
async function gameAward(sid,cid,cat,on,pid){
 if(!supabaseClient)return;const q=await supabaseClient.rpc('set_game_award',{p_session:sid,p_child:cid,p_category:cat,p_on:!!on});
 if(q.error)return toast('Could not save: '+q.error.message);
 await loadGamedayData();render();
}
async function gameAwardAll(sid,cat){
 if(!supabaseClient)return;const q=await supabaseClient.rpc('award_game_all',{p_session:sid,p_category:cat});
 if(q.error)return toast('Could not save: '+q.error.message);
 await loadGamedayData();toast(Number(q.data)?`Gave ${q.data} players points.`:'Everyone checked in already has it.');render();
}
async function gameCheckInAll(sid,pid){
 if(!supabaseClient)return;const p=(state.programs||[]).find(x=>String(x.dbId)===String(pid)),s=(state.managerSessions||[]).find(x=>String(x.id)===String(sid));if(!p||!s)return;
 const todo=(state.managerChildren||[]).filter(c=>isManagerEnrolled(pid,c.id)&&!state.attendedSessionDates?.[attendanceStateKey(p,c.id)]?.[s.date]);
 const rs=await Promise.all(todo.map(c=>supabaseClient.rpc('set_attendance',{p_session:sid,p_child:c.id,p_present:true})));
 const bad=rs.find(r=>r.error);if(bad)toast('Could not check everyone in: '+bad.error.message);
 await loadUserData();render();
}
async function saveCategoryPoints(pid){
 const v=k=>Number(document.getElementById(`gp-${k}-${pid}`)?.value);const e=v('enthusiasm'),f=v('fitness'),t=v('teamwork');
 if(![e,f,t].every(x=>Number.isInteger(x)&&x>=0&&x<=20))return toast('Points must be whole numbers from 0 to 20.');
 const q=await supabaseClient.rpc('set_category_points',{p_program:pid,p_enthusiasm:e,p_fitness:f,p_teamwork:t});
 if(q.error)return toast('Could not save points: '+q.error.message);
 await loadGamedayData();toast('Points per category saved.');render();
}
function manager(){const programs=state.programs||[];return `<div class="section-title"><div><span class="pill">${isOwner()?'Owner / manager':'Manager'}</span><h2>Program Builder</h2><p class="muted">Programs stay permanent. Weekly planning determines the sessions underneath them.</p></div><button class="btn green" onclick="showProgramForm()">+ Add Program</button></div>${gamedayPanel()}<div id="programForm" class="card" style="display:none;margin-bottom:18px"><h3>New program</h3><div class="formgrid"><div><div class="label">Program name</div><input class="input" id="mName" placeholder="Tuesday Skills — U8/U10"></div><div><div class="label">Sport</div><input class="input" id="mSport" placeholder="Soccer"></div><div><div class="label">Location</div><div style="display:flex;gap:8px"><input class="input" id="mVenue" placeholder="Search a real venue"><button class="btn light" type="button" onclick="searchRealLocation()">Search</button></div><div id="locationResults" class="catalog" style="margin-top:8px"></div></div><div><div class="label">Price</div><input class="input" id="mPrice" type="number" min="0" placeholder="500"></div><div><div class="label">Attendance payback</div><input class="input" id="mAttendancePayback" type="number" min="0" placeholder="100"><div class="small muted">Total payback for completing every session. Example: $100 total on an $500 program.</div></div><div><div class="label">Number of sessions</div><input class="input" id="mSessionCount" type="number" min="1" max="52" placeholder="8" oninput="updateSchedulePlanner()"></div><div><div class="label">Spots</div><input class="input" id="mSpots" type="number" min="1" max="500" placeholder="12"></div><div><div class="label">First session date</div><input class="input" id="mFirstDate" type="date" onchange="updateSchedulePlanner()"></div><div class="full"><div class="label">Schedule</div><input class="input" id="mSchedule" placeholder="Tuesday 5–6 PM" oninput="updateSchedulePlanner()"><div class="small muted">Forgiving input: Tuesday 5–6 PM, Tuesdays 5:00–6:00 PM, Tue 17:00–18:00.</div></div><div class="full"><div id="schedulePlanner" class="schedule-planner"><div class="notice">Enter a schedule and first date to see the weekly planner.</div></div></div><div class="full"><div class="label">Details</div><textarea class="input" id="mDetails" rows="3" placeholder="Technical skills, movement and game play."></textarea></div><div class="full"><div class="label">Rewards</div><select class="input" id="mRewardMode"><option value="none">No rewards (default)</option><option value="catalog">Enable manager reward catalog</option></select><div class="small muted">Even with no catalog, kids can still earn points for enthusiasm, fitness and teamwork.</div></div></div><div class="button-row"><button class="btn green" onclick="addProgram()">Create program</button><button class="btn light" onclick="hideProgramForm()">Cancel</button></div></div>${programs.length?programs.map(p=>managerProgramCard(p)).join(''):'<div class="notice">No programs created yet.</div>'}${programs.length?programs.map(p=>mvpTable(p)).join(''):''}${rewardManager()}${managerPayments()}${isOwner()?ownerProgramHistory():''}${isOwner()?ownerPeoplePanel():''}`}
async function addProgram(){
 const name=document.getElementById('mName')?.value.trim(); if(!name)return toast('Enter a program name.');
 const scheduleText=document.getElementById('mSchedule')?.value.trim(),parsed=parseScheduleInput(scheduleText); if(!parsed)return toast('Enter a schedule like Tuesday 5–6 PM.');
 const firstDate=document.getElementById('mFirstDate')?.value; const rawCount=document.getElementById('mSessionCount')?.value; if(!firstDate)return toast('Choose the first session date.'); if(rawCount==='')return toast('Enter the number of sessions.'); const count=Math.max(1,Math.min(52,Number(rawCount))); if(!Number.isInteger(count))return toast('Session count must be a whole number.');
 if(!supabaseClient||!state.authUser||!(state.authRole==='manager'||state.authRole==='owner'))return toast('Approved manager access is required.');
 const sport=document.getElementById('mSport')?.value.trim()||'Sports'; const rawPrice=document.getElementById('mPrice')?.value,rawPayback=document.getElementById('mAttendancePayback')?.value,rawSpots=document.getElementById('mSpots')?.value; if(rawPrice===''||rawPayback===''||rawSpots==='')return toast('Complete price, attendance payback and spots before creating the program.'); const price=Math.max(0,Number(rawPrice)); const attendancePayback=Math.max(0,Number(rawPayback)); const spots=Math.max(1,Math.min(500,Math.floor(Number(rawSpots)))); const details=document.getElementById('mDetails')?.value.trim()||''; const rewardModeValue=document.getElementById('mRewardMode')?.value||'none'; if(!Number.isFinite(price)||!Number.isFinite(attendancePayback)||!Number.isFinite(spots))return toast('Enter valid program numbers.');
 if(!Number.isInteger(attendancePayback))return toast('Attendance payback must be a whole number of dollars.');
 const removed=state.scheduleDraft.removed||{}; const rows=scheduleWeekRows(firstDate,parsed.day,count,removed); const selectedDates=rows.filter(x=>x.selected).map(x=>x.date); const flags=rows.filter(x=>x.flag).map(x=>`${x.date}: ${x.flag}`);
 if(selectedDates.length!==count)return toast(`The planner produced ${selectedDates.length} sessions; it needs exactly ${count}.`);
 const venueText=document.getElementById('mVenue')?.value.trim()||''; const selectedVenue=state.selectedLocation||null; const venueName=selectedVenue?.name||venueText||null; const venueAddress=selectedVenue?selectedVenue.display_name:null;
 const scheduleLabel=`${scheduleText} • ${selectedDates.join(', ')}`;
 const q=await supabaseClient.rpc('create_program_with_sessions',{p_name:name,p_sport:sport,p_sessions:count,p_price:price,p_attendance_payback:attendancePayback,p_schedule:scheduleLabel,p_details:details,p_spots:spots,p_rewards_enabled:rewardModeValue==='catalog',p_session_dates:selectedDates,p_start_time:parsed.start,p_end_time:parsed.end,p_venue_name:venueName,p_venue_address:venueAddress});
 if(q.error)return toast('Could not create program: '+q.error.message);
 await loadUserData();state.scheduleDraft={};state.selectedLocation=null;hideProgramForm();toast(`Program created with ${selectedDates.length} sessions.`);render();
}

function deleteSession(id){toast('Sessions are not deleted from the normal workflow. Mark the session cancelled instead.')}
async function deleteProgram(programRef){
 if(!state.authUser||!['manager','owner'].includes(state.authRole))return toast('Approved manager access is required.');
 const p=(state.programs||[]).find(x=>String(x.dbId||x.id)===String(programRef)||String(x.id)===String(programRef));
 if(!p)return toast('Program not found.');
 const pid=String(p.dbId||'');if(!pid)return toast('This program is missing its database ID. Refresh the app and try again.');
 if(state.authRole==='manager'&&String(p.managerId)!==String(state.authUser.id))return toast('You can only delete your own programs.');
 const enrolled=(state.managerEnrollments||[]).filter(x=>String(x.program_id)===pid&&['active','pending_payment'].includes(String(x.enrollment_status||'active'))).length;
 const warn=enrolled?`\n\n${enrolled} ${enrolled===1?'child is':'children are'} currently enrolled and will no longer see this program.`:'';
 if(!confirm(`Delete “${p.name}”?${warn}\n\nIt stays in the owner's history and only the owner can restore it.`))return;
 const q=await supabaseClient.from('programs').update({deleted_at:new Date().toISOString()}).eq('id',pid).is('deleted_at',null).select('id');
 if(q.error)return toast('Could not delete program: '+q.error.message);
 if(!q.data||!q.data.length)return toast('Could not delete program: the database did not allow it.');
 state.expandedPrograms['mgr-'+pid]=false;
 if(String(state.managerProgramId)===pid)state.managerProgramId=null;
 await loadUserData();toast(`“${p.name}” was deleted.`);render();
}
async function restoreProgram(programId){
 if(!isOwner())return toast('Owner access required.');
 const r=(state.deletedPrograms||[]).find(x=>String(x.dbId)===String(programId));
 if(!r)return toast('Program not found.');
 if(!confirm(`Restore “${r.name}”? It will be visible to parents and its manager again.`))return;
 const q=await supabaseClient.from('programs').update({deleted_at:null}).eq('id',r.dbId).select('id');
 if(q.error)return toast('Could not restore program: '+q.error.message);
 if(!q.data||!q.data.length)return toast('Could not restore program: the database did not allow it.');
 await loadUserData();toast(`“${r.name}” was restored.`);render();
}
function ownerProgramHistory(){
 const rows=(state.deletedPrograms||[]).slice().sort((a,b)=>String(b.deletedAt||'').localeCompare(String(a.deletedAt||'')));
 const who=id=>{const x=(state.people||[]).find(p=>String(p.id)===String(id));return x?(x.name||x.email||'Unknown'):'Unknown'};
 return `<div class="card" style="margin-top:18px"><div class="section-title" style="margin-bottom:12px"><div><span class="pill">Owner history</span><h3>Deleted programs</h3><p class="muted">Deleted programs stay here with their enrollments, payments and sessions intact. Parents and managers no longer see them.</p></div></div>${rows.length?`<table class="table"><thead><tr><th>Program</th><th>Manager</th><th>Deleted by</th><th>Deleted on</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.name)}</b><div class="small muted">${esc(r.schedule||'')} • ${esc(r.venue)}</div></td><td>${esc(who(r.managerId))}</td><td>${esc(who(r.deletedBy))}</td><td>${r.deletedAt?esc(fmtDate(String(r.deletedAt).slice(0,10))):'—'}</td><td><button class="btn light" type="button" onclick="restoreProgram('${esc(r.dbId)}')">Restore</button></td></tr>`).join('')}</tbody></table>`:'<div class="notice">No deleted programs yet.</div>'}</div>`;
}

// ---- v10 product hardening / testing flow ----
async function awardPoints(kind,amount=10,childId=null,programId=null){
 const p=programId?(state.programs||[]).find(pr=>String(pr.dbId||pr.id)===String(programId)):(state.programs||[]).find(pr=>String(pr.dbId||pr.id)===String(state.managerProgramId||''))||currentManagerProgramForChild(childId||activeManagerChildId());
 if(!p)return toast('Select a program first.');
 const selected=childId||activeManagerChildForProgram(p);const child=(state.managerChildren||[]).find(c=>String(c.id)===String(selected));const id=child?.id||selected;
 if(!id)return toast('No child is selected for this points award.');if(!isManagerEnrolled(p.dbId||p.id,id))return toast('Select a child enrolled in this program.');if(!supabaseClient||!state.authUser)return toast('Manager sign-in is required.');
 const n=Math.max(1,Math.floor(Number(amount)||10));const sourceKey=`award-${crypto.randomUUID()}`;
 const q=await supabaseClient.from('points_ledger').insert({child_id:id,program_id:p.dbId||p.id,manager_id:state.authUser.id,amount:n,description:`${kind} bonus`,type:'earned',source_key:sourceKey});
 if(q.error)return toast('Could not award points: '+q.error.message);
 await loadUserData();toast(`+${n} points for ${kind}`);render();
}
function currentManagerProgramForChild(childId){const cid=String(childId||'');return (state.programs||[]).find(p=>isManagerEnrolled(p.dbId||p.id,cid))||null}
function activeManagerChildForProgram(programRef,kidsArg=null){const p=programRef&&typeof programRef==='object'?programRef:(state.programs||[]).find(x=>String(x.dbId||x.id)===String(programRef)||String(x.id)===String(programRef));if(!p)return null;const pid=String(p.dbId||p.id);const kids=kidsArg||(state.managerChildren||[]).filter(c=>isManagerEnrolled(pid,c.id));const stored=state.activeManagerChildByProgram?.[pid];if(stored&&kids.some(c=>String(c.id)===String(stored)))return stored;const legacy=state.activeManagerChildId;const chosen=kids.find(c=>String(c.id)===String(legacy))?.id||kids[0]?.id||null;if(chosen){state.activeManagerChildByProgram=state.activeManagerChildByProgram||{};state.activeManagerChildByProgram[pid]=String(chosen);}return chosen}
function setManagerChildForProgram(programId,childId){const p=(state.programs||[]).find(x=>String(x.dbId||x.id)===String(programId)||String(x.id)===String(programId));if(!p)return toast('Program not found.');const pid=String(p.dbId||p.id);if(!isManagerEnrolled(pid,childId))return toast('That child is not enrolled in this program.');state.activeManagerChildByProgram=state.activeManagerChildByProgram||{};state.activeManagerChildByProgram[pid]=String(childId);state.activeManagerChildId=String(childId);state.managerProgramId=pid;saveLocalOnly();render();}
function setManagerProgram(programId){const p=(state.programs||[]).find(x=>String(x.dbId||x.id)===String(programId)||String(x.id)===String(programId));if(!p)return toast('Program not found.');const pid=String(p.dbId||p.id);state.managerProgramId=pid;const key=`mgr-${pid}`;state.expandedPrograms=state.expandedPrograms||{};state.expandedPrograms[key]=!state.expandedPrograms[key];const childId=activeManagerChildForProgram(p);if(childId)state.activeManagerChildId=childId;saveLocalOnly();render();}
function downloadProgramICS(ref){const p=(ref&&typeof ref==='object')?ref:(state.programs||[]).find(x=>String(x.id)===String(ref)||String(x.dbId)===String(ref))||null;if(!p)return toast('Program not found.');const dates=plannedDatesForProgram(p);const parsed=parseScheduleInput(p.slots?.[0]?.label||p.schedule||'');if(!dates.length||!parsed)return toast('No scheduled sessions available yet.');const esc=x=>String(x||'').replace(/([,;\\])/g,'\\$1').replace(/\n/g,'\\n');const events=dates.map((d,i)=>`BEGIN:VEVENT\r\nUID:${esc((p.dbId||p.id)+'-'+d)}@thedailyroll.ca\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}\r\nDTSTART:${d.replace(/-/g,'')}T${parsed.start.replace(':','')}00\r\nDTEND:${d.replace(/-/g,'')}T${parsed.end.replace(':','')}00\r\nSUMMARY:${esc(p.name)}\r\nLOCATION:${esc(p.venue)}\r\nDESCRIPTION:${esc(`The Daily Roll • ${state.childName||'Child'} • ${p.sport||''}`)}\r\nEND:VEVENT`).join('\r\n');const ics=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//The Daily Roll//Program Calendar//EN\r\nCALSCALE:GREGORIAN\r\n${events}\r\nEND:VCALENDAR`;const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${p.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-schedule.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Calendar file downloaded.')}
function rewardCatalogForProgram(p){if(!p||rewardMode(p)!=='catalog')return [];return (state.rewards||[]).filter(r=>!p.managerId||String(r.managerId)===String(p.managerId))}
state.simulationOffsetDays = Number(state.simulationOffsetDays||0);
state.simulationBaseDate = state.simulationBaseDate || new Date().toISOString().slice(0,10);
state.votesBySession = state.votesBySession || {};
state.userVotesBySession = state.userVotesBySession || {};
state.publishedMVPBySession = state.publishedMVPBySession || {};
state.rewardModeByProgram = state.rewardModeByProgram || {};
state.locationSearch = state.locationSearch || [];
state.scheduleDraft = state.scheduleDraft || {};

function demoOn(){if(!state.authUser)return false;if(isOwner())return state.demoMode!==false;return state.demoEnabled===true}
function setDemoMode(on){state.demoMode=!!on;state.currentCheckinDate=null;state.currentVote=null;state.currentVoteChildId=null;saveLocalOnly();render();toast(on?'Demo features are showing.':'Demo features are hidden. The app is on today’s real date.')}
function simulationDate(){const d=new Date(state.simulationBaseDate+'T12:00:00');d.setDate(d.getDate()+(demoOn()?Math.max(0,state.simulationOffsetDays):0));return d.toISOString().slice(0,10)}
function fmtDate(iso){return new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',year:'numeric'}).format(new Date(iso+'T12:00:00'))}
function fmtMonthYear(iso){const d=new Date(String(iso||'').slice(0,7)+'-01T12:00:00');return Number.isNaN(d.getTime())?'Not provided':new Intl.DateTimeFormat('en-CA',{month:'long',year:'numeric'}).format(d)}
function addDays(iso,n){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
function isoWeekStart(iso){const d=new Date(iso+'T12:00:00');const day=d.getDay()||7;d.setDate(d.getDate()-day+1);return d.toISOString().slice(0,10)}
function hdsbFlags(year){
 const out={};
 const add=(a,b,reason)=>{let d=new Date(a+'T12:00:00'),e=new Date(b+'T12:00:00');while(d<=e){out[d.toISOString().slice(0,10)]=reason;d.setDate(d.getDate()+1)}};
 if(year===2026||year===2027){
   add('2026-09-02','2026-09-03','HDSB PA day');
   add('2026-10-09','2026-10-09','HDSB PA day');
   add('2026-11-27','2026-11-27','HDSB PA day');
   add('2026-12-21','2027-01-01','HDSB Winter Break');
   add('2027-02-05','2027-02-05','HDSB PA day');
   add('2027-03-15','2027-03-19','HDSB March Break');
   add('2027-04-19','2027-04-19','HDSB PA day');
   add('2027-06-04','2027-06-04','HDSB PA day');
 }
 return out;
}

function ontarioHolidayFlags(year){
 const out={};
 const nth=(month,weekday,n,name)=>{let d=new Date(year,month-1,1,12);let delta=(weekday-d.getDay()+7)%7;d.setDate(1+delta+7*(n-1));out[d.toISOString().slice(0,10)]=name};
 const lastBefore=(month,weekday,dayLimit,name)=>{let d=new Date(year,month-1,dayLimit,12);while(d.getDay()!==weekday)d.setDate(d.getDate()-1);out[d.toISOString().slice(0,10)]=name};
 const fixed=(m,d,name)=>{out[`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`]=name};
 fixed(1,1,'New Year’s Day'); fixed(7,1,'Canada Day'); fixed(12,25,'Christmas Day'); fixed(12,26,'Boxing Day');
 nth(2,1,3,'Family Day'); lastBefore(5,1,24,'Victoria Day'); nth(8,1,1,'Civic Holiday'); nth(9,1,1,'Labour Day'); nth(10,1,2,'Thanksgiving');
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
 const easter=new Date(year,month-1,day,12); const gf=new Date(easter);gf.setDate(gf.getDate()-2);const em=new Date(easter);em.setDate(em.getDate()+1);out[gf.toISOString().slice(0,10)]='Good Friday';out[em.toISOString().slice(0,10)]='Easter Monday';
 return out;
}

function scheduleWeekRows(startDate,day,count,removed){
 const rows=[]; let d=nextDateOnWeekday(startDate,day); let guard=0; const target=Math.max(1,Number(count)||8); let included=0;
 while(guard<target+18 && rows.length<target+18){const iso=d.toISOString().slice(0,10);const flags={...hdsbFlags(new Date(iso+'T12:00:00').getFullYear()),...ontarioHolidayFlags(new Date(iso+'T12:00:00').getFullYear())};const flag=flags[iso]||null;const off=!!removed[iso];let selected=included<target&&!off;if(selected)included++;rows.push({date:iso,flag,selected});d.setDate(d.getDate()+7);guard++;}
 // If the manager removes an originally selected week, extend selection to preserve session count.
 for(let i=0;i<rows.length&&included<target;i++){if(!rows[i].selected&&!removed[rows[i].date]){rows[i].selected=true;included++;}}
 return rows;
}
function updateSchedulePlanner(){
 const schedule=document.getElementById('mSchedule')?.value||''; const parsed=parseScheduleInput(schedule); const first=document.getElementById('mFirstDate')?.value; const count=Math.max(1,Math.min(52,Number(document.getElementById('mSessionCount')?.value)||8)); if(!parsed||!first){const e=document.getElementById('schedulePlanner');if(e)e.innerHTML='<div class="notice">Enter a schedule and first date to see the weekly planner.</div>';return;}
 const removed=state.scheduleDraft.removed||{}; const rows=scheduleWeekRows(first,parsed.day,count,removed); state.scheduleDraft={firstDate:first,day:parsed.day,start:parsed.start,end:parsed.end,label:parsed.label,count,removed}; const e=document.getElementById('schedulePlanner');if(e)e.innerHTML=`<div class="schedule-planner"><div class="small muted" style="margin-bottom:8px">Weeks are flagged from the HDSB school calendar and Ontario holidays. A flag is a recommendation—not an automatic cancellation. Remove a week to give families a break; the system extends the program so you still get ${count} sessions.</div>${rows.map((r,i)=>`<div class="week-row ${r.selected?'included':'removed'}"><div><b>Week ${i+1}</b><span class="small muted">${fmtDate(r.date)}</span></div><div>${r.flag?`<span class="pill">⚠ ${r.flag}</span>`:'<span class="small muted">Normal week</span>'}</div><div><button class="btn ${r.selected?'light':'green'}" onclick="toggleScheduleWeek('${r.date}')">${r.selected?'Take week off':'Include week'}</button></div></div>`).join('')}</div>`;
}
function toggleScheduleWeek(date){state.scheduleDraft.removed=state.scheduleDraft.removed||{};if(state.scheduleDraft.removed[date])delete state.scheduleDraft.removed[date];else state.scheduleDraft.removed[date]=true;saveLocalOnly();updateSchedulePlanner()}
function plannedDatesForProgram(p){const raw=p?.scheduleWeeks; if(Array.isArray(raw)&&raw.length)return raw; const parsed=parseScheduleInput(p?.slots?.[0]?.label||p?.schedule||'');if(!parsed)return[];return scheduleWeekRows(p.firstDate||new Date().toISOString().slice(0,10),parsed.day,p.sessions||8,p.removedWeeks||{}).filter(x=>x.selected).map(x=>x.date)}
function currentSessionForProgram(p){const sim=simulationDate();const list=(state.sessions||[]).filter(s=>String(s.programId||'')===String(p?.dbId||''));return list.find(s=>s.date===sim&&String(s.status).toLowerCase()!=='cancelled')||null}
function currentSessionKey(p){const s=currentSessionForProgram(p);return s?String(s.id||s.dbId):null}
function simulationBar(){if(!state.authUser||!demoOn())return '';const base=state.simulationBaseDate;return `<div class="card simulation-bar"><div><b>Demo clock</b><span class="small muted">${fmtDate(simulationDate())} • ${state.simulationOffsetDays} day${state.simulationOffsetDays===1?'':'s'} from ${fmtDate(base)}</span></div><input aria-label="Simulate days" type="range" min="0" max="120" value="${Math.min(120,state.simulationOffsetDays)}" oninput="setSimulationDays(this.value)"><label class="small muted" style="display:flex;flex-direction:column;gap:2px;white-space:nowrap">Go to date<input class="input" style="margin-top:0" aria-label="Jump to date" type="date" min="${state.simulationBaseDate}" value="${simulationDate()}" onchange="setSimulationDate(this.value)"></label><div class="button-row"><button class="btn light" onclick="setSimulationDays(0)">Reset</button><button class="btn light" onclick="setSimulationDays(${Math.max(0,state.simulationOffsetDays-7)})">−7</button><button class="btn light" onclick="setSimulationDays(${Math.max(0,state.simulationOffsetDays-1)})">−1 day</button><button class="btn light" onclick="setSimulationDays(${Math.min(400,state.simulationOffsetDays+1)})">+1 day</button><button class="btn light" onclick="setSimulationDays(${Math.min(400,state.simulationOffsetDays+7)})">+7</button></div></div>`}
function setSimulationDate(iso){const base=new Date(state.simulationBaseDate+'T12:00:00'),d=new Date(String(iso||'')+'T12:00:00');if(Number.isNaN(d.getTime()))return;setSimulationDays(Math.round((d-base)/86400000))}
function setSimulationDays(n){state.simulationOffsetDays=Math.max(0,Math.min(400,Number(n)||0));state.currentCheckinDate=null;state.currentVote=null;state.currentVoteChildId=null;saveLocalOnly();render()}
function paymentPreferenceLabel(){return state.paymentMethod==='stripe'?'Credit card':'Cash / EMT'}

function isParentLike(){return state.authRole==='parent'||state.authRole==='owner'}
function rewardMode(pr){if(pr&&typeof pr.rewardsEnabled==='boolean')return pr.rewardsEnabled?'catalog':'none';return state.rewardModeByProgram[String(programDbId(pr))]==='catalog'?'catalog':'none'}
async function setRewardMode(pid,mode){
 const p=(state.programs||[]).find(x=>String(x.id)===String(pid)||String(x.dbId)===String(pid)); if(!p||!supabaseClient)return toast('Program not found.');
 const enabled=mode==='catalog';
 const q=await supabaseClient.from('programs').update({rewards_enabled:enabled}).eq('id',p.dbId||p.id);
 if(q.error)return toast('Could not update rewards: '+q.error.message);
 p.rewardsEnabled=enabled; state.rewardModeByProgram[String(p.dbId||p.id)]=enabled?'catalog':'none'; saveLocalOnly(); render();
}


async function processSelectedPayment(){const p=(state.programs||[]).find(x=>String(x.id)===String(state.selectedProgram)||String(x.dbId)===String(state.selectedProgram))||currentTrackedProgram();if(!p)return toast('Choose a program first.');if(state.paymentMethod==='stripe'){return startStripeCheckout(p)}completePurchase(state.paymentMethod);}





function sessionVoteData(p){const key=currentSessionKey(p)||`preview-${p?.id}`;state.votesBySession[key]=state.votesBySession[key]||{};return {key,votes:state.votesBySession[key]}}









async function searchRealLocation(){const q=document.getElementById('mVenue')?.value.trim();if(!q)return toast('Enter a venue or address to search.');try{const res=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ca&q=${encodeURIComponent(q)}`,{headers:{'Accept':'application/json'}});const data=await res.json();state.locationSearch=data||[];const e=document.getElementById('locationResults');if(e)e.innerHTML=data.length?data.map((x,i)=>`<button class="program-collapse" onclick="chooseLocation(${i})"><span><b>${x.display_name}</b></span><span>›</span></button>`).join(''):'<div class="notice">No Canadian locations found.</div>';}catch(err){toast('Location search is unavailable right now. You can still enter the full venue/address manually.')}}
function chooseLocation(i){const x=state.locationSearch[i];if(!x)return;const e=document.getElementById('mVenue');if(e)e.value=x.display_name;state.selectedLocation=x;const r=document.getElementById('locationResults');if(r)r.innerHTML=`<div class="success">Selected real location: <b>${x.display_name}</b></div>`}
async function startStripeCheckout(p){if(!supabaseClient||!state.authUser)return toast('Log in before starting card payment.');const c=activeChild();if(!c)return toast('Choose a child first.');const session=await supabaseClient.auth.getSession();const token=session.data?.session?.access_token;if(!token)return toast('Your login session has expired. Please log in again.');const res=await fetch('/api/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({program_id:p.dbId,child_id:c.id,payback_destination:state.economics||'parent',customer:{name:state.parentName,email:state.email,phone:state.phone}})});let data=null;try{data=await res.json()}catch(_e){}if(!res.ok||!data?.url)return toast(data?.error||'Stripe checkout is not available.');window.location.href=data.url;}
async function handleStripeReturn(){const q=new URLSearchParams(location.search);if(q.get('stripe_cancelled')==='1'){history.replaceState({},'',location.pathname);toast('Stripe payment was cancelled. No enrollment was activated.');return}if(q.get('stripe_success')!=='1')return;const paymentId=q.get('payment_id');if(!paymentId){history.replaceState({},'',location.pathname);return toast('Payment return received, but the payment reference was missing.');}const session=await supabaseClient?.auth.getSession();const token=session?.data?.session?.access_token;if(!token)return;const r=await fetch(`/api/payment-status?payment_id=${encodeURIComponent(paymentId)}`,{headers:{Authorization:`Bearer ${token}`}});const d=await r.json().catch(()=>null);history.replaceState({},'',location.pathname);if(d?.status==='paid'){await loadUserData();setView('parent');toast('Payment confirmed and enrollment activated.')}else{toast('Payment was received by Stripe. Enrollment will activate when Stripe confirms the payment.')}}

// Keep manager attendance override useful with the simulated clock.





/* ===== Daily Roll production hardening: role flows, per-child wallets, persistent demo data ===== */
function activeChild(){if(!state.children?.length)return null;return state.children.find(c=>String(c.id)===String(state.activeChildId))||state.children[0]||null}
function childPoints(childId){const id=String(childId||activeChild()?.id||'');if(!id)return 0;return Number(state.pointsByChild?.[id]||0)||0}
function childLedger(childId){const id=String(childId||activeChild()?.id||'');if(!id)return [];state.ledgerByChild=state.ledgerByChild||{};state.ledgerByChild[id]=state.ledgerByChild[id]||[];return state.ledgerByChild[id]}
function setChildPoints(childId,value){const id=String(childId||'');if(!id)return;state.pointsByChild=state.pointsByChild||{};state.pointsByChild[id]=Math.max(0,Number(value)||0);state.rewardPoints=state.pointsByChild[id];state.ledger=childLedger(id)}
function addChildPoints(childId,amount,description,type='earned'){ // compatibility helper: DB writes must use insertPointsLedger().
 const id=String(childId||'');const n=Number(amount)||0;if(!id||!n)return false;setChildPoints(id,childPoints(id)+n);childLedger(id).push({date:simulationDate(),description,amount:n,type});return true;
}
async function insertPointsLedger({childId,programId,managerId,amount,description,type='earned',rewardId=null,sourceKey=null}){
 if(!supabaseClient||!state.authUser)return {error:new Error('Not authenticated')};
 const row={child_id:childId,program_id:programId||null,manager_id:managerId||null,amount:Number(amount)||0,description,type,reward_id:rewardId,source_key:sourceKey||crypto.randomUUID()};
 const q=await supabaseClient.from('points_ledger').insert(row).select('id,child_id,program_id,manager_id,amount,description,type,reward_id,created_at').single();
 if(!q.error){state.ledgerByChild[String(childId)]=state.ledgerByChild[String(childId)]||[];state.ledgerByChild[String(childId)].push({dbId:q.data.id,date:q.data.created_at||simulationDate(),description:q.data.description,amount:Number(q.data.amount||0),type:q.data.type,programId:q.data.program_id,rewardId:q.data.reward_id});state.pointsByChild[String(childId)]=computeLocalBalance(childId);state.rewardPoints=state.pointsByChild[String(childId)];state.ledger=childLedger(childId)}
 return q;
}
function selectChild(childId){const c=currentChildForId(childId);if(!c)return;state.activeChildId=c.id;state.childName=c.name;state.rewardPoints=childPoints(c.id);state.ledger=childLedger(c.id);state.currentVote=null;state.currentVoteChildId=null;saveLocalOnly();render()}

function extractDatesFromSchedule(schedule){
  const s=String(schedule||''); return [...s.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(m=>m[1]);
}
function managerRewardChild(){return activeManagerChildId()}
function activeManagerChildId(){
  const id=state.activeManagerChildId||state.managerChildren?.[0]?.id; if(id)state.activeManagerChildId=id; return id||null;
}
















(async function boot(){
 if(appBooted)return;appBooted=true;render();await initSupabase();if(!supabaseClient)return;try{const {data}=await supabaseClient.auth.getSession();if(data?.session?.user){state.authUser=state.authMode==='recovery'?data.session.user:state.authUser; if(state.authMode!=='recovery')await setAuthenticatedUser(data.session.user); await handleStripeReturn(); render();}else{state.authUser=null;state.authRole=null;render();}}catch(err){console.error('Auth bootstrap failed:',err);state.authError='Authentication could not be initialized. Refresh and try again.';render()}})();