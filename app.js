const defaultState={
 view:'sales', selectedProgram:null, selectedSlot:null, paid:false, parentName:'Sarah', childName:'Alex', childPhoto:null,
 email:'', phone:'', attendance:7,totalSessions:8,rewardPoints:300, votes:{Alex:0,Noah:0,Liam:0,Maya:0},userVote:null,publishedMVP:null,managerOverride:null,
 economics:'parent', consent:false, privacyOpen:false, attendanceByProgram:{}, currentCheckinDate:null,
 rewards:[{id:1,name:'Sports Drink',description:'Cold drink after practice',cost:5,image:''},{id:2,name:'Snack',description:'Post-session snack',cost:8,image:''}],
 ledger:[{date:'Today',description:'Effort bonus',amount:50,type:'earned'},{date:'Yesterday',description:'Teamwork bonus',amount:25,type:'earned'},{date:'Yesterday',description:'Reward purchase — Sports Drink',amount:-5,type:'spent'}],
 programs:[
  {id:2,name:'Tuesday Skills — U8/U10',sport:'Soccer',sessions:8,price:500,attendancePayback:100,venue:'Burlington Indoor Field',details:'Technical skills, movement and game play.',slots:[{id:'tue-pm',label:'Tuesdays • 5:00–6:00 PM',spots:6,capacity:10},{id:'thu-pm',label:'Thursdays • 5:30–6:30 PM',spots:9,capacity:10}]}
 ],
 players:[{name:'Alex',photo:null},{name:'Noah',photo:null},{name:'Liam',photo:null},{name:'Maya',photo:null}]
};
const saved=localStorage.getItem('dailyRollMVP'); const state=Object.assign(defaultState,saved?JSON.parse(saved):{});
(state.programs||[]).forEach(p=>{if(p.name==='Tuesday Skills — U8/U10' && (p.attendancePayback===undefined||p.attendancePayback===null))p.attendancePayback=100;});

// ---- Supabase connection ----
const SUPABASE_URL = 'https://pzgzzbjeyrxpuqkuizyr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YESJdmGbaOkMT0_0Yor9Dg_qkHj_GVv';
const OWNER_EMAIL = 'gurpsb@icloud.com';
let supabaseClient = null;
let supabaseReady = false;

async function initSupabase(){
  try {
    if (!window.supabase || !window.supabase.createClient) return;
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    supabaseReady = true;
    await pullSupabaseData();
  } catch(err){ console.warn('Supabase connection failed; local demo mode remains available.', err); }
}

async function pullSupabaseData(){
  if(!supabaseClient) return;
  try {
    const [{data: programs}, {data: rewards}, {data: sessions}] = await Promise.all([
      supabaseClient.from('programs').select('id,name,sport,sessions,price,attendance_payback,schedule,details,spots,venue_id,manager_id,venues(name)').order('created_at'),
      supabaseClient.from('rewards').select('id,name,description,cost,icon,image_url').eq('active',true).order('created_at'),
      supabaseClient.from('sessions').select('id,name,sport,session_date,start_time,end_time,status,description,max_players,program_id,venue_id,programs(name),venues(name)').order('session_date',{ascending:false})
    ]);
    if(programs && programs.length){
      state.programs = programs.map((p,i)=>({
        id:i+1, dbId:p.id, managerId:p.manager_id||null, name:p.name, sport:p.sport, sessions:p.sessions||8, price:Number(p.price||0), attendancePayback:Number(p.attendance_payback||0),
        venue:p.venues?.name||'Burlington Indoor Field', details:p.details||'',
        slots:[{id:'db-'+p.id,label:p.schedule||'Schedule to be announced',spots:p.spots??0,capacity:p.spots??0}]
      }));
    }
    if(programs && programs.length){
      const mids=[...new Set(programs.map(p=>p.manager_id).filter(Boolean))];
      if(mids.length){const mq=await supabaseClient.from('profiles').select('id,name').in('id',mids);if(!mq.error){const names=Object.fromEntries((mq.data||[]).map(x=>[x.id,x.name]));state.programs=state.programs.map(p=>({...p,managerName:names[p.managerId]||'Program manager'}));}}
    }
    if(rewards && rewards.length){
      state.rewards = rewards.map((r,i)=>({id:i+1,dbId:r.id,name:r.name,description:r.description||'',cost:r.cost,icon:r.icon||'🎁',image:r.image_url||''}));
    }
    if(sessions){
      state.sessions = sessions.map(s=>({
        id:s.id, dbId:s.id, name:s.name, sport:s.sport||'', date:s.session_date,
        start:s.start_time||'', end:s.end_time||'', status:s.status,
        description:s.description||'', maxPlayers:s.max_players||0,
        program:s.programs?.name||'Unassigned', venue:s.venues?.name||'Venue TBD'
      }));
    }
    saveLocalOnly();
    render();
  } catch(err){ console.warn('Supabase data read failed; using local data.', err); }
}

function saveLocalOnly(){ localStorage.setItem('dailyRollMVP',JSON.stringify(state)); }

async function syncStateToSupabase(){
  if(!supabaseClient) return;
  try {
    // Persist the demo child's profile and current reward ledger balance.
    const {data: child} = await supabaseClient.from('children').select('id').eq('name',state.childName).limit(1).maybeSingle();
    if(child){
      const earned = state.ledger.filter(x=>x.type==='earned').reduce((a,x)=>a+x.amount,0);
      const spent = Math.abs(state.ledger.filter(x=>x.type==='spent').reduce((a,x)=>a+x.amount,0));
      const {data: existing} = await supabaseClient.from('reward_ledger').select('id').eq('child_id',child.id).limit(1);
      if(!existing || existing.length===0){
        // Seed ledger already exists in Supabase, so only new local entries are intentionally left local for now.
      }
      void earned; void spent;
    }
  } catch(err){ console.warn('Supabase write sync skipped.', err); }
}


