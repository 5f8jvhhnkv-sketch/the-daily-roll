const defaultState={
 view:'sales', selectedProgram:null, selectedSlot:null, paid:false, parentName:'', childName:'', childPhoto:null,
 email:'', phone:'', attendance:0,totalSessions:0,rewardPoints:0, votes:{},userVote:null,publishedMVP:null,managerOverride:null,
 economics:'parent', consent:false, privacyOpen:false, attendanceByProgram:{}, currentCheckinDate:null,
 rewards:[], ledger:[], programs:[], players:[], activeChildId:null, pointsByChild:{}, ledgerByChild:{},
 managerChildren:[], managerEnrollments:[], managerSessions:[], votesBySession:{}, userVotesBySession:{}, publishedMVPBySession:{}, teamChildrenByProgram:{}, managerProgramId:null,
 rewardModeByProgram:{}, attendedSessionDates:{}, expandedPrograms:{}, enrolledPrograms:[], children:[], people:[],
 simulationOffsetDays:0, simulationBaseDate:new Date().toISOString().slice(0,10),
 authMode:null, authUser:null, authRole:null, registerRole:'parent', paymentMethod:null,
 childModalOpen:false, childForm:{name:'',date_of_birth:'',sex:''}, rewardImagePreview:'', locationSearch:[], scheduleDraft:{}
};
let savedState=null;
try{savedState=JSON.parse(localStorage.getItem('dailyRollMVP')||'null')}catch(_e){savedState=null}
const state=Object.assign(JSON.parse(JSON.stringify(defaultState)),savedState&&typeof savedState==='object'?savedState:{});
state.simulationBaseDate=state.simulationBaseDate||new Date().toISOString().slice(0,10);
state.simulationOffsetDays=Math.max(0,Math.min(120,Number(state.simulationOffsetDays)||0));
state.pointsByChild=state.pointsByChild||{}; state.ledgerByChild=state.ledgerByChild||{};
state.votesBySession=state.votesBySession||{}; state.userVotesBySession=state.userVotesBySession||{}; state.publishedMVPBySession=state.publishedMVPBySession||{};
state.rewardModeByProgram=state.rewardModeByProgram||{}; state.attendedSessionDates=state.attendedSessionDates||{};
state.expandedPrograms=state.expandedPrograms||{}; state.enrolledPrograms=state.enrolledPrograms||[]; state.children=state.children||[];
state.managerChildren=state.managerChildren||[]; state.managerEnrollments=state.managerEnrollments||[]; state.managerSessions=state.managerSessions||[]; state.teamChildrenByProgram=state.teamChildrenByProgram||{}; state.people=state.people||[];
state.scheduleDraft=state.scheduleDraft||{}; state.locationSearch=state.locationSearch||[];
// localStorage is a cache only; never trust it as proof of authentication.
state.authUser=null; state.authRole=null;
let rewardImageFile=null;
let appBooted=false;

// ---- Supabase connection ----
const SUPABASE_URL = 'https://pzgzzbjeyrxpuqkuizyr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YESJdmGbaOkMT0_0Yor9Dg_qkHj_GVv';
const OWNER_EMAIL = 'gurpsb@icloud.com';
const PAYMENT_VARIANT = 'cash';
const APP_VERSION = '10.3.1-production';
const PAYMENT_DEFAULT = 'emt';
let supabaseClient = null;
let supabaseReady = false;

function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function isUuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''))}
function setBusy(btn,busy,label){if(!btn)return;btn.disabled=busy;btn.dataset.originalText=btn.dataset.originalText||btn.textContent;if(busy)btn.textContent=label||'Saving…';else btn.textContent=btn.dataset.originalText}
function cacheThenRender(){saveLocalOnly();render()}
function currentChildForId(childId){return (state.children||[]).find(c=>String(c.id)===String(childId))||null}
function activeProgramForChild(childId){
 const id=String(childId||activeChild()?.id||'');
 return (state.programs||[]).find(p=>String(p.dbId||p.id)===String(state.selectedProgram)&&isEnrolled(p.dbId||p.id,id)) ||
        (state.programs||[]).find(p=>isEnrolled(p.dbId||p.id,id)) || null;
}
function attendanceStateKey(pr,childId){return `${String(programDbId(pr)||pr?.id||'')}:${String(childId||activeChild()?.id||'')}`}
function computeLocalBalance(childId){return childLedger(childId).reduce((sum,row)=>sum+Number(row.amount||0),0)}
function resetTransientRewardImage(){rewardImageFile=null;state.rewardImagePreview=''}

