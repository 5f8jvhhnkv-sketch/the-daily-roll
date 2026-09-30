const defaultState={
 view:'sales', selectedProgram:null, selectedSlot:null, paid:false, parentName:'Sarah', childName:'Alex', childPhoto:null,
 email:'', phone:'', attendance:7,totalSessions:8,rewardPoints:350, votes:{Alex:0,Noah:0,Liam:0,Maya:0},userVote:null,publishedMVP:null,managerOverride:null,
 economics:'parent', consent:false, privacyOpen:false,
 rewards:[{id:1,name:'Sports Drink',description:'Cold drink after practice',cost:5,image:''},{id:2,name:'Snack',description:'Post-session snack',cost:8,image:''}],
 ledger:[{date:'Today',description:'Attendance bonus',amount:50,type:'earned'},{date:'Today',description:'Effort bonus',amount:50,type:'earned'},{date:'Yesterday',description:'Teamwork bonus',amount:25,type:'earned'},{date:'Yesterday',description:'Reward purchase — Sports Drink',amount:-5,type:'spent'}],
 programs:[
  {id:1,name:'Saturday Soccer — U10',sport:'Soccer',sessions:8,price:500,venue:'Oakville Sports Centre',details:'Skills, small-sided games and development.',slots:[{id:'sat-am',label:'Saturdays • 10:00–11:00 AM',spots:8,capacity:12},{id:'sat-pm',label:'Saturdays • 2:00–3:00 PM',spots:4,capacity:12}]},
  {id:2,name:'Tuesday Skills — U8/U10',sport:'Soccer',sessions:8,price:500,venue:'Burlington Indoor Field',details:'Technical skills, movement and game play.',slots:[{id:'tue-pm',label:'Tuesdays • 5:00–6:00 PM',spots:6,capacity:10},{id:'thu-pm',label:'Thursdays • 5:30–6:30 PM',spots:9,capacity:10}]}
 ],
 players:[{name:'Alex',photo:null},{name:'Noah',photo:null},{name:'Liam',photo:null},{name:'Maya',photo:null}]
};
const saved=localStorage.getItem('dailyRollMVP'); const state=Object.assign(defaultState,saved?JSON.parse(saved):{});