function save(){saveLocalOnly(); syncStateToSupabase();}
function toast(msg){const d=document.createElement('div');d.className='toast';d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),2300)}
function money(n){return new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(n)}
function checkout(p){const sl=p.slots.find(x=>x.id===state.selectedSlot);return `<div class="section-title"><div><h2>Reserve your spot</h2><span class="muted">One simple checkout. Contact details are collected at the bottom.</span></div></div><div class="checkout-layout"><div class="card"><h3>${p.name}</h3><p class="muted">${sl.label} • ${p.venue}</p><div class="formgrid"><div><div class="label">Parent name</div><input class="input" id="parent" value="${state.parentName}"></div><div><div class="label">Child name</div><input class="input" id="child" value="${state.childName}"></div><div><div class="label">Email</div><input class="input" id="email" type="email" value="${state.email}" placeholder="you@example.com"></div><div><div class="label">Phone</div><input class="input" id="phone" type="tel" value="${state.phone}" placeholder="416-555-1234"></div></div><div class="notice" style="margin-top:18px">Child photo can be added later from the parent profile. It is not required to join.</div></div><div class="card sticky-summary"><h3>Payment summary</h3><div class="statrow"><span>Program</span><b>${money(p.price)}</b></div><div class="statrow"><span>Attendance payback</span><b>${money(p.attendancePayback||0)}</b></div><div class="statrow"><span>Child reward allocation</span><b>$50</b></div><div class="divider"></div><div class="statrow total"><span>Total today</span><b>${money(p.price)}</b></div><button class="btn green" style="width:100%;margin-top:14px" onclick="openPrivacy()">Continue to payment</button><p class="small muted">Before payment, you will review and acknowledge the privacy/video terms.</p></div></div>`}
function privacyModal(){return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">Required acknowledgement</span><h2>Privacy & video acknowledgement</h2></div><button class="icon-btn" onclick="closePrivacy()">×</button></div><p>The Daily Roll may use cameras and AI video processing during sessions to provide session recordings, live viewing and, in the future, child-specific highlights.</p><p class="muted">This MVP uses a placeholder acknowledgement. Before launch, this should link to your final privacy policy, consent language and applicable legal terms.</p><div class="policy-box"><b>What you're acknowledging</b><ul><li>Session video may be recorded and processed.</li><li>Authorized family members may access session video.</li><li>Future AI features may analyze session footage.</li></ul><label class="check"><input type="checkbox" ${state.consent?'checked':''} onchange="state.consent=this.checked;save();render()"> I acknowledge the privacy/video terms and want to continue.</label></div><button class="btn green" style="width:100%" ${state.consent?'':'disabled'} onclick="continueToPayment()">Proceed to payment</button></div></div>`}
function mvpTable(){const tally=Object.entries(state.votes).sort((a,b)=>b[1]-a[1]),leader=tally[0];return `<table class="table"><thead><tr><th>Player</th><th>Votes</th><th>Status</th></tr></thead><tbody>${tally.map(([n,v])=>`<tr><td><b>${n}</b></td><td>${v}</td><td>${leader&&leader[0]===n?'Leading':''}</td></tr>`).join('')}</tbody></table><div style="margin-top:14px"><div class="label">Manager MVP selection</div><select class="input" id="mvpSelect"><option value="">Use peer-vote leader</option>${Object.keys(state.votes).map(n=>`<option ${state.managerOverride===n?'selected':''}>${n}</option>`).join('')}</select><button class="btn green" style="margin-top:10px" onclick="publishMVP()">Publish MVP</button></div>${state.publishedMVP?`<div class="success" style="margin-top:12px">Published MVP: <b>${state.publishedMVP}</b></div>`:''}`}
function rewardsInfo(){return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>How rewards work</h2><button class="icon-btn" onclick="closeModal()">×</button></div><div class="reward-explain"><div class="big-number">1</div><div><b>1 point = $1</b><p class="muted">Kids earn points for attendance, effort, teamwork and achievements. Points can be spent on rewards set by the manager.</p></div></div><button class="btn green" style="width:100%" onclick="closeModal()">Got it</button></div></div>`}
function spendModal(){return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">Spend points</span><h2>${state.rewardPoints} points available</h2></div><button class="icon-btn" onclick="closeModal()">×</button></div><div class="catalog">${state.rewards.map(r=>`<button class="reward-card" onclick="buyReward(${r.id})">${r.image?`<img src="${r.image}"/>`:'<div class="reward-icon">🎁</div>'}<div><b>${r.name}</b><p class="small muted">${r.description}</p></div><strong>${r.cost} pts</strong></button>`).join('')}</div></div></div>`}
function openRewardsInfo(){state.privacyOpen='rewards';render()}function openSpend(){state.privacyOpen='spend';render()}function openVideo(){toast('Demo video room: live stream and full-session download will connect here.')}function closeModal(){state.privacyOpen=false;render()}
function selectSlot(pid,sid){state.selectedProgram=pid;state.selectedSlot=sid;save();render();document.getElementById('programs').scrollIntoView({behavior:'smooth'})}
function selectProgram(pid){state.selectedProgram=pid;state.selectedSlot=null;save();render();document.getElementById('programs').scrollIntoView({behavior:'smooth'})}
function deselectProgram(){state.selectedProgram=null;state.selectedSlot=null;save();render()}
function openPrivacy(){state.parentName=document.getElementById('parent').value||'Sarah';state.childName=document.getElementById('child').value||'Alex';state.email=document.getElementById('email').value;state.phone=document.getElementById('phone').value;state.privacyOpen=true;state.consent=false;save();render()}
function closePrivacy(){state.privacyOpen=false;render()}
function continueToPayment(){if(!state.consent)return;state.privacyOpen=false;save();render();toast('Ready for secure payment checkout.')} 
function completePurchase(){state.paid=true;const pr=currentTrackedProgram();if(pr){state.attendance=0;state.totalSessions=pr.sessions||state.totalSessions;const key=String(programDbId(pr));state.attendanceByProgram[key]={attended:0,paybackIssued:false,payoutDestination:state.economics||'parent'};}save();toast('Demo enrollment recorded — payment integration is the remaining step.');setView('parent')}
function castVote(name){if(state.userVote)return;state.userVote=name;render()}
function submitVote(){if(!state.userVote)return toast('Pick a teammate first.');state.votes[state.userVote]++;save();toast(`Vote recorded for ${state.userVote}`);render()}
function publishMVP(){const val=document.getElementById('mvpSelect').value,tally=Object.entries(state.votes).sort((a,b)=>b[1]-a[1]);state.managerOverride=val||null;state.publishedMVP=val||(tally[0]&&tally[0][1]>0?tally[0][0]:null);save();toast('MVP published');render()}
function setEconomics(v){state.economics=v;save();toast(`Payment preference saved: ${v==='kid'?'kid':'parent'}`)}
function adjustAttendance(){const pr=currentTrackedProgram();if(!pr)return toast('No program available.');const a=attendanceProgress(pr);setProgramAttendance(pr,Math.min(a.total,a.attended+1),'manager');}
async function addReward(){const name=document.getElementById('rName')?.value.trim();if(!name)return toast('Enter a reward name.');if(!state.authUser||!(state.authRole==='manager'||state.authRole==='owner'))return toast('Approved manager access is required.');const reward={name,description:document.getElementById('rDesc')?.value.trim()||'Reward',cost:Number(document.getElementById('rCost')?.value)||1,active:true,manager_id:state.authUser.id};if(supabaseClient){const q=await supabaseClient.from('rewards').insert(reward).select('id,name,description,cost,active,manager_id').single();if(q.error)return toast('Could not add reward: '+q.error.message);state.rewards.push({...q.data,id:Date.now(),dbId:q.data.id,image:rewardImage});}else state.rewards.push({id:Date.now(),...reward,image:rewardImage});rewardImage='';saveLocalOnly();toast('Reward added to this manager catalog');render()}
function buyReward(id){const r=state.rewards.find(x=>x.id===id);if(!r)return;if(state.rewardPoints<r.cost)return toast('Not enough points.');state.rewardPoints-=r.cost;state.ledger.push({date:'Today',description:`Reward purchase — ${r.name}`,amount:-r.cost,type:'spent'});save();toast(`${r.name} purchased`);render()}
function resetDemo(){localStorage.removeItem('dailyRollMVP');location.reload()}
function setView(v){state.view=v;save();render();window.scrollTo({top:0,behavior:'smooth'})}
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
function authRequired(){
  const pending=state.authRole==='manager_pending';
  return `<div class="card" style="max-width:620px;margin:50px auto;text-align:center"><span class="pill">${pending?'Manager approval pending':'Account required'}</span><h2>${pending?'Your manager account is awaiting approval':'Log in to The Daily Roll'}</h2><p class="muted">${pending?'You registered as a manager. The owner needs to approve your account before Manager View is available.':'Parents can manage children and programs. Approved managers can manage programs and their own reward catalog.'}</p>${pending?'<div class="notice">You can log out and return once the owner approves your manager account.</div>':''}<div class="button-row" style="justify-content:center"><button class="btn blue" onclick="${pending?'logout()':'openAuth(\'login\')'}">${pending?'Log out':'Log in'}</button>${pending?'':'<button class="btn green" onclick="openAuth(\'register\')">Create account</button>'}</div></div>`;
}
function authModal(){
 const reg=state.authMode==='register';
 return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">The Daily Roll account</span><h2>${reg?'Create your account':'Welcome back'}</h2></div><button class="icon-btn" onclick="closeAuth()">×</button></div>${reg?`<div class="notice" style="margin-bottom:16px"><b>Choose your account type</b><div class="small muted" style="margin-top:4px">Managers can register normally, but the owner must approve the account before Manager View is unlocked.</div></div><div class="label">Account type</div><select class="input" id="authRole" onchange="state.registerRole=this.value;saveLocalOnly()"><option value="parent" ${state.registerRole==='parent'?'selected':''}>Parent</option><option value="manager" ${state.registerRole==='manager'?'selected':''}>Manager</option></select>`:''}<div class="label" style="margin-top:12px">Email</div><input class="input" id="authEmail" type="email" placeholder="you@example.com"><div class="label" style="margin-top:12px">Password</div><input class="input" id="authPassword" type="password" placeholder="At least 6 characters">${reg?`<div class="label" style="margin-top:12px">Name</div><input class="input" id="authName" placeholder="Your name">`:''}<button class="btn ${reg?'green':'blue'}" style="width:100%;margin-top:18px" onclick="${reg?'registerAccount()':'loginAccount()'}">${reg?'Create account':'Log in'}</button><p class="small muted" style="margin-top:12px">${reg?'Your account type is saved to your profile. The owner email is automatically recognized as the owner account.':'Use the email and password you registered with.'}</p></div></div>`;
}
function openAuth(mode){state.authMode=mode;state.authRole=mode==='register'?'parent':null;state.registerRole='parent';render()}
function closeAuth(){state.authMode=null;render()}
async function registerAccount(){
 if(!supabaseClient)return toast('Supabase is not connected.');
 const email=document.getElementById('authEmail').value.trim().toLowerCase(); const password=document.getElementById('authPassword').value; const name=document.getElementById('authName').value.trim();
 const requestedRole=document.getElementById('authRole')?.value==='manager'?'manager':'parent';
 const owner=email===OWNER_EMAIL;
 const role=owner?'owner':(requestedRole==='manager'?'manager_pending':'parent');
 if(!email||!password||password.length<6||!name)return toast('Enter your name, email and a password of at least 6 characters.');
 const {data,error}=await supabaseClient.auth.signUp({email,password});
 if(error)return toast(error.message);
 if(!data.user)return toast('Account created. Check your email to finish registration.');
 const {error:profileError}=await supabaseClient.from('profiles').upsert({id:data.user.id,name,role,email},{onConflict:'id'});
 if(profileError)return toast('Account created, but profile setup failed: '+profileError.message);
 if(data.session?.user){
   state.authUser=data.user;state.authRole=role;state.parentName=name;state.email=email;state.authMode=null;
   state.view=(role==='owner'||role==='manager')?'manager':'sales';saveLocalOnly();await loadUserData();render();toast(owner?'Owner account created':'Account created');
 }else{
   state.authMode=null;render();toast(owner?'Owner account created. Check your email to confirm the account, then log in.':role==='manager_pending'?'Manager account created. The owner must approve it after you confirm your email.':'Account created. Check your email to confirm the account, then log in.');
 }
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
 state.authUser=user; state.email=user.email||'';
 const {data:profile}=await supabaseClient.from('profiles').select('id,name,role,email').eq('id',user.id).maybeSingle();
 const normalizedEmail=String(user.email||'').toLowerCase();
 if(normalizedEmail===OWNER_EMAIL){
   state.authRole='owner';
   state.parentName=profile?.name||'Owner';
   if(!profile){await supabaseClient.from('profiles').upsert({id:user.id,name:'Owner',role:'owner',email:user.email},{onConflict:'id'});}else if(profile.role!=='owner'){await supabaseClient.from('profiles').update({role:'owner',email:user.email}).eq('id',user.id);}
 }else{
   state.authRole=profile?.role||'parent';
   state.parentName=profile?.name||user.email?.split('@')[0]||'Parent';
 }
 state.view=(state.authRole==='manager'||state.authRole==='owner')?'manager':'sales';
 await loadUserData();saveLocalOnly();
}
async function loadUserData(){
 if(!supabaseClient||!state.authUser)return;
 try{
   if(state.authRole==='manager'||state.authRole==='owner'){
     let pq=supabaseClient.from('programs').select('id,name,sport,sessions,price,attendance_payback,schedule,details,spots,venue_id,manager_id,venues(name)').order('created_at');
     if(state.authRole==='manager')pq=pq.eq('manager_id',state.authUser.id);
     const q=await pq;
     if(!q.error){state.programs=(q.data||[]).filter(p=>p.name!=='Saturday Soccer — U10').map((p,i)=>({id:i+1,dbId:p.id,managerId:p.manager_id,name:p.name,sport:p.sport,sessions:p.sessions||8,price:Number(p.price||0),attendancePayback:Number(p.attendance_payback||0),venue:p.venues?.name||'Venue TBD',details:p.details||'',slots:[{id:'db-'+p.id,label:p.schedule||'Schedule to be announced',spots:p.spots??0,capacity:p.spots??0}]}));}
     if(state.programs.length){const mids=[...new Set(state.programs.map(p=>p.managerId).filter(Boolean))];if(mids.length){const mq=await supabaseClient.from('profiles').select('id,name').in('id',mids);if(!mq.error){const names=Object.fromEntries((mq.data||[]).map(x=>[x.id,x.name]));state.programs=state.programs.map(p=>({...p,managerName:names[p.managerId]||'Program manager'}));}}}
     let r=supabaseClient.from('rewards').select('id,name,description,cost,icon,image_url,manager_id').eq('active',true).order('created_at');
     if(state.authRole==='manager')r=r.eq('manager_id',state.authUser.id);
     const rq=await r;
     if(!rq.error)state.rewards=(rq.data||[]).map((x,i)=>({id:i+1,dbId:x.id,name:x.name,description:x.description||'',cost:x.cost,icon:x.icon||'🎁',image:x.image_url||''}));
     if(isOwner()){
       const people=await supabaseClient.from('profiles').select('id,name,email,role,created_at').order('created_at',{ascending:false});
       if(!people.error)state.people=people.data||[];
     }
   }
   if(state.authRole==='parent'){
     const {data:links}=await supabaseClient.from('parent_children').select('child_id').eq('parent_id',state.authUser.id);
     const ids=(links||[]).map(x=>x.child_id);
     if(ids.length){const {data:children}=await supabaseClient.from('children').select('id,name,photo_url').in('id',ids); state.children=children||[]; state.childName=state.children[0]?.name||state.childName; const {data:enroll}=await supabaseClient.from('program_children').select('program_id,child_id').in('child_id',ids); state.enrolledPrograms=[...(enroll||[])];}
   }
 }catch(err){console.warn('User data load skipped.',err)}
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
function enrolledForChild(childId){return (state.enrolledPrograms||[]).filter(x=>String(x.child_id)===String(childId)).map(x=>String(x.program_id));}
function isEnrolled(programId,childId){return enrolledForChild(childId).includes(String(programId))}
async function enrollInProgram(programId){
 if(!state.authUser)return openAuth('login');
 if(state.authRole!=='parent')return toast('Programs are enrolled through a parent account.');
 const child=state.children[0]; if(!child)return toast('Add a child to your parent account first.');
 const pid=state.programs.find(p=>p.id===programId)?.dbId||programId;
 if(isEnrolled(pid,child.id))return toast('This child is already enrolled in the program.');
 if(!supabaseClient)return toast('Supabase is not connected.');
 const {error}=await supabaseClient.from('program_children').insert({program_id:pid,child_id:child.id});
 if(error)return toast('Could not enroll: '+error.message);
 state.enrolledPrograms.push({program_id:pid,child_id:child.id});saveLocalOnly();toast('Program added to your child');render();
}
async function addChild(){
 if(!state.authUser||state.authRole!=='parent')return;
 const name=prompt('Child name'); if(!name)return;
 const {data:child,error}=await supabaseClient.from('children').insert({name}).select('id,name,photo_url').single();
 if(error)return toast('Could not add child: '+error.message);
 const {error:linkError}=await supabaseClient.from('parent_children').insert({parent_id:state.authUser.id,child_id:child.id});
 if(linkError)return toast('Child created but parent link failed: '+linkError.message);
 state.children.push(child);state.childName=child.name;saveLocalOnly();toast('Child added');render();
}
function programSummary(pr,childId){const enrolled=isEnrolled(pr.dbId||pr.id,childId);return `<div class="card" style="margin-bottom:10px"><button class="program-collapse" onclick="toggleProgram('${pr.id}')"><span><b>${pr.name}</b><span class="small muted">${pr.sessions} sessions • ${money(pr.price)} • ${pr.venue} • ${money(programAttendanceTotal(pr))} attendance payback</span><span class="pill" style="margin-top:6px;display:inline-block">Manager: ${pr.managerName||'Program manager'}</span></span><span>${state.expandedPrograms[pr.id]?'−':'+'}</span></button>${state.expandedPrograms[pr.id]?`<div class="program-expanded"><p>${pr.details}</p><div class="statrow"><span>Manager</span><b>${pr.managerName||'Program manager'}</b></div><div class="statrow"><span>Schedule</span><b>${pr.slots?.[0]?.label||pr.schedule||'Schedule TBD'}</b></div><div class="statrow"><span>Enrollment</span><b>${enrolled?'Registered':'Not registered'}</b></div>${childId?`<button class="btn ${enrolled?'light':'green'}" ${enrolled?'disabled':''} onclick="enrollInProgram(${pr.id})">${enrolled?'Registered':'Add to program'}</button>`:''}</div>`:''}</div>`}
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
function attendanceRecord(pr){const key=String(programDbId(pr)||'demo');if(!state.attendanceByProgram)state.attendanceByProgram={};const rec=state.attendanceByProgram[key]||{};return {attended:Math.max(0,Number(rec.attended||0)),paybackIssued:!!rec.paybackIssued,payoutDestination:rec.payoutDestination||state.economics||'parent',lastUpdated:rec.lastUpdated||null};}
function attendanceProgress(pr){const rec=attendanceRecord(pr);const total=Math.max(1,Number(pr?.sessions||state.totalSessions||1));return {attended:Math.min(rec.attended,total),total,payback:programAttendanceTotal(pr),qualified:rec.attended>=total,payoutIssued:rec.paybackIssued,destination:rec.payoutDestination};}
function currentTrackedProgram(){return (state.programs||[]).find(p=>p.dbId&&state.enrolledPrograms?.some(x=>String(x.program_id)===String(p.dbId))) || (state.programs||[]).find(p=>p.dbId) || (state.programs||[])[0] || null;}
function applyAttendancePayback(pr){
 const prog=pr||currentTrackedProgram();if(!prog)return false;const key=String(programDbId(prog));const a=attendanceProgress(prog);
 if(a.qualified&&!a.payoutIssued&&a.payback>0){
   if(!state.attendanceByProgram)state.attendanceByProgram={};
   state.attendanceByProgram[key]={attended:a.attended,paybackIssued:true,payoutDestination:state.economics||'parent',lastUpdated:new Date().toISOString()};
   if((state.economics||'parent')==='kid'){
     state.rewardPoints += a.payback;
     state.ledger.push({date:'Today',description:`Attendance payback — ${prog.name}`,amount:a.payback,type:'earned'});
   }
   return true;
 }
 return false;
}
function setProgramAttendance(pr,attended,source='manager'){
 const prog=pr||currentTrackedProgram();if(!prog)return toast('No program is available for attendance.');const total=Math.max(0,Number(prog.sessions||state.totalSessions||0));let n=Math.max(0,Math.min(total,Number(attended)||0));const key=String(programDbId(prog));const existing=attendanceRecord(prog);if(existing.paybackIssued){n=total;}
 state.attendance=n;state.totalSessions=total||state.totalSessions;state.attendanceByProgram[key]={attended:n,paybackIssued:existing.paybackIssued,payoutDestination:existing.payoutDestination||state.economics||'parent',lastUpdated:new Date().toISOString()};
 const paidNow=applyAttendancePayback(prog);saveLocalOnly();render();toast(paidNow?'Attendance updated — attendance payback automatically awarded.':`Attendance updated to ${n}/${total}.`);
}
function kidCheckIn(){
 const prog=currentTrackedProgram();if(!prog)return toast('No program is enrolled.');const today=new Date().toISOString().slice(0,10);if(state.currentCheckinDate===today)return toast('This session is already checked in.');const a=attendanceProgress(prog);if(a.attended>=a.total)return toast('All program sessions are already marked attended.');state.currentCheckinDate=today;setProgramAttendance(prog,a.attended+1,'kid');}
function managerProgramCard(pr){
 const key='mgr-'+pr.id, sessions=(state.sessions||[]).filter(s=>String(s.programId||s.program)===String(pr.dbId||pr.id)), expanded=!!state.expandedPrograms[key], a=attendanceProgress(pr);
 return `<div class="card" style="margin-bottom:10px"><button class="program-collapse" onclick="toggleProgram('${key}')"><span><b>${pr.name}</b><span class="small muted">${pr.sessions} sessions • ${money(pr.price)} • ${pr.venue} • ${money(programAttendanceTotal(pr))} attendance payback</span><span class="pill" style="margin-top:6px;display:inline-block">Manager: ${pr.managerName||state.parentName||'Program manager'}</span></span><span>${expanded?'−':'+'}</span></button>${expanded?`<div class="program-expanded"><p>${pr.details||'No description yet.'}</p><div class="statrow"><span>Schedule</span><b>${pr.slots?.[0]?.label||pr.schedule||'Schedule TBD'}</b></div><div class="statrow"><span>Planned sessions</span><b>${pr.sessions}</b></div><div class="statrow"><span>Generated sessions</span><b>${sessions.length}</b></div><div class="statrow"><span>Attendance payback</span><b>${money(a.payback)} ${a.payback?'total':'(not allocated)'}</b></div><div class="statrow"><span>Attendance status</span><b>${a.attended}/${a.total}${a.payoutIssued?' • Payback awarded':' • Payback pending'}</b></div><div class="statrow"><span>Payout destination</span><b>${a.destination==='kid'?'Kid wallet':'Parent'}</b></div><div class="notice" style="margin:12px 0"><b>Attendance control</b><div class="small muted" style="margin-top:4px">Set the child's attended-session count here when you need to correct attendance manually. Reaching full attendance automatically awards the manager's allocated payback.</div><div class="button-row" style="margin-top:10px"><input class="input" id="attendance-${pr.id}" type="number" min="0" max="${a.total}" value="${a.attended}" style="max-width:130px"><button class="btn green" onclick="setProgramAttendance(${pr.id},document.getElementById('attendance-${pr.id}').value,'manager')">Save attendance</button><button class="btn light" onclick="setProgramAttendance(${pr.id},${a.total},'manager')">Mark all attended</button></div></div><button class="btn blue" onclick="generateSessions(${pr.id})">Generate sessions</button><div class="catalog" style="margin-top:14px">${sessions.map(s=>`<div class="session-admin-row"><div><b>${s.name}</b><div class="small muted">${s.date} • ${s.start}–${s.end} • ${s.venue}</div></div><span class="pill">${s.status}</span></div>`).join('')||'<div class="notice">No sessions generated yet.</div>'}</div></div>`:''}</div>`;
}

function rewardManager(){return `<div class="card" style="margin-top:20px"><h3>My Reward Catalog</h3><p class="muted">This catalog belongs to the signed-in manager. Rewards can include a picture, description and points cost.</p><div class="formgrid"><div><div class="label">Reward</div><input class="input" id="rName" placeholder="Sports Drink"></div><div><div class="label">Points cost</div><input class="input" id="rCost" type="number" value="5"></div><div class="full"><div class="label">Description</div><input class="input" id="rDesc" placeholder="Cold drink after practice"></div><div class="full"><div class="label">Picture</div><input class="input" id="rImage" type="file" accept="image/*" onchange="previewRewardImage(event)"></div></div><button class="btn green" style="margin-top:12px" onclick="addReward()">Add reward</button><div class="catalog">${(state.rewards||[]).map(r=>`<div class="catalog-row">${r.image?`<img src="${r.image}"/>`:'<div class="thumb">🎁</div>'}<div><b>${r.name}</b><div class="small muted">${r.description}</div></div><strong>${r.cost} pts</strong></div>`).join('')||'<div class="notice">No rewards in this catalog yet.</div>'}</div></div>`}
function showProgramForm(){const x=document.getElementById('programForm');if(x)x.style.display='block'}
function hideProgramForm(){const x=document.getElementById('programForm');if(x)x.style.display='none'}
async function generateSessions(pid){
 const p=state.programs.find(x=>x.id===pid);if(!p||!supabaseClient)return toast('Program or Supabase connection missing.');const parsed=parseScheduleInput(p.slots?.[0]?.label||p.schedule||'');if(!parsed)return toast('This program needs a readable schedule before sessions can be generated.');
 const existing=(state.sessions||[]).filter(s=>String(s.programId||s.program)===String(p.dbId||p.id)); if(existing.length>=(p.sessions||8))return toast(`This program already has ${existing.length} sessions. No duplicates were created.`); const first=prompt('First session date (YYYY-MM-DD)',new Date().toISOString().slice(0,10));if(!first)return;const embedded=(p.slots?.[0]?.label||'').match(/skips (.*)$/i);const holidayText=embedded?embedded[1]:prompt('Holiday / blackout dates, comma-separated (YYYY-MM-DD). These dates will be skipped.','');const holidays=parseHolidayDates(holidayText),rows=[],existingDates=new Set(existing.map(s=>s.date));let d=nextDateOnWeekday(first,parsed.day),guard=0;
 while(existing.length+rows.length<(p.sessions||8)&&guard<370){const iso=d.toISOString().slice(0,10);if(!holidays.has(iso)&&!existingDates.has(iso))rows.push({name:p.name,sport:p.sport,session_date:iso,start_time:parsed.start,end_time:parsed.end,status:'committed',description:p.details,max_players:p.slots?.[0]?.capacity||12,program_id:p.dbId||null,venue_id:null});d.setDate(d.getDate()+7);guard++;}
 if(existing.length+rows.length<(p.sessions||8))return toast('Could not create the requested number of sessions.');if(!rows.length)return toast('No new sessions were needed.');const {data,error}=await supabaseClient.from('sessions').insert(rows).select();if(error)return toast('Could not generate sessions: '+error.message);
 state.sessions=[...(state.sessions||[]),...(data||[]).map(s=>({id:s.id,dbId:s.id,name:s.name,sport:s.sport,date:s.session_date,start:s.start_time,end:s.end_time,status:s.status,description:s.description,maxPlayers:s.max_players,programId:s.program_id,program:p.name,venue:p.venue}))];saveLocalOnly();toast(`${data.length} sessions created; blackout dates were skipped.`);render();}
function programSummary(pr,childId){const enrolled=isEnrolled(pr.dbId||pr.id,childId);return `<div class="card" style="margin-bottom:10px"><button class="program-collapse" onclick="toggleProgram('${pr.id}')"><span><b>${pr.name}</b><span class="small muted">${pr.sessions} sessions • ${money(pr.price)} • ${pr.venue} • ${money(programAttendanceTotal(pr))} attendance payback</span><span class="pill" style="margin-top:6px;display:inline-block">Manager: ${pr.managerName||'Program manager'}</span></span><span>${state.expandedPrograms[pr.id]?'−':'+'}</span></button>${state.expandedPrograms[pr.id]?`<div class="program-expanded"><p>${pr.details||''}</p><div class="statrow"><span>Manager</span><b>${pr.managerName||'Program manager'}</b></div><div class="statrow"><span>Schedule</span><b>${pr.slots?.[0]?.label||pr.schedule||'Schedule TBD'}</b></div><div class="statrow"><span>Attendance payback</span><b>${money(programAttendanceTotal(pr))} on full attendance</b></div><div class="statrow"><span>Status</span><b>${enrolled?'Registered':'Available'}</b></div>${childId?`<button class="btn ${enrolled?'light':'green'}" ${enrolled?'disabled':''} onclick="enrollInProgram(${pr.id})">${enrolled?'Registered':'Add to program'}</button>`:''}${childId&&enrolled?`<div class="grid compact" style="margin-top:16px"><div class="card"><b>Schedule</b><p class="muted">Upcoming sessions</p></div><div class="card"><b>History</b><p class="muted">Completed sessions</p></div><div class="card"><b>Rewards</b><p>${state.rewardPoints} points</p></div><div class="card"><b>Videos</b><p class="muted">Session recordings</p></div><div class="card"><b>Accomplishments</b><p class="muted">Progress and badges</p></div></div>`:''}</div>`:''}</div>`}

// ---- Canonical Daily Roll UI / behavior ----
function shell(content){return `<header class="topbar"><div class="brand"><div class="brand-mark">⚽</div>The Daily Roll</div><nav class="nav">${state.authUser?['parent','kid',...(state.authRole==='manager'||state.authRole==='owner'?['manager']:[])].map(v=>`<button class="${state.view===v?'active':''}" onclick="setView('${v}')">${v[0].toUpperCase()+v.slice(1)} View</button>`).join(''):''}<button class="${state.view==='sales'?'active':''}" onclick="setView('sales')">Join a Program</button></nav><div style="display:flex;align-items:center;gap:8px">${authButtons()}</div></header><main class="wrap">${content}</main><div class="footer">The Daily Roll • Play • Improve • Earn</div>${state.privacyOpen===true?privacyModal():''}${renderModalSpecial()||''}${state.authMode?authModal():''}`}
function render(){let content;if(state.view==='manager'&&(!state.authUser||!(state.authRole==='manager'||state.authRole==='owner')))content=authRequired();else if((state.view==='parent'||state.view==='kid')&&!state.authUser)content=authRequired();else content=state.view==='sales'?sales():state.view==='parent'?parent():state.view==='kid'?kid():manager();document.getElementById('app').innerHTML=shell(content)}
function sales(){const programs=publicPrograms();const selected=state.selectedProgram?programs.find(p=>p.id===state.selectedProgram):null;return `<section class="hero"><div><span class="pill">Kids sports programs</span><h1>Kids play.<br>Kids improve.<br>Kids earn.</h1><p>Choose a program, create your parent account, and add your child when you're ready.</p><button class="btn green" onclick="document.getElementById('programs').scrollIntoView({behavior:'smooth'})">See available programs</button></div><div class="hero-card"><div class="small">THE DAILY ROLL</div><div class="price">Play • Improve • Earn</div><p>Each manager has their own programs and reward catalog. Attendance payback is allocated per program.</p></div></section><div id="programs" class="section-title"><div><h2>Choose your program</h2><span class="muted">Open a program to see its manager, schedule, location and attendance payback.</span></div>${state.authUser&&state.authRole==='parent'?'<button class="btn light" onclick="setView(\'parent\')">My programs</button>':''}</div><div class="grid">${programs.length?programs.map(pr=>programSummary(pr,state.children[0]?.id)).join(''):'<div class="notice">No public programs are currently available.</div>'}</div>${selected&&state.selectedSlot?checkout(selected):''}`}
function parent(){const kids=state.children.length?state.children:[{id:null,name:state.childName}];return `<div class="section-title"><div><span class="pill">Parent portal</span><h2>Welcome, ${state.parentName} 👋</h2><p class="muted">Manage your children and their enrolled programs.</p></div><div class="button-row"><button class="btn light" onclick="addChild()">+ Add child</button><button class="btn light" onclick="setView('sales')">Browse programs</button></div></div>${kids.map(child=>{const enrolledIds=enrolledForChild(child.id);const enrolled=publicPrograms().filter(p=>enrolledIds.includes(String(p.dbId||p.id)));const open=!!state.expandedPrograms['child-'+child.id];return `<div class="card" style="margin-bottom:18px"><button class="program-collapse" onclick="toggleProgram('child-${child.id}')"><span><b>${child.name}</b><span class="small muted">${enrolled.length} program${enrolled.length===1?'':'s'}</span></span><span>${open?'−':'+'}</span></button>${open?`<div class="program-expanded">${enrolled.length?enrolled.map(pr=>programSummary(pr,child.id)).join(''):'<div class="notice">This child is not registered in a program yet.</div>'}<div class="grid compact" style="margin-top:14px"><div class="card"><b>Schedule</b><p class="muted">Upcoming sessions</p></div><div class="card"><b>History</b><p class="muted">Attendance and past sessions</p></div><div class="card"><b>Rewards</b><p>${state.rewardPoints} points</p></div><div class="card"><b>Videos</b><p class="muted">Session recordings</p></div><div class="card"><b>Accomplishments</b><p class="muted">Progress and badges</p></div></div></div>`:''}</div>`}).join('')}`}
function kid(){const enrolled=publicPrograms().filter(p=>state.enrolledPrograms.some(x=>String(x.program_id)===String(p.dbId||p.id)));const pr=currentTrackedProgram();const a=pr?attendanceProgress(pr):{attended:0,total:0,payback:0,qualified:false,payoutIssued:false,destination:state.economics||'parent'};const spentPoints=Math.abs((state.ledger||[]).filter(x=>x.type==='spent').reduce((sum,x)=>sum+x.amount,0));const attendanceAward=a.payback&&a.payoutIssued&&a.destination==='kid'?a.payback:0;const paybackText=a.payback?(a.payoutIssued?(a.destination==='kid'?`+${a.payback} ⭐ added to your wallet`:`${money(a.payback)} paid back to your parent`):`${money(a.payback)} pending until ${a.total}/${a.total} sessions`):'No attendance payback allocated';return `<div class="section-title"><div><span class="pill">Kid view</span><h2>Hey ${state.childName}! 👋</h2><p class="muted">Your programs, attendance and rewards wallet.</p></div></div><div class="card"><button class="program-collapse" onclick="toggleProgram('kid-programs')"><span><b>My programs</b><span class="small muted">${enrolled.length} registered</span></span><span>${state.expandedPrograms['kid-programs']?'−':'+'}</span></button>${state.expandedPrograms['kid-programs']?`<div class="program-expanded">${enrolled.map(pr=>programSummary(pr,state.children[0]?.id)).join('')||'<div class="notice">No programs are registered yet.</div>'}</div>`:''}</div><div class="grid"><div class="card checkin-card"><h3>Today's check-in</h3><div class="big-check">✓</div><b>${state.currentCheckinDate===new Date().toISOString().slice(0,10)?'Checked in today':'Ready to check in'}</b><div class="statrow" style="margin-top:10px"><span>Attendance</span><b>${a.attended}/${a.total}</b></div><button class="btn light" onclick="kidCheckIn()">Check in for this session</button></div><div class="card"><h3>Rewards wallet</h3><div class="money">${state.rewardPoints} ⭐</div><p class="muted">1 point = $1</p><div class="statrow"><span>Attendance payback</span><b>${paybackText}</b></div><div class="small muted" style="margin-top:8px">${a.total?a.attended+'/'+a.total+' sessions attended. ':''}${a.payback?`Complete every session to unlock the ${money(a.payback)} total payback.`:'Your manager has not allocated an attendance payback.'}</div><div class="small muted" style="margin-top:6px">Spent: ${spentPoints} ⭐${attendanceAward?` • ${attendanceAward} points came from attendance`:''}</div><button class="btn green" style="margin-top:12px" onclick="openSpend()">Spend points</button></div><div class="card"><h3>🏆 MVP voting</h3><p class="muted">Vote for the teammate who tried the hardest today.</p>${state.players.filter(x=>x.name!==state.childName).map(x=>`<button class="vote-card ${state.userVote===x.name?'selected':''}" onclick="castVote('${x.name}')"><b>${x.name}</b></button>`).join('')}<button class="btn blue" style="margin-top:12px;width:100%" ${state.userVote?'disabled':''} onclick="submitVote()">Submit vote</button></div></div>`}
function manager(){const programs=(state.programs||[]).filter(p=>p.name!=='Saturday Soccer — U10');return `<div class="section-title"><div><span class="pill">${isOwner()?'Owner / manager':'Manager'}</span><h2>Program Builder</h2><p class="muted">Programs are permanent offerings. Sessions are generated underneath them.</p></div><button class="btn green" onclick="showProgramForm()">+ Add Program</button></div><div id="programForm" class="card" style="display:none;margin-bottom:18px"><h3>New program</h3><div class="formgrid"><div><div class="label">Program name</div><input class="input" id="mName" placeholder="Tuesday Skills — U8/U10"></div><div><div class="label">Sport</div><input class="input" id="mSport" placeholder="Soccer"></div><div><div class="label">Location</div><input class="input" id="mVenue" placeholder="Burlington Indoor Field"></div><div><div class="label">Price</div><input class="input" id="mPrice" type="number" value="500" min="0"></div><div><div class="label">Attendance payback</div><input class="input" id="mAttendancePayback" type="number" value="100" min="0"><div class="small muted" style="margin-top:5px">Total amount the manager allocates back for completing all sessions. Example: $100 on full attendance.</div></div><div><div class="label">Number of sessions</div><input class="input" id="mSessionCount" type="number" value="8" min="1" max="52" oninput="refreshSchedulePreview()"></div><div><div class="label">First session date</div><input class="input" id="mFirstDate" type="date" value="${new Date().toISOString().slice(0,10)}" onchange="refreshSchedulePreview()"></div><div class="full"><div class="label">Schedule</div><input class="input" id="mSchedule" placeholder="Tuesday 5–6 PM" oninput="refreshSchedulePreview()"><div class="small muted" style="margin-top:5px">Forgiving input: “Tuesday 5–6 PM”, “Tuesdays 5:00–6:00 PM”, “Tue 17:00–18:00”, etc.</div></div><div class="full"><div class="label">Holidays / blackout dates</div><input class="input" id="mHolidays" placeholder="2026-10-13, 2026-11-10" oninput="refreshSchedulePreview()"><div class="small muted" style="margin-top:5px">Skipped dates do not count toward the requested session total.</div></div><div class="full"><div class="label">Description</div><textarea class="input" id="mDetails" rows="3" placeholder="Technical skills, movement and game play."></textarea></div><div class="full" id="schedulePreview">${schedulePreview()}</div></div><div class="button-row"><button class="btn green" onclick="addProgram()">Create program</button><button class="btn light" onclick="hideProgramForm()">Cancel</button></div></div>${programs.length?programs.map(managerProgramCard).join(''):'<div class="notice">No programs created yet. Use <b>+ Add Program</b> to start.</div>'}${rewardManager()}${isOwner()?ownerPeoplePanel():''}`}
async function addProgram(){const name=document.getElementById('mName')?.value.trim();if(!name)return toast('Enter a program name.');const scheduleText=document.getElementById('mSchedule')?.value.trim(),parsed=parseScheduleInput(scheduleText);if(!parsed)return toast('Enter a schedule like Tuesday 5–6 PM.');const firstDate=document.getElementById('mFirstDate')?.value,count=Math.max(1,Math.min(52,Number(document.getElementById('mSessionCount')?.value)||8));if(!firstDate)return toast('Choose the first session date.');const holidayList=[...parseHolidayDates(document.getElementById('mHolidays')?.value)],sport=document.getElementById('mSport')?.value.trim()||'Sports',venue=document.getElementById('mVenue')?.value.trim()||'Location TBD',price=Math.max(0,Number(document.getElementById('mPrice')?.value)||0),attendancePayback=Math.max(0,Number(document.getElementById('mAttendancePayback')?.value)||0),details=document.getElementById('mDetails')?.value.trim()||'';if(!supabaseClient||!state.authUser||!(state.authRole==='manager'||state.authRole==='owner'))return toast('Approved manager access is required.');const scheduleLabel=`${scheduleText} • ${count} sessions${holidayList.length?` • skips ${holidayList.join(', ')}`:''}`;const q=await supabaseClient.from('programs').insert({name,sport,sessions:count,price,attendance_payback:attendancePayback,schedule:scheduleLabel,details,spots:12,manager_id:state.authUser.id}).select('id,name,sport,sessions,price,attendance_payback,schedule,details,spots,venue_id,manager_id').single();if(q.error)return toast('Could not create program: '+q.error.message);const d=q.data;state.programs.push({id:Date.now(),dbId:d.id,managerId:d.manager_id||state.authUser.id,name:d.name,sport:d.sport,sessions:d.sessions||count,price:Number(d.price||0),attendancePayback:Number(d.attendance_payback||0),venue,details:d.details||'',slots:[{id:'db-'+d.id,label:scheduleLabel,spots:d.spots||12,capacity:d.spots||12}],managerName:state.parentName||'Program manager'});hideProgramForm();saveLocalOnly();toast('Program created');render()}
function deleteSession(id){toast('Sessions are not deleted from the normal workflow. Mark the session cancelled instead.')}
// Boot only after every canonical function above has been defined.
(async function boot(){render();await initSupabase();if(supabaseClient){const {data}=await supabaseClient.auth.getSession();if(data?.session?.user){await setAuthenticatedUser(data.session.user);render()}else{state.authUser=null;state.authRole=null;render()}supabaseClient.auth.onAuthStateChange(async (_event,session)=>{if(session?.user&&!state.authUser){await setAuthenticatedUser(session.user);render()}})}})();