async function initSupabase(){
  try {
    if (!window.supabase || !window.supabase.createClient) return;
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    supabaseReady = true;
    await pullSupabaseData();
  } catch(err){ console.warn('Supabase connection failed; local demo mode remains available.', err); }
}
async function pullSupabaseData(){
 if(!supabaseClient)return;
 try{
   const q=await supabaseClient.from('programs').select('id,name,sport,sessions,price,attendance_payback,schedule,details,spots,venue_id,manager_id,rewards_enabled,venues(name,address)').order('created_at');
   if(q.error){console.warn('Public program load failed:',q.error.message);return;}
   state.programs=(q.data||[]).filter(p=>p.name!=='Saturday Soccer — U10').map((p,i)=>{
     const dates=extractDatesFromSchedule(p.schedule);
     return {id:i+1,dbId:p.id,managerId:p.manager_id||null,name:p.name,sport:p.sport||'Sports',sessions:Number(p.sessions||0),price:Number(p.price||0),attendancePayback:Number(p.attendance_payback||0),rewardsEnabled:!!p.rewards_enabled,venue:[p.venues?.name,p.venues?.address].filter(Boolean).join(' • ')||'Venue TBD',details:p.details||'',scheduleWeeks:dates,firstDate:dates[0]||null,slots:[{id:'db-'+p.id,label:(String(p.schedule||'').split(' • ')[0]||'Schedule to be announced'),spots:Number(p.spots||0),capacity:Number(p.spots||0)}],managerName:'Program manager'};
   });
   if(state.programs.length){const mids=[...new Set(state.programs.map(p=>p.managerId).filter(isUuid))]; if(mids.length){const mq=await supabaseClient.from('program_manager_names').select('manager_id,name').in('manager_id',mids); if(!mq.error){const names=Object.fromEntries((mq.data||[]).map(x=>[x.manager_id,x.name])); state.programs=state.programs.map(p=>({...p,managerName:names[p.managerId]||'Program manager'}));}}}
 }catch(err){console.warn('Public Supabase read failed.',err)}
}
function saveLocalOnly(){
 const copy={...state,authUser:null,authRole:null,children:state.children||[],managerChildren:state.managerChildren||[],managerEnrollments:state.managerEnrollments||[],teamChildrenByProgram:state.teamChildrenByProgram||{}};
 delete copy.childModalOpen; delete copy.rewardImagePreview;
 try{localStorage.setItem('dailyRollMVP',JSON.stringify(copy))}catch(err){console.warn('Local cache unavailable.',err)}
}
async function syncStateToSupabase(){return true}
function save(){saveLocalOnly()}
function toast(msg){const d=document.createElement('div');d.className='toast';d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),2300)}
function money(n){return new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(n)}
function checkout(p){const kids=state.children||[];const active=activeChild();if(!state.authUser||!isParentLike())return `<div class="card" style="margin-top:20px"><div class="notice">Log in as a parent to join this program and select a child.</div></div>`;return `<div class="section-title"><div><h2>Join ${esc(p.name)}</h2><span class="muted">Select the child, choose the payback destination and payment method.</span></div></div><div class="checkout-layout"><div class="card"><h3>Enrollment</h3><div class="formgrid"><div class="full"><div class="label">Child</div><select class="input" id="checkoutChild">${kids.map(c=>`<option value="${esc(c.id)}" ${String(c.id)===String(active?.id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div><div class="label">Parent name</div><input class="input" id="parent" value="${esc(state.parentName)}" maxlength="100"></div><div><div class="label">Email</div><input class="input" id="email" type="email" value="${esc(state.email)}" placeholder="you@example.com"></div><div><div class="label">Phone</div><input class="input" id="phone" type="tel" value="${esc(state.phone)}" placeholder="416-555-1234"></div></div><div class="notice" style="margin-top:18px">Child photo can be added later. Birthday and sex stay on the child profile and are not shown here.</div></div><div class="card sticky-summary"><h3>Payment summary</h3><div class="statrow"><span>Program</span><b>${money(p.price)}</b></div><div class="statrow"><span>Attendance payback</span><b>${money(p.attendancePayback||0)}</b></div><div class="statrow"><span>Reward catalog</span><b>${rewardMode(p)==='catalog'?'Manager catalog enabled':'No rewards by default'}</b></div><div class="divider"></div><div class="statrow total"><span>Total</span><b>${money(p.price)}</b></div><div style="margin-top:14px"><div class="label">Attendance payback goes to</div><select class="input" id="paybackDestination"><option value="parent">Parent</option><option value="kid">Kid wallet</option></select></div><div style="margin-top:14px"><div class="label">Payment method</div><select class="input" id="paymentMethod"><option value="cash">Cash</option><option value="emt">EMT</option>${PAYMENT_VARIANT==='stripe'?'<option value="stripe">Credit card</option>':''}</select></div><button class="btn green" style="width:100%;margin-top:14px" onclick="openPrivacy()">Continue</button><p class="small muted">You will acknowledge the privacy/video terms before payment.</p></div></div>`}

function privacyModal(){return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">Required acknowledgement</span><h2>Privacy & video acknowledgement</h2></div><button class="icon-btn" onclick="closePrivacy()">×</button></div><p>The Daily Roll may use cameras and AI video processing during sessions to provide session recordings, live viewing and, in the future, child-specific highlights.</p><p class="muted">This MVP uses a placeholder acknowledgement. Before launch, this should link to your final privacy policy, consent language and applicable legal terms.</p><div class="policy-box"><b>What you're acknowledging</b><ul><li>Session video may be recorded and processed.</li><li>Authorized family members may access session video.</li><li>Future AI features may analyze session footage.</li></ul><label class="check"><input type="checkbox" ${state.consent?'checked':''} onchange="state.consent=this.checked;save();render()"> I acknowledge the privacy/video terms and want to continue.</label></div><button class="btn green" style="width:100%" ${state.consent?'':'disabled'} onclick="continueToPayment()">Proceed to payment</button></div></div>`}
function mvpTable(p){const prog=p||currentTrackedProgram(),s=prog&&currentSessionForProgram(prog);if(!s||!isUuid(String(s.id||s.dbId)))return `<div class="notice">No database session selected for ${esc(prog?.name||'this program')}. Generate sessions first.</div>`;const rows=(state.managerChildren||[]).filter(c=>isManagerEnrolled(prog.dbId||prog.id,c.id)).map(c=>{const n=state.votesBySession?.[String(s.id||s.dbId)]?.[String(c.id)]||0;return {id:c.id,name:c.name,votes:n}}).sort((a,b)=>b.votes-a.votes);const chosen=state.publishedMVPBySession?.[String(s.id||s.dbId)]||'';return `<div class="card"><h3>🏆 MVP voting • ${fmtDate(s.date)}</h3>${rows.length?`<table class="table"><thead><tr><th>Player</th><th>Votes</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.votes}</td></tr>`).join('')}</tbody></table><div style="margin-top:12px"><div class="label">Manager override</div><select class="input" id="mvpSelect-${prog.id}"><option value="">Use vote leader</option>${rows.map(r=>`<option value="${esc(r.id)}" ${String(chosen)===String(r.id)?'selected':''}>${esc(r.name)}</option>`).join('')}</select><button class="btn green" style="margin-top:10px" onclick="publishMVP(${prog.id})">Publish MVP</button></div>${chosen?`<div class="success" style="margin-top:12px">Published MVP: <b>${esc((state.managerChildren||[]).find(c=>String(c.id)===String(chosen))?.name||chosen)}</b></div>`:''}`:'<div class="notice">No enrolled teammates are available for this session yet.</div>'}</div>`}

function rewardsInfo(){return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>How rewards work</h2><button class="icon-btn" onclick="closeModal()">×</button></div><div class="reward-explain"><div class="big-number">1</div><div><b>1 point = $1</b><p class="muted">Kids earn points for attendance, effort, teamwork and achievements. Points can be spent on rewards set by the manager.</p></div></div><button class="btn green" style="width:100%" onclick="closeModal()">Got it</button></div></div>`}
function spendModal(){const p=currentTrackedProgram();const catalog=rewardCatalogForProgram(p);return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">Spend points</span><h2>${childPoints(activeChild()?.id)} points available</h2></div><button class="icon-btn" onclick="closeModal()">×</button></div>${catalog.length?`<div class="catalog">${catalog.map(r=>`<button class="reward-card" onclick="buyReward('${esc(r.id||r.dbId)}')">${r.image?`<img src="${esc(r.image)}" alt=""/>`:'<div class="reward-icon">🎁</div>'}<div><b>${esc(r.name)}</b><p class="small muted">${esc(r.description)}</p></div><strong>${r.cost} pts</strong></button>`).join('')}</div>`:'<div class="notice">No rewards are enabled for this program.</div>'}</div></div>`}

function openRewardsInfo(){state.privacyOpen='rewards';render()}function openSpend(){state.privacyOpen='spend';render()}function openVideo(){toast('Demo video room: live stream and full-session download will connect here.')}function closeModal(){state.privacyOpen=false;render()}
function selectSlot(pid,sid){state.selectedProgram=pid;state.selectedSlot=sid;save();render();document.getElementById('programs').scrollIntoView({behavior:'smooth'})}
function selectProgram(pid){state.selectedProgram=pid;state.selectedSlot=null;save();render();document.getElementById('programs').scrollIntoView({behavior:'smooth'})}
function deselectProgram(){state.selectedProgram=null;state.selectedSlot=null;save();render()}
function openPrivacy(){state.parentName=document.getElementById('parent')?.value.trim()||state.parentName||'';state.email=document.getElementById('email')?.value.trim().toLowerCase()||state.email||'';state.phone=document.getElementById('phone')?.value.trim()||state.phone||'';state.activeChildId=document.getElementById('checkoutChild')?.value||state.activeChildId;const c=activeChild();if(c)state.childName=c.name;state.paymentMethod=document.getElementById('paymentMethod')?.value||PAYMENT_DEFAULT;state.economics=document.getElementById('paybackDestination')?.value||'parent';state.privacyOpen=true;state.consent=false;saveLocalOnly();render()}
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
   if(q.error)return toast('Could not save the enrollment: '+q.error.message);
   await loadUserData();state.selectedProgram=null;state.selectedSlot=null;setView('parent');toast(method==='emt'?'Enrollment saved — EMT payment is pending confirmation.':'Enrollment saved — cash payment is pending confirmation.');render();
 }catch(err){toast('Could not save the enrollment: '+(err?.message||'unknown error'))}
 finally{state.paymentProcessing=false;}
}