// ---- Supabase connection ----
const SUPABASE_URL = 'https://pzgzzbjeyrxpuqkuizyr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YESJdmGbaOkMT0_0Yor9Dg_qkHj_GVv';
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
      supabaseClient.from('programs').select('id,name,sport,sessions,price,schedule,details,spots,venue_id,venues(name)').order('created_at'),
      supabaseClient.from('rewards').select('id,name,description,cost,icon,image_url').eq('active',true).order('created_at'),
      supabaseClient.from('sessions').select('id,name,sport,session_date,start_time,end_time,status,description,max_players,program_id,venue_id,programs(name),venues(name)').order('session_date',{ascending:false})
    ]);
    if(programs && programs.length){
      state.programs = programs.map((p,i)=>({
        id:i+1, dbId:p.id, name:p.name, sport:p.sport, sessions:p.sessions||8, price:Number(p.price||0),
        venue:p.venues?.name||'Burlington Indoor Field', details:p.details||'',
        slots:[{id:'db-'+p.id,label:p.schedule||'Schedule to be announced',spots:p.spots??0,capacity:p.spots??0}]
      }));
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
initSupabase();
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
function shell(content){return `<header class="topbar"><div class="brand"><div class="brand-mark">⚽</div>The Daily Roll</div><nav class="nav">${['sales','parent','kid','manager'].map(v=>`<button class="${state.view===v?'active':''}" onclick="setView('${v}')">${v==='sales'?'Join a Program':v[0].toUpperCase()+v.slice(1)+' View'}</button>`).join('')}</nav></header><main class="wrap">${content}</main><div class="footer">The Daily Roll • Play • Improve • Earn • MVP prototype</div>${state.privacyOpen?privacyModal():''}`}
function render(){document.getElementById('app').innerHTML=shell(state.view==='sales'?sales():state.view==='parent'?parent():state.view==='kid'?kid():manager());}
function sales(){return `<section class="hero"><div><span class="pill">Kids sports programs</span><h1>Kids play.<br>Kids improve.<br>Kids earn.</h1><p>Choose a program, pick a convenient session time, and let your child earn through attendance, effort and rewards.</p><button class="btn green" onclick="document.getElementById('programs').scrollIntoView({behavior:'smooth'})">See available programs</button></div><div class="hero-card"><div class="small">PROGRAM PRICE</div><div class="price">$500</div><p>Up to <b>$100 back</b> for attendance + <b>$50 reward allocation</b> for the child.</p><div class="statrow"><span>Sessions</span><b>8</b></div><div class="statrow"><span>Attendance-back</span><b>$100</b></div><div class="statrow"><span>Kid rewards</span><b>$50</b></div></div></section><div id="programs" class="section-title"><div><h2>Choose your program</h2><span class="muted">Click a program to see the schedule and location.</span></div></div><div class="grid">${state.programs.map(pr=>programCard(pr)).join('')}</div>${state.selectedProgram&&state.selectedSlot?checkout(state.programs.find(x=>x.id===state.selectedProgram)):''}`}
function programCard(pr){const selected=state.selectedProgram===pr.id;return `<div class="card program-card ${selected?'selected-program':''}"><span class="tag">${pr.sport}</span><h3 style="margin-top:10px">${pr.name}</h3><p class="muted">${pr.sessions} sessions • ${money(pr.price)}</p><p>${pr.details}</p><div class="venue"><b>📍 ${pr.venue}</b><span class="small muted">${selected?'Schedule shown below':'Click to view schedule'}</span></div>${selected?`<div class="schedule-detail">${pr.slots.map(sl=>`<button class="choice ${state.selectedSlot===sl.id?'selected':''}" onclick="selectSlot(${pr.id},'${sl.id}')"><strong>${sl.label}</strong><small>${sl.spots} spots left</small></button>`).join('')}</div><button class="btn light" style="width:100%;margin-top:10px" onclick="deselectProgram()">Deselect program</button>`:`<button class="btn blue" style="width:100%" onclick="selectProgram(${pr.id})">View schedule & select</button>`}</div>`}
function checkout(p){const sl=p.slots.find(x=>x.id===state.selectedSlot);return `<div class="section-title"><div><h2>Reserve your spot</h2><span class="muted">One simple checkout. Contact details are collected at the bottom.</span></div></div><div class="checkout-layout"><div class="card"><h3>${p.name}</h3><p class="muted">${sl.label} • ${p.venue}</p><div class="formgrid"><div><div class="label">Parent name</div><input class="input" id="parent" value="${state.parentName}"></div><div><div class="label">Child name</div><input class="input" id="child" value="${state.childName}"></div><div><div class="label">Email</div><input class="input" id="email" type="email" value="${state.email}" placeholder="you@example.com"></div><div><div class="label">Phone</div><input class="input" id="phone" type="tel" value="${state.phone}" placeholder="416-555-1234"></div></div><div class="notice" style="margin-top:18px">Child photo can be added later from the parent profile. It is not required to join.</div></div><div class="card sticky-summary"><h3>Payment summary</h3><div class="statrow"><span>Program</span><b>${money(p.price)}</b></div><div class="statrow"><span>Attendance-back potential</span><b>$100</b></div><div class="statrow"><span>Child reward allocation</span><b>$50</b></div><div class="divider"></div><div class="statrow total"><span>Total today</span><b>${money(p.price)}</b></div><button class="btn green" style="width:100%;margin-top:14px" onclick="openPrivacy()">Continue to payment</button><p class="small muted">Before payment, you will review and acknowledge the privacy/video terms.</p></div></div>`}
function privacyModal(){return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="pill">Required acknowledgement</span><h2>Privacy & video acknowledgement</h2></div><button class="icon-btn" onclick="closePrivacy()">×</button></div><p>The Daily Roll may use cameras and AI video processing during sessions to provide session recordings, live viewing and, in the future, child-specific highlights.</p><p class="muted">This MVP uses a placeholder acknowledgement. Before launch, this should link to your final privacy policy, consent language and applicable legal terms.</p><div class="policy-box"><b>What you're acknowledging</b><ul><li>Session video may be recorded and processed.</li><li>Authorized family members may access session video.</li><li>Future AI features may analyze session footage.</li></ul><label class="check"><input type="checkbox" ${state.consent?'checked':''} onchange="state.consent=this.checked;save();render()"> I acknowledge the privacy/video terms and want to continue.</label></div><button class="btn green" style="width:100%" ${state.consent?'':'disabled'} onclick="continueToPayment()">Proceed to payment</button></div></div>`}
function parent(){const earned=state.ledger.filter(x=>x.type==='earned').reduce((a,x)=>a+x.amount,0),spent=Math.abs(state.ledger.filter(x=>x.type==='spent').reduce((a,x)=>a+x.amount,0));return `<div class="section-title"><div><span class="pill">Parent portal</span><h2>Welcome, ${state.parentName} 👋</h2></div><button class="btn light" onclick="setView('sales')">Browse programs</button></div><div class="grid"><div class="card"><div class="player"><img class="photo" src="${state.childPhoto||''}" onerror="this.style.display='none'"/><div><h3>${state.childName}</h3><div class="muted">U10 Soccer • Saturday program</div></div></div><div class="statrow"><span>Attendance</span><b>${state.attendance}/${state.totalSessions}</b></div><div class="progress"><div style="width:${state.attendance/state.totalSessions*100}%"></div></div><div class="statrow"><span>Points</span><b>${state.rewardPoints}</b></div></div><div class="card"><h3>Program economics</h3><div class="money">$500 paid</div><p class="muted">Choose where the attendance-back is paid. This choice can only be changed before the program starts.</p><div class="radio-stack"><label><input type="radio" name="econ" ${state.economics==='parent'?'checked':''} onchange="setEconomics('parent')"> Pay back to parent</label><label><input type="radio" name="econ" ${state.economics==='kid'?'checked':''} onchange="setEconomics('kid')"> Pay directly to kid</label></div><div class="success" style="margin-top:12px">Current projection: <b>${state.attendance===state.totalSessions?'$100':money(Math.round(100*state.attendance/state.totalSessions))} back</b> → ${state.economics==='kid'?'Kid':'Parent'}</div></div><div class="card"><h3>Next session</h3><p><b>Saturday • 10:00 AM</b></p><p class="muted">Soccer Skills • Oakville Sports Centre</p><button class="btn blue" onclick="openVideo()">Watch / live session</button></div></div><div class="grid2"><div class="card"><h3>Session video</h3><p class="muted">Full-session video can live here. You can download the full recording or watch a live session when available.</p><div class="video-placeholder"><div>▶</div><span>Session video / live stream</span></div><div class="button-row"><button class="btn blue" onclick="openVideo()">Watch full session</button><button class="btn light" onclick="toast('Demo: full session download would start here.')">Download full video</button></div></div><div class="card"><h3>Rewards</h3><div class="money">${state.rewardPoints} points</div><p class="muted">1 point = $1 of reward value.</p><button class="btn green" onclick="openRewardsInfo()">View rewards</button><div class="small muted" style="margin-top:10px">Earned: ${earned} • Spent: ${spent}</div></div></div>`}
function kid(){return `<div class="section-title"><div><span class="pill">Team iPad</span><h2>Hey ${state.childName}! 👋</h2><p class="muted">Check in, see today's summary, vote and spend your points.</p></div></div><div class="grid"><div class="card checkin-card"><h3>Today's check-in</h3><div class="big-check">✓</div><b>${state.childName} is checked in</b><p class="muted">Saturday Soccer • 10:00 AM</p><button class="btn light" onclick="toast('Demo: check-in status updated.')">Check in / out</button></div><div class="card"><h3>Rewards wallet</h3><div class="money">${state.rewardPoints} ⭐</div><p class="muted">1 point = $1</p><button class="btn green" onclick="openSpend()">Spend points</button><div class="ledger">${state.ledger.slice().reverse().map(x=>`<div class="ledger-row"><div><b>${x.description}</b><div class="small muted">${x.date}</div></div><b class="${x.type==='spent'?'spent':'earned'}">${x.amount>0?'+':''}${x.amount}</b></div>`).join('')}</div></div><div class="card"><h3>🏆 MVP voting</h3><p class="muted">Vote for the teammate who tried the hardest today. Your vote is private.</p><div class="vote-grid">${state.players.filter(x=>x.name!==state.childName).map(x=>`<button class="vote-card ${state.userVote===x.name?'selected':''}" onclick="castVote('${x.name}')"><div style="font-size:32px">⚽</div><b>${x.name}</b>${state.userVote===x.name?'<div class="small" style="color:var(--purple);margin-top:5px">Your vote</div>':''}</button>`).join('')}</div><button class="btn blue" style="margin-top:15px;width:100%" ${state.userVote?'disabled':''} onclick="submitVote()">Submit my vote</button><div class="small muted" style="margin-top:10px">No voting history is shown to kids.</div></div></div><div class="card"><h3>Today summary</h3><div class="grid compact"><div><b>Attendance</b><p>+50 ⭐</p></div><div><b>Effort</b><p>+50 ⭐</p></div><div><b>Teamwork</b><p>+25 ⭐</p></div><div><b>MVP</b><p>+25 ⭐</p></div></div></div>`}
function manager(){return `<div class="section-title"><div><span class="pill">Owner / manager</span><h2>The Daily Roll Dashboard</h2></div><button class="btn green" onclick="setView('sales')">View customer page</button></div><div class="grid"><div class="card"><div class="muted">Program revenue</div><div class="kpi">${state.paid?'$500':'$0'}</div></div><div class="card"><div class="muted">Active kids</div><div class="kpi">${state.paid?'1':'0'}</div></div><div class="card"><div class="muted">Break-even model</div><div class="kpi">25 kids</div><div class="small muted">Example contribution model</div></div></div><div class="grid2"><div class="card"><h3>Program builder</h3><p class="muted">Add or edit programs, locations, session times and availability. Changes appear on the public Join a Program page.</p><div class="formgrid"><div><div class="label">Program name</div><input class="input" id="mName" placeholder="Saturday Soccer — U10"></div><div><div class="label">Sport</div><input class="input" id="mSport" placeholder="Soccer"></div><div><div class="label">Location</div><input class="input" id="mVenue" placeholder="Oakville Sports Centre"></div><div><div class="label">Session price</div><input class="input" id="mPrice" type="number" value="500"></div><div class="full"><div class="label">Schedule / details</div><input class="input" id="mSchedule" placeholder="Saturdays • 10:00–11:00 AM"></div></div><button class="btn green" style="margin-top:12px" onclick="addProgram()">Add program</button></div><div class="card"><h3>Reward catalog</h3><p class="muted">Add a reward with a picture, description and points cost.</p><div class="formgrid"><div><div class="label">Reward</div><input class="input" id="rName" placeholder="Sports Drink"></div><div><div class="label">Points cost</div><input class="input" id="rCost" type="number" value="5"></div><div class="full"><div class="label">Description</div><input class="input" id="rDesc" placeholder="Cold drink after practice"></div><div class="full"><div class="label">Picture</div><input class="input" id="rImage" type="file" accept="image/*" onchange="previewRewardImage(event)"></div></div><button class="btn green" style="margin-top:12px" onclick="addReward()">Add reward</button><div class="catalog">${state.rewards.map(r=>`<div class="catalog-row">${r.image?`<img src="${r.image}"/>`:'<div class="thumb">🎁</div>'}<div><b>${r.name}</b><div class="small muted">${r.description}</div></div><strong>${r.cost} pts</strong></div>`).join('')}</div></div></div><div class="grid2" style="margin-top:18px"><div class="card"><h3>Current session — MVP voting</h3><p class="muted">Manager sees the tally and can override before publishing. Kids never see the voting log.</p>${mvpTable()}</div><div class="card"><h3>Client & program</h3><div class="player"><div class="photo">⚽</div><div><b>${state.childName}</b><div class="muted">${state.parentName} • Saturday Soccer</div></div></div><div class="statrow"><span>Payment</span><b>${state.paid?'Paid $500':'Not paid'}</b></div><div class="statrow"><span>Attendance</span><b>${state.attendance}/${state.totalSessions}</b></div><div class="statrow"><span>Reward points</span><b>${state.rewardPoints}</b></div><h3 style="margin-top:20px">Quick actions</h3><button class="btn light" style="width:100%;margin-bottom:8px" onclick="adjustAttendance()">Simulate attendance</button><button class="btn light" style="width:100%" onclick="resetDemo()">Reset demo</button></div></div><div class="card" style="margin-top:18px"><div class="section-title" style="margin-bottom:12px"><div><h3 style="margin:0">Sessions</h3><span class="small muted">Sessions are stored in Supabase. Deleting a session also removes its RSVP, check-in, attendance, votes and video records.</span></div></div>${state.sessions&&state.sessions.length?state.sessions.map(s=>`<div class="session-admin-row"><div><b>${s.name}</b><div class="small muted">${s.date} • ${s.start}–${s.end} • ${s.venue}</div><div class="small muted">${s.program} • <span class="pill">${s.status}</span></div></div><button class="btn danger" onclick="deleteSession('${s.dbId}')">Delete</button></div>`).join(''):`<div class="notice">No sessions found.</div>`}</div><div class="card" style="margin-top:18px"><h3>Video</h3><p class="muted">Future phase: connect a live camera stream, session recordings and optional AI highlight processing.</p></div>`}
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
function completePurchase(){state.paid=true;state.attendance=0;save();toast('Demo payment recorded — welcome to The Daily Roll!');setView('parent')}
function castVote(name){if(state.userVote)return;state.userVote=name;render()}
function submitVote(){if(!state.userVote)return toast('Pick a teammate first.');state.votes[state.userVote]++;save();toast(`Vote recorded for ${state.userVote}`);render()}
function publishMVP(){const val=document.getElementById('mvpSelect').value,tally=Object.entries(state.votes).sort((a,b)=>b[1]-a[1]);state.managerOverride=val||null;state.publishedMVP=val||(tally[0]&&tally[0][1]>0?tally[0][0]:null);save();toast('MVP published');render()}
function setEconomics(v){state.economics=v;save();toast(`Payment preference saved: ${v==='kid'?'kid':'parent'}`)}
function adjustAttendance(){state.attendance=Math.min(state.totalSessions,state.attendance+1);state.rewardPoints+=50;state.ledger.push({date:'Today',description:'Attendance bonus',amount:50,type:'earned'});save();toast('Attendance +1 and 50 points added');render()}
function addProgram(){const name=document.getElementById('mName').value.trim();if(!name)return toast('Enter a program name.');const venue=document.getElementById('mVenue').value.trim()||'Location TBD',price=Number(document.getElementById('mPrice').value)||500,schedule=document.getElementById('mSchedule').value.trim()||'Schedule TBD';state.programs.push({id:Date.now(),name,sport:document.getElementById('mSport').value.trim()||'Sports',sessions:8,price,venue,details:'Manager-created program.',slots:[{id:'slot-'+Date.now(),label:schedule,spots:10,capacity:10}]});save();toast('Program added to the public page');render()}
let rewardImage='';function previewRewardImage(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{rewardImage=r.result};r.readAsDataURL(f)}
function addReward(){const name=document.getElementById('rName').value.trim();if(!name)return toast('Enter a reward name.');state.rewards.push({id:Date.now(),name,description:document.getElementById('rDesc').value.trim()||'Reward',cost:Number(document.getElementById('rCost').value)||1,image:rewardImage});rewardImage='';save();toast('Reward added');render()}
function buyReward(id){const r=state.rewards.find(x=>x.id===id);if(!r)return;if(state.rewardPoints<r.cost)return toast('Not enough points.');state.rewardPoints-=r.cost;state.ledger.push({date:'Today',description:`Reward purchase — ${r.name}`,amount:-r.cost,type:'spent'});save();toast(`${r.name} purchased`);render()}
async function deleteSession(id){
  const session=state.sessions?.find(s=>s.dbId===id);
  if(!session)return;
  const ok=confirm(`Delete “${session.name}” on ${session.date}?\n\nThis permanently removes the session and its related RSVP, check-in, attendance, voting and video records.`);
  if(!ok)return;
  if(supabaseClient){
    const {error}=await supabaseClient.from('sessions').delete().eq('id',id);
    if(error){console.error(error);return toast('Could not delete session: '+error.message);}
  }
  state.sessions=state.sessions.filter(s=>s.dbId!==id);
  saveLocalOnly();
  toast('Session deleted');
  render();
}
function resetDemo(){localStorage.removeItem('dailyRollMVP');location.reload()}
function setView(v){state.view=v;save();render();window.scrollTo({top:0,behavior:'smooth'})}
function renderModalSpecial(){if(state.privacyOpen==='rewards')return rewardsInfo();if(state.privacyOpen==='spend')return spendModal();return null}
const oldRender=render;render=function(){document.getElementById('app').innerHTML=shell(state.view==='sales'?sales():state.view==='parent'?parent():state.view==='kid'?kid():manager())+(renderModalSpecial()||'')};
render();


// Start Supabase after the initial UI is available.
initSupabase();