function castVote(name){state.currentVote=name;render()}
async function submitVote(){const p=currentTrackedProgram(),c=activeChild(),s=p&&currentSessionForProgram(p);if(!p||!c||!s||!isUuid(String(s.id||s.dbId)))return toast('Voting is only available on a real session day.');if(!state.currentVote)return toast('Pick a teammate first.');const roster=teamChildrenForProgram(p.dbId||p.id);const nominee=roster.find(x=>x.name===state.currentVote)||state.children.find(x=>x.name===state.currentVote);if(!nominee)return toast('That teammate is not available.');const q=await supabaseClient.from('session_votes').insert({session_id:s.id||s.dbId,voter_child_id:c.id,nominee_child_id:nominee.id}).select('id,session_id,voter_child_id,nominee_child_id').single();if(q.error){if(q.error.code==='23505')return toast('You already voted for this session.');return toast('Could not record vote: '+q.error.message)}state.userVotesBySession[String(s.id||s.dbId)]=state.currentVote;state.currentVote=null;toast('Vote recorded for this session');await loadUserData();render();}
async function publishMVP(pid){const p=(state.programs||[]).find(x=>String(x.id)===String(pid)||String(x.dbId)===String(pid))||currentTrackedProgram();const s=p&&currentSessionForProgram(p);if(!p||!s||!isUuid(String(s.id||s.dbId)))return toast('No database session is selected.');const chosen=document.getElementById(`mvpSelect-${p.id}`)?.value||null;const sessionId=s.id||s.dbId;let childId=null;if(chosen){const cc=(state.managerChildren||[]).find(x=>String(x.id)===String(chosen));childId=cc?.id||chosen}else{const rows=await supabaseClient.from('session_votes').select('nominee_child_id').eq('session_id',sessionId);if(rows.error)return toast('Could not read the vote tally: '+rows.error.message);const counts={};for(const x of rows.data||[])counts[x.nominee_child_id]=(counts[x.nominee_child_id]||0)+1;childId=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;}if(!childId)return toast('No vote leader to publish yet.');const q=await supabaseClient.from('session_mvp').upsert({session_id:sessionId,child_id:childId,override:!!chosen,published_by:state.authUser.id,published_at:new Date().toISOString()},{onConflict:'session_id'});if(q.error)return toast('Could not publish MVP: '+q.error.message);state.publishedMVPBySession[String(sessionId)]=childId;toast('MVP published for this session');render();}
function setEconomics(v){state.economics=v;save();toast(`Payment preference saved: ${v==='kid'?'kid':'parent'}`)}
function adjustAttendance(){const pr=currentTrackedProgram();if(!pr)return toast('No program available.');const a=attendanceProgress(pr);setProgramAttendance(pr,Math.min(a.total,a.attended+1),'manager');}
async function addReward(){
 const name=document.getElementById('rName')?.value.trim();const description=document.getElementById('rDesc')?.value.trim()||'Reward';const cost=Math.max(1,Math.floor(Number(document.getElementById('rCost')?.value)||0));
 if(!name)return toast('Enter a reward name.');
 if(!Number.isFinite(cost)||cost<1)return toast('Enter a valid points cost.');
 if(!state.authUser||!(state.authRole==='manager'||state.authRole==='owner'))return toast('Approved manager access is required.');
 const btn=document.querySelector('#rewardManagerForm .btn.green');setBusy(btn,true,'Saving…');let uploadedPath=null;
 try{
   let imageUrl=null;
   if(rewardImageFile){
     const ext=(rewardImageFile.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');const path=`${state.authUser.id}/${crypto.randomUUID()}.${ext}`;
     const up=await supabaseClient.storage.from('reward-images').upload(path,rewardImageFile,{cacheControl:'3600',contentType:rewardImageFile.type||'image/jpeg',upsert:false});
     if(up.error)throw new Error('Image upload failed: '+up.error.message); uploadedPath=path; imageUrl=supabaseClient.storage.from('reward-images').getPublicUrl(path).data.publicUrl;
   }
   const q=await supabaseClient.from('rewards').insert({name,description,cost,active:true,manager_id:state.authUser.id,image_url:imageUrl}).select('id,name,description,cost,active,manager_id,image_url').single();
   if(q.error)throw new Error(q.error.message);
   state.rewards=[...(state.rewards||[]),{id:Date.now(),dbId:q.data.id,name:q.data.name,description:q.data.description||'',cost:Number(q.data.cost||0),icon:'🎁',image:q.data.image_url||'',managerId:q.data.manager_id}];resetTransientRewardImage();saveLocalOnly();toast('Reward added to your catalog');render();
 }catch(err){if(uploadedPath){await supabaseClient.storage.from('reward-images').remove([uploadedPath])}toast('Could not add reward: '+err.message)}finally{setBusy(btn,false)}
}
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

function publicPrograms(){
  return (state.programs||[]).filter(p=>p.name!=='Saturday Soccer — U10');
}
function isOwner(){return !!state.authUser && (String(state.authUser.email||'').toLowerCase()===OWNER_EMAIL || state.authRole==='owner');}
function authButtons(){
  if(state.authUser) return `<span class="small" style="color:#dbe6f6">${state.authUser.email||''}</span><button class="btn light" onclick="logout()">Log out</button>`;
  return `<button class="btn light" onclick="openAuth('login')">Log in</button><button class="btn green" onclick="openAuth('register')">Register</button>`;
}
function authRequired(){const pending=state.authRole==='manager_pending';return `<div class="card" style="max-width:620px;margin:50px auto;text-align:center"><span class="pill">${pending?'Manager approval pending':'Account required'}</span><h2>${pending?'Your manager account is awaiting approval':'Log in to The Daily Roll'}</h2><p class="muted">${pending?'You registered as a manager. The owner needs to approve your account before Manager View is available.':'Parents can manage children and programs. Owners can also use the Parent View for testing.'}</p><div class="button-row" style="justify-content:center"><button class="btn blue" onclick="${pending?'logout()':'openAuth(\'login\')'}">${pending?'Log out':'Log in'}</button>${pending?'':'<button class="btn green" onclick="openAuth(\'register\')">Create account</button>'}</div></div>`}

function authModal(){
 const reg=state.authMode==='register';
 return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">The Daily Roll account</span><h2>${reg?'Create your account':'Welcome back'}</h2></div><button class="icon-btn" onclick="closeAuth()">×</button></div>${reg?`<div class="notice" style="margin-bottom:16px"><b>Choose your account type</b><div class="small muted" style="margin-top:4px">Managers can register normally, but the owner must approve the account before Manager View is unlocked.</div></div><div class="label">Account type</div><select class="input" id="authRole" onchange="state.registerRole=this.value;saveLocalOnly()"><option value="parent" ${state.registerRole==='parent'?'selected':''}>Parent</option><option value="manager" ${state.registerRole==='manager'?'selected':''}>Manager</option></select>`:''}<div class="label" style="margin-top:12px">Email</div><input class="input" id="authEmail" type="email" placeholder="you@example.com"><div class="label" style="margin-top:12px">Password</div><input class="input" id="authPassword" type="password" placeholder="At least 6 characters">${reg?`<div class="label" style="margin-top:12px">Name</div><input class="input" id="authName" placeholder="Your name">`:''}<button class="btn ${reg?'green':'blue'}" style="width:100%;margin-top:18px" onclick="${reg?'registerAccount()':'loginAccount()'}">${reg?'Create account':'Log in'}</button>${reg?'':'<button class="btn light" type="button" style="width:100%;margin-top:8px" onclick="sendPasswordReset()">Forgot password?</button>'}<p class="small muted" style="margin-top:12px">${reg?'Your account type is saved to your profile. The owner email is automatically recognized as the owner account.':'Use the email and password you registered with.'}</p></div></div>`;
}
function openAuth(mode){state.authMode=mode;state.authRole=mode==='register'?'parent':null;state.registerRole='parent';render()}
function closeAuth(){state.authMode=null;render()}
async function sendPasswordReset(){
 if(!supabaseClient)return toast('Supabase is not connected.');
 const email=document.getElementById('authEmail')?.value.trim().toLowerCase();
 if(!email)return toast('Enter your email first.');
 const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}${location.pathname}`});
 if(error)return toast('Could not send reset email: '+error.message);
 toast('Password reset email sent if that account exists.');
}
async function registerAccount(){
 if(!supabaseClient)return toast('Supabase is not connected.');
 const email=document.getElementById('authEmail')?.value.trim().toLowerCase();const password=document.getElementById('authPassword')?.value;const name=document.getElementById('authName')?.value.trim();const requestedRole=document.getElementById('authRole')?.value==='manager'?'manager':'parent';
 const owner=email===OWNER_EMAIL;
 if(!email||!password||password.length<8||!name)return toast('Enter your name, email and a password of at least 8 characters.');
 const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{name,requested_role:owner?'owner':requestedRole}}});
 if(error)return toast(error.message);
 state.authMode=null;render();
 if(!data.user)return toast('Account created. Check your email to finish registration.');
 if(data.session?.user){await setAuthenticatedUser(data.user);toast(owner?'Owner account created':'Account created');render();}
 else toast(owner?'Owner account created. Check your email to confirm the account, then log in.':requestedRole==='manager'?'Manager application created. Confirm your email; the owner must approve Manager View.':'Account created. Check your email to confirm the account, then log in.');
}

async function loginAccount(){
 if(!supabaseClient)return toast('Supabase is not connected.');
 const email=document.getElementById('authEmail').value.trim().toLowerCase(); const password=document.getElementById('authPassword').value;
 if(!email||!password)return toast('Enter your email and password.');
 const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
 if(error)return toast(error.message);
 await setAuthenticatedUser(data.user);state.authMode=null;render();
}
async function setAuthenticatedUser(user){
 state.authUser=user;state.email=user.email||'';state.authMode=null;
 let profileQ=await supabaseClient.from('profiles').select('id,name,role,email').eq('id',user.id).maybeSingle();
 let profile=profileQ.data||null;
 const normalizedEmail=String(user.email||'').toLowerCase();
 if(!profile){const desiredRole=normalizedEmail===OWNER_EMAIL?'owner':'parent';const ins=await supabaseClient.from('profiles').insert({id:user.id,name:user.user_metadata?.name||user.email?.split('@')[0]||'Parent',role:desiredRole,email:user.email});if(ins.error&&ins.error.code!=='23505')console.warn('Profile creation failed:',ins.error.message);profile=(await supabaseClient.from('profiles').select('id,name,role,email').eq('id',user.id).maybeSingle()).data||null;}
 if(normalizedEmail===OWNER_EMAIL){state.authRole='owner';state.parentName=profile?.name||user.user_metadata?.name||'Owner';if(profile?.role!=='owner'){await supabaseClient.from('profiles').update({role:'owner',email:user.email}).eq('id',user.id)}}
 else{state.authRole=profile?.role||'parent';state.parentName=profile?.name||user.user_metadata?.name||user.email?.split('@')[0]||'Parent';}
 state.view=(state.authRole==='manager'||state.authRole==='owner')?'manager':'sales';
 await loadUserData();saveLocalOnly();
}

async function loadUserData(){
 if(!supabaseClient||!state.authUser)return;
 try{
   const uid=state.authUser.id; const parentLike=isParentLike();
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
       if(pids.length && ids.length){const vq=await supabaseClient.from('session_votes').select('session_id,voter_child_id,nominee_child_id').in('voter_child_id',ids).in('session_id',(state.sessions||[]).map(x=>x.id));if(!vq.error){state.userVotesBySession={};for(const v of vq.data||[]){const nominee=(state.managerChildren||[]).find(c=>String(c.id)===String(v.nominee_child_id))||(state.children||[]).find(c=>String(c.id)===String(v.nominee_child_id));state.userVotesBySession[String(v.session_id)]=nominee?.name||String(v.nominee_child_id)}}
         const mv=await supabaseClient.from('session_mvp').select('session_id,child_id').in('session_id',(state.sessions||[]).map(x=>x.id));if(!mv.error){state.publishedMVPBySession={};for(const x of mv.data||[])state.publishedMVPBySession[String(x.session_id)]=x.child_id;}}
       const [checkQ,overrideQ,paybackQ,paymentQ]=await Promise.all([
         supabaseClient.from('session_checkins').select('session_id,child_id,checked_in_at,sessions(program_id,session_date,status)').in('child_id',ids),
         pids.length?supabaseClient.from('attendance_overrides').select('program_id,child_id,attended_count,reason,updated_at').in('program_id',pids).in('child_id',ids):Promise.resolve({data:[],error:null}),
         supabaseClient.from('attendance_paybacks').select('id,program_id,child_id,amount,destination,status,awarded_at').in('child_id',ids),
         supabaseClient.from('payments').select('id,program_id,child_id,amount,currency,method,status,receipt_number,stripe_checkout_session_id,receipt_url,paid_at,created_at').eq('user_id',uid).order('created_at',{ascending:false})
       ]);
       if(!checkQ.error){state.attendedSessionDates={};for(const x of checkQ.data||[]){const k=attendanceStateKey({dbId:x.sessions?.program_id},x.child_id);state.attendedSessionDates[k]=state.attendedSessionDates[k]||{};if(x.sessions?.session_date)state.attendedSessionDates[k][x.sessions.session_date]=true;}}
       state.attendanceByProgram={};
       for(const x of (checkQ.data||[])){if(x.sessions?.program_id){const k=attendanceStateKey({dbId:x.sessions.program_id},x.child_id);state.attendanceByProgram[k]=state.attendanceByProgram[k]||{attended:0,paybackIssued:false};if(x.sessions.status!=='cancelled')state.attendanceByProgram[k].attended=(state.attendanceByProgram[k].attended||0)+1;}}
       for(const x of overrideQ.data||[]){const k=attendanceStateKey({dbId:x.program_id},x.child_id);state.attendanceByProgram[k]=state.attendanceByProgram[k]||{};state.attendanceByProgram[k].attended=Math.max(0,Number(x.attended_count)||0);state.attendanceByProgram[k].override=true;}
       for(const x of paybackQ.data||[]){const k=attendanceStateKey({dbId:x.program_id},x.child_id);state.attendanceByProgram[k]=state.attendanceByProgram[k]||{};state.attendanceByProgram[k].paybackIssued=true;state.attendanceByProgram[k].payoutDestination=x.destination;state.attendanceByProgram[k].paybackAmount=Number(x.amount||0);}
       state.payments=paymentQ.error?[]:(paymentQ.data||[]);
       for(const p of state.programs||[]){p.rewardsEnabled=!!p.rewardsEnabled;}
       // Load only reward catalogs belonging to enrolled programs that opted in.
       const rewardManagerIds=[...new Set((state.enrolledPrograms||[]).map(e=>(state.programs||[]).find(p=>String(p.dbId)===String(e.program_id))?.managerId).filter(isUuid))];
       if(rewardManagerIds.length){const rr=await supabaseClient.from('rewards').select('id,name,description,cost,icon,image_url,manager_id').eq('active',true).in('manager_id',rewardManagerIds).order('created_at');if(!rr.error)state.rewards=(rr.data||[]).map((x,i)=>({id:i+1,dbId:x.id,name:x.name,description:x.description||'',cost:Number(x.cost||0),icon:x.icon||'🎁',image:x.image_url||'',managerId:x.manager_id}));}
     }else{state.children=[];state.enrolledPrograms=[];state.pointsByChild={};state.ledgerByChild={};state.rewardPoints=0;state.ledger=[];state.payments=[];}
   }
   if(state.authRole==='manager'||state.authRole==='owner'){
     state.managerChildren=[];state.managerEnrollments=[];state.managerSessions=[];state.managerPayments=[];state.rewards=[];state.votesBySession={};state.publishedMVPBySession={};
     let pq=supabaseClient.from('programs').select('id,name,sport,sessions,price,attendance_payback,schedule,details,spots,venue_id,manager_id,rewards_enabled,venues(name,address)').order('created_at'); if(state.authRole==='manager')pq=pq.eq('manager_id',uid);
     const q=await pq;if(q.error)throw new Error('Could not load manager programs: '+q.error.message);
     state.programs=(q.data||[]).filter(p=>p.name!=='Saturday Soccer — U10').map((p,i)=>{const dates=extractDatesFromSchedule(p.schedule);return {id:i+1,dbId:p.id,managerId:p.manager_id,name:p.name,sport:p.sport||'Sports',sessions:Number(p.sessions||0),price:Number(p.price||0),attendancePayback:Number(p.attendance_payback||0),rewardsEnabled:!!p.rewards_enabled,venue:[p.venues?.name,p.venues?.address].filter(Boolean).join(' • ')||'Venue TBD',details:p.details||'',scheduleWeeks:dates,firstDate:dates[0]||null,slots:[{id:'db-'+p.id,label:(String(p.schedule||'').split(' • ')[0]||'Schedule to be announced'),spots:Number(p.spots||0),capacity:Number(p.spots||0)}],managerName:'Program manager'};});
     const mids=[...new Set(state.programs.map(p=>p.managerId).filter(isUuid))];if(mids.length){const mq=await supabaseClient.from('program_manager_names').select('manager_id,name').in('manager_id',mids);if(!mq.error){const names=Object.fromEntries((mq.data||[]).map(x=>[x.manager_id,x.name]));state.programs=state.programs.map(p=>({...p,managerName:names[p.managerId]||'Program manager'}));}}
     let rq=supabaseClient.from('rewards').select('id,name,description,cost,icon,image_url,manager_id').eq('active',true);if(state.authRole==='manager')rq=rq.eq('manager_id',uid);const rr=await rq.order('created_at');if(!rr.error)state.rewards=(rr.data||[]).map((x,i)=>({id:i+1,dbId:x.id,name:x.name,description:x.description||'',cost:Number(x.cost||0),icon:x.icon||'🎁',image:x.image_url||'',managerId:x.manager_id}));
     const pids=state.programs.map(p=>p.dbId).filter(isUuid);
     if(pids.length){const sq=await supabaseClient.from('sessions').select('id,name,sport,session_date,start_time,end_time,status,description,max_players,program_id,venue_id,venues(name,address)').in('program_id',pids).order('session_date');if(!sq.error)state.managerSessions=(sq.data||[]).map(s=>({id:s.id,dbId:s.id,name:s.name,sport:s.sport||'',date:s.session_date,start:s.start_time||'',end:s.end_time||'',status:String(s.status||'Committed').toLowerCase(),description:s.description||'',maxPlayers:Number(s.max_players||0),programId:s.program_id,venue:[s.venues?.name,s.venues?.address].filter(Boolean).join(' • ')||'Venue TBD'}));state.sessions=state.managerSessions;
       const pc=await supabaseClient.from('program_children').select('program_id,child_id,payment_status,enrollment_status').in('program_id',pids);state.managerEnrollments=pc.error?[]:(pc.data||[]);const childIds=[...new Set(state.managerEnrollments.map(x=>x.child_id).filter(isUuid))];if(childIds.length){const cq=await supabaseClient.from('children').select('id,name,date_of_birth,sex,photo_url,created_by').in('id',childIds).order('name');if(!cq.error)state.managerChildren=cq.data||[];}
       const vq=await supabaseClient.from('session_votes').select('session_id,voter_child_id,nominee_child_id,created_at').in('session_id',(state.managerSessions||[]).map(s=>s.id));if(!vq.error){state.managerVoteRows=vq.data||[];state.votesBySession={};for(const v of vq.data||[]){state.votesBySession[v.session_id]=state.votesBySession[v.session_id]||{};const n=String(v.nominee_child_id);state.votesBySession[v.session_id][n]=(state.votesBySession[v.session_id][n]||0)+1;}}
       const mv=await supabaseClient.from('session_mvp').select('session_id,child_id').in('session_id',(state.managerSessions||[]).map(s=>s.id));if(!mv.error)for(const x of mv.data||[])state.publishedMVPBySession[String(x.session_id)]=x.child_id;
     }
     const payq=await supabaseClient.from('payments').select('id,program_id,child_id,amount,currency,method,status,receipt_number,paid_at,created_at').in('program_id',pids).order('created_at',{ascending:false});state.managerPayments=payq.error?[]:(payq.data||[]);
     if(isOwner()){const people=await supabaseClient.from('profiles').select('id,name,email,role,created_at').order('created_at',{ascending:false});if(!people.error)state.people=people.data||[];}
   }
   saveLocalOnly();render();
 }catch(err){console.error('Authenticated data load failed:',err);toast(err.message||'Could not load account data.');}
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
 const people=(state.people||[]).filter(p=>String(p.email||'').toLowerCase()!==OWNER_EMAIL);
 return `<div class="card" style="margin-top:18px"><div class="section-title" style="margin-bottom:12px"><div><span class="pill">Owner controls</span><h3>Manager approvals & accounts</h3><p class="muted">Managers register normally. You decide who is approved as a manager.</p></div></div>${people.length?`<table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Change</th></tr></thead><tbody>${people.map(p=>`<tr><td><b>${p.name||'Unnamed'}</b></td><td>${p.email||'—'}</td><td>${p.role==='manager_pending'?'<span class="pill">Pending manager</span>':p.role}</td><td><select class="input" onchange="changeUserRole('${p.id}',this.value)" style="min-width:150px"><option value="${p.role}" selected>${p.role==='manager_pending'?'Pending manager':p.role}</option><option value="parent">Parent</option><option value="manager_pending">Pending manager</option><option value="manager">Manager</option></select></td></tr>`).join('')}</tbody></table>`:'<div class="notice">No other accounts yet. When someone registers as a manager, their application will appear here.</div>'}</div>`;
}
async function logout(){if(supabaseClient)await supabaseClient.auth.signOut();state.authUser=null;state.authRole=null;state.children=[];state.enrolledPrograms=[];state.view='sales';saveLocalOnly();render();toast('Logged out')}
function toggleProgram(id){state.expandedPrograms[id]=!state.expandedPrograms[id];render()}
function enrolledForChild(childId){return (state.enrolledPrograms||[]).filter(x=>String(x.child_id)===String(childId)&&coalesceStatusActive(x)).map(x=>String(x.program_id));}
function coalesceStatusActive(row){return String(row?.enrollment_status||'active')==='active' || String(row?.enrollment_status||'')===''}
function isEnrolled(programId,childId){return enrolledForChild(childId).includes(String(programId))}
function isManagerEnrolled(programId,childId){return (state.managerEnrollments||[]).some(x=>String(x.program_id)===String(programId)&&String(x.child_id)===String(childId)&&coalesceStatusActive(x))}
function teamChildrenForProgram(programId){return state.teamChildrenByProgram?.[String(programId)]||[]}
async function enrollInProgram(programId){if(!state.authUser)return openAuth('register');if(!isParentLike())return toast('Manager accounts cannot enroll children. Owner accounts can test parent enrollment.');const child=activeChild();const p=state.programs.find(x=>String(x.id)===String(programId)||String(x.dbId)===String(programId));if(!child)return toast('Add a child before joining.');if(!p)return toast('Program not found.');state.activeChildId=child.id;state.childName=child.name;state.selectedProgram=p.id;state.selectedSlot=p.slots?.[0]?.id||null;state.view='sales';saveLocalOnly();render();}
async function addChild(){
 if(!state.authUser||!isParentLike())return toast('Log in as a parent or owner to add a child.');
 state.childModalOpen=true;state.childForm={name:'',date_of_birth:'',sex:''};render();
}
function childModal(){
 const f=state.childForm||{};
 return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">Child profile</span><h2>Add a child</h2></div><button class="icon-btn" onclick="closeChildModal()">×</button></div><p class="muted">Birthday and sex are stored on the child profile so children can be grouped appropriately later. Both are optional for now.</p><div class="label">Child name</div><input class="input" id="childNameForm" value="${esc(f.name)}" placeholder="Alex" maxlength="80"><div class="label" style="margin-top:12px">Birthday</div><input class="input" id="childDobForm" type="date" value="${esc(f.date_of_birth)}"><div class="label" style="margin-top:12px">Sex</div><select class="input" id="childSexForm"><option value="">Prefer not to specify</option><option value="Female" ${f.sex==='Female'?'selected':''}>Female</option><option value="Male" ${f.sex==='Male'?'selected':''}>Male</option><option value="Other" ${f.sex==='Other'?'selected':''}>Other</option></select><div class="button-row" style="margin-top:18px"><button class="btn green" onclick="saveNewChild()">Save child</button><button class="btn light" onclick="closeChildModal()">Cancel</button></div></div></div>`;
}
function closeChildModal(){state.childModalOpen=false;render()}
async function saveNewChild(){
 if(!state.authUser||!isParentLike())return toast('Parent access required.');
 const name=document.getElementById('childNameForm')?.value.trim();const dob=document.getElementById('childDobForm')?.value||null;const sex=document.getElementById('childSexForm')?.value||null;
 if(!name)return toast('Enter the child’s name.');
 if(dob){const d=new Date(dob+'T12:00:00');const now=new Date();const min=new Date(now.getFullYear()-25,now.getMonth(),now.getDate());if(Number.isNaN(d.getTime())||d>now||d<min)return toast('Enter a valid birthday.');}
 const btn=document.querySelector('.modal .btn.green');setBusy(btn,true,'Saving…');
 try{
   const q=await supabaseClient.from('children').insert({name,date_of_birth:dob,sex}).select('id,name,date_of_birth,sex,photo_url,created_by').single();
   if(q.error)throw new Error(q.error.message);
   const linked=await supabaseClient.from('parent_children').select('child_id').eq('parent_id',state.authUser.id).eq('child_id',q.data.id).maybeSingle();
   if(linked.error || !linked.data)throw new Error('Child was created but the account link was not confirmed: '+(linked.error?.message||'missing parent-child link'));
   state.children=[...(state.children||[]),q.data];state.activeChildId=q.data.id;state.pointsByChild[String(q.data.id)]=0;state.ledgerByChild[String(q.data.id)]=[];state.rewardPoints=0;state.ledger=[];state.childName=q.data.name;state.childModalOpen=false;saveLocalOnly();await loadUserData();toast('Child added');
 }catch(err){toast('Could not add child: '+err.message)}finally{setBusy(btn,false)}
}
function programSummary(pr,childId){const enrolled=isEnrolled(pr.dbId||pr.id,childId);const canJoin=isParentLike()&&childId;return `<div class="card" style="margin-bottom:10px"><button class="program-collapse" onclick="toggleProgram('${esc(pr.id)}')"><span><b>${esc(pr.name)}</b><span class="small muted">${pr.sessions} sessions • ${money(pr.price)} • ${esc(pr.venue)}</span><span class="pill" style="margin-top:6px;display:inline-block">Manager: ${esc(pr.managerName||'Program manager')}</span></span><span>${state.expandedPrograms[pr.id]?'−':'+'}</span></button>${state.expandedPrograms[pr.id]?`<div class="program-expanded"><p>${esc(pr.details||'')}</p><div class="statrow"><span>Schedule</span><b>${esc(pr.slots?.[0]?.label||pr.schedule||'Schedule TBD')}</b></div><div class="statrow"><span>Attendance payback</span><b>${money(programAttendanceTotal(pr))} on full attendance</b></div><div class="statrow"><span>Rewards</span><b>${rewardMode(pr)==='catalog'?'Manager reward catalog enabled':'No catalog rewards by default'}</b></div><div class="statrow"><span>Status</span><b>${enrolled?'Registered':'Available'}</b></div>${childId&&canJoin?`<button class="btn ${enrolled?'light':'green'}" ${enrolled?'disabled':''} onclick="enrollInProgram(${esc(pr.id)})">${enrolled?'Registered':'Join this program'}</button>`:!state.authUser?'<button class="btn green" onclick="openAuth(\'register\')">Register to join</button>':'<div class="notice">Select a child in Parent View before joining.</div>'}${childId&&enrolled?`<div class="grid compact" style="margin-top:16px"><div class="card"><b>Schedule</b><p class="muted">Upcoming sessions</p></div><div class="card"><b>History</b><p class="muted">Completed sessions</p></div><div class="card"><b>Rewards</b><p>${childPoints(childId)} points</p></div><div class="card"><b>Videos</b><p class="muted">Session recordings</p></div><div class="card"><b>Accomplishments</b><p class="muted">Progress and badges</p></div></div>`:''}</div>`:''}</div>`}

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
function attendanceRecord(pr,childId=activeChild()?.id){const key=attendanceStateKey(pr,childId);const rec=state.attendanceByProgram?.[key]||{};return {attended:Math.max(0,Number(rec.attended||0)),paybackIssued:!!rec.paybackIssued,payoutDestination:rec.payoutDestination||state.economics||'parent',paybackAmount:Number(rec.paybackAmount||programAttendanceTotal(pr)),override:!!rec.override,lastUpdated:rec.lastUpdated||null}}
function attendanceProgress(pr,childId=activeChild()?.id){const rec=attendanceRecord(pr,childId);const total=Math.max(1,Number(pr?.sessions||state.totalSessions||1));return {attended:Math.min(rec.attended,total),total,payback:programAttendanceTotal(pr),qualified:rec.attended>=total,payoutIssued:rec.paybackIssued,destination:rec.payoutDestination,override:rec.override}}
function currentTrackedProgram(){return (state.programs||[]).find(p=>p.dbId&&state.enrolledPrograms?.some(x=>String(x.program_id)===String(p.dbId))) || (state.programs||[]).find(p=>p.dbId) || (state.programs||[])[0] || null;}
function applyAttendancePayback(pr){const a=attendanceProgress(pr);return !!(a.qualified&&a.payoutIssued)}
async function setProgramAttendance(pr,attended,source='manager',childId=activeManagerChildId()){const prog=pr||currentTrackedProgram();const cid=childId||activeChild()?.id;if(!prog||!cid||!supabaseClient)return toast('Select a program and child first.');if(source==='manager'&&!['manager','owner'].includes(state.authRole))return toast('Manager access required.');const total=Math.max(0,Number(prog.sessions||0));const n=Math.max(0,Math.min(total,Math.floor(Number(attended)||0)));const q=await supabaseClient.from('attendance_overrides').upsert({program_id:prog.dbId||prog.id,child_id:cid,attended_count:n,reason:'Manager adjustment',updated_by:state.authUser.id}, {onConflict:'program_id,child_id'});if(q.error)return toast('Could not save attendance: '+q.error.message);await loadUserData();toast(`Attendance updated to ${n}/${total}.`);render();}
async function kidCheckIn(){const p=currentTrackedProgram();const c=activeChild();if(!p||!c)return toast('No enrolled program.');const s=currentSessionForProgram(p);if(!s||!isUuid(String(s.id||s.dbId)))return toast('No database session is available for today.');const already=state.attendedSessionDates?.[attendanceStateKey(p,c.id)]?.[s.date];if(already)return toast('Already checked in for this session.');const q=await supabaseClient.from('session_checkins').insert({session_id:s.id||s.dbId,child_id:c.id,source:'kid'}).select('id,session_id,child_id,checked_in_at').single();if(q.error){if(q.error.code==='23505')return toast('Already checked in for this session.');return toast('Could not check in: '+q.error.message)}await loadUserData();toast('Checked in');render();}
function managerProgramCard(pr){const key='mgr-'+pr.id,sessions=(state.managerSessions||state.sessions||[]).filter(s=>String(s.programId)===String(pr.dbId||pr.id)),expanded=!!state.expandedPrograms[key],a=attendanceProgress(pr,activeManagerChildId());const kids=(state.managerChildren||[]).filter(c=>isManagerEnrolled(pr.dbId||pr.id,c.id));if(kids.length&&!kids.some(c=>String(c.id)===String(state.activeManagerChildId)))state.activeManagerChildId=kids[0].id;return `<div class="card" style="margin-bottom:10px"><button class="program-collapse" onclick="setManagerProgram('${esc(pr.dbId||pr.id)}')"><span><b>${esc(pr.name)}</b><span class="small muted">${pr.sessions} sessions • ${money(pr.price)} • ${esc(pr.venue)} • ${money(programAttendanceTotal(pr))} payback</span><span class="pill" style="margin-top:6px;display:inline-block">Manager: ${esc(pr.managerName||'Program manager')}</span></span><span>${expanded?'−':'+'}</span></button>${expanded?`<div class="program-expanded"><p>${esc(pr.details||'No description yet.')}</p><div class="statrow"><span>Schedule</span><b>${esc(pr.slots?.[0]?.label||'Schedule TBD')}</b></div><div class="statrow"><span>Planned sessions</span><b>${pr.sessions}</b></div><div class="statrow"><span>Generated sessions</span><b>${sessions.length}</b></div><div class="statrow"><span>Reward catalog</span><select class="input" style="max-width:260px" onchange="setRewardMode('${esc(pr.dbId||pr.id)}',this.value)"><option value="none" ${rewardMode(pr)==='none'?'selected':''}>No rewards (default)</option><option value="catalog" ${rewardMode(pr)==='catalog'?'selected':''}>Enabled</option></select></div><div class="statrow"><span>Attendance</span><b>${a.attended}/${a.total}${a.payoutIssued?' • payback awarded':''}</b></div><div class="notice" style="margin:12px 0"><b>Attendance control</b><div class="button-row" style="margin-top:10px">${kids.length?`<select class="input" onchange="state.activeManagerChildId=this.value;saveLocalOnly();render()">${kids.map(c=>`<option value="${esc(c.id)}" ${String(state.activeManagerChildId)===String(c.id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`:'<span class="small muted">No enrolled children loaded yet.</span>'}<input class="input" id="attendance-${pr.id}" type="number" min="0" max="${a.total}" value="${a.attended}" style="max-width:130px"><button class="btn green" onclick="setProgramAttendance(${pr.id},document.getElementById('attendance-${pr.id}').value,'manager',state.activeManagerChildId)">Save attendance</button><button class="btn light" onclick="setProgramAttendance(${pr.id},${a.total},'manager',state.activeManagerChildId)">Mark all attended</button></div></div><div class="notice" style="margin:12px 0"><b>Season points</b><div class="button-row" style="margin-top:10px"><button class="btn light" onclick="awardPoints('Enthusiasm',10,state.activeManagerChildId)">+10 Enthusiasm</button><button class="btn light" onclick="awardPoints('Teamwork',10,state.activeManagerChildId)">+10 Teamwork</button></div></div><div class="button-row" style="margin-top:10px"><button class="btn light" onclick="downloadProgramICS(${pr.id})">Add to calendar</button><button class="btn blue" onclick="generateSessions(${pr.id})">Generate sessions</button></div><div class="catalog" style="margin-top:14px">${sessions.map(s=>`<div class="session-admin-row"><div><b>${esc(s.name)}</b><div class="small muted">${esc(s.date)} • ${esc(s.start)}–${esc(s.end)} • ${esc(s.venue)}</div></div><span class="pill">${esc(s.status)}</span></div>`).join('')||'<div class="notice">No sessions generated yet.</div>'}</div></div>`:''}</div>`}

function rewardManager(){return `<div class="card" style="margin-top:20px" id="rewardManagerForm"><h3>My Reward Catalog</h3><p class="muted">Catalog rewards are OFF by default per program. Kids can still earn enthusiasm and teamwork points.</p><div class="formgrid"><div><div class="label">Reward</div><input class="input" id="rName" placeholder="Sports Drink" maxlength="100"></div><div><div class="label">Points cost</div><input class="input" id="rCost" type="number" value="5" min="1" max="100000"></div><div class="full"><div class="label">Description</div><input class="input" id="rDesc" placeholder="Cold drink after practice" maxlength="240"></div><div class="full"><div class="label">Picture (optional)</div><input class="input" id="rImage" type="file" accept="image/png,image/jpeg,image/webp" onchange="previewRewardImage(event)">${state.rewardImagePreview?`<div style="margin-top:8px"><img src="${state.rewardImagePreview}" alt="Reward preview" style="width:84px;height:84px;object-fit:cover;border-radius:12px;display:block"><button class="btn light" type="button" style="margin-top:6px" onclick="resetTransientRewardImage();render()">Remove picture</button></div>`:''}</div></div><button class="btn green" style="margin-top:12px" onclick="addReward()">Add reward</button><div class="catalog">${(state.rewards||[]).map(r=>`<div class="catalog-row"><div class="thumb">${r.image?`<img src="${esc(r.image)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px">`:(r.icon||'🎁')}</div><div><b>${esc(r.name)}</b><div class="small muted">${esc(r.description)}</div></div><strong>${Number(r.cost)||0} pts</strong></div>`).join('')||'<div class="notice">No rewards in this catalog yet.</div>'}</div></div>`}

function showProgramForm(){const x=document.getElementById('programForm');if(x)x.style.display='block'}
function hideProgramForm(){const x=document.getElementById('programForm');if(x)x.style.display='none'}
async function generateSessions(pid){const p=state.programs.find(x=>x.id===pid);if(!p||!supabaseClient)return toast('Program or Supabase connection missing.');const dates=plannedDatesForProgram(p);const existing=(state.sessions||[]).filter(s=>String(s.programId||s.program)===String(p.dbId||p.id));const existingDates=new Set(existing.map(s=>s.date));const parsed=parseScheduleInput(p.slots?.[0]?.label||p.schedule||'');if(!parsed)return toast('Program schedule needs a valid weekday/time.');const rows=dates.filter(d=>!existingDates.has(d)).map(iso=>({name:p.name,sport:p.sport,session_date:iso,start_time:parsed.start,end_time:parsed.end,status:'Committed',description:p.details,max_players:p.slots?.[0]?.capacity||12,program_id:p.dbId||null,venue_id:p.venueId||null}));if(!rows.length)return toast('All planned sessions already exist.');const {data,error}=await supabaseClient.from('sessions').insert(rows).select();if(error)return toast('Could not generate sessions: '+error.message);state.sessions=[...(state.sessions||[]),...(data||[]).map(s=>({id:s.id,dbId:s.id,name:s.name,sport:s.sport,date:s.session_date,start:s.start_time,end:s.end_time,status:String(s.status||'Committed').toLowerCase(),description:s.description,maxPlayers:s.max_players,programId:s.program_id,program:p.name,venue:p.venue}))];saveLocalOnly();toast(`${data.length} sessions created from the weekly planner.`);render()}


// ---- Canonical Daily Roll UI / behavior ----
function shell(content){return `<header class="topbar"><div class="brand"><div class="brand-mark">⚽</div>The Daily Roll <span class="small" style="opacity:.55">v10.4</span></div><nav class="nav">${state.authUser?['parent','kid',...(state.authRole==='manager'||state.authRole==='owner'?['manager']:[])].map(v=>`<button class="${state.view===v?'active':''}" onclick="setView('${v}')">${v[0].toUpperCase()+v.slice(1)} View</button>`).join(''):''}<button class="${state.view==='sales'?'active':''}" onclick="setView('sales')">Join a Program</button></nav><div style="display:flex;align-items:center;gap:8px">${authButtons()}</div></header><main class="wrap">${simulationBar()}${content}</main><div class="footer">The Daily Roll • Play • Improve • Earn</div>${state.privacyOpen===true?privacyModal():''}${renderModalSpecial()||''}${state.childModalOpen?childModal():''}${state.authMode?authModal():''}`}
function render(){const root=document.getElementById('app');if(!root)return;let content;if(state.view==='manager'&&(!state.authUser||!(state.authRole==='manager'||state.authRole==='owner')))content=authRequired();else if((state.view==='parent'||state.view==='kid')&&!state.authUser)content=authRequired();else content=state.view==='sales'?sales():state.view==='parent'?parent():state.view==='kid'?kid():manager();root.innerHTML=shell(content)}
function sales(){const programs=publicPrograms();return `<section class="hero"><div><span class="pill">Kids sports programs</span><h1>Kids play.<br>Kids improve.<br>Kids earn.</h1><p>Choose a program, see the manager, add your child and join.</p><button class="btn green" onclick="document.getElementById('programs').scrollIntoView({behavior:'smooth'})">See available programs</button></div><div class="hero-card"><div class="small">THE DAILY ROLL</div><div class="price">Play • Improve • Earn</div><p>Every program shows its manager. Each manager controls their own reward catalog.</p></div></section><div id="programs" class="section-title"><div><h2>Choose your program</h2><span class="muted">Programs are grouped by manager so parents know exactly who runs them.</span></div>${isParentLike()?'<button class="btn light" onclick="setView(\'parent\')">My children</button>':'<button class="btn light" onclick="openAuth(\'register\')">Register as parent</button>'}</div><div class="grid">${programs.length?programs.map(pr=>programSummary(pr,state.children[0]?.id)).join(''):'<div class="notice">No public programs are currently available.</div>'}</div>${state.selectedProgram?checkout(programs.find(p=>p.id===state.selectedProgram)||programs[0]):''}`}
function parent(){const kids=state.children||[],active=activeChild();return `<div class="section-title"><div><span class="pill">Parent portal${state.authRole==='owner'?' • Owner testing':''}</span><h2>Welcome, ${esc(state.parentName||'Parent')} 👋</h2><p class="muted">Manage children, enrollment and season progress.</p></div><div class="button-row"><button class="btn light" onclick="addChild()">+ Add child</button><button class="btn light" onclick="setView('sales')">Join a program</button></div></div>${kids.length?`<div class="card" style="margin-bottom:18px"><div class="label">Active child</div><select class="input" onchange="selectChild(this.value)">${kids.map(c=>`<option value="${esc(c.id)}" ${String(active?.id)===String(c.id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>`:''}${kids.length?kids.map(child=>{const enrolledIds=enrolledForChild(child.id);const enrolled=publicPrograms().filter(p=>enrolledIds.includes(String(p.dbId||p.id)));const open=!!state.expandedPrograms['child-'+child.id];const pts=childPoints(child.id);const payments=(state.payments||[]).filter(p=>String(p.child_id)===String(child.id));return `<div class="card" style="margin-bottom:18px"><button class="program-collapse" onclick="toggleProgram('child-${esc(child.id)}')"><span><b>${esc(child.name)}</b><span class="small muted">${enrolled.length} program${enrolled.length===1?'':'s'} • ${pts} points</span></span><span>${open?'−':'+'}</span></button>${open?`<div class="program-expanded"><div class="statrow"><span>Birthday</span><b>${child.date_of_birth?esc(fmtDate(child.date_of_birth)):'Not provided'}</b></div><div class="statrow"><span>Sex</span><b>${esc(child.sex||'Not specified')}</b></div>${enrolled.length?enrolled.map(pr=>programSummary(pr,child.id)).join(''):'<div class="notice">This child is not registered in a program yet.</div>'}${payments.length?`<div class="notice" style="margin-top:14px"><b>Payment history</b>${payments.slice(0,3).map(pm=>`<div class="statrow"><span>${esc(pm.method)} • ${esc(pm.status)}</span><b>${money(pm.amount)}</b></div>`).join('')}</div>`:''}<div class="grid compact" style="margin-top:14px"><div class="card"><b>Schedule</b><p class="muted">Upcoming sessions</p>${enrolled.map(x=>`<button class="btn light" style="margin-top:8px" onclick="downloadProgramICS(${x.id})">Add ${esc(x.name)} to calendar</button>`).join('')}</div><div class="card"><b>History</b><p class="muted">Attendance and past sessions</p></div><div class="card"><b>Rewards</b><p>${pts} points</p><p class="small muted">Earned ${childLedger(child.id).filter(x=>x.amount>0).reduce((a,x)=>a+Number(x.amount||0),0)} • Spent ${Math.abs(childLedger(child.id).filter(x=>x.amount<0).reduce((a,x)=>a+Number(x.amount||0),0))}</p></div><div class="card"><b>Videos</b><p class="muted">Session recordings</p></div><div class="card"><b>Accomplishments</b><p class="muted">Progress and badges</p></div></div></div>`:''}</div>`}).join(''):'<div class="card"><div class="notice">No children yet. Click <b>+ Add child</b> to get started.</div></div>'}`}
function kid(){const child=activeChild();const enrolled=publicPrograms().filter(p=>child&&isEnrolled(p.dbId||p.id,child.id));const pr=child&&activeProgramForChild(child.id);const a=pr?attendanceProgress(pr,child.id):{attended:0,total:0,payback:0,qualified:false,payoutIssued:false,destination:'parent'};const session=pr&&currentSessionForProgram(pr);const key=session&&String(session.id||session.dbId);const voted=key&&state.userVotesBySession[key];const candidates=(pr?teamChildrenForProgram(pr.dbId||pr.id):(state.managerChildren||[])).filter(c=>String(c.id)!==String(child?.id));return `<div class="section-title"><div><span class="pill">Kid view</span><h2>Hey ${esc(child?.name||state.childName||'Player')}! 👋</h2><p class="muted">${fmtDate(simulationDate())} • Your programs, attendance, teamwork and enthusiasm.</p></div></div><div class="card"><button class="program-collapse" onclick="toggleProgram('kid-programs')"><span><b>My programs</b><span class="small muted">${enrolled.length} registered</span></span><span>${state.expandedPrograms['kid-programs']?'−':'+'}</span></button>${state.expandedPrograms['kid-programs']?`<div class="program-expanded">${enrolled.map(pr=>programSummary(pr,child.id)).join('')||'<div class="notice">No programs are registered yet.</div>'}</div>`:''}</div><div class="grid"><div class="card checkin-card"><h3>Session</h3><div class="big-check">✓</div><b>${session?'Session day':'No session today'}</b><div class="statrow" style="margin-top:10px"><span>Attendance</span><b>${a.attended}/${a.total}</b></div><button class="btn light" onclick="kidCheckIn()">${session?'Check in for this session':'Check in unavailable'}</button></div><div class="card"><h3>Rewards wallet</h3><div class="money">${childPoints(child?.id)} ⭐</div><p class="muted">1 point = $1</p><div class="statrow"><span>Attendance payback</span><b>${a.payback?(a.payoutIssued?(a.destination==='kid'?`+${a.payback} ⭐`:`${money(a.payback)} to parent`):`${money(a.payback)} pending`):'None allocated'}</b></div><div class="small muted" style="margin-top:8px">Kids can earn points for <b>enthusiasm</b> and <b>teamwork</b> even when a program has no reward catalog.</div>${rewardMode(pr)==='catalog'?`<button class="btn green" style="margin-top:12px" onclick="openSpend()">Spend catalog points</button>`:'<div class="notice" style="margin-top:12px">No reward catalog is enabled for this program.</div>'}</div><div class="card"><h3>🏆 MVP voting</h3><p class="muted">${session?'Vote for the teammate who tried the hardest today.':'Voting opens on session days.'}</p>${session?candidates.map(x=>`<button class="vote-card ${state.currentVote===x.name?'selected':''} ${voted===x.name?'selected':''}" ${voted?'disabled':''} onclick="castVote('${esc(x.name)}')"><b>${esc(x.name)}</b></button>`).join(''):''}<button class="btn blue" style="margin-top:12px;width:100%" ${(!state.currentVote||voted||!session)?'disabled':''} onclick="submitVote()">${voted?'Vote submitted':'Submit vote'}</button></div></div>`}

function managerPayments(){const rows=state.managerPayments||[];if(!rows.length)return `<div class="card" style="margin-top:20px"><h3>Payments</h3><div class="notice">No payments yet.</div></div>`;return `<div class="card" style="margin-top:20px"><h3>Payments</h3><div class="catalog">${rows.map(p=>{const child=(state.managerChildren||[]).find(c=>String(c.id)===String(p.child_id));const prog=(state.programs||[]).find(x=>String(x.dbId)===String(p.program_id));return `<div class="catalog-row"><div><b>${esc(child?.name||'Child')}</b><div class="small muted">${esc(prog?.name||'Program')} • ${esc(p.method)} • ${money(p.amount)} • ${esc(p.status)}</div></div>${p.status==='pending'?`<button class="btn green" onclick="confirmCashEmtPayment('${esc(p.id)}')">Mark received</button>`:'<span class="pill">Confirmed</span>'}</div>`}).join('')}</div></div>`}
async function confirmCashEmtPayment(paymentId){if(!state.authUser||!(state.authRole==='manager'||state.authRole==='owner'))return toast('Manager access required.');const q=await supabaseClient.rpc('confirm_cash_emt_payment',{p_payment_id:paymentId});if(q.error)return toast('Could not confirm payment: '+q.error.message);await loadUserData();toast('Payment confirmed and enrollment activated.');render();}

function manager(){const programs=(state.programs||[]).filter(p=>p.name!=='Saturday Soccer — U10');return `<div class="section-title"><div><span class="pill">${isOwner()?'Owner / manager':'Manager'}</span><h2>Program Builder</h2><p class="muted">Programs stay permanent. Weekly planning determines the sessions underneath them.</p></div><button class="btn green" onclick="showProgramForm()">+ Add Program</button></div><div id="programForm" class="card" style="display:none;margin-bottom:18px"><h3>New program</h3><div class="formgrid"><div><div class="label">Program name</div><input class="input" id="mName" placeholder="Tuesday Skills — U8/U10"></div><div><div class="label">Sport</div><input class="input" id="mSport" placeholder="Soccer"></div><div><div class="label">Location</div><div style="display:flex;gap:8px"><input class="input" id="mVenue" placeholder="Search a real venue"><button class="btn light" type="button" onclick="searchRealLocation()">Search</button></div><div id="locationResults" class="catalog" style="margin-top:8px"></div></div><div><div class="label">Price</div><input class="input" id="mPrice" type="number" value="500" min="0"></div><div><div class="label">Attendance payback</div><input class="input" id="mAttendancePayback" type="number" value="100" min="0"><div class="small muted">Total payback for completing every session. Example: $100 total on an $500 program.</div></div><div><div class="label">Number of sessions</div><input class="input" id="mSessionCount" type="number" value="8" min="1" max="52" oninput="updateSchedulePlanner()"></div><div><div class="label">Spots</div><input class="input" id="mSpots" type="number" value="12" min="1" max="500"></div><div><div class="label">First session date</div><input class="input" id="mFirstDate" type="date" value="${new Date().toISOString().slice(0,10)}" onchange="updateSchedulePlanner()"></div><div class="full"><div class="label">Schedule</div><input class="input" id="mSchedule" placeholder="Tuesday 5–6 PM" oninput="updateSchedulePlanner()"><div class="small muted">Forgiving input: Tuesday 5–6 PM, Tuesdays 5:00–6:00 PM, Tue 17:00–18:00.</div></div><div class="full"><div id="schedulePlanner" class="schedule-planner"><div class="notice">Enter a schedule and first date to see the weekly planner.</div></div></div><div class="full"><div class="label">Details</div><textarea class="input" id="mDetails" rows="3" placeholder="Technical skills, movement and game play."></textarea></div><div class="full"><div class="label">Rewards</div><select class="input" id="mRewardMode"><option value="none">No rewards (default)</option><option value="catalog">Enable manager reward catalog</option></select><div class="small muted">Even with no catalog, kids can still earn points for enthusiasm and teamwork.</div></div></div><div class="button-row"><button class="btn green" onclick="addProgram()">Create program</button><button class="btn light" onclick="hideProgramForm()">Cancel</button></div></div>${programs.length?programs.map(p=>managerProgramCard(p)).join(''):'<div class="notice">No programs created yet.</div>'}${programs.length?programs.map(p=>mvpTable(p)).join(''):''}${rewardManager()}${managerPayments()}${isOwner()?ownerPeoplePanel():''}`}
async function addProgram(){
 const name=document.getElementById('mName')?.value.trim(); if(!name)return toast('Enter a program name.');
 const scheduleText=document.getElementById('mSchedule')?.value.trim(),parsed=parseScheduleInput(scheduleText); if(!parsed)return toast('Enter a schedule like Tuesday 5–6 PM.');
 const firstDate=document.getElementById('mFirstDate')?.value; const count=Math.max(1,Math.min(52,Number(document.getElementById('mSessionCount')?.value)||8)); if(!firstDate)return toast('Choose the first session date.');
 if(!supabaseClient||!state.authUser||!(state.authRole==='manager'||state.authRole==='owner'))return toast('Approved manager access is required.');
 const sport=document.getElementById('mSport')?.value.trim()||'Sports',price=Math.max(0,Number(document.getElementById('mPrice')?.value)||0),attendancePayback=Math.max(0,Number(document.getElementById('mAttendancePayback')?.value)||0),spots=Math.max(1,Math.min(500,Math.floor(Number(document.getElementById('mSpots')?.value)||12))),details=document.getElementById('mDetails')?.value.trim()||'',rewardModeValue=document.getElementById('mRewardMode')?.value||'none';
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

// ---- v10 product hardening / testing flow ----
async function awardPoints(kind,amount=10,childId=activeManagerChildId()){
 const child=state.managerChildren?.find(c=>String(c.id)===String(childId));const id=child?.id||childId;if(!id)return toast('No child is selected for this points award.');
 const p=state.programs?.find(pr=>String(pr.dbId)===String(state.managerProgramId||''))||currentManagerProgramForChild(id); if(!p)return toast('Select a program with an enrolled child first.');
 const n=Math.max(1,Math.floor(Number(amount)||10));const sourceKey=`award-${crypto.randomUUID()}`;
 const q=await supabaseClient.from('points_ledger').insert({child_id:id,program_id:p.dbId,manager_id:state.authUser.id,amount:n,description:`${kind} bonus`,type:'earned',source_key:sourceKey});
 if(q.error)return toast('Could not award points: '+q.error.message);
 await loadUserData();toast(`+${n} points for ${kind}`);render();
}
function currentManagerProgramForChild(childId){const cid=String(childId||'');return (state.programs||[]).find(p=>isManagerEnrolled(p.dbId||p.id,cid))||state.programs?.[0]||null}
function setManagerProgram(programId){state.managerProgramId=programId;const kids=(state.managerChildren||[]).filter(c=>isManagerEnrolled(programId,c.id));if(kids.length&&!kids.some(c=>String(c.id)===String(state.activeManagerChildId)))state.activeManagerChildId=kids[0].id;saveLocalOnly();render();}

function downloadProgramICS(p){const dates=plannedDatesForProgram(p);const parsed=parseScheduleInput(p.slots?.[0]?.label||p.schedule||'');if(!dates.length||!parsed)return toast('No scheduled sessions available yet.');const esc=x=>String(x||'').replace(/([,;\\])/g,'\\$1').replace(/\n/g,'\\n');const events=dates.map((d,i)=>`BEGIN:VEVENT\r\nUID:${esc((p.dbId||p.id)+'-'+d)}@thedailyroll.ca\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}\r\nDTSTART:${d.replace(/-/g,'')}T${parsed.start.replace(':','')}00\r\nDTEND:${d.replace(/-/g,'')}T${parsed.end.replace(':','')}00\r\nSUMMARY:${esc(p.name)}\r\nLOCATION:${esc(p.venue)}\r\nDESCRIPTION:${esc(`The Daily Roll • ${state.childName||'Child'} • ${p.sport||''}`)}\r\nEND:VEVENT`).join('\r\n');const ics=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//The Daily Roll//Program Calendar//EN\r\nCALSCALE:GREGORIAN\r\n${events}\r\nEND:VCALENDAR`;const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${p.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-schedule.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Calendar file downloaded.')}
function rewardCatalogForProgram(p){if(!p||rewardMode(p)!=='catalog')return [];return (state.rewards||[]).filter(r=>!p.managerId||String(r.managerId)===String(p.managerId))}
state.simulationOffsetDays = Number(state.simulationOffsetDays||0);
state.simulationBaseDate = state.simulationBaseDate || new Date().toISOString().slice(0,10);
state.votesBySession = state.votesBySession || {};
state.userVotesBySession = state.userVotesBySession || {};
state.publishedMVPBySession = state.publishedMVPBySession || {};
state.rewardModeByProgram = state.rewardModeByProgram || {};
state.locationSearch = state.locationSearch || [];
state.scheduleDraft = state.scheduleDraft || {};

function simulationDate(){const d=new Date(state.simulationBaseDate+'T12:00:00');d.setDate(d.getDate()+Math.max(0,state.simulationOffsetDays));return d.toISOString().slice(0,10)}
function fmtDate(iso){return new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',year:'numeric'}).format(new Date(iso+'T12:00:00'))}
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
function currentSessionForProgram(p){const sim=simulationDate();const list=(state.sessions||[]).filter(s=>String(s.programId||'')===String(p?.dbId||''));return list.find(s=>s.date===sim&&s.status!=='cancelled')||null}
function currentSessionKey(p){const s=currentSessionForProgram(p);return s?String(s.id||s.dbId):null}
function simulationBar(){if(!state.authUser)return '';const base=state.simulationBaseDate;return `<div class="card simulation-bar"><div><b>Demo clock</b><span class="small muted">${fmtDate(simulationDate())} • ${state.simulationOffsetDays} day${state.simulationOffsetDays===1?'':'s'} from ${fmtDate(base)}</span></div><input aria-label="Simulate days" type="range" min="0" max="120" value="${state.simulationOffsetDays}" oninput="setSimulationDays(this.value)"><div class="button-row"><button class="btn light" onclick="setSimulationDays(0)">Reset</button><button class="btn light" onclick="setSimulationDays(${Math.min(120,state.simulationOffsetDays+7)})">+7 days</button></div></div>`}
function setSimulationDays(n){state.simulationOffsetDays=Math.max(0,Math.min(120,Number(n)||0));state.currentCheckinDate=null;state.userVote=null;saveLocalOnly();render()}
function paymentPreferenceLabel(){return state.paymentMethod==='stripe'?'Credit card':'Cash / EMT'}

function isParentLike(){return state.authRole==='parent'||state.authRole==='owner'}
function rewardMode(pr){return (pr?.rewardsEnabled===true || state.rewardModeByProgram[String(programDbId(pr))]==='catalog')?'catalog':'none'}
async function setRewardMode(pid,mode){
 const p=(state.programs||[]).find(x=>String(x.id)===String(pid)||String(x.dbId)===String(pid)); if(!p||!supabaseClient)return toast('Program not found.');
 const enabled=mode==='catalog';
 const q=await supabaseClient.from('programs').update({rewards_enabled:enabled}).eq('id',p.dbId||p.id);
 if(q.error)return toast('Could not update rewards: '+q.error.message);
 p.rewardsEnabled=enabled; state.rewardModeByProgram[String(p.dbId||p.id)]=enabled?'catalog':'none'; saveLocalOnly(); render();
}


async function processSelectedPayment(){const p=(state.programs||[]).find(x=>x.id===state.selectedProgram)||currentTrackedProgram();if(!p)return toast('Choose a program first.');if(state.paymentMethod==='stripe'){return startStripeCheckout(p)}completePurchase(state.paymentMethod);}





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
function selectChild(childId){const c=currentChildForId(childId);if(!c)return;state.activeChildId=c.id;state.childName=c.name;state.rewardPoints=childPoints(c.id);state.ledger=childLedger(c.id);saveLocalOnly();render()}

function extractDatesFromSchedule(schedule){
  const s=String(schedule||''); return [...s.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(m=>m[1]);
}
function managerRewardChild(){return activeManagerChildId()}
function activeManagerChildId(){
  const id=state.activeManagerChildId||state.managerChildren?.[0]?.id; if(id)state.activeManagerChildId=id; return id||null;
}
















(async function boot(){
 if(appBooted)return;appBooted=true;render();await initSupabase();if(!supabaseClient)return;try{const {data}=await supabaseClient.auth.getSession();if(data?.session?.user){await setAuthenticatedUser(data.session.user);await handleStripeReturn();render()}else{state.authUser=null;state.authRole=null;render()}supabaseClient.auth.onAuthStateChange(async (_event,session)=>{if(session?.user){await setAuthenticatedUser(session.user);render()}else{state.authUser=null;state.authRole=null;state.children=[];state.enrolledPrograms=[];render()}})}catch(err){console.error('Auth bootstrap failed:',err)}})();
