"use strict";
// Logic giao diện AccSoft – mọi dữ liệu lấy qua window.api (SQLite ở tiến trình chính)
// window.api do preload.js cung cấp
// Mọi lỗi giao diện đều ghi vào nhật ký
window.addEventListener('error',e=>api.logError(e.message,e.error&&e.error.stack||`${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection',e=>api.logError(String(e.reason&&e.reason.message||e.reason),e.reason&&e.reason.stack));
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmt=v=>v==null||isNaN(v)?'':Math.round(v).toLocaleString('en-US');
const fmt2=v=>v==null?'':(+v).toLocaleString('en-US',{maximumFractionDigits:2});
const pct=v=>isFinite(v)?(v*100).toFixed(1)+'%':'–';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const vn=s=>s?s.split('-').reverse().join('/'):'';
const short=u=>String(u||'').split('_')[0];
const num=v=>(+v||0).toLocaleString('vi');
const ic=n=>`<svg class="icon"><use href="#i-${n}"/></svg>`;
const kpi=(cls,icon,lb,v,s)=>`<div class="kpi ${cls}"><div class="ic">${ic(icon)}</div><div class="lb">${lb}</div><div class="v">${v}</div><div class="s">${s||''}</div></div>`;
const ls={get:(k,d)=>{try{const v=localStorage.getItem('accsoft.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem('accsoft.'+k,JSON.stringify(v))}catch(e){}}};
const SEVL={H:'Cao',M:'Trung bình',L:'Thấp'};
let META={rules:[],status:{}},RULE={},PAGE='overview',charts={};
const TITLES={overview:['Tổng quan','Bức tranh chung về dữ liệu hạch toán'],errors:['Lỗi nhập liệu','Phát hiện, theo dõi và xử lý bút toán sai'],inv:['Tuổi hàng tồn kho','Tồn kho theo mặt hàng, kho, đối tượng – FIFO theo ngày nhập'],aging:['Công nợ & tuổi nợ','Phải thu, phải trả, tạm ứng theo đối tượng'],
  pl:['Kết quả kinh doanh','Doanh thu, chi phí, lợi nhuận theo năm và tháng'],cost:['Doanh thu & Chi phí','Phân tích theo tài khoản, khoản mục, bộ phận và kỳ'],deep:['Phân tích chuyên sâu','Chi phí định kỳ, biến động, 335/242, nhân viên, Benford, nhà cung cấp, tỷ giá'],report:['Báo cáo & Thông báo','Báo cáo kiểm tra và gửi yêu cầu khắc phục'],data:['Quản lý dữ liệu','Tháng dữ liệu, lần nạp file và bảo trì CSDL']};

/* ---------- Biểu đồ: bảng màu TLM, cam chủ đạo ---------- */
const C={brand:'#FA4700',brand3:'#FF9C6B',brand1:'#FFD4BD',navy:'#001A79',ok:'#17B26A',err:'#F04438',gray:'#D5D7DA',grid:'#F5F5F5',txt:'#535862'};
Chart.defaults.font.family=getComputedStyle(document.body).fontFamily;Chart.defaults.color=C.txt;Chart.defaults.maintainAspectRatio=false;Chart.defaults.animation={duration:350};
Chart.defaults.plugins.legend.labels.usePointStyle=true;Chart.defaults.plugins.legend.labels.boxWidth=8;Chart.defaults.scale.grid.color=C.grid;Chart.defaults.elements.bar.borderRadius=6;
Chart.defaults.plugins.tooltip.backgroundColor='#181D27';Chart.defaults.plugins.tooltip.padding=10;Chart.defaults.plugins.tooltip.cornerRadius=8;
function chart(id,cfg){charts[id]?.destroy();charts[id]=new Chart($('#'+id),cfg)}

/* ---------- Điều hướng ---------- */
async function go(p){
  PAGE=p;$$('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.p===p));
  $$('.content>section').forEach(s=>s.classList.toggle('hide',s.id!==p));
  $('#pTitle').textContent=TITLES[p][0];$('#pSub').textContent=TITLES[p][1];$('#content').scrollTop=0;
  const sec=$('#'+p);sec.classList.add('loading');const t=setTimeout(()=>$('#pageLoad').classList.remove('hide'),300);
  try{await VIEWS[p]()}catch(e){console.error(e);api.logError(`Mở trang ${p}: ${e.message}`,e.stack)}
  finally{clearTimeout(t);sec.classList.remove('loading');$('#pageLoad').classList.add('hide')}
}
$('#sideRv').onclick=()=>go('errors');
document.addEventListener('click',e=>{const k=e.target.closest('[data-gg]');if(k){FIL={group:k.dataset.gg};OFF=0;go('errors')}});
$('#nav').onclick=e=>{const b=e.target.closest('[data-p]');if(b)go(b.dataset.p)};
document.addEventListener('click',e=>{const g=e.target.closest('[data-go]');if(g)go(g.dataset.go);if(e.target.closest('[data-act=import]'))doImport()});
/* ---------- Kỳ rà soát lỗi ---------- */
const QN=m=>Math.floor((+m.slice(5)-1)/3)+1;
const addM=(ym,n)=>{let y=+ym.slice(0,4),m=+ym.slice(5)-1+n;y+=Math.floor(m/12);m=((m%12)+12)%12;return `${y}-${String(m+1).padStart(2,'0')}`};
function rvLabel(p){if(!p.from&&!p.to)return 'Toàn bộ dữ liệu';const f=p.from,t=p.to;
  if(f&&f===t)return `Tháng ${f.slice(5)}/${f.slice(0,4)}`;
  if(f&&t&&f.slice(0,4)===t.slice(0,4)&&f.endsWith('-01')&&t.endsWith('-12'))return `Năm ${f.slice(0,4)}`;
  if(f&&t&&addM(f,2)===t&&(+f.slice(5)-1)%3===0)return `Quý ${QN(f)}/${f.slice(0,4)}`;
  return `${f?vn(f+'-01').slice(3):'…'} → ${t?vn(t+'-01').slice(3):'…'}`}
async function renderReviewBar(id){
  const [p,ms]=await Promise.all([api.q('reviewPeriod'),api.q('months')]);const yms=ms.map(m=>m.ym).sort();
  if(!yms.length){$(id).innerHTML='<span class="mut">Chưa có dữ liệu.</span>';return}
  const f=p.from,t=p.to,years=[...new Set(yms.map(m=>m.slice(0,4)))].reverse(),quarters=[...new Set(yms.map(m=>`${m.slice(0,4)}-Q${QN(m)}`))].reverse();
  let mode='all';if(f||t){if(f===t)mode='m';else if(f&&t&&f.slice(0,4)===t.slice(0,4)&&f.endsWith('-01')&&t.endsWith('-12'))mode='y';else if(f&&t&&addM(f,2)===t&&(+f.slice(5)-1)%3===0)mode='q';else mode='r'}
  const opt=(v,l,sel)=>`<option value="${v}" ${sel?'selected':''}>${l}</option>`;
  const mSel=(cls,cur)=>`<select class="input ${cls}">${[...yms].reverse().map(m=>opt(m,`${m.slice(5)}/${m.slice(0,4)}`,m===cur)).join('')}</select>`;
  let val='';
  if(mode==='m')val=mSel('rvM',f);
  if(mode==='q')val=`<select class="input rvQ">${quarters.map(q=>opt(q,`Quý ${q.slice(6)}/${q.slice(0,4)}`,f&&q===`${f.slice(0,4)}-Q${QN(f)}`)).join('')}</select>`;
  if(mode==='y')val=`<select class="input rvY">${years.map(y=>opt(y,'Năm '+y,f&&y===f.slice(0,4))).join('')}</select>`;
  if(mode==='r')val=`Từ ${mSel('rvF',f||yms[0])} đến ${mSel('rvT',t||yms.at(-1))}`;
  $(id).innerHTML=`<span class="lbl">${ic('alert')}Kỳ rà soát lỗi</span>
    <select class="input rvMode">${opt('all','Toàn bộ dữ liệu',mode==='all')}${opt('m','Theo tháng',mode==='m')}${opt('q','Theo quý',mode==='q')}${opt('y','Theo năm',mode==='y')}${opt('r','Khoảng tháng',mode==='r')}</select>${val}
    <span class="mut" style="font-size:13px">Chỉ lỗi trong kỳ này được hiển thị, báo cáo và gửi email. Dữ liệu ngoài kỳ vẫn dùng cho phân tích công nợ, tồn kho, doanh thu – chi phí.</span>`;
  const el=$(id),g=c=>el.querySelector(c)?.value;
  el.onchange=async e=>{let from='',to='';const mode=g('.rvMode');
    if(e.target.classList.contains('rvMode')){const last=yms.at(-1);
      if(mode==='m')from=to=last;else if(mode==='q'){const q0=addM(last,-((+last.slice(5)-1)%3));from=q0;to=addM(q0,2)}else if(mode==='y'){from=last.slice(0,4)+'-01';to=last.slice(0,4)+'-12'}else if(mode==='r'){from=yms[0];to=last}}
    else if(mode==='m')from=to=g('.rvM');
    else if(mode==='q'){const q=g('.rvQ'),y=q.slice(0,4),n=+q.slice(6);from=`${y}-${String(n*3-2).padStart(2,'0')}`;to=addM(from,2)}
    else if(mode==='y'){const y=g('.rvY');from=y+'-01';to=y+'-12'}
    else if(mode==='r'){from=g('.rvF');to=g('.rvT');if(from>to)[from,to]=[to,from]}
    await api.q('setReviewPeriod',from,to);OFF=0;FIL={...FIL,month:''};await refreshSide();go(PAGE)};
}

/* ---------- Phân tích dữ liệu (tách khỏi bước nạp) ---------- */
async function refreshPending(){
  const st=await api.q('analysisStatus'),n=st.pending.length;
  $('#anPending').textContent=n;$('#anPending').classList.toggle('hide',!n);
  const old=st.pending.filter(x=>x.old).length,list=st.pending.slice(0,6).map(x=>x.ym.slice(5)+'/'+x.ym.slice(0,4)).join(', ')+(n>6?'…':'');
  $$('.pendNote').forEach(el=>{el.classList.toggle('hide',!n);
    el.innerHTML=n?`${ic('alert')}<span><b>${n} tháng trong kỳ rà soát chưa được phân tích${old?` (${old} tháng phân tích bằng bộ quy tắc cũ)`:''}</b>: ${list}. Kết quả lỗi đang hiển thị chưa đầy đủ.</span><button class="btn sm primary" data-act="analyze">Phân tích ngay</button>`:''});
  return st;
}
async function runAnalyze(all=false){
  const st=await api.q('analysisStatus');
  const label=all?'TOÀN BỘ dữ liệu (mọi tháng)':`kỳ rà soát: ${rvLabel(st.review)} (${st.months} tháng)`;
  if(!confirm(`Phân tích ${label}?\n\nKết quả lỗi cũ của các tháng này được tính lại; trạng thái và ghi chú xử lý vẫn được giữ.`))return;
  try{const r=await api.task(all?'recheck':'analyze',all?{}:st.review);alert(`Đã phân tích ${num(r.rows)} dòng · ${r.months} tháng · ${Math.round(r.secs)} giây.`)}catch(e){alert(e.message)}
  await refreshSide();go(PAGE);
}
$('#btnAnalyze').onclick=()=>runAnalyze(false);
document.addEventListener('click',e=>{if(e.target.closest('[data-act=analyze]'))runAnalyze(false)});

async function refreshSide(){
  refreshPending();
  const s=await api.q('stats');
  $('#sideFoot').innerHTML=`<b>${num(s.entries)}</b> dòng · <b>${s.monthsOn}/${s.months}</b> tháng đang phân tích`;
  const [f,rp]=await Promise.all([api.q('errorFacets'),api.q('reviewPeriod')]);const n=f.status.open+f.status.doing;
  $('#sideRv').innerHTML=`Kỳ rà soát lỗi<b>${rvLabel(rp)}</b>`;
  $('#navErr').textContent=n>999?(Math.round(n/100)/10).toLocaleString('vi')+'k':n;$('#navErr').classList.toggle('hide',!n);
}

/* ---------- Nạp dữ liệu & tiến độ ---------- */
async function doImport(files){
  try{const log=files?await api.importFiles(files):await api.pickAndImport();
    if(log){alert('Kết quả nạp dữ liệu:\n\n'+log.join('\n'));await refreshSide();go(PAGE)}}
  catch(e){alert(e.message)}
}
$('#btnImport').onclick=()=>doImport();
api.onProgress(m=>{
  if(m.done){$('#toast').classList.add('hide');return}
  $('#toast').classList.remove('hide');$('#tLabel').textContent=m.label||'Đang xử lý…';
  $('#tSub').textContent=m.rows?`${num(m.rows)} dòng`+(m.secs?` · ${num(Math.round(m.rows/m.secs))} dòng/giây`:''):'';
  const has=m.pct!=null;$('#tBar').classList.toggle('ind',!has);$('#tPct').textContent=has?Math.round(m.pct)+'%':'';if(has)$('#tBar i').style.width=m.pct+'%';
});
api.onReload(()=>{refreshSide();go(PAGE)});
let dragN=0;
window.addEventListener('dragenter',e=>{e.preventDefault();dragN++;$('#dropmask').classList.remove('hide')});
window.addEventListener('dragleave',()=>{if(--dragN<=0){dragN=0;$('#dropmask').classList.add('hide')}});
window.addEventListener('dragover',e=>e.preventDefault());
window.addEventListener('drop',e=>{e.preventDefault();dragN=0;$('#dropmask').classList.add('hide');const f=[...e.dataTransfer.files];if(f.length)doImport(f)});

/* ---------- Tổng quan ---------- */
async function vOverview(){
  const o=await api.q('overview');const empty=!o.rows;
  $('#ovEmpty').classList.toggle('hide',!empty);$('#ovBody').classList.toggle('hide',empty);if(empty)return;
  $('#hYear').textContent=o.year||'';$('#hSub').textContent=`Kỳ dữ liệu ${vn(o.dmin)} → ${vn(o.dmax)}`;
  $('#hRows').textContent=num(o.rows);$('#hDocs').textContent=num(o.docs);$('#hErr').textContent=num(o.errs);$('#hErrL').textContent='cảnh báo · '+rvLabel(o.review).toLowerCase();$('#hHigh').textContent=num(o.high);
  $('#ovKpi').innerHTML=kpi('','file','Dòng có cảnh báo',num(o.errRows),pct(o.errRows/o.rvRows)+' số dòng trong kỳ rà soát')+`<div class="kpi click" data-gg="staff" style="cursor:pointer"><div class="ic" style="background:#EFF4FF;color:#155EEF;border-color:#D1E0FF">${ic('users')}</div><div class="lb">Sai sót nhân viên</div><div class="v">${num(o.byRule.filter(r=>RULE[r.k]?.g==='staff').reduce((s,r)=>s+r.n,0))}</div><div class="s">lỗi thao tác nhập liệu</div></div>`
    +`<div class="kpi click" data-gg="audit" style="cursor:pointer"><div class="ic" style="background:#F5F3FF;color:#7839EE;border-color:#DDD6FE">${ic('file')}</div><div class="lb">Sai sót dễ bị kiểm toán</div><div class="v">${num(o.byRule.filter(r=>RULE[r.k]?.g==='audit').reduce((s,r)=>s+r.n,0))}</div><div class="s">${num(o.high)} lỗi mức cao (mọi nhóm)</div></div>`
    +kpi('blue','coins',`Doanh thu thuần ${o.year||''}`,fmt(o.net),'theo dữ liệu đã nạp')+kpi(o.pat<0?'red':'green','trend',`Lợi nhuận sau thuế ${o.year||''}`,fmt(o.pat),o.pat<0?'lỗ':'lãi');
  const sevC={H:C.err,M:C.brand,L:C.navy};
  chart('chRule',{type:'bar',data:{labels:o.byRule.map(r=>RULE[r.k]?.n||r.k),datasets:[{data:o.byRule.map(r=>r.n),backgroundColor:o.byRule.map(r=>sevC[r.sev]),barThickness:16}]},
    options:{indexAxis:'y',plugins:{legend:{display:false}},onClick:(e,el)=>{if(el[0]){FIL={rule:o.byRule[el[0].index].k};go('errors')}}}});
  chart('chUser',{type:'bar',data:{labels:o.byUser.map(u=>short(u.u)),datasets:[{label:'Dòng lỗi',data:o.byUser.map(u=>u.bad),backgroundColor:C.brand,barThickness:22},{label:'Tổng dòng nhập',data:o.byUser.map(u=>u.total),backgroundColor:C.brand1,barThickness:22}]},
    options:{plugins:{tooltip:{callbacks:{afterBody:i=>'Tỷ lệ lỗi: '+pct(o.byUser[i[0].dataIndex].bad/o.byUser[i[0].dataIndex].total)}}}}});
  chart('chTrend',{data:{labels:o.trend.map(m=>m.k),datasets:[{type:'bar',label:'Doanh thu thuần',data:o.trend.map(m=>m.net),backgroundColor:C.brand,maxBarThickness:32},
    {type:'bar',label:'Tổng chi phí',data:o.trend.map(m=>m.net-m.pbt),backgroundColor:C.gray,maxBarThickness:32},{type:'line',label:'LN trước thuế',data:o.trend.map(m=>m.pbt),borderColor:C.navy,backgroundColor:C.navy,tension:.3}]}});
}

/* ---------- Lỗi nhập liệu ---------- */
let FIL={},SORT={k:'sev',d:1},OFF=0,VIEW=[],CUR=-1,TOTAL=0;const LIM=200;
function readFil(){const v=id=>$(id).value;return {group:FIL.group||'',status:FIL.status||'',sev:v('#fSev'),rule:v('#fRule'),user:v('#fUser'),month:v('#fMonth'),dept:v('#fDept'),acc:v('#fAcc').trim(),min:v('#fMin'),max:v('#fMax'),text:v('#fText').trim()}}
function fillSel(id,items,label,cur){$(id).innerHTML=`<option value="">${label}</option>`+items.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('');$(id).value=cur||''}
async function vErrors(keep){
  renderReviewBar('#rvErr');
  const f=await api.q('errorFacets');
  if(!keep){
    fillSel('#fRule',f.rules.filter(r=>!FIL.group||RULE[r.k]?.g===FIL.group).map(r=>[r.k,`${RULE[r.k]?.n||r.k} (${num(r.n)})`]),'Tất cả loại lỗi',FIL.rule);
    fillSel('#fUser',f.users.map(u=>[u,short(u)]),'Tất cả người nhập',FIL.user);
    fillSel('#fMonth',f.months.map(m=>[m,m]),'Tất cả tháng',FIL.month);
    fillSel('#fDept',f.depts.map(d=>[d,d]),'Tất cả bộ phận',FIL.dept);
    for(const [k,id] of [['sev','#fSev'],['acc','#fAcc'],['min','#fMin'],['max','#fMax'],['text','#fText']])$(id).value=FIL[k]||'';
  }
  FIL=readFil();
  const all=Object.values(f.status).reduce((a,b)=>a+b,0);
  const gc={staff:0,audit:0};f.rules.forEach(r=>gc[RULE[r.k]?.g]+=r.n);
  const GT=[['','alert','Tất cả cảnh báo','Toàn bộ kết quả rà soát trong kỳ',gc.staff+gc.audit],['staff','users','Sai sót nhân viên','Lỗi thao tác nhập liệu: thiếu trường, chọn sai TK, diễn giải kém… → nhắc nhở, đào tạo',gc.staff],
    ['audit','file','Sai sót dễ bị kiểm toán','Dấu hiệu kiểm toán viên hay chọn mẫu, nêu trong thư quản lý: sai kỳ, doanh thu, trùng lặp, bút toán thủ công lớn…',gc.audit]];
  $('#grpTabs').innerHTML=GT.map(([k,icn,t,d,n])=>`<button data-g="${k}" class="${(FIL.group||'')===k?'on':''}"><span class="ic">${ic(icn)}</span><span><b>${t}</b><small>${d}</small></span><span class="n">${num(n)}</span></button>`).join('');
  $('#stTabs').innerHTML=[['','Tất cả',all],...Object.entries(META.status).map(([k,n])=>[k,n,f.status[k]])]
    .map(([k,n,c])=>`<button class="${(FIL.status||'')===k?'on':''}" data-st="${k}">${n}<b>${num(c)}</b></button>`).join('')+
    (f.gone.length?`<button data-gone="1">${ic('check')}Đã sửa trong ERP<b>${f.gone.length}</b></button>`:'');
  $('#goneCard').classList.toggle('hide',!f.gone.length);
  $('#tGone').innerHTML='<thead><tr><th>Loại lỗi</th><th>Chứng từ</th><th>Trạng thái đã ghi</th><th>Ghi chú</th><th>Cập nhật</th></tr></thead><tbody>'+f.gone.map(r=>`<tr><td>${esc(RULE[r.rule]?.n||r.rule)}</td><td>${esc(r.doc)}</td><td><span class="badge s-${r.status}">${META.status[r.status]||''}</span></td><td>${esc(r.note)}</td><td class=nw>${esc(r.at)}</td></tr>`).join('')+'</tbody>';
  const cnt=Object.fromEntries(f.rules.map(r=>[r.k,r.n]));
  const sevO={H:0,M:1,L:2};
  $('#tRules').innerHTML='<thead><tr><th>Mức</th><th>Quy tắc</th><th>Ý nghĩa / rủi ro</th><th>Cách khắc phục</th><th class=n>Cảnh báo</th></tr></thead><tbody>'+
    ['staff','audit'].filter(g=>!FIL.group||FIL.group===g).map(g=>`<tr class="grow"><td colspan=5><span class="badge g-${g}">${META.groups[g]}</span> ${META.rules.filter(r=>r.g===g).length} quy tắc · ${num(META.rules.filter(r=>r.g===g).reduce((s,r)=>s+(cnt[r.k]||0),0))} cảnh báo</td></tr>`+
    META.rules.filter(r=>r.g===g).sort((a,b)=>sevO[a.s]-sevO[b.s]||(cnt[b.k]||0)-(cnt[a.k]||0)).map(r=>`<tr class="r${r.s}"><td><span class="badge b-${r.s}">${SEVL[r.s]}</span></td><td><b>${esc(r.n)}</b><div class=mut style="font-size:12px">${r.k}</div></td><td>${esc(r.d)}${r.why?`<div class="why"><b>Vì sao kiểm toán quan tâm:</b> ${esc(r.why)}</div>`:''}</td><td>${esc(r.fix)}</td><td class=n>${num(cnt[r.k])}</td></tr>`).join('')).join('')+'</tbody>';
  await loadErrTable();
}
async function loadErrTable(){
  const H=(k,t,c='')=>`<th class="sort ${c} ${SORT.k===k?'on':''}" data-s="${k}">${t}${SORT.k===k?(SORT.d>0?' ↑':' ↓'):''}</th>`;
  if($('#fGroup').value==='doc'){
    const r=await api.q('errorGroups',FIL,OFF,LIM);TOTAL=r.total;VIEW=[];
    $('#errCount').innerHTML=`<b>${num(r.total)}</b> chứng từ có cảnh báo`;
    $('#tErr').innerHTML='<thead><tr><th>Chứng từ</th><th>Ngày</th><th class=n>Cảnh báo</th><th class=n>Mức cao</th><th class=n>Chưa xử lý</th><th>Các loại lỗi</th><th>Người nhập</th></tr></thead><tbody>'+
      r.rows.map(g=>`<tr class="click r${g.high?'H':'M'}" data-eid="${g.eid}"><td><b>${esc(g.doc)}</b></td><td class=nw>${vn(g.date)}</td><td class=n>${g.n}</td><td class="n ${g.high?'neg':''}">${g.high||''}</td><td class=n>${g.open||'<span class=pos>✓</span>'}</td><td>${esc(String(g.rules).split(',').map(k=>RULE[k]?.n||k).join(' · '))}</td><td>${esc(short(g.user))}</td></tr>`).join('')+'</tbody>';
  }else{
    const r=await api.q('errors',FIL,SORT,OFF,LIM);TOTAL=r.total;VIEW=r.rows;
    $('#errCount').innerHTML=`<b>${num(r.total)}</b> cảnh báo phù hợp bộ lọc`;
    $('#tErr').innerHTML='<thead><tr>'+H('sev','Mức')+H('st','Trạng thái')+H('rule','Loại lỗi')+'<th>Chi tiết</th>'+H('date','Ngày')+H('doc','Chứng từ')+'<th>Nợ</th><th>Có</th>'+H('amt','Số tiền','n')+'<th>Diễn giải</th>'+H('user','Người nhập')+'<th>Ghi chú</th></tr></thead><tbody>'+
     r.rows.map((e,i)=>`<tr class="click r${e.sev} ${e.status==='fixed'||e.status==='ignore'?'done':''}" data-i="${i}"><td><span class="badge b-${e.sev}">${SEVL[e.sev]}</span></td><td><span class="badge s-${e.status}">${META.status[e.status]}</span></td>
      <td class=nw><b>${esc(RULE[e.k]?.n)}</b></td><td><div class="clamp s" title="${esc(e.msg)}">${esc(e.msg)}</div></td><td class=nw>${vn(e.date)}</td><td class=nw>${esc(e.doc)}</td><td>${esc(e.dr)}</td><td>${esc(e.cr)}</td><td class=n>${fmt2(e.amt)}</td>
      <td><div class=clamp title="${esc(e.desc)}">${esc(e.desc)}</div></td><td class=nw>${esc(short(e.user))}</td><td title="${esc(e.note||'')}">${e.note?esc(e.note.slice(0,40)):''}</td></tr>`).join('')+'</tbody>';
  }
  const pages=Math.max(1,Math.ceil(TOTAL/LIM)),p=Math.floor(OFF/LIM)+1;
  $('#pgErr').innerHTML=`Trang <b>${p}</b> / ${num(pages)}<button class="btn sm" data-pg="-1" ${p<=1?'disabled':''}>‹ Trước</button><button class="btn sm" data-pg="1" ${p>=pages?'disabled':''}>Sau ›</button>`;
}
let tmr;const refilter=()=>{clearTimeout(tmr);tmr=setTimeout(()=>{OFF=0;FIL=readFil();loadErrTable()},250)};
['#fSev','#fRule','#fUser','#fMonth','#fDept','#fGroup'].forEach(s=>$(s).onchange=refilter);['#fAcc','#fMin','#fMax','#fText'].forEach(s=>$(s).oninput=refilter);
$('#fReset').onclick=()=>{FIL={group:FIL.group};OFF=0;vErrors()};
$('#grpTabs').onclick=e=>{const b=e.target.closest('[data-g]');if(!b)return;FIL.group=b.dataset.g;FIL.rule='';OFF=0;vErrors()};
$('#stTabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.gone){$('#goneCard').scrollIntoView({behavior:'smooth'});return}FIL.status=b.dataset.st;OFF=0;vErrors(true)};
$('#pgErr').onclick=e=>{const b=e.target.closest('[data-pg]');if(!b)return;OFF=Math.max(0,OFF+ +b.dataset.pg*LIM);loadErrTable();$('#content').scrollTop=0};
$('#tErr').onclick=e=>{const th=e.target.closest('th[data-s]');if(th){SORT=SORT.k===th.dataset.s?{k:SORT.k,d:-SORT.d}:{k:th.dataset.s,d:1};OFF=0;return loadErrTable()}
  const tr=e.target.closest('tr.click');if(!tr)return;if(tr.dataset.eid)showDetail(null,+tr.dataset.eid);else showDetail(+tr.dataset.i)};
$('#expErr').onclick=()=>api.exportErrors(readFil(),SORT);
$('#bulkSt').onchange=async e=>{const st=e.target.value;e.target.value='';if(!st)return;
  if(!confirm(`Đặt trạng thái "${META.status[st]}" cho ${num(TOTAL)} cảnh báo đang lọc?`))return;
  await api.q('setStatusWhere',readFil(),st);vErrors(true);refreshSide()};

const FIELDS=[['doc','Chứng từ'],['line','Line No'],['date','Ngày hạch toán'],['due','Hạn thanh toán'],['drName','TK Nợ'],['crName','TK Có'],['amt','Số tiền'],['qty','Số lượng'],['price','Đơn giá'],
  ['bp','Đối tượng Nợ'],['bpCr','Đối tượng Có'],['desc','Diễn giải'],['descP','Diễn giải chứng từ'],['dept','Bộ phận'],['deptSub','Bộ phận con'],['tcost','Khoản mục chi phí'],['trev','Loại doanh thu'],
  ['inv','Invoice'],['adv','Advance Request'],['contract','Hợp đồng'],['table','Nguồn (Table)'],['cf','Lưu chuyển tiền'],['user','Người tạo'],['updUser','Người sửa'],['file','File nguồn']];
async function showDetail(i,eid){
  if(i!=null){CUR=i;eid=VIEW[i]?.eid}else CUR=-1;if(!eid)return;
  const d=await api.q('errorDetail',eid);if(!d)return;const e=d.e,full=d.full;
  const fv=k=>{const v=full[k];return k==='date'||k==='due'?vn(v):typeof v==='number'?fmt2(v):v??''};
  const total=d.lines.reduce((s,l)=>s+l.amt,0),nav=CUR>=0;
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Chứng từ</div><h2 style="font-size:20px">${esc(e.doc)}</h2></div><div style="flex:1"></div>
     ${nav?`<button class="btn sm" id="dPrev">‹ Trước</button><span class="mut">${num(OFF+CUR+1)} / ${num(TOTAL)}</span><button class="btn sm" id="dNext">Sau ›</button>`:''}<button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
   <div class="pb">
   <div class="card"><div class="card-h"><h3>Cảnh báo của dòng đang chọn</h3><span class="hint">line ${esc(e.line)} · ${vn(e.date)} · ${fmt2(e.amt)}</span></div>
     ${d.rowErrs.map(x=>`<div class="fix ${x.sev}"><div class="t"><span class="badge b-${x.sev}">${SEVL[x.sev]}</span>${esc(RULE[x.k]?.n)}<span class="mut" style="font-weight:400">– ${esc(x.msg)}</span><div style="flex:1"></div><span class="badge s-${x.status}">${META.status[x.status]}</span></div>
       <div class="mut" style="margin-top:6px;font-size:13px"><span class="badge g-${RULE[x.k]?.g}">${META.groups[RULE[x.k]?.g]||''}</span> ${esc(RULE[x.k]?.d)}</div>${RULE[x.k]?.why?`<div class="why"><b>Vì sao kiểm toán quan tâm:</b> ${esc(RULE[x.k].why)}</div>`:''}<div class="how"><b>Cần chỉnh sửa:</b> ${esc(RULE[x.k]?.fix||'Kiểm tra lại chứng từ gốc.')}</div></div>`).join('')}</div>
   <div class="card"><div class="card-h"><h3>Xử lý cảnh báo</h3><span class="badge b-${e.sev}">${esc(RULE[e.k]?.n)}</span>${e.at?`<span class="hint">cập nhật ${esc(e.at)}</span>`:''}</div>
     <div class="row"><label class="field" style="width:220px">Trạng thái<select class="input" id="dSt">${Object.entries(META.status).map(([k,n])=>`<option value="${k}" ${k===e.status?'selected':''}>${n}</option>`).join('')}</select></label>
       <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" id="dAll">Áp dụng cho tất cả cảnh báo của chứng từ này</label></div>
     <label class="field" style="margin-top:12px">Ghi chú<textarea class="input" id="dNote" placeholder="Đã yêu cầu ai sửa, cách sửa, số chứng từ điều chỉnh…">${esc(e.note||'')}</textarea></label>
     <div class="row" style="margin-top:12px"><button class="btn primary" id="dSave">Lưu</button>${nav?'<button class="btn" id="dSaveNext">Lưu & sang lỗi tiếp ›</button>':''}<span class="pos" id="dMsg"></span></div></div>
   <div class="card"><div class="card-h"><h3>Toàn bộ bút toán của chứng từ</h3><span class="hint">${d.lines.length} dòng · tổng ${fmt2(total)}</span></div>
     <div class="tbl" style="max-height:380px"><table><thead><tr><th>Line</th><th>Cảnh báo</th><th>Ngày</th><th>TK Nợ</th><th>TK Có</th><th class=n>Số tiền</th><th>Đối tượng Nợ</th><th>Đối tượng Có</th><th>Diễn giải</th><th>Khoản mục</th></tr></thead><tbody>
     ${d.lines.map(l=>{const w=l.errs.length?l.errs.reduce((a,b)=>'HML'.indexOf(a.sev)<='HML'.indexOf(b.sev)?a:b).sev:'';
       return `<tr class="${w?'r'+w:''} ${l.rid===e.rid?'cur':''}"><td>${esc(l.line)}</td><td>${l.errs.map(x=>`<span class="badge b-${x.sev}" title="${esc(x.msg)}">${esc(RULE[x.k]?.n)}</span>`).join(' ')}</td><td class=nw>${vn(l.date)}</td><td>${esc(l.drName)}</td><td>${esc(l.crName)}</td><td class=n>${fmt2(l.amt)}</td><td>${esc(l.bp)}</td><td>${esc(l.bpCr)}</td><td>${esc(l.desc)}</td><td>${esc(l.tcost)}</td></tr>`}).join('')}
     </tbody></table></div></div>
   <div class="card"><div class="card-h"><h3>Chi tiết đầy đủ dòng đang chọn</h3></div><div class="kv">${FIELDS.map(([k,n])=>`<div>${n}</div><div>${esc(fv(k))}</div>`).join('')}</div></div>
   </div>`;
  $('#drawer').classList.remove('hide');$('#dPane').scrollTop=0;
  const save=async()=>{const status=$('#dSt').value,note=$('#dNote').value.trim();
    if($('#dAll').checked)await api.q('setStatusDoc',e.doc,status,note);
    else await api.q('setReviews',[{key:e.key,rule:e.k,doc:e.doc,status,note,snapshot:JSON.stringify({m:e.ym,amt:e.amt,desc:String(e.desc||'').slice(0,200)})}]);
    refreshSide();if(PAGE==='errors')await loadErrTable()};
  $('#dClose').onclick=closeDetail;
  if(nav){$('#dPrev').onclick=()=>step(-1);$('#dNext').onclick=()=>step(1);$('#dSaveNext').onclick=async()=>{await save();step(1)}}
  $('#dSave').onclick=async()=>{await save();$('#dMsg').textContent='✓ Đã lưu'};
}
async function step(d){let j=CUR+d;
  if(j<0&&OFF>0){OFF-=LIM;await loadErrTable();j=VIEW.length-1}else if(j>=VIEW.length&&OFF+LIM<TOTAL){OFF+=LIM;await loadErrTable();j=0}
  if(j>=0&&j<VIEW.length)showDetail(j)}
function closeDetail(){$('#drawer').classList.add('hide');CUR=-1}
$('#drawer').onclick=e=>{if(e.target.id==='drawer')closeDetail()};
document.addEventListener('keydown',e=>{if($('#drawer').classList.contains('hide')||/TEXTAREA|INPUT|SELECT/.test(e.target.tagName))return;
  if(e.key==='Escape')closeDetail();if(CUR>=0&&(e.key==='ArrowDown'||e.key==='ArrowRight'))step(1);if(CUR>=0&&(e.key==='ArrowUp'||e.key==='ArrowLeft'))step(-1)});

/* ---------- Công nợ ---------- */
const refShort=v=>{const p=String(v??'').split('_'),h=p.length/2;return p.length%2===0&&p.slice(0,h).join('_')===p.slice(h).join('_')?p.slice(0,h).join('_'):String(v??'')}; // 'NO: 05/..._NO: 05/...' → 'NO: 05/...'
const BUCKETS=['Chưa đến hạn','1–30','31–60','61–90','91–180','181–365','> 365'];
const BCOL=[C.ok,'#FFD4BD','#FF9C6B','#FF6929','#FA4700','#D63600','#8A2200'];
const GRPN={thu:'Phải thu',tra:'Phải trả'};
let AGDATA=null,AGV={det:[],abn:[]};
async function vAging(reload=true){
  if(!$('#asOf').value){const s=await api.q('overview');if(s.dmax)$('#asOf').value=s.dmax}if(!$('#asOf').value)return;
  if(reload||!AGDATA)AGDATA=await api.q('aging',$('#asOf').value,+$('#term').value||0,$('#agLevel').value,$('#agDim').value);
  const grp=$('#agGrp').value,cur=$('#agAcc').value,find=$('#agFind').value.trim().toLowerCase();
  const inGrp=AGDATA.items.filter(o=>!grp||o.grp===grp);
  const accs=[...new Map(inGrp.map(o=>[o.acc,o])).values()].sort((a,b)=>a.acc.localeCompare(b.acc));
  fillSel('#agAcc',accs.map(o=>[o.acc,`${o.acc} – ${o.accName}`]),'Tất cả tài khoản',accs.some(o=>o.acc===cur)?cur:'');
  const sel=inGrp.filter(o=>!$('#agAcc').value||o.acc===$('#agAcc').value),pos=sel.filter(o=>o.bal>0),abn=sel.filter(o=>o.bal<0);
  // KPI theo nhóm
  const tot=g=>{const L=pos.filter(o=>o.grp===g),b=Array(7).fill(0);L.forEach(o=>o.b.forEach((v,i)=>b[i]+=v));const t=b.reduce((x,y)=>x+y,0);return {t,over:t-b[0],o90:b[4]+b[5]+b[6],n:L.length}};
  const T=tot('thu'),P=tot('tra');
  $('#agKpi').innerHTML=(grp!=='tra'?kpi('blue','wallet','Tổng phải thu',fmt(T.t),`${num(T.n)} đối tượng · quá hạn ${pct(T.over/T.t)}`)+kpi('red','alert','Phải thu quá hạn > 90 ngày',fmt(T.o90),pct(T.o90/T.t)+' tổng phải thu'):'')
    +(grp!=='thu'?kpi('','coins','Tổng phải trả',fmt(P.t),`${num(P.n)} đối tượng · quá hạn ${pct(P.over/P.t)}`)+kpi('red','alert','Phải trả quá hạn > 90 ngày',fmt(P.o90),pct(P.o90/P.t)+' tổng phải trả'):'')
    +kpi('','users','Dư ngược chiều',num(abn.length),'đối tượng cần đối chiếu');
  // Tổng hợp theo tài khoản
  const S=new Map();
  for(const o of sel){const x=S.get(o.acc)||S.set(o.acc,{acc:o.acc,name:o.accName,grp:o.grp,n:0,bal:0,b:Array(7).fill(0),abn:0}).get(o.acc);
    if(o.bal>0){x.n++;x.bal+=o.bal;o.b.forEach((v,i)=>x.b[i]+=v)}else x.abn+=o.bal}
  const SL=[...S.values()].sort((a,b)=>a.grp.localeCompare(b.grp)*-1||a.acc.localeCompare(b.acc));
  const sub=g=>{const L=SL.filter(x=>x.grp===g);if(!L.length)return '';const b=Array(7).fill(0);L.forEach(x=>x.b.forEach((v,i)=>b[i]+=v));const t=b.reduce((p,q)=>p+q,0),ab=L.reduce((p,x)=>p+x.abn,0);
    return `<tr style="background:var(--brand-25)"><td colspan=2><b>Cộng ${GRPN[g].toLowerCase()}</b></td><td class=n><b>${num(L.reduce((p,x)=>p+x.n,0))}</b></td><td class=n><b>${fmt2(t)}</b></td>${b.map(v=>`<td class=n><b>${Math.abs(v)>=0.005?fmt2(v):''}</b></td>`).join('')}<td class=n><b>${pct((t-b[0])/t)}</b></td><td class="n neg">${ab?fmt2(ab):''}</td></tr>`};
  const row=x=>{const t=x.bal;return `<tr class="click dbl" title="Bấm: lọc chi tiết · Nhấn đúp: xem bút toán" data-acc="${esc(x.acc)}"><td class=nw><b>${esc(x.acc)}</b></td><td style="min-width:240px">${esc(x.name)}</td><td class=n>${num(x.n)}</td><td class=n><b>${fmt2(t)}</b></td>${x.b.map(v=>`<td class=n>${Math.abs(v)>=0.005?fmt2(v):''}</td>`).join('')}<td class=n>${pct((t-x.b[0])/t)}</td><td class="n neg">${Math.abs(x.abn)>=0.005?fmt2(x.abn):''}</td></tr>`};
  $('#tAgSum').innerHTML='<thead><tr><th>TK</th><th>Tên tài khoản</th><th class=n>Đối tượng</th><th class=n>Số dư</th>'+BUCKETS.map(b=>`<th class=n>${b}</th>`).join('')+'<th class=n>% quá hạn</th><th class=n>Dư ngược chiều</th></tr></thead><tbody>'+
    ['thu','tra'].map(g=>SL.filter(x=>x.grp===g).map(row).join('')+sub(g)).join('')+'</tbody>';
  chart('chAging',{type:'bar',data:{labels:SL.map(x=>x.acc),datasets:BUCKETS.map((b,i)=>({label:b,data:SL.map(x=>x.b[i]),backgroundColor:BCOL[i],borderRadius:0,maxBarThickness:48}))},
    options:{scales:{x:{stacked:true},y:{stacked:true}},plugins:{tooltip:{callbacks:{title:i=>{const x=SL[i[0].dataIndex];return x.acc+' – '+x.name}}}}}});
  const REFH0={contract:'Hợp đồng',adv:'Đề nghị TU',tcost:'Khoản mục'}[$('#agDim').value];AGV.abn=abn;
  $('#tAbn').innerHTML='<thead><tr><th>TK</th><th>Đối tượng</th>'+(REFH0?`<th>${REFH0}</th>`:'')+'<th class=n>PS Nợ</th><th class=n>PS Có</th><th class=n>Dư ngược</th></tr></thead><tbody>'+
    abn.sort((a,b)=>a.bal-b.bal).map((o,i)=>`<tr class=dbl data-agn="${i}"><td title="${esc(o.accName)}">${esc(o.acc)}</td><td>${esc(o.bp)}</td>${REFH0?`<td class=nw title="${esc(o.ref)}">${esc(refShort(o.ref))}</td>`:''}<td class=n>${fmt2(o.dr)}</td><td class=n>${fmt2(o.cr)}</td><td class="n neg">${fmt2(o.bal)}</td></tr>`).join('')+'</tbody>';
  const dim=$('#agDim').value,REFH={contract:'Hợp đồng',adv:'Đề nghị tạm ứng',tcost:'Khoản mục chi phí'}[dim],refCell=o=>REFH?`<td class=nw title="${esc(o.ref)}">${esc(refShort(o.ref))}</td>`:'';
  const det=pos.filter(o=>!find||(o.bp+' '+(o.ref||'')).toLowerCase().includes(find)).sort((a,b)=>b.bal-a.bal);
  AGV.det=det;
  $('#tAging').innerHTML='<thead><tr><th>Nhóm</th><th>TK</th><th>Đối tượng</th>'+(REFH?`<th>${REFH}</th><th>Phát sinh đầu</th>`:'')+'<th class=n>PS Nợ</th><th class=n>PS Có</th><th class=n>Số dư</th>'+BUCKETS.map(b=>`<th class=n>${b}</th>`).join('')+'<th class=n>Tuổi tối đa</th><th>Đánh giá</th></tr></thead><tbody>'+
   det.slice(0,3000).map((o,i)=>{const o90=o.b[4]+o.b[5]+o.b[6];
    const risk=o.bp.startsWith('(không')?'<span class="badge b-H">Thiếu đối tượng</span>':REFH&&String(o.ref).startsWith('(không')?`<span class="badge b-M">Thiếu ${REFH.toLowerCase()}</span>`:dim==='adv'&&o.maxAge>30?`<span class="badge b-H">Tạm ứng quá ${o.maxAge} ngày chưa quyết toán</span>`:o.acc.startsWith('335')&&o.maxAge>90?`<span class="badge b-H">Trích trước ${o.maxAge} ngày chưa quyết toán/hoàn nhập</span>`:o.b[6]>0?`<span class="badge b-H">${o.grp==='thu'?'Xem xét dự phòng':'Quá hạn > 1 năm'}</span>`:o90>0?`<span class="badge b-M">${o.grp==='thu'?'Đôn đốc thu':'Ưu tiên thanh toán'}</span>`:'';
    return `<tr class=dbl data-ag="${i}"><td><span class="badge ${o.grp==='thu'?'b-L':'s-doing'}">${GRPN[o.grp]}</span></td><td class=nw title="${esc(o.accName)}">${esc(o.acc)}</td><td>${esc(o.bp)}</td>${refCell(o)}${REFH?`<td class=nw>${vn(o.first)}</td>`:''}<td class=n>${fmt2(o.dr)}</td><td class=n>${fmt2(o.cr)}</td><td class=n><b>${fmt2(o.bal)}</b></td>${o.b.map(v=>`<td class=n>${Math.abs(v)>=0.005?fmt2(v):''}</td>`).join('')}<td class=n>${o.maxAge}</td><td>${risk}</td></tr>`}).join('')+'</tbody>';
}
['#asOf','#term','#agLevel','#agDim'].forEach(s=>$(s).onchange=()=>{if(s==='#agLevel')$('#agAcc').value='';vAging(true)});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-preset]');if(!b)return;
  const P={'331c':{grp:'tra',level:'l1',dim:'contract',acc:'331'},'335t':{grp:'tra',level:'l1',dim:'tcost',acc:'335'},'1411a':{grp:'thu',level:'detail',dim:'adv',acc:'1411'},all:{grp:'',level:'l1',dim:'bp',acc:''}}[b.dataset.preset];
  $('#agGrp').value=P.grp;$('#agLevel').value=P.level;$('#agDim').value=P.dim;$('#agAcc').value='';await vAging(true);
  if(P.acc){const opt=[...$('#agAcc').options].find(o=>o.value===P.acc||o.value.startsWith(P.acc));if(opt){$('#agAcc').value=opt.value;vAging(false)}}});
['#agGrp','#agAcc'].forEach(s=>$(s).onchange=()=>vAging(false));
$('#agFind').oninput=()=>vAging(false);
$('#tAgSum').onclick=e=>{const tr=e.target.closest('[data-acc]');if(tr){$('#agAcc').value=tr.dataset.acc;vAging(false);$('#tAging').scrollIntoView({behavior:'smooth'})}};
$('#expAg').onclick=()=>api.exportAging($('#asOf').value,+$('#term').value||0,$('#agLevel').value,$('#agGrp').value,$('#agAcc').value,$('#agDim').value);

/* ---------- Tuổi hàng tồn kho ---------- */
const IBUCKETS=['0–30 ngày','31–90','91–180','181–365','1–2 năm','> 2 năm'];
const IBCOL=[C.ok,'#FFD4BD','#FF9C6B','#FA4700','#D63600','#8A2200'];
let IV={data:null,flag:''},IVV={det:[],neg:[]};
async function vInv(reload=true){
  if(!$('#ivAsOf').value){const s=await api.q('overview');if(s.dmax)$('#ivAsOf').value=s.dmax}if(!$('#ivAsOf').value)return;
  if(reload||!IV.data)IV.data=await api.q('inventory',$('#ivAsOf').value,$('#ivBy').value,$('#ivLevel').value);
  const d=IV.data,cur=$('#ivAcc').value,find=$('#ivFind').value.trim().toLowerCase();
  $('#ivOld').classList.toggle('hide',!d.oldImportRows);
  $('#ivOld').innerHTML=`⚠ ${num(d.oldImportRows)} dòng hàng tồn kho được nạp bằng phiên bản cũ nên chưa có mã hàng/kho. Hãy <b>nạp lại các file đó</b> (chọn "Thay thế") để tính tuổi theo mặt hàng chính xác.`;
  const accs=[...new Map(d.items.map(o=>[o.acc,o])).values()].sort((a,b)=>a.acc.localeCompare(b.acc));
  fillSel('#ivAcc',accs.map(o=>[o.acc,`${o.acc} – ${o.accName}`]),'Tất cả tài khoản',accs.some(o=>o.acc===cur)?cur:'');
  const sel=d.items.filter(o=>!$('#ivAcc').value||o.acc===$('#ivAcc').value),pos=sel.filter(o=>o.bal>0.005),neg=sel.filter(o=>o.bal<-0.005);
  const slow=o=>o.bal>0.005&&(o.sinceOut==null?o.sinceIn>180:o.sinceOut>180),old=o=>o.b[4]+o.b[5]>0.005,noprod=o=>/^\(không có/.test(o.obj);
  const b=Array(6).fill(0);pos.forEach(o=>o.b.forEach((v,i)=>b[i]+=v));const tot=b.reduce((x,y)=>x+y,0),o180=b[3]+b[4]+b[5],o365=b[4]+b[5];
  $('#ivKpi').innerHTML=kpi('','box','Giá trị hàng tồn',fmt(tot),`${num(pos.length)} mặt hàng/đối tượng còn tồn`)+kpi('','alert','Tồn trên 180 ngày',fmt(o180),pct(o180/tot)+' giá trị tồn')
    +kpi('red','alert','Tồn trên 1 năm',fmt(o365),'xem xét dự phòng giảm giá')+kpi('','refresh','Chậm luân chuyển',num(pos.filter(slow).length),'> 180 ngày không xuất')
    +kpi(neg.length?'red':'green','alert','Tồn âm',num(neg.length),'mặt hàng xuất vượt nhập');
  const S=new Map();
  for(const o of sel){const x=S.get(o.acc)||S.set(o.acc,{acc:o.acc,name:o.accName,n:0,bal:0,b:Array(6).fill(0),neg:0}).get(o.acc);if(o.bal>0.005){x.n++;x.bal+=o.bal;o.b.forEach((v,i)=>x.b[i]+=v)}else if(o.bal<-0.005)x.neg+=o.bal}
  const SL=[...S.values()].sort((a,b)=>a.acc.localeCompare(b.acc)),c=v=>Math.abs(v)>=0.005?fmt2(v):'';
  $('#tIvSum').innerHTML='<thead><tr><th>TK</th><th>Tên tài khoản</th><th class=n>Mặt hàng</th><th class=n>Giá trị tồn</th>'+IBUCKETS.map(x=>`<th class=n>${x}</th>`).join('')+'<th class=n>% > 180 ngày</th><th class=n>Tồn âm</th></tr></thead><tbody>'+
    SL.map(x=>`<tr class="click dbl" data-acc="${esc(x.acc)}"><td class=nw><b>${esc(x.acc)}</b></td><td style="min-width:220px">${esc(x.name)}</td><td class=n>${num(x.n)}</td><td class=n><b>${fmt2(x.bal)}</b></td>${x.b.map(v=>`<td class=n>${c(v)}</td>`).join('')}<td class=n>${pct((x.b[3]+x.b[4]+x.b[5])/x.bal)}</td><td class="n neg">${c(x.neg)}</td></tr>`).join('')+
    `<tr style="background:var(--brand-25)"><td colspan=2><b>Tổng cộng</b></td><td class=n><b>${num(pos.length)}</b></td><td class=n><b>${fmt2(tot)}</b></td>${b.map(v=>`<td class=n><b>${c(v)}</b></td>`).join('')}<td class=n><b>${pct(o180/tot)}</b></td><td class="n neg">${c(neg.reduce((s,o)=>s+o.bal,0))}</td></tr></tbody>`;
  chart('chIv',{type:'bar',data:{labels:IBUCKETS,datasets:[{data:b,backgroundColor:IBCOL,barThickness:40}]},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:x=>`${fmt(x.raw)} (${pct(x.raw/tot)})`}}}}});
  const objH={product:'Mặt hàng',product_loc:'Mặt hàng @ Kho',loc:'Kho',bp:'Đối tượng'}[$('#ivBy').value];
  $('#tIvNeg').innerHTML=`<thead><tr><th>TK</th><th>${objH}</th><th class=n>SL tồn</th><th class=n>Giá trị tồn</th><th>Xuất gần nhất</th></tr></thead><tbody>`+
    neg.sort((a,b)=>a.bal-b.bal).map((o,i)=>`<tr class=dbl data-ivn="${i}"><td>${esc(o.acc)}</td><td><div class=clamp title="${esc(o.obj)}">${esc(o.obj)}</div></td><td class="n neg">${fmt2(o.qtyBal)} ${esc(o.uom)}</td><td class="n neg">${fmt2(o.bal)}</td><td class=nw>${vn(o.lastOut)}</td></tr>`).join('')+'</tbody>';
  const f={slow,old,noprod}[IV.flag]||(()=>true);
  IVV.neg=neg;
  const det=pos.filter(f).filter(o=>!find||o.obj.toLowerCase().includes(find)).sort((a,b)=>b.bal-a.bal);
  IVV.det=det;
  $('#tIv').innerHTML=`<thead><tr><th>TK</th><th>${objH}</th><th>ĐVT</th><th class=n>SL nhập</th><th class=n>SL xuất</th><th class=n>SL tồn</th><th class=n>Giá trị tồn</th>`+IBUCKETS.map(x=>`<th class=n>${x}</th>`).join('')+'<th>Nhập gần nhất</th><th>Xuất gần nhất</th><th>Đánh giá</th></tr></thead><tbody>'+
    det.slice(0,3000).map((o,i)=>{const tags=[];if(noprod(o))tags.push('<span class="badge b-H">Thiếu mã hàng</span>');if(o.b[5]>0.005)tags.push('<span class="badge b-H">Tồn > 2 năm</span>');else if(old(o))tags.push('<span class="badge b-M">Tồn > 1 năm</span>');if(slow(o))tags.push(`<span class="badge b-M">${o.sinceOut==null?'Chưa xuất':o.sinceOut+' ngày không xuất'}</span>`);
      return `<tr class=dbl data-iv="${i}"><td class=nw title="${esc(o.accName)}">${esc(o.acc)}</td><td><div class=clamp title="${esc(o.obj)}">${esc(o.obj)}</div></td><td>${esc(o.uom)}</td><td class=n>${o.qtyIn?fmt2(o.qtyIn):''}</td><td class=n>${o.qtyOut?fmt2(o.qtyOut):''}</td><td class=n>${o.qtyIn||o.qtyOut?fmt2(o.qtyBal):''}</td>
      <td class=n><b>${fmt2(o.bal)}</b></td>${o.b.map(v=>`<td class=n>${c(v)}</td>`).join('')}<td class=nw>${vn(o.lastIn)}</td><td class=nw>${vn(o.lastOut)}</td><td>${tags.join(' ')}</td></tr>`}).join('')+'</tbody>';
}
['#ivAsOf','#ivBy','#ivLevel'].forEach(s=>$(s).onchange=()=>{if(s!=='#ivAsOf')$('#ivAcc').value='';vInv(true)});
$('#ivAcc').onchange=()=>vInv(false);$('#ivFind').oninput=()=>vInv(false);
$('#ivFlag').onclick=e=>{const b=e.target.closest('[data-f]');if(!b)return;IV.flag=b.dataset.f;$$('#ivFlag button').forEach(x=>x.classList.toggle('on',x===b));vInv(false)};
$('#tIvSum').onclick=e=>{const tr=e.target.closest('[data-acc]');if(tr){$('#ivAcc').value=tr.dataset.acc;vInv(false);$('#tIv').scrollIntoView({behavior:'smooth'})}};
$('#ivXls').onclick=()=>api.exportInventory($('#ivAsOf').value,$('#ivBy').value,$('#ivLevel').value,$('#ivAcc').value);

/* ---------- Bộ chọn kỳ phân tích & so sánh (dùng chung) ---------- */
const MODES={y:'Năm',q:'Quý',m:'Tháng',ytd:'Lũy kế từ đầu năm',r:'Khoảng tháng'};
const CMPS={both:'Kỳ trước & cùng kỳ năm trước',prev:'Kỳ liền trước',ly:'Cùng kỳ năm trước',none:'Không so sánh'};
const SPANS={'12m':'12 tháng','24m':'24 tháng','3y':'3 năm','5y':'5 năm',all:'Toàn bộ'};
const ymLbl=ym=>`${ym.slice(5)}/${ym.slice(0,4)}`;
const mdiff=(a,b)=>(+b.slice(0,4)-+a.slice(0,4))*12+(+b.slice(5)-+a.slice(5));
function perRange(st,lastYm){ // → {cur,cmp[],trend}; kỳ chưa đủ dữ liệu được cắt đến tháng cuối có dữ liệu và so sánh tương đương
  let f,t,l;
  if(st.mode==='y'){f=st.y+'-01';t=st.y+'-12';l='Năm '+st.y}
  else if(st.mode==='q'){f=`${st.y}-${String(st.q*3-2).padStart(2,'0')}`;t=addM(f,2);l=`Quý ${st.q}/${st.y}`}
  else if(st.mode==='m'){f=t=st.m;l='Tháng '+ymLbl(st.m)}
  else if(st.mode==='ytd'){f=st.m.slice(0,4)+'-01';t=st.m;l=`Lũy kế 01–${st.m.slice(5)}/${st.m.slice(0,4)}`}
  else{f=st.from<=st.to?st.from:st.to;t=st.from<=st.to?st.to:st.from;l=`${ymLbl(f)} → ${ymLbl(t)}`}
  const fullLen=mdiff(f,t)+1;let partial=false;
  if(lastYm&&t>lastYm&&f<=lastYm){t=lastYm;partial=true;l+=` (dữ liệu đến ${ymLbl(lastYm)})`}
  const len=mdiff(f,t)+1,lab=(a,b)=>a===b?'Tháng '+ymLbl(a):`${ymLbl(a)} → ${ymLbl(b)}`;
  const prev=st.mode==='ytd'?null:{from:addM(f,-fullLen),to:addM(t,-fullLen)};
  if(prev)prev.label=partial?lab(prev.from,prev.to):st.mode==='y'?'Năm '+prev.from.slice(0,4):st.mode==='q'?`Quý ${QN(prev.from)}/${prev.from.slice(0,4)}`:lab(prev.from,prev.to);
  const ly={from:addM(f,-12),to:addM(t,-12)};
  ly.label=partial&&st.mode!=='ytd'?lab(ly.from,ly.to):st.mode==='y'?'Năm '+ly.from.slice(0,4):st.mode==='q'?`Quý ${QN(ly.from)}/${ly.from.slice(0,4)}`:st.mode==='ytd'?`Lũy kế 01–${ly.to.slice(5)}/${ly.to.slice(0,4)}`:lab(ly.from,ly.to);
  const cmp=[];if(prev&&(st.cmp==='both'||st.cmp==='prev'))cmp.push({k:'prev',...prev});if((st.cmp==='both'||st.cmp==='ly')&&!(prev&&st.cmp==='both'&&prev.from===ly.from&&prev.to===ly.to))cmp.push({k:'ly',...ly}); // năm: kỳ trước = cùng kỳ năm trước → không lặp cột
  const sp={'12m':11,'24m':23,'3y':35,'5y':59}[st.span],gran=st.span==='12m'||st.span==='24m'?'m':st.span==='3y'?'q':'y';
  return {cur:{from:f,to:t,label:l},cmp,trend:{from:sp==null?'':addM(t,-sp),to:t,gran}};
}
function initPick(st,yms){
  const last=yms.at(-1);if(!last)return;
  st.y??=last.slice(0,4);st.q??=QN(last);st.m??=last;st.from??=addM(last,-11)<yms[0]?yms[0]:addM(last,-11);st.to??=last;st.mode??='y';st.cmp??='both';st.span??='5y';
}
function renderPick(el,st,yms,onChange){
  initPick(st,yms);const years=[...new Set(yms.map(m=>m.slice(0,4)))].reverse(),R=perRange(st,yms.at(-1));
  const o=(v,l,c)=>`<option value="${v}" ${String(c)===String(v)?'selected':''}>${l}</option>`,F=(l,h)=>`<label class="field">${l}${h}</label>`;
  const mSel=(k,cur)=>`<select class="input" data-k="${k}">${[...yms].reverse().map(m=>o(m,ymLbl(m),cur)).join('')}</select>`;
  let v='';
  if(st.mode==='y')v=F('Năm',`<select class="input" data-k="y">${years.map(y=>o(y,y,st.y)).join('')}</select>`);
  if(st.mode==='q')v=F('Năm',`<select class="input" data-k="y">${years.map(y=>o(y,y,st.y)).join('')}</select>`)+F('Quý',`<select class="input" data-k="q">${[1,2,3,4].map(q=>o(q,'Quý '+q,st.q)).join('')}</select>`);
  if(st.mode==='m')v=F('Tháng',mSel('m',st.m));
  if(st.mode==='ytd')v=F('Đến hết tháng',mSel('m',st.m));
  if(st.mode==='r')v=F('Từ tháng',mSel('from',st.from))+F('Đến tháng',mSel('to',st.to));
  el.innerHTML=F('Kỳ phân tích',`<select class="input" data-k="mode">${Object.entries(MODES).map(([k,l])=>o(k,l,st.mode)).join('')}</select>`)+v+'<span class="sep"></span>'
    +F('So sánh với',`<select class="input" data-k="cmp">${Object.entries(CMPS).filter(([k])=>st.mode!=='ytd'||k==='ly'||k==='none').map(([k,l])=>o(k,l,st.cmp)).join('')}</select>`)
    +F('Biểu đồ xu hướng',`<select class="input" data-k="span">${Object.entries(SPANS).map(([k,l])=>o(k,l,st.span)).join('')}</select>`)
    +`<div class="cur">Đang xem<b>${R.cur.label}</b>${R.cmp.map(c=>'so với '+c.label).join(' · ')}</div>`;
  el.onchange=e=>{const k=e.target.dataset.k;if(!k)return;st[k]=k==='q'?+e.target.value:e.target.value;if(k==='mode'&&st.mode==='ytd'&&(st.cmp==='both'||st.cmp==='prev'))st.cmp='ly';onChange()};
}
const chg=(a,b)=>b?(a-b)/Math.abs(b):null;
const chgTd=(a,b,good=1)=>{const c=chg(a,b);if(c==null)return '<td class="n mut">–</td>';const cls=Math.abs(c)<0.005?'':(c*good>0?'up':'down');return `<td class="n ${cls}">${c>0?'▲':'▼'} ${pct(Math.abs(c))}</td>`};

/* ---------- Kết quả kinh doanh ---------- */
const PLST=ls.get('plPick',{});let PLV={};
async function vPL(){
  const yms=(await api.q('months')).filter(m=>m.included).map(m=>m.ym).sort();
  if(!yms.length){$('#plPick').innerHTML='<span class=mut>Chưa có dữ liệu.</span>';return}
  renderPick($('#plPick'),PLST,yms,()=>{ls.set('plPick',PLST);vPL()});
  const R=perRange(PLST,yms.at(-1));
  const [cur,...cmps]=await Promise.all([api.q('plRange',R.cur.from,R.cur.to),...R.cmp.map(c=>api.q('plRange',c.from,c.to))]);
  const L=[['Doanh thu bán hàng & CCDV','rev',0,1],['Giảm trừ doanh thu','ded',0,-1],['Doanh thu thuần','net',1,1],['Giá vốn / chi phí SX','cogs',0,-1],['Lợi nhuận gộp','gp',1,1],['Doanh thu tài chính','finInc',0,1],['Chi phí tài chính','finExp',0,-1],
    ['Chi phí bán hàng','sell',0,-1],['Chi phí quản lý DN','admin',0,-1],['Lợi nhuận thuần từ HĐKD','op',1,1],['Lợi nhuận khác','other',0,1],['Lợi nhuận trước thuế','pbt',1,1],['Chi phí thuế TNDN','tax',0,-1],['Lợi nhuận sau thuế','pat',1,1],
    ['Biên lợi nhuận gộp',y=>y.gp/y.net,2,1],['Biên LN thuần HĐKD',y=>y.op/y.net,2,1],['CP bán hàng + QLDN / DT',y=>(y.sell+y.admin)/y.net,2,-1]];
  const val=(y,f)=>typeof f==='function'?f(y):y[f];
  // KPI
  const K=(cls,icon,lb,f)=>{const v=cur[f];return kpi(cls,icon,lb,fmt(v),cmps.map((c,i)=>{const x=chg(v,c[f]);return x==null?'':`${x>=0?'▲':'▼'} ${pct(Math.abs(x))} vs ${R.cmp[i].k==='ly'?'cùng kỳ':'kỳ trước'}`}).filter(Boolean).join(' · ')||R.cur.label)};
  $('#plKpi').innerHTML=K('blue','coins','Doanh thu thuần','net')+K('','trend','Lợi nhuận gộp','gp')+K('','chart','LN thuần từ HĐKD','op')+K(cur.pat<0?'red':'green','check','Lợi nhuận sau thuế','pat');
  $('#plHint').textContent=R.cur.label;
  $('#tPL').innerHTML='<thead><tr><th>Chỉ tiêu</th><th class=n>'+R.cur.label+'</th>'+R.cmp.map(c=>`<th class=n>${c.label}</th><th class=n>±</th><th class=n>%</th>`).join('')+'</tr></thead><tbody>'+
    L.map(([n,f,t,good])=>{const v=val(cur,f);return `<tr data-key="${typeof f==='string'?f:''}" data-n="${esc(n)}" style="${t===1?'background:var(--brand-25)':''}"><td class=nw style="min-width:220px">${t===1?'<b>'+n+'</b>':n}</td><td data-c="-1" class="n ${t!==2?'dbl':''} ${v<0?'neg':''}">${t===2?pct(v):(t===1?'<b>'+fmt(v)+'</b>':fmt(v))}</td>`+
      cmps.map((c,ci)=>{const p=val(c,f);return t===2?`<td class=n>${pct(p)}</td><td class=n>${isFinite(v-p)?((v-p)*100).toFixed(1)+' đ%':''}</td><td></td>`:`<td data-c="${ci}" class="n mut dbl">${fmt(p)}</td><td class=n>${fmt(v-p)}</td>${chgTd(v,p,good)}`}).join('')+'</tr>'}).join('')+'</tbody>';
  // Xu hướng
  const tr=await api.q('plTrend',R.trend.from,R.trend.to,R.trend.gran);
  $('#plTrendT').textContent=`Xu hướng theo ${{m:'tháng',q:'quý',y:'năm'}[R.trend.gran]} – ${SPANS[PLST.span].toLowerCase()} đến ${ymLbl(R.trend.to)}`;
  const inCur=k=>{const s=R.cur.from,e=R.cur.to;if(R.trend.gran==='m')return k>=s&&k<=e;if(R.trend.gran==='y')return k>=s.slice(0,4)&&k<=e.slice(0,4);const qs=`${s.slice(0,4)}-Q${QN(s)}`,qe=`${e.slice(0,4)}-Q${QN(e)}`;return k>=qs&&k<=qe};
  chart('chMonth',{data:{labels:tr.map(m=>m.k),datasets:[{type:'bar',label:'Doanh thu thuần',data:tr.map(m=>m.net),backgroundColor:tr.map(m=>inCur(m.k)?C.brand:C.brand1),maxBarThickness:36},
    {type:'bar',label:'Tổng chi phí',data:tr.map(m=>m.net-m.pbt),backgroundColor:tr.map(m=>inCur(m.k)?'#A4A7AE':C.gray),maxBarThickness:36},{type:'line',label:'LN trước thuế',data:tr.map(m=>m.pbt),borderColor:C.navy,backgroundColor:C.navy,tension:.3}]}});
  // So sánh nhiều năm: cùng khoảng tháng trong từng năm có dữ liệu
  const years=[...new Set(yms.map(m=>m.slice(0,4)))],off=+R.cur.to.slice(0,4)-+R.cur.from.slice(0,4)===0;
  const ranges=off?years.map(y=>({y,from:y+R.cur.from.slice(4),to:y+R.cur.to.slice(4)})):years.map(y=>({y,from:y+'-01',to:y+'-12'}));
  PLV.R=R;PLV.ranges=ranges;const multi=(await Promise.all(ranges.map(r=>api.q('plRange',r.from,r.to)))).map((v,i)=>({...v,y:ranges[i].y})).filter(v=>v.net||v.cogs||v.pbt);PLV.multi=multi;
  const mlab=off?(R.cur.from===R.cur.to?'tháng '+R.cur.from.slice(5):`tháng ${R.cur.from.slice(5)}–${R.cur.to.slice(5)}`):'cả năm';
  $('#tPLY').innerHTML=`<thead><tr><th>Chỉ tiêu (${mlab})</th>`+multi.map((y,i)=>`<th class=n>${y.y}</th>`+(i?'<th class=n>±%</th>':'')).join('')+'</tr></thead><tbody>'+
    L.filter(x=>x[2]!==2).map(([n,f,t,good])=>`<tr data-key="${f}" data-n="${esc(n)}" style="${t===1?'background:var(--brand-25)':''}"><td class=nw style="min-width:220px">${t===1?'<b>'+n+'</b>':n}</td>`+multi.map((y,i)=>`<td data-y="${i}" class="n dbl ${y[f]<0?'neg':''}">${fmt(y[f])}</td>`+(i?chgTd(y[f],multi[i-1][f],good):'')).join('')+'</tr>').join('')+'</tbody>';
  // Nhận xét
  const notes=[],N=(cls,t)=>notes.push(`<div class="note ${cls}">${t}</div>`);
  N('brand',`Kỳ phân tích <b>${R.cur.label}</b>: doanh thu thuần <b>${fmt(cur.net)}</b>, lợi nhuận trước thuế <b>${fmt(cur.pbt)}</b>.`);
  cmps.forEach((c,i)=>{const g=chg(cur.net,c.net),k=chg(cur.cogs+cur.sell+cur.admin,c.cogs+c.sell+c.admin);
    if(g!=null)N('',`So với <b>${R.cmp[i].label}</b>: doanh thu ${g>=0?'tăng':'giảm'} <b>${pct(Math.abs(g))}</b>; chi phí hoạt động ${k>=0?'tăng':'giảm'} ${pct(Math.abs(k||0))}.`+(k!=null&&k>g+0.05?' ⚠ Chi phí tăng nhanh hơn doanh thu.':''))});
  if(cur.net<=0&&cur.cogs>0)N('','⚠ Có chi phí nhưng doanh thu ghi nhận rất ít – kiểm tra doanh thu hạch toán ở phân hệ khác (BCCS) hoặc chưa kết chuyển.');
  if(cur.gp<0)N('','⚠ Lợi nhuận gộp âm: chi phí sản xuất vượt doanh thu.');
  if(!cmps.some(c=>c.net||c.cogs))R.cmp.length&&N('','Kỳ so sánh chưa có dữ liệu.');
  $('#plNotes').innerHTML=notes.join('');
}

/* ---------- Doanh thu & chi phí theo tài khoản / khoản mục ---------- */
const AN_BY={acc1:'Tài khoản',acc:'Tài khoản chi tiết',item:'Khoản mục',dept:'Bộ phận'};
const PAL=['#FA4700','#001A79','#FF9C6B','#2970FF','#D63600','#875BF7','#17B26A','#EAAA08','#A4A7AE'];
const ANST=ls.get('anPick',{});
let AN={kind:'exp',view:[],R:null};
async function vCost(){
  const yms=(await api.q('months')).filter(m=>m.included).map(m=>m.ym).sort();
  if(!yms.length){$('#anPick').innerHTML='<span class=mut>Chưa có dữ liệu.</span>';return}
  renderPick($('#anPick'),ANST,yms,()=>{ls.set('anPick',ANST);vCost()});
  const R=perRange(ANST,yms.at(-1));AN.R=R;const by=$('#anBy').value,find=$('#anFind').value.trim().toLowerCase();
  const [cur,...cmps]=await Promise.all([api.q('analysisRange',AN.kind,by,R.cur.from,R.cur.to),...R.cmp.map(c=>api.q('analysisRange',AN.kind,by,c.from,c.to))]);
  const G=new Map();
  cur.forEach(r=>G.set(r.g,{g:r.g,name:r.name,v:r.v,n:r.n,c:R.cmp.map(()=>0)}));
  cmps.forEach((rows,i)=>rows.forEach(r=>{const x=G.get(r.g)||G.set(r.g,{g:r.g,name:r.name,v:0,n:0,c:R.cmp.map(()=>0)}).get(r.g);x.c[i]=r.v}));
  const all=[...G.values()].sort((a,b)=>b.v-a.v),total=all.reduce((s,x)=>s+x.v,0),ctot=R.cmp.map((_,i)=>all.reduce((s,x)=>s+x.c[i],0));
  const list=all.filter(x=>!find||(x.g+' '+x.name).toLowerCase().includes(find));AN.view=list;
  const label=AN.kind==='rev'?'doanh thu':'chi phí',good=AN.kind==='rev'?1:-1;
  const mv=R.cmp.length?all.map(x=>({x,d:x.v-x.c[0]})).sort((a,b)=>Math.abs(b.d)-Math.abs(a.d))[0]:null;
  $('#anKpi').innerHTML=kpi(AN.kind==='rev'?'blue':'','coins',`Tổng ${label} – ${R.cur.label}`,fmt(total),R.cmp.map((c,i)=>{const x=chg(total,ctot[i]);return x==null?'':`${x>=0?'▲':'▼'} ${pct(Math.abs(x))} vs ${c.label}`}).filter(Boolean).join(' · ')||`${num(all.length)} nhóm`)
    +kpi('','chart',`Lớn nhất: ${esc(String(all[0]?.g||'').slice(0,28))}`,all[0]?pct(all[0].v/total):'–',esc(all[0]?.name||'tỷ trọng trong tổng'))
    +(mv?kpi(mv.d*good<0?'red':'green','alert',`Biến động mạnh nhất vs ${R.cmp[0].label}`,(mv.d>0?'+':'')+fmt(mv.d),esc(String(mv.x.g).slice(0,40))):'');
  // Xu hướng: top 8 nhóm của kỳ hiện tại
  const tr=await api.q('analysis',AN.kind,by,R.trend.gran,R.trend.from,R.trend.to),periods=[...new Set(tr.rows.map(r=>r.p))].sort();
  const top=all.slice(0,8).map(x=>x.g),idx=new Map(tr.rows.map(r=>[r.g+'|'+r.p,r.v]));
  const ds=top.map((g,i)=>({label:String(g).slice(0,40),data:periods.map(p=>idx.get(g+'|'+p)||0),backgroundColor:PAL[i],borderRadius:0,maxBarThickness:42}));
  ds.push({label:'Khác',data:periods.map(p=>tr.rows.filter(r=>r.p===p&&!top.includes(r.g)).reduce((s,r)=>s+r.v,0)),backgroundColor:PAL[8],borderRadius:0,maxBarThickness:42});
  $('#anChartT').textContent=`Diễn biến ${label} theo ${{m:'tháng',q:'quý',y:'năm'}[R.trend.gran]} – ${SPANS[ANST.span].toLowerCase()} đến ${ymLbl(R.trend.to)}`;
  chart('chAn',{type:'bar',data:{labels:periods,datasets:ds},options:{scales:{x:{stacked:true},y:{stacked:true}},plugins:{legend:{position:'bottom',labels:{font:{size:11}}}}}});
  const t8=all.slice(0,8),oth=all.slice(8).reduce((s,x)=>s+Math.max(0,x.v),0);
  chart('chAnPie',{type:'doughnut',data:{labels:[...t8.map(x=>String(x.g).slice(0,30)),...(oth?['Khác']:[])],datasets:[{data:[...t8.map(x=>Math.max(0,x.v)),...(oth?[oth]:[])],backgroundColor:PAL,borderWidth:2,borderColor:'#fff'}]},
    options:{cutout:'62%',plugins:{legend:{position:'bottom',labels:{font:{size:11}}},tooltip:{callbacks:{label:c=>`${c.label}: ${fmt(c.raw)} (${pct(c.raw/total)})`}}}}});
  // Bảng so sánh
  $('#anTblT').textContent=`${label.charAt(0).toUpperCase()+label.slice(1)} theo ${AN_BY[by].toLowerCase()} – ${R.cur.label}`;
  $('#anHint').textContent=`${num(list.length)} nhóm`;
  const head='<thead><tr><th>'+AN_BY[by]+'</th>'+(by==='acc1'?'<th>Tên</th>':'')+`<th class=n>${R.cur.label}</th><th class=n>Tỷ trọng</th>`+R.cmp.map(c=>`<th class=n>${c.label}</th><th class=n>±</th><th class=n>%</th>`).join('')+'<th class=n>Số dòng</th></tr></thead>';
  const body=list.slice(0,1500).map((x,i)=>`<tr class="click dbl" data-i="${i}"><td style="min-width:200px"><b>${esc(x.g)}</b></td>${by==='acc1'?`<td class=nw>${esc(x.name)}</td>`:''}<td class=n><b>${fmt(x.v)}</b></td>
      <td class=n><div style="display:flex;align-items:center;gap:6px;justify-content:flex-end"><div style="width:50px;height:6px;border-radius:9px;background:var(--gray-200)"><div style="width:${Math.max(0,Math.min(100,x.v/total*100))}%;height:100%;border-radius:9px;background:var(--brand-500)"></div></div>${pct(x.v/total)}</div></td>
      ${x.c.map(c=>`<td class="n mut">${fmt(c)}</td><td class=n>${fmt(x.v-c)}</td>${c?chgTd(x.v,c,good):`<td class="n mut">${x.v?'mới':''}</td>`}`).join('')}<td class="n mut">${num(x.n)}</td></tr>`).join('');
  const foot=`<tr style="background:var(--brand-25)"><td><b>Tổng cộng</b></td>${by==='acc1'?'<td></td>':''}<td class=n><b>${fmt(total)}</b></td><td class=n>100%</td>${ctot.map(c=>`<td class=n><b>${fmt(c)}</b></td><td class=n><b>${fmt(total-c)}</b></td>${chgTd(total,c,good)}`).join('')}<td></td></tr>`;
  $('#tAn').innerHTML=head+'<tbody>'+body+foot+'</tbody>';
}
$('#anKind').onclick=e=>{const b=e.target.closest('[data-k]');if(!b)return;AN.kind=b.dataset.k;$$('#anKind button').forEach(x=>x.classList.toggle('on',x===b));vCost()};
$('#anBy').onchange=()=>vCost();$('#anFind').oninput=()=>{clearTimeout(tmr);tmr=setTimeout(vCost,250)};
$('#tAn').ondblclick=e=>{const tr=e.target.closest('tr[data-i]');if(tr)drill(AN.view[+tr.dataset.i])};
$('#anXls').onclick=()=>{const by=$('#anBy').value,R=AN.R;
  api.exportAnalysis((AN.kind==='rev'?'DoanhThu':'ChiPhi')+'_'+by,AN.view.map(x=>Object.assign({[AN_BY[by]]:x.g},by==='acc1'?{'Tên':x.name}:{},{[R.cur.label]:x.v},...R.cmp.map((c,i)=>({[c.label]:x.c[i],[`± ${c.label}`]:x.v-x.c[i]})),{'Số dòng':x.n})))};
async function drill(x){
  const R=AN.R,d=await api.q('analysisDrill',AN.kind,$('#anBy').value,x.g,R.cur.from,R.cur.to);CUR=-1;
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">${AN_BY[$('#anBy').value]} · ${R.cur.label}</div><h2 style="font-size:20px">${esc(x.g)} ${x.name?'<span class=mut style="font-weight:400">– '+esc(x.name)+'</span>':''}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
   <div class="pb"><div class="kpis">${kpi('','coins','Tổng',fmt(d.sum),num(d.total)+' bút toán')}${kpi('','file','Đang hiển thị',num(d.rows.length),'bút toán có số tiền lớn nhất')}</div>
   <div class="card"><div class="card-h"><h3>Bút toán chi tiết</h3><span class="hint">bấm dòng có nhãn lỗi để xem lỗi</span></div><div class="tbl"><table><thead><tr><th></th><th>Ngày</th><th>Chứng từ</th><th>TK Nợ</th><th>TK Có</th><th class=n>Số tiền</th><th>Diễn giải</th><th>Khoản mục</th><th>Bộ phận</th><th>Người nhập</th></tr></thead><tbody>
   ${d.rows.map(r=>`<tr class="${r.eid?'click':''}" data-eid="${r.eid||''}"><td>${r.eid?'<span class="badge b-M">Có lỗi</span>':''}</td><td class=nw>${vn(r.date)}</td><td class=nw>${esc(r.doc)}</td><td>${esc(r.drName)}</td><td>${esc(r.crName)}</td><td class="n ${r.amt<0?'neg':''}">${fmt2(r.amt)}</td><td><div class=clamp title="${esc(r.desc)}">${esc(r.desc)}</div></td><td>${esc(AN.kind==='rev'?r.trev:r.tcost)}</td><td>${esc(r.dept)}</td><td class=nw>${esc(short(r.user))}</td></tr>`).join('')}
   </tbody></table></div></div></div>`;
  $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
  $('#dPane').querySelector('tbody').onclick=e=>{const tr=e.target.closest('tr[data-eid]');if(tr&&tr.dataset.eid)showDetail(null,+tr.dataset.eid)};
}

/* ---------- Chi tiết bút toán khi nhấn đúp ---------- */
// nat: 1 = số dư tự nhiên bên Nợ (phải thu, tồn kho, chi phí); -1 = bên Có (phải trả, doanh thu)
async function openLedger(title,sub,spec,nat=1){
  CUR=-1;$('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">${esc(sub)}</div><h2 style="font-size:20px">${esc(title)}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div><div class="pb"><div class="row"><span class="spin"></span> Đang tải bút toán…</div></div>`;
  $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
  const d=await api.q('ledger',spec);let run=d.before*nat;
  const bal=(d.debit-d.credit)*nat,rows=d.rows.map(r=>{run+=(r.debit-r.credit)*nat;return {...r,run}});
  const REF=spec.dim==='contract'?['contract','Hợp đồng']:spec.dim==='adv'?['adv','Đề nghị TU']:spec.dim==='tcost'||spec.kind==='pl'?['tcost','Khoản mục']:spec.kind==='inv'?['product','Mặt hàng']:null;
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">${esc(sub)}</div><h2 style="font-size:20px">${esc(title)}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
   <div class="pb"><div class="kpis">${kpi('','file','Số bút toán',num(d.total),d.truncated?`hiển thị ${num(d.rows.length)} dòng gần nhất`:'')}${kpi('blue','coins','Phát sinh Nợ',fmt2(d.debit))}${kpi('','coins','Phát sinh Có',fmt2(d.credit))}${kpi(bal<0?'red':'green','wallet','Số dư / Lũy kế',fmt2(bal),nat>0?'dư Nợ (+)':'dư Có (+)')}</div>
   <div class="card"><div class="card-h"><h3>Bút toán chi tiết</h3><span class="hint">nhấn đúp dòng có nhãn lỗi để mở phần xử lý lỗi</span></div><div class="tbl" style="max-height:calc(100vh - 330px)"><table><thead><tr><th></th><th>Ngày</th><th>Chứng từ</th><th>TK Nợ</th><th>TK Có</th><th>Đối tượng</th>${REF?`<th>${REF[1]}</th>`:''}<th class=n>PS Nợ</th><th class=n>PS Có</th><th class=n>Lũy kế</th><th>Diễn giải</th><th>Người nhập</th></tr></thead><tbody>
   ${rows.map(r=>`<tr class="${r.eid?'dbl':''}" data-eid="${r.eid||''}"><td>${r.eid?'<span class="badge b-M">Có lỗi</span>':''}</td><td class=nw>${vn(r.date)}</td><td class=nw>${esc(r.doc)}</td><td>${esc(r.drName)}</td><td>${esc(r.crName)}</td>
     <td><div class="clamp s" title="${esc(r.side==='dr'?r.bp:r.bpCr)}">${esc(r.side==='dr'?r.bp:r.bpCr)}</div></td>${REF?`<td><div class="clamp s" title="${esc(r[REF[0]])}">${esc(refShort(r[REF[0]]))}</div></td>`:''}
     <td class=n>${r.debit?fmt2(r.debit):''}</td><td class=n>${r.credit?fmt2(r.credit):''}</td><td class="n ${r.run<0?'neg':''}"><b>${fmt2(r.run)}</b></td><td><div class=clamp title="${esc(r.desc)}">${esc(r.desc)}</div></td><td class=nw>${esc(short(r.user))}</td></tr>`).join('')}
   </tbody></table></div></div></div>`;
  $('#dClose').onclick=closeDetail;
  $('#dPane').querySelector('tbody').ondblclick=e=>{const tr=e.target.closest('tr[data-eid]');if(tr&&tr.dataset.eid)showDetail(null,+tr.dataset.eid)};
}
const AGNAT=acc=>/^(331|335|336|334|3388)/.test(acc)?-1:1;
$('#tAging').ondblclick=e=>{const tr=e.target.closest('tr[data-ag]');if(!tr)return;const o=AGV.det[+tr.dataset.ag],dim=$('#agDim').value;
  openLedger(o.bp+(o.ref?' · '+refShort(o.ref):''),`TK ${o.acc} – ${o.accName} · đến ${vn($('#asOf').value)}`,{kind:'ag',acc:o.acc,bp:o.bp,dim,ref:o.ref,asOf:$('#asOf').value},AGNAT(o.acc))};
$('#tAbn').ondblclick=e=>{const tr=e.target.closest('tr[data-agn]');if(!tr)return;const o=AGV.abn[+tr.dataset.agn],dim=$('#agDim').value;
  openLedger(o.bp+(o.ref?' · '+refShort(o.ref):''),`Dư ngược chiều · TK ${o.acc}`,{kind:'ag',acc:o.acc,bp:o.bp,dim,ref:o.ref,asOf:$('#asOf').value},AGNAT(o.acc))};
$('#tAgSum').ondblclick=e=>{const tr=e.target.closest('tr[data-acc]');if(!tr)return;const a=tr.dataset.acc;
  openLedger('Tài khoản '+a,`Tất cả đối tượng · đến ${vn($('#asOf').value)}`,{kind:'ag',acc:a,asOf:$('#asOf').value},AGNAT(a))};
$('#tIv').ondblclick=e=>{const tr=e.target.closest('tr[data-iv]');if(!tr)return;const o=IVV.det[+tr.dataset.iv];
  openLedger(o.obj,`TK ${o.acc} – ${o.accName} · đến ${vn($('#ivAsOf').value)}`,{kind:'inv',acc:o.acc,by:$('#ivBy').value,obj:o.obj,asOf:$('#ivAsOf').value},1)};
$('#tIvNeg').ondblclick=e=>{const tr=e.target.closest('tr[data-ivn]');if(!tr)return;const o=IVV.neg[+tr.dataset.ivn];
  openLedger(o.obj,`Tồn âm · TK ${o.acc}`,{kind:'inv',acc:o.acc,by:$('#ivBy').value,obj:o.obj,asOf:$('#ivAsOf').value},1)};
$('#tIvSum').ondblclick=e=>{const tr=e.target.closest('tr[data-acc]');if(!tr)return;
  openLedger('Tài khoản '+tr.dataset.acc,`Tất cả mặt hàng · đến ${vn($('#ivAsOf').value)}`,{kind:'inv',acc:tr.dataset.acc,asOf:$('#ivAsOf').value},1)};
const PLNAT=k=>['rev','finInc','othInc','net','gp','op','other','pbt','pat'].includes(k)?-1:1;
$('#tPL').ondblclick=e=>{const td=e.target.closest('td[data-c]'),tr=e.target.closest('tr[data-key]');if(!td||!tr||!tr.dataset.key)return;const c=+td.dataset.c,R=PLV.R||perRange(PLST),p=c<0?R.cur:R.cmp[c];
  openLedger(tr.dataset.n,p.label,{kind:'pl',key:tr.dataset.key,from:p.from,to:p.to},PLNAT(tr.dataset.key))};
$('#tPLY').ondblclick=e=>{const td=e.target.closest('td[data-y]'),tr=e.target.closest('tr[data-key]');if(!td||!tr)return;const y=PLV.multi[+td.dataset.y],r=PLV.ranges.find(x=>x.y===y.y);
  openLedger(tr.dataset.n,`Năm ${y.y} (${r.from.slice(5)}–${r.to.slice(5)})`,{kind:'pl',key:tr.dataset.key,from:r.from,to:r.to},PLNAT(tr.dataset.key))};

/* ---------- Báo cáo & thông báo ---------- */
let MAILTO=ls.get('mailto',{});
const mailOpts=(test=false)=>({group:$('#rGroup').value,minSev:$('#rSev').value,deadline:$('#rDeadline').value,intro:$('#rIntro').value,sign:$('#rSign').value,mark:$('#rMark').checked,test});
async function vReport(){
  renderReviewBar('#rvRep');
  const [rep,todo,log]=await Promise.all([api.q('report'),api.q('todo',$('#rSev').value,$('#rGroup').value),api.q('mailLog')]);
  const sum=k=>rep.byRule.reduce((a,r)=>a+r[k],0),n=sum('n'),done=sum('fixed')+sum('ignore');
  $('#repPeriod').textContent=`Kỳ dữ liệu ${rep.months[0]||''} → ${rep.months.at(-1)||''} · Lập ngày ${new Date().toLocaleDateString('vi')}`;
  const gsum=g=>rep.byRule.filter(r=>RULE[r.k]?.g===g).reduce((s,r)=>s+r.n,0);
  $('#repKpi').innerHTML=kpi('','alert','Cảnh báo phát hiện',num(n),`👤 nhân viên ${num(gsum('staff'))} · 🔍 kiểm toán ${num(gsum('audit'))}`)+kpi('green','check','Đã kiểm tra xong',num(done),pct(done/n))+kpi('green','check','Đã khắc phục',num(sum('fixed')))
    +kpi('','file','Còn phải khắc phục',num(sum('open')+sum('doing')))+kpi('red','alert','Lỗi mức cao',num(sum('high')),'tổng phát hiện');
  const cross=(rows,label,name)=>`<thead><tr><th>${label}</th><th class=n>Tổng</th><th class=n>Cao</th><th class=n>Chưa XL</th><th class=n>Đang XL</th><th class=n>Đã sửa</th><th class=n>Không lỗi</th><th class=n>Hoàn thành</th></tr></thead><tbody>`+
    rows.map(r=>{const p=(r.fixed+r.ignore)/r.n;return `<tr><td>${esc(name(r.k))}</td><td class=n>${num(r.n)}</td><td class="n ${r.high?'neg':''}">${r.high||''}</td><td class=n>${num(r.open)}</td><td class=n>${num(r.doing)}</td><td class="n pos">${num(r.fixed)}</td><td class=n>${num(r.ignore)}</td>
      <td class=n><div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><div style="width:60px;height:6px;border-radius:9px;background:var(--gray-200)"><div style="width:${p*100}%;height:100%;border-radius:9px;background:var(--brand-500)"></div></div><b>${pct(p)}</b></div></td></tr>`}).join('')+'</tbody>';
  $('#tRepRule').innerHTML=cross([...rep.byRule].sort((a,b)=>(RULE[a.k]?.g||'').localeCompare(RULE[b.k]?.g||'')*-1||b.n-a.n),'Loại lỗi',k=>`${RULE[k]?.n||k} ·${RULE[k]?.g==='audit'?' 🔍':' 👤'}`);$('#tRepUser').innerHTML=cross(rep.byUser,'Người nhập',short);
  const emails=await Promise.all(todo.map(t=>MAILTO[t.u]!=null?MAILTO[t.u]:api.emailOf(t.u)));
  $('#tTodo').innerHTML='<thead><tr><th><input type="checkbox" id="mAllEmp" checked></th><th>Nhân viên</th><th>Email</th><th class=n>Cần khắc phục</th><th class=n>Mức cao</th><th class=n>Chứng từ</th><th>Gửi lần cuối</th><th></th></tr></thead><tbody>'+
    (todo.map((t,i)=>{const last=log.find(x=>x.employee===t.u);
      return `<tr><td><input type="checkbox" class="empChk" data-u="${esc(t.u)}" ${emails[i]?'checked':''}></td><td><b>${esc(short(t.u))}</b><div class=mut style="font-size:12px">${esc(t.u)}</div></td>
      <td><input class="input empMail" data-u="${esc(t.u)}" value="${esc(emails[i])}" placeholder="nhập email" style="width:240px;padding:6px 10px"></td><td class=n><b>${num(t.n)}</b></td><td class="n neg">${t.high||''}</td><td class=n>${num(t.docs)}</td>
      <td class=nw>${last?`${esc(last.at)} ${last.status==='ok'?'<span class="badge s-fixed">Đã gửi</span>':'<span class="badge b-H">Lỗi</span>'}`:'<span class=mut>Chưa gửi</span>'}</td>
      <td class=nw><button class="btn sm" data-prev="${esc(t.u)}">Xem email</button> <button class="btn sm ghost" data-xls="${esc(t.u)}" title="Xuất Excel">${ic('download')}</button></td></tr>`}).join('')||'<tr><td colspan=8 class=mut style="text-align:center;padding:24px">Không còn lỗi cần khắc phục 🎉</td></tr>')+'</tbody>';
  $('#tMailLog').innerHTML='<thead><tr><th>Thời gian</th><th>Nhân viên</th><th>Email</th><th class=n>Số lỗi</th><th>Kết quả</th></tr></thead><tbody>'+
    log.slice(0,100).map(x=>`<tr><td class=nw>${esc(x.at)}</td><td>${esc(short(x.employee))}</td><td>${esc(x.to)}</td><td class=n>${x.count}</td><td>${x.status==='ok'?'<span class="badge s-fixed">Đã gửi</span>':'<span class="badge b-H">Lỗi</span> '+esc(x.error)}</td></tr>`).join('')+'</tbody>';
  const c=await api.getSmtp();for(const k of ['host','port','user','from','cc'])$('#s_'+k).value=c[k]||'';$('#s_secure').checked=!!c.secure;$('#s_self').checked=!!c.allowSelfSigned;
  $('#s_pass').value='';$('#s_pass').placeholder=c.hasPass?'•••••• (để trống = giữ nguyên)':'Mật khẩu / App password';
}
['rIntro','rSign','rDeadline','rSev','rGroup'].forEach(id=>{const v=ls.get(id,null);if(v!=null)$('#'+id).value=v;$('#'+id).addEventListener('change',()=>{ls.set(id,$('#'+id).value);if(id==='rSev'||id==='rGroup')vReport()})});
$('#repPrint').onclick=()=>window.print();$('#repXls').onclick=()=>api.exportReport($('#rSev').value,$('#rGroup').value);
$('#tTodo').onchange=e=>{if(e.target.id==='mAllEmp')$$('.empChk').forEach(c=>c.checked=e.target.checked);
  if(e.target.classList.contains('empMail')){MAILTO[e.target.dataset.u]=e.target.value.trim();ls.set('mailto',MAILTO)}};
$('#tTodo').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.prev)previewMail(b.dataset.prev);if(b.dataset.xls)api.exportEmployee(b.dataset.xls,$('#rSev').value,$('#rGroup').value)};
const mailOf=u=>($$('.empMail').find(x=>x.dataset.u===u)?.value||'').trim();
async function sendMails(test){
  let list=$$('.empChk:checked').map(c=>({user:c.dataset.u,to:mailOf(c.dataset.u)}));if(!list.length)return alert('Chưa chọn nhân viên nào.');
  if(test){const me=prompt('Gửi thử email của nhân viên đầu tiên đến địa chỉ:',$('#s_from').value);if(!me)return;list=[{...list[0],to:me}]}
  const bad=list.filter(x=>!/@/.test(x.to));if(bad.length)return alert('Thiếu email: '+bad.map(x=>short(x.user)).join(', '));
  if(!test&&!confirm(`Gửi email cho ${list.length} nhân viên?\n`+list.map(x=>`• ${short(x.user)} <${x.to}>`).join('\n')))return;
  $('#mailState').textContent='Đang gửi…';
  try{const res=await api.sendMails(list,mailOpts(test));const ok=res.filter(r=>r.ok).length;
    $('#mailState').innerHTML=`<span class="${ok===res.length?'pos':'neg'}">Đã gửi ${ok}/${res.length}</span>`+(ok<res.length?' – '+esc(res.filter(r=>!r.ok).map(r=>r.to+': '+r.error).join('; ')):'');}
  catch(e){$('#mailState').innerHTML=`<span class=neg>${esc(e.message)}</span>`}
  const st=$('#mailState').innerHTML;await vReport();$('#mailState').innerHTML=st;refreshSide();
}
$('#mSend').onclick=()=>sendMails(false);$('#mTest').onclick=()=>sendMails(true);
async function previewMail(u){const p=await api.mailPreview(u,mailOpts());CUR=-1;
  $('#dPane').innerHTML=`<div class="ph"><h2 style="font-size:20px">Xem trước email</h2><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
   <div class="pb"><div class="card"><div class="kv"><div>Đến</div><div>${esc(mailOf(u))}</div><div>Tiêu đề</div><div>${esc(p.subject)}</div><div>Đính kèm</div><div>AccSoft_CanKhacPhuc_${esc(short(u))}.xlsx (${num(p.count)} dòng)</div></div></div>
   <div class="card">${p.html}</div></div>`;
  $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail}
$('#s_save').onclick=async()=>{const v=k=>$('#s_'+k).value.trim();
  await api.setSmtp({host:v('host'),port:v('port')||'587',user:v('user'),pass:$('#s_pass').value,from:v('from'),cc:v('cc'),secure:$('#s_secure').checked,allowSelfSigned:$('#s_self').checked});
  $('#smtpMsg').textContent='Đang kiểm tra kết nối…';const r=await api.verifySmtp();$('#smtpMsg').innerHTML=r.ok?'<span class=pos>✓ Kết nối SMTP thành công</span>':'<span class=neg>✕ '+esc(r.error)+'</span>';$('#s_pass').value=''};

/* ---------- Quản lý dữ liệu ---------- */
let INFO_VER=null;
async function vData(){
  const [ms,imps,info,s,ast]=await Promise.all([api.q('months'),api.q('imports'),api.info(),api.q('stats'),api.q('analysisStatus')]);INFO_VER=ast.version;
  const years={};ms.forEach(m=>(years[m.ym.slice(0,4)]??=[]).push(m));
  $('#months').innerHTML=Object.entries(years).map(([y,arr])=>`<h4 style="margin:16px 0 10px">Năm ${y}</h4><div class="month-grid">`+
    arr.map(m=>`<div class="mcard ${m.included?'on':''}"><div class="x"><span class="m">Tháng ${m.ym.slice(5)}</span><input type="checkbox" data-m="${m.ym}" ${m.included?'checked':''} title="Đưa vào phân tích"></div>
      <div class="mut" style="font-size:12px">${num(m.n)} dòng</div><div>${m.analyzed_ver==null?'<span class="badge s-open">Chưa phân tích</span>':m.analyzed_ver===INFO_VER?'<span class="badge s-fixed">Đã phân tích</span>':'<span class="badge b-M">Cần phân tích lại</span>'}</div><div class="mut" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(m.files)}">${esc(m.files||'')}</div>
      <button class="btn sm danger" data-delm="${m.ym}">Xoá tháng</button></div>`).join('')+'</div>').join('')||'<div class="empty"><h2>Chưa có dữ liệu</h2><p>Bấm "Nạp dữ liệu" để bắt đầu.</p></div>';
  $('#tImports').innerHTML='<thead><tr><th>File</th><th class=n>Số dòng</th><th>Từ ngày</th><th>Đến ngày</th><th>Nạp lúc</th><th></th></tr></thead><tbody>'+
    imps.map(i=>`<tr><td>${esc(i.file)}</td><td class=n>${num(i.rows)}</td><td>${vn(i.from)}</td><td>${vn(i.to)}</td><td class=nw>${esc(i.at)}</td><td><button class="btn sm danger" data-deli="${i.id}">Xoá</button></td></tr>`).join('')+'</tbody>';
  api.q('inventory',new Date().toISOString().slice(0,10),'product','l1').then(r=>{$('#enrichInfo').innerHTML=r.oldImportRows?`<span class=neg>${num(r.oldImportRows)} dòng hàng tồn kho chưa có mã hàng/kho (nạp bằng phiên bản cũ).</span>`:'<span class=pos>✓ Tất cả dòng hàng tồn kho đã có thông tin mã hàng/kho.</span>'});
  loadTh();loadBk();
  $('#dbInfo').innerHTML=`<div>File CSDL</div><div><code>${esc(info.dbFile)}</code>${info.fallback?'<div class="neg" style="font-size:12px">Không ghi được vào thư mục ứng dụng ('+esc(info.appDir)+') nên đang lưu ở thư mục người dùng. Hãy đặt AccSoft ở thư mục có quyền ghi (vd D:\\AccSoft).</div>':''}${info.migratedFrom?'<div class="pos" style="font-size:12px">Đã chuyển dữ liệu từ '+esc(info.migratedFrom)+'</div>':''}</div><div>Dòng hạch toán</div><div>${num(s.entries)}</div><div>Cảnh báo</div><div>${num(s.errors)}</div><div>Phiên bản</div><div>${esc(info.version)}</div>`;
}
const runT=async(t,a,msg)=>{try{await api.task(t,a);if(msg)alert(msg)}catch(e){alert(e.message)}await refreshSide();go(PAGE)};
$('#months').onchange=async e=>{const m=e.target.dataset.m;if(!m)return;await api.q('setMonths',[m],e.target.checked);await refreshSide();vData()};
$('#months').onclick=e=>{const m=e.target.dataset.delm;if(m&&confirm(`Xoá hẳn toàn bộ dữ liệu tháng ${m}?`))runT('deleteMonth',{ym:m})};
$('#tImports').onclick=e=>{const id=e.target.closest('[data-deli]')?.dataset.deli;if(id&&confirm('Xoá toàn bộ dữ liệu của lần nạp này?'))runT('deleteImport',{id:+id})};
$('#mAll').onclick=async()=>{await api.q('setAllMonths',true);await refreshSide();vData()};$('#mNone').onclick=async()=>{await api.q('setAllMonths',false);await refreshSide();vData()};
$('#btnEnrich').onclick=async()=>{try{const log=await api.pickAndEnrich();if(log){alert('Kết quả bổ sung thông tin hàng tồn kho:\n\n'+log.join('\n'));await refreshSide();go(PAGE)}}catch(e){alert(e.message)}};
$('#openDb').onclick=()=>api.openDbFolder();$('#btnLogs').onclick=()=>api.openLogs();
$('#btnRecheck').onclick=()=>runAnalyze(true);
$('#btnClear').onclick=()=>{if(confirm('Xoá TOÀN BỘ dữ liệu hạch toán và cảnh báo? (giữ lại trạng thái/ghi chú và cấu hình mail)'))runT('clear',{})};

/* ---------- Phân tích chuyên sâu ---------- */
let DP=ls.get('deepTab','reversal');const RVSEL=new Set();let RVG=[];let RVST='Chưa huỷ trích',RVM=ls.get('rvMode','detail');const DPS=ls.get('deepPick',{});
const flagB=f=>'<div style="display:flex;flex-direction:column;gap:3px;min-width:240px;white-space:normal">'+f.map(([s,t])=>`<span class="badge b-${s}">${esc(t)}</span>`).join('')+'</div>';
const spark=a=>{const mx=Math.max(...a.map(Math.abs),1);return `<span style="display:inline-flex;gap:1px;align-items:flex-end;height:22px">${a.map((v,i)=>`<i style="width:4px;height:${Math.max(1,Math.abs(v)/mx*22)}px;background:${i===a.length-1?C.brand:v?C.brand3:C.gray}"></i>`).join('')}</span>`};
const tbl=(head,rows,empty)=>`<div class="tbl" style="max-height:calc(100vh - 340px)"><table><thead><tr>${head.map(h=>`<th${h[0]==='#'?' class=n':''}>${h.replace(/^#/,'')}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan=${head.length} class=mut style="text-align:center;padding:24px">${empty||'Không có dữ liệu'}</td></tr>`}</tbody></table></div>`;
async function vDeep(){
  $$('#dpTabs [data-d]').forEach(b=>b.classList.toggle('on',b.dataset.d===DP));
  const yms=(await api.q('months')).map(m=>m.ym).sort(),last=yms.at(-1)||'';
  const opt=(v)=>yms.slice().reverse().map(m=>`<option value="${m}" ${m===v?'selected':''}>${ymLbl(m)}</option>`).join('');
  DPS.end??=last;DPS.from??=yms[Math.max(0,yms.length-12)]||'';DPS.by??='tcost';DPS.kind??='exp';DPS.asOf??=new Date().toISOString().slice(0,10);
  if(!yms.includes(DPS.end))DPS.end=last;if(!yms.includes(DPS.from))DPS.from=yms[Math.max(0,yms.length-12)]||'';
  const rangeCtl=`<label>Từ tháng <select data-k="from">${opt(DPS.from)}</select></label><label>Đến tháng <select data-k="end">${opt(DPS.end)}</select></label>`;
  const ctl={recurring:`<label>Đến tháng <select data-k="end">${opt(DPS.end)}</select></label><span class="hint">Xét 12 tháng; khoản mục × đối tượng phát sinh ≥ ${'ngưỡng'} số tháng được coi là định kỳ</span>`,
    variance:`<label>Tháng <select data-k="end">${opt(DPS.end)}</select></label><label>Loại <select data-k="kind"><option value="exp">Chi phí</option><option value="rev">Doanh thu</option></select></label><label>Theo <select data-k="by"><option value="tcost">Khoản mục</option><option value="tcost_bp">Khoản mục × đối tượng</option><option value="acc">Tài khoản</option><option value="dept">Bộ phận</option></select></label><span class="hint">So với trung bình 12 tháng trước</span>`,
    reversal:rangeCtl+`<span class="hint">Kỳ dịch vụ / kỳ ghi chi phí thực tế</span>`,
    accrual:`<label>Tại ngày <input type="date" data-k="asOf" value="${DPS.asOf}"></label>`,fx:rangeCtl,staff:rangeCtl,benford:rangeCtl,vendors:rangeCtl}[DP];
  $('#dpCtl').innerHTML=`<div class="row">${ctl}</div>`;$$('#dpCtl select').forEach(x=>{if(DPS[x.dataset.k])x.value=DPS[x.dataset.k]});
  const B=$('#dpBody');B.innerHTML='<div class="card"><span class="spin"></span> Đang phân tích…</div>';
  if(!last){B.innerHTML='<div class="empty"><h2>Chưa có dữ liệu</h2></div>';return}
  const card=(t,h,body)=>`<div class="card"><div class="card-h"><div><h3>${t}</h3>${h?`<div class="hint">${h}</div>`:''}</div></div>${body}</div>`;
  if(DP==='recurring'){const r=await api.q('deepRecurring',DPS.end,12);
    B.innerHTML=r.note?card('Chi phí định kỳ',r.note,''):`<div class="kpis">${kpi('','file','Khoản định kỳ có bất thường',num(r.items.length),`${r.from} → ${r.end}`)}${kpi('red','coins','Tháng bị thiếu',num(r.items.reduce((s,x)=>s+x.missing.length,0)))}${kpi('','coins','Tháng ghi trùng (×1.8)',num(r.items.reduce((s,x)=>s+x.double.length,0)))}</div>`+
      card('Thiếu / trùng chi phí định kỳ',`Định kỳ = phát sinh ≥ ${r.need}/${r.months.length} tháng. Thiếu tháng → có thể chưa trích trước/chưa hạch toán; ghi gấp đôi → có thể trùng hoá đơn.`,
      tbl(['Khoản mục','Đối tượng','#Số tháng','#Mức thường (median)','Tháng thiếu','Tháng trùng','Xu hướng','#Ảnh hưởng ước tính'],r.items.map(x=>`<tr><td>${esc(x.t)}</td><td><div class="clamp s" title="${esc(x.p)}">${esc(x.name||x.p)}</div></td><td class=n>${x.present}/${x.total}</td><td class=n>${fmt(x.med)}</td><td>${x.missing.map(m=>`<span class="badge b-H">${ymLbl(m)}</span>`).join(' ')}</td><td>${x.double.map(m=>`<span class="badge b-M">${ymLbl(m)}</span>`).join(' ')}</td><td>${spark(x.series)}</td><td class=n><b>${fmt(x.impact)}</b></td></tr>`),'Không phát hiện thiếu/trùng chi phí định kỳ'));}
  if(DP==='reversal'){const r=await api.q('deepReversal',DPS.from,DPS.end),G=r.groups,open=G.filter(g=>g.status==='Chưa huỷ trích');
    const tot=k=>G.reduce((s,g)=>s+g[k],0),dbl=open.reduce((s,g)=>s+Math.min(g.remain,g.actual),0),cnt=s=>G.filter(g=>g.status===s).length;
    const ST=['Chưa huỷ trích','Huỷ trích vượt số đã trích','Chưa có chi phí thực tế','Đã huỷ trích','Đã huỷ / quyết toán','Huỷ trích của kỳ trước dữ liệu'],SC={'Chưa huỷ trích':'b-H','Huỷ trích vượt số đã trích':'b-M','Chưa có chi phí thực tế':'s-open','Đã huỷ trích':'s-fixed','Đã huỷ / quyết toán':'s-fixed','Huỷ trích của kỳ trước dữ liệu':''};
    const MODES={detail:'Đối chiếu chi tiết',per:'Theo kỳ dịch vụ',p:'Theo đối tượng',t:'Theo khoản mục',u:'Theo nhân viên',age:'Tuổi khoản trích còn treo',make:'Lập trích trước kỳ mới'};
    const summ=by=>{const m=new Map();for(const g of G)for(const key of by==='u'?(g.users.length?g.users:['(chưa có thực tế)']):[g[by]]){const o=m.get(key)||m.set(key,{key,name:g.name,n:0,accrued:0,released:0,remain:0,actual:0,paid:0,unpaid:0,open:0,dbl:0}).get(key);
      o.n++;for(const k of ['accrued','released','remain','actual','paid','unpaid'])o[k]+=g[k];if(g.status==='Chưa huỷ trích'){o.open++;o.dbl+=Math.min(g.remain,g.actual)}}return [...m.values()]};
    const head=`<div class="kpis">${kpi('','coins','Đã trích (Có 335)',fmt(tot('accrued')),`${num(G.length)} khoản · đối tượng × khoản mục × kỳ`)}${kpi('blue','refresh','Đã huỷ / quyết toán',fmt(tot('released')))}${kpi('','wallet','Còn treo 335',fmt(tot('remain')),`${num(G.filter(g=>g.remain>0.005).length)} khoản`)}${kpi('','file','Chi phí thực tế',fmt(tot('actual')),`đã thanh toán ${fmt(tot('paid'))} · chưa ${fmt(tot('unpaid'))}`)}${kpi('red','alert','Chi phí nghi ghi 2 lần',fmt(dbl),`${num(open.length)} khoản chưa huỷ trích`)}</div>`;
    const bar=`<div class="card" style="padding:12px 16px"><div class="row"><div class="tabs" id="rvModes">${Object.entries(MODES).map(([k,v])=>`<button data-rvm="${k}" class="${RVM===k?'on':''}">${v}</button>`).join('')}</div><div class="sp" style="flex:1"></div><button class="btn primary" id="rvXls">${ic('download')}Xuất Excel (6 sheet)</button></div></div>`;
    const sumHead=l=>[l,'#Số khoản','#Đã trích','#Đã huỷ / QT','#Còn treo','#Thực tế','#TT − trích','#Đã thanh toán','#Chưa thanh toán','#Chưa huỷ trích','#Nghi ghi 2 lần'];
    const sumRow=(o,label)=>`<tr><td><div class="clamp s" title="${esc(o.key)}">${label}</div></td><td class=n>${num(o.n)}</td><td class=n>${fmt2(o.accrued)}</td><td class=n>${fmt2(o.released)}</td><td class=n><b>${fmt2(o.remain)}</b></td><td class=n>${fmt2(o.actual)}</td><td class="n ${o.actual-o.accrued>0?'neg':''}">${o.actual?fmt2(o.actual-o.accrued):''}</td><td class=n>${fmt2(o.paid)}</td><td class=n>${fmt2(o.unpaid)}</td><td class=n>${o.open?`<span class="badge b-H">${o.open}</span>`:''}</td><td class="n neg">${o.dbl?fmt2(o.dbl):''}</td></tr>`;
    let body='';
    if(RVM==='detail'){const rows=G.filter(g=>!RVST||g.status===RVST);
      body=(r.users.length?card('Nhân viên ghi chi phí thực tế nhưng chưa huỷ trích','Bấm "Xem lỗi" để mở danh sách lỗi và gửi nhắc nhở ở "Báo cáo & Thông báo".',tbl(['Nhân viên','#Số khoản','#Mức cao','#Chi phí nghi ghi 2 lần',''],r.users.map(u=>`<tr><td><b>${esc(short(u.u))}</b></td><td class=n>${num(u.n)}</td><td class=n>${num(u.H)}</td><td class=n><b>${fmt(u.amt)}</b></td><td><button class="btn sm" data-rvu="${esc(u.u)}">Xem lỗi</button></td></tr>`))):'')+
      card('Đối chiếu trích trước – huỷ trích – chi phí thực tế – thanh toán','Trích: Nợ 6xx/Có 335 (dương). Huỷ: Có 335 số âm hoặc Nợ 335. Thực tế: Nợ 6xx/Có 331, 111, 112… Thanh toán: Nợ 331 phân bổ cho hoá đơn cũ trước (FIFO theo đối tượng). Nhấn đúp dòng để xem bút toán 335.',`<div class="row" style="margin-bottom:10px;flex-wrap:wrap">${['',...ST].map(s=>`<button class="btn sm ${RVST===s?'primary':''}" data-rvst="${s}">${s||'Tất cả'} (${s?cnt(s):G.length})</button>`).join('')}</div>`+
      `<div class="row" id="rvSelBar" style="margin-bottom:10px;padding:10px 12px;background:var(--brand-25,#FFF6F2);border-radius:10px"></div>`+
      tbl(['<input type="checkbox" id="rvAll" title="Chọn tất cả dòng còn treo đang hiển thị">','Tình trạng','Đối tượng','Khoản mục','Kỳ DV','#Đã trích','#Đã huỷ','#Còn treo','#Thực tế','#TT − trích','#Đã TT','#Chưa TT','CT trích / huỷ','CT thực tế / HĐ','Người nhập','Độ tin cậy'],rows.slice(0,500).map(g=>`<tr class="dbl ${g.sev==='H'?'rH':''}" data-rvp="${esc(g.p)}" data-rvt="${esc(g.t)}"><td>${g.remain>0.005?`<input type="checkbox" data-rvk="${esc(g.key)}" ${RVSEL.has(g.key)?'checked':''}>`:''}</td><td><span class="badge ${SC[g.status]}">${g.status}</span></td><td><div class="clamp s" title="${esc(g.p)}">${esc(g.name||g.p||'(trống)')}</div></td><td><div class="clamp s" title="${esc(g.t)}">${esc(g.t)}</div></td><td class=nw>${ymLbl(g.per)}</td>
        <td class=n>${fmt2(g.accrued)}</td><td class=n>${fmt2(g.released)}</td><td class="n ${g.remain>0.005&&g.actual?'neg':''}"><b>${fmt2(g.remain)}</b></td><td class=n>${g.actual?fmt2(g.actual):''}</td><td class=n>${g.actual&&g.accrued?fmt2(g.diff):''}</td><td class=n>${g.actual?fmt2(g.paid):''}</td><td class="n ${g.unpaid>0.005?'neg':''}">${g.unpaid>0.005?fmt2(g.unpaid):''}</td>
        <td><div class="mut" style="font-size:12px">${g.accDocs.slice(0,3).map(esc).join('<br>')}${g.relDocs.length?'<br><i>huỷ: '+g.relDocs.slice(0,2).map(esc).join(', ')+'</i>':''}</div></td><td><div class="mut" style="font-size:12px">${g.actDocs.slice(0,3).map(esc).join('<br>')}${g.invs.length?'<br>HĐ '+g.invs.slice(0,2).map(esc).join(', '):''}${g.lastPay?'<br>TT '+vn(g.lastPay):''}</div></td><td class=nw>${g.users.map(short).map(esc).join(', ')}</td><td style="font-size:12px">${esc(g.conf)}</td></tr>`),'Không có khoản nào'));}
    else if(RVM==='make'){body='<div id="mkBox"></div>'}
    else if(RVM==='age'){const AG=[[30,'0–30 ngày'],[60,'31–60'],[90,'61–90'],[180,'91–180'],[365,'181–365'],[1e9,'> 1 năm']],op=G.filter(g=>g.remain>0.005&&g.age!=null);
      const b=AG.map(([d,l],i)=>{const xs=op.filter(g=>g.age<=d&&(i===0||g.age>AG[i-1][0]));return {l,n:xs.length,v:xs.reduce((s,g)=>s+g.remain,0),a:xs.filter(g=>g.actual).reduce((s,g)=>s+g.remain,0)}});
      body=`<div class="grid g2">${card('Tuổi khoản trích còn treo','Tính từ ngày trích gần nhất đến ngày dữ liệu cuối. Khoản treo lâu mà đã có chi phí thực tế là sai sót cần huỷ ngay.',`<div style="height:280px"><canvas id="cRvAge"></canvas></div>`)}${card('Bảng tuổi','',tbl(['Tuổi','#Số khoản','#Còn treo','#Trong đó đã có thực tế'],b.map(x=>`<tr><td>${x.l}</td><td class=n>${num(x.n)}</td><td class=n><b>${fmt2(x.v)}</b></td><td class="n ${x.a?'neg':''}">${x.a?fmt2(x.a):''}</td></tr>`)))}</div>`+
        card('Khoản treo lâu nhất','',tbl(['Đối tượng','Khoản mục','Kỳ DV','#Còn treo','#Tuổi (ngày)','Trích gần nhất','Tình trạng'],op.sort((a,b)=>b.age-a.age).slice(0,200).map(g=>`<tr class="dbl" data-rvp="${esc(g.p)}" data-rvt="${esc(g.t)}"><td><div class="clamp s" title="${esc(g.p)}">${esc(g.name||g.p)}</div></td><td><div class="clamp s">${esc(g.t)}</div></td><td>${ymLbl(g.per)}</td><td class=n><b>${fmt2(g.remain)}</b></td><td class=n>${g.age}</td><td>${vn(g.lastAcc)}</td><td><span class="badge ${SC[g.status]}">${g.status}</span></td></tr>`)));
      setTimeout(()=>chart('cRvAge',{type:'bar',data:{labels:b.map(x=>x.l),datasets:[{label:'Chưa có thực tế',data:b.map(x=>x.v-x.a),backgroundColor:C.brand3},{label:'Đã có thực tế (cần huỷ)',data:b.map(x=>x.a),backgroundColor:C.err}]},options:{scales:{x:{stacked:true},y:{stacked:true}}}}));}
    else {const L={per:'Kỳ dịch vụ',p:'Đối tượng',t:'Khoản mục',u:'Nhân viên ghi thực tế'}[RVM],rows=summ(RVM).sort((a,b)=>RVM==='per'?b.key.localeCompare(a.key):b.remain-a.remain);
      body=(RVM==='per'?card('Trích – huỷ – thực tế – thanh toán theo kỳ dịch vụ','Cột: số trích, huỷ, thực tế; đường: còn treo 335.',`<div style="height:300px"><canvas id="cRvPer"></canvas></div>`):'')+
        card(`Tổng hợp ${L.toLowerCase()}`,'TT − trích dương: ước tính thấp hơn thực tế; âm: ước tính cao.',tbl(sumHead(L),rows.map(o=>sumRow(o,RVM==='per'?ymLbl(o.key):RVM==='u'?esc(short(o.key)):esc(RVM==='p'?(o.name||o.key):o.key)))));
      if(RVM==='per'){const pr=rows.slice().reverse().slice(-24);setTimeout(()=>chart('cRvPer',{type:'bar',data:{labels:pr.map(o=>ymLbl(o.key)),datasets:[{label:'Đã trích',data:pr.map(o=>o.accrued),backgroundColor:C.brand},{label:'Đã huỷ / QT',data:pr.map(o=>o.released),backgroundColor:C.navy},{label:'Thực tế',data:pr.map(o=>o.actual),backgroundColor:C.brand3},{label:'Đã thanh toán',data:pr.map(o=>o.paid),backgroundColor:C.ok},{type:'line',label:'Còn treo',data:pr.map(o=>o.remain),borderColor:C.err,pointRadius:3}]}}))}}
    B.innerHTML=head+bar+body;RVG=G;if(RVM==='make')mkView();
    const selBar=()=>{const el=$('#rvSelBar');if(!el)return;const sel=G.filter(g=>RVSEL.has(g.key));
      el.innerHTML=`<b>Đã chọn ${num(sel.length)} khoản</b><span class="mut">· tổng huỷ trích ${fmt2(sel.reduce((s,g)=>s+g.remain,0))}</span><div style="flex:1"></div><button class="btn sm" data-rvsel="open">Chọn mọi khoản "Chưa huỷ trích"</button><button class="btn sm ghost" data-rvsel="none">Bỏ chọn</button><button class="btn sm primary" id="rvErp" ${sel.length?'':'disabled'}>${ic('download')}Xuất file huỷ trích (import ERP)</button>`};
    selBar();
    B.onchange=e=>{const k=e.target.dataset.rvk;if(k!=null){e.target.checked?RVSEL.add(k):RVSEL.delete(k);selBar();return}
      if(e.target.id==='rvAll'){$$('[data-rvk]').forEach(x=>{x.checked=e.target.checked;e.target.checked?RVSEL.add(x.dataset.rvk):RVSEL.delete(x.dataset.rvk)});selBar()}};
    $('#rvXls').onclick=async()=>{try{const f=await api.accrualXlsx(DPS.from,DPS.end);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
    B.onclick=e=>{const sv=e.target.closest('[data-rvsel]');if(sv){if(sv.dataset.rvsel==='none')RVSEL.clear();else G.filter(g=>g.status==='Chưa huỷ trích').forEach(g=>RVSEL.add(g.key));vDeep();return}
      if(e.target.closest('#rvErp')){revForm();return}
      const m=e.target.closest('[data-rvm]');if(m){RVM=m.dataset.rvm;ls.set('rvMode',RVM);vDeep();return}const s=e.target.closest('[data-rvst]');if(s){RVST=s.dataset.rvst;vDeep();return}const u=e.target.closest('[data-rvu]');if(u){FIL={rule:'ACCRUAL_NOT_REVERSED',user:u.dataset.rvu};OFF=0;go('errors')}};
    B.ondblclick=e=>{const tr=e.target.closest('[data-rvp]');if(tr)openLedger(tr.dataset.rvp||'(trống)','TK 335 · '+tr.dataset.rvt,{kind:'ag',acc:'335',bp:tr.dataset.rvp,dim:'tcost',ref:tr.dataset.rvt},-1)};}
  else B.onclick=null;
  if(DP==='variance'){const r=await api.q('deepVariance',DPS.end,DPS.by,DPS.kind);
    B.innerHTML=r.note?card('Biến động bất thường',r.note,''):card(`Biến động bất thường tháng ${ymLbl(r.ym)}`,'Chênh lệch so với trung bình các tháng trước vượt ngưỡng % và giá trị tối thiểu (Cài đặt ngưỡng trong Quản lý dữ liệu).',
      tbl(['Nhóm','Loại','#Tháng này','#TB 12 tháng','#Chênh lệch','#%','Xu hướng'],r.items.map(x=>`<tr><td><div class="clamp" title="${esc(x.g)}">${esc(x.g)}</div></td><td><span class="badge ${x.diff>0?'b-H':'b-L'}">${x.type}</span></td><td class=n>${fmt(x.cur)}</td><td class=n>${fmt(x.avg)}</td><td class="n ${x.diff<0?'neg':''}"><b>${fmt(x.diff)}</b></td><td class=n>${x.pct==null?'mới':pct(x.pct)}</td><td>${spark(x.series)}</td></tr>`),'Không có biến động vượt ngưỡng'));}
  if(DP==='accrual'){const [a,p]=await Promise.all([api.q('deepAccruals',DPS.asOf),api.q('deepPrepaid',DPS.asOf)]);
    B.innerHTML=card('TK 335 – Trích trước theo đối tượng × khoản mục','Nhấn đúp dòng để xem bút toán. Cảnh báo: quá hạn quyết toán, quyết toán vượt trích, trích liên tục không quyết toán.',
      tbl(['Đối tượng','Khoản mục','#Đã trích','#Đã quyết toán','#Số dư','#Tuổi (ngày)','Trích gần nhất','QT gần nhất','Cảnh báo'],a.items.map(x=>`<tr class="dbl" data-acc335="${esc(x.p)}" data-t="${esc(x.t)}"><td><div class="clamp s" title="${esc(x.p)}">${esc(x.name||x.p)}</div></td><td>${esc(x.t)}</td><td class=n>${fmt(x.accrued)}</td><td class=n>${fmt(x.settled)}</td><td class="n ${x.bal<0?'neg':''}"><b>${fmt(x.bal)}</b></td><td class=n>${x.age||''}</td><td class=nw>${vn(x.lastAcc)}</td><td class=nw>${vn(x.lastSet)}</td><td>${flagB(x.flags)}</td></tr>`)))+
      card('TK 242 – Chi phí trả trước theo hợp đồng','So sánh số đã phân bổ với lịch phân bổ (Distribution From/To).',
      tbl(['Hợp đồng / nhóm','Khoản mục','#Trả trước','#Đã phân bổ','#Theo lịch','#Còn lại','Kỳ phân bổ','Cảnh báo'],p.items.map(x=>`<tr><td><div class="clamp s" title="${esc(x.k)}">${esc(refShort(x.k))}</div></td><td>${esc(x.t||'')}</td><td class=n>${fmt(x.pre)}</td><td class=n>${fmt(x.amo)}</td><td class=n>${x.expected==null?'':fmt(x.expected)}</td><td class="n ${x.bal<0?'neg':''}"><b>${fmt(x.bal)}</b></td><td class=nw>${x.f?vn(x.f)+' → '+vn(x.to):''}</td><td>${flagB(x.flags)}</td></tr>`)));
    B.ondblclick=e=>{const tr=e.target.closest('[data-acc335]');if(tr)openLedger(tr.dataset.acc335,'TK 335 · '+tr.dataset.t,{kind:'ag',acc:'335',bp:tr.dataset.acc335,dim:'tcost',ref:tr.dataset.t,asOf:DPS.asOf},-1)};}
  else B.ondblclick=null;
  if(DP==='staff'){const r=await api.q('deepStaff',DPS.from,DPS.end);
    B.innerHTML=card('Chấm điểm chất lượng hạch toán theo nhân viên','Điểm = 100 − (lỗi NV + 2×lỗi kiểm toán + 3×lỗi nghiêm trọng)/số dòng. Lỗi lặp = cùng quy tắc ≥ 3 tháng → cần đào tạo.',
      tbl(['Nhân viên','#Điểm','#Số dòng','#Lỗi','#Tỷ lệ %','#NV','#KT','#Cao','#Đã sửa','#Còn mở','Lỗi hay gặp','Lỗi lặp lại',`Tỷ lệ lỗi ${r.months.length} tháng`],r.items.map(x=>`<tr><td class=nw><b>${esc(short(x.u))}</b></td><td class=n><span class="badge ${x.score<70?'b-H':x.score<90?'b-M':'s-fixed'}">${x.score}</span></td><td class=n>${num(x.entries)}</td><td class=n>${num(x.errors)}</td><td class=n>${x.rate.toFixed(1)}</td><td class=n>${num(x.staff)}</td><td class=n>${num(x.audit)}</td><td class=n>${num(x.high)}</td><td class=n>${num(x.fixed)}</td><td class=n>${num(x.open)}</td>
        <td>${x.top.map(([k,n])=>`<div class="mut" style="font-size:12px">${esc(RULE[k]?.n||k)}: ${num(n)}</div>`).join('')}</td><td>${x.repeat.map(o=>`<span class="badge b-M" title="${o.months} tháng">${esc(RULE[o.k]?.n||o.k)}</span>`).join(' ')}</td><td>${spark(x.trend.map(v=>v||0))}</td></tr>`),'Chưa có dữ liệu – hãy "Phân tích dữ liệu" trước'));}
  if(DP==='benford'){const r=await api.q('deepBenford',DPS.from,DPS.end),t=r.total;
    B.innerHTML=`<div class="grid g2">${card('Định luật Benford – chữ số đầu',`Toàn bộ: ${num(t.n)} số tiền, MAD = ${t.mad.toFixed(4)} → <b>${t.level}</b>. Lệch nhiều có thể do số bị "làm tròn", chia nhỏ, hoặc nhập tay bất thường.`,'<div style="height:260px"><canvas id="cBen"></canvas></div>')}
      ${card('Tỷ lệ số tròn','Tỷ lệ số tiền chia hết cho 1.000 (không có số lẻ).',`<div style="height:260px"><canvas id="cRound"></canvas></div>`)}</div>`+
      card('Theo người nhập','Xếp theo mức lệch Benford (MAD). Cần ≥ 300 số tiền để kết luận.',tbl(['Người nhập','#Số lượng','#MAD','Đánh giá','#Tỷ lệ số tròn'],r.users.map(x=>`<tr><td><b>${esc(short(x.u))}</b></td><td class=n>${num(x.n)}</td><td class=n>${x.mad.toFixed(4)}</td><td><span class="badge ${x.level==='Không phù hợp'?'b-H':x.level==='Cận biên'?'b-M':''}">${x.level}</span></td><td class=n>${pct(x.round)}</td></tr>`)));
    chart('cBen',{type:'bar',data:{labels:[1,2,3,4,5,6,7,8,9],datasets:[{label:'Thực tế',data:t.obs.map(v=>v*100),backgroundColor:C.brand},{type:'line',label:'Benford',data:r.expected.map(v=>v*100),borderColor:C.navy,pointRadius:3}]},options:{scales:{y:{ticks:{callback:v=>v+'%'}}}}});
    const us=r.users.filter(x=>x.n>=50).slice(0,15);chart('cRound',{type:'bar',data:{labels:us.map(x=>short(x.u)),datasets:[{label:'% số tròn',data:us.map(x=>x.round*100),backgroundColor:C.brand3}]},options:{indexAxis:'y',scales:{x:{ticks:{callback:v=>v+'%'}}}}});}
  if(DP==='vendors'){const r=await api.q('deepVendors',DPS.from,DPS.end);
    B.innerHTML=`<div class="kpis">${kpi('','coins','Giá trị mua (Có 331)',fmt(r.total))}${kpi('','file','Số nhà cung cấp',num(r.count))}${kpi(r.top10>0.8?'red':'','pie','Tỷ trọng top 10',pct(r.top10))}${kpi('blue','file','NCC mới trong kỳ',num(r.newVendors.length))}</div>`+
      card('Mức độ tập trung nhà cung cấp','Nhấn đúp để xem bút toán 331 của nhà cung cấp.',tbl(['#','Nhà cung cấp','#Giá trị','#Số dòng','#Tỷ trọng','#Lũy kế','Lần đầu','Mới'],r.list.slice(0,100).map((x,i)=>`<tr class="dbl" data-v331="${esc(x.p)}"><td class=n>${i+1}</td><td><div class="clamp s" title="${esc(x.p)}">${esc(x.name||x.p)}</div></td><td class=n>${fmt(x.v)}</td><td class=n>${num(x.n)}</td><td class=n>${pct(x.share)}</td><td class=n>${pct(x.cum)}</td><td class=nw>${vn(x.first)}</td><td>${x.isNew?'<span class="badge b-M">Mới</span>':''}</td></tr>`)))+
      `<div class="grid g2">${card('Tên gần giống nhau – nghi trùng mã NCC','Cùng tên sau khi bỏ dấu, loại hình DN (Co., Ltd, Lda…). Rủi ro thanh toán trùng / NCC "ma".',tbl(['Tên chuẩn hoá','Các mã'],r.similar.map(x=>`<tr><td>${esc(x.k)}</td><td>${x.codes.map(c=>`<div class="mut" style="font-size:12px">${esc(c)}</div>`).join('')}</td></tr>`),'Không có'))}
      ${card('Trả tiền trước khi có hoá đơn','Lần ghi Nợ 331 đầu tiên sớm hơn lần ghi Có 331 đầu tiên.',tbl(['Nhà cung cấp','Trả lần đầu','Hoá đơn lần đầu','#Đã trả'],r.prepay.slice(0,200).map(x=>`<tr class="dbl" data-v331="${esc(x.p)}"><td><div class="clamp s" title="${esc(x.p)}">${esc(x.name||x.p)}</div></td><td class=nw>${vn(x.firstPay)}</td><td class=nw>${x.firstInv?vn(x.firstInv):'<span class=neg>chưa có</span>'}</td><td class=n>${fmt(x.paid)}</td></tr>`),'Không có'))}</div>`;
    B.ondblclick=e=>{const tr=e.target.closest('[data-v331]');if(tr)openLedger(tr.dataset.v331,'TK 331',{kind:'ag',acc:'331',bp:tr.dataset.v331,dim:'bp'},-1)};}
  if(DP==='fx'){const r=await api.q('deepFx',DPS.from,DPS.end);
    B.innerHTML=r.noData?card('Kiểm tra tỷ giá',`Dữ liệu không có tỷ giá (cột RateToVND/Currency rate đều bằng 0 hoặc trống trên ${num(r.rows)} dòng) nên không kiểm tra được. Tiền tệ: ${r.currencies.map(c=>esc(c.c||'(trống)')+' '+num(c.n)).join(', ')}.`,'')
      :card('Nhiều tỷ giá trong cùng ngày','',tbl(['Ngày','Tiền tệ','#Số tỷ giá','#Thấp','#Cao','#Số dòng'],r.multi.map(x=>`<tr><td>${vn(x.d)}</td><td>${esc(x.c)}</td><td class=n>${x.k}</td><td class=n>${fmt(x.lo)}</td><td class=n>${fmt(x.hi)}</td><td class=n>${num(x.n)}</td></tr>`)))+
       card('Tỷ giá lệch > 2% so với bình quân tháng','',tbl(['Ngày','Chứng từ','Tiền tệ','#Tỷ giá','#BQ tháng','#Số tiền','Người nhập'],r.dev.map(x=>`<tr><td>${vn(x.d)}</td><td>${esc(x.doc)}</td><td>${esc(x.c)}</td><td class=n>${fmt(x.r)}</td><td class=n>${fmt(x.avg)}</td><td class=n>${fmt2(x.amt)}</td><td>${esc(short(x.u))}</td></tr>`)));}
}
/* ---------- Lập trích trước kỳ mới (file GL Journal import ERP) ---------- */
const MN=['January','February','March','April','May','June','July','August','September','October','November','December'];
function swapPeriod(s,from,to){const [fy,fm]=[+from.slice(0,4),+from.slice(5)],[ty,tm]=[+to.slice(0,4),+to.slice(5)];let x=String(s||'');
  x=x.replace(new RegExp(`\\b${MN[fm-1]}(\\s*,?\\s*)${fy}\\b`,'gi'),`${MN[tm-1]}$1${ty}`).replace(new RegExp(`\\b${MN[fm-1].slice(0,3)}\\.?(\\s*,?\\s*)${fy}\\b`,'gi'),`${MN[tm-1].slice(0,3)}$1${ty}`);
  x=x.replace(new RegExp(`(tháng|thang|T)\\s*0?${fm}\\s*([/-]|năm)\\s*${fy}`,'gi'),(m,a,b)=>`${a} ${String(tm).padStart(2,'0')}${b==='năm'?' năm ':'/'}${ty}`).replace(new RegExp(`\\b0?${fm}/${fy}\\b`,'g'),`${String(tm).padStart(2,'0')}/${ty}`);
  return x}
let MK=ls.get('mkPick',{});let MKROWS=[];
async function mkView(){const box=$('#mkBox');if(!box)return;box.innerHTML='<div class="card"><span class="spin"></span> Đang tải các khoản trích…</div>';
  let r=await api.q('accrualSource',MK.src||'',MK.to||'');if(!MK.src||!r.pers.includes(MK.src)){MK.src=r.pers[0]||'';MK.to=MK.to&&MK.to>MK.src?MK.to:addM(MK.src||'2026-01',1);if(MK.src)r=await api.q('accrualSource',MK.src,MK.to)}
  MKROWS=r.rows.map(x=>({...x,on:!x.dup,amt:x.a,desc:swapPeriod(x.ds,x.per,MK.to)}));
  const tot=()=>MKROWS.filter(x=>x.on).reduce((s,x)=>s+(+x.amt||0),0);
  box.innerHTML=`<div class="card"><div class="card-h"><div><h3>Lập trích trước kỳ mới từ khoản trích kỳ trước</h3><div class="hint">Chọn kỳ dịch vụ mẫu → các dòng trích (Nợ 6xx / Có 335) được sao chép sang kỳ mới: giữ TK, đối tượng, khoản mục, Group cost, Services, Location; diễn giải tự đổi tháng ("In ${MN[+MK.src.slice(5)-1]||''} ${MK.src.slice(0,4)}" → kỳ mới). Sửa số tiền theo ước tính, bỏ chọn dòng không trích, rồi xuất file .xls để import ERP.</div></div></div>
    <div class="row" style="flex-wrap:wrap;gap:12px"><label>Kỳ dịch vụ mẫu <select id="mkSrc">${r.pers.map(p=>`<option ${p===MK.src?'selected':''} value="${p}">${ymLbl(p)}</option>`).join('')}</select></label>
    <label>Kỳ trích mới <input type="month" id="mkTo" value="${MK.to}"></label><span class="mut" id="mkSum"></span><div style="flex:1"></div><button class="btn primary" id="mkGo">${ic('download')}Xuất file trích trước (import ERP)</button></div></div>
    <div class="card">${tbl(['<input type="checkbox" id="mkAll" checked>','Đối tượng','Khoản mục','TK Nợ / Có','#Số kỳ mẫu','#Số trích kỳ mới','Diễn giải kỳ mới','Ghi chú'],MKROWS.map((x,i)=>`<tr class="${x.dup?'rM':''}"><td><input type="checkbox" data-mk="${i}" ${x.on?'checked':''}></td><td><div class="clamp s" title="${esc(x.bpCr)}">${esc(String(x.bpCr||x.bp||'').split('_').slice(2).join('_')||x.bpCr||x.bp||'')}</div></td><td><div class="clamp s" title="${esc(x.t)}">${esc(x.t)}</div></td><td class=nw>${esc(String(x.drName).split('_')[0])} / ${esc(String(x.crName).split('_')[0])}</td>
      <td class=n>${fmt2(x.a)}</td><td><input type="number" step="0.01" data-mka="${i}" value="${x.a}" style="width:110px;text-align:right"></td><td><input data-mkd="${i}" value="${esc(x.desc)}" style="width:100%;min-width:340px"></td><td>${x.dup?'<span class="badge b-M">Kỳ mới đã có trích – bỏ chọn để tránh trùng</span>':''}${!x.grpCost?'<span class="badge">Thiếu Group cost</span>':''}</td></tr>`),'Không có khoản trích ở kỳ này')}</div>`;
  const upd=()=>{$('#mkSum').textContent=`${num(MKROWS.filter(x=>x.on).length)} dòng · tổng ${fmt2(tot())}`};upd();
  box.onchange=e=>{const t=e.target,d=t.dataset;if(d.mk!=null){MKROWS[+d.mk].on=t.checked;upd()}else if(d.mka!=null){MKROWS[+d.mka].amt=+t.value;upd()}else if(d.mkd!=null)MKROWS[+d.mkd].desc=t.value;
    else if(t.id==='mkAll'){MKROWS.forEach(x=>x.on=t.checked);$$('[data-mk]').forEach(c=>c.checked=t.checked);upd()}
    else if(t.id==='mkSrc'||t.id==='mkTo'){MK={src:$('#mkSrc').value,to:$('#mkTo').value};ls.set('mkPick',MK);mkView()}};
  $('#mkGo').onclick=()=>mkForm();
}
function mkForm(){const sel=MKROWS.filter(x=>x.on&&+x.amt);if(!sel.length)return alert('Chưa chọn dòng nào');const eom=(ym=>{const x=new Date(+ym.slice(0,4),+ym.slice(5),0);return `${ym}-${String(x.getDate()).padStart(2,'0')}`})(MK.to);
  const O=ls.get('revErp',{dept:'VTL_Finance Dept.',docType:'GL Journal (Sub)'});CUR=-1;const L='style="display:grid;gap:4px"';
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Xuất file GL Journal để import vào ERP</div><h2 style="font-size:20px">Trích trước kỳ ${ymLbl(MK.to)} · ${num(sel.length)} dòng · ${fmt2(sel.reduce((s,x)=>s+ +x.amt,0))}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
   <div class="pb"><div class="card"><div class="filters" style="grid-template-columns:repeat(2,1fr)">
     <label ${L}>Ngày hạch toán (DateAcct)<input type="date" id="mkDate" value="${eom}"></label><label ${L}>Hạn thanh toán dòng (DueDate)<input type="date" id="mkDue" value="${eom}"></label>
     <label ${L}>Bộ phận (Department)<input id="mkDept" value="${esc(O.dept)}"></label><label ${L}>Loại chứng từ (DocType)<input id="mkType" value="${esc(O.docType)}"></label>
     <label ${L}>Số chứng từ (để trống cho ERP tự đánh số)<input id="mkNo"></label><span></span>
     <label style="grid-column:1/-1;display:grid;gap:4px">Diễn giải chứng từ<input id="mkDesc" value="VTL: Estimate expense in ${MN[+MK.to.slice(5)-1]} ${MK.to.slice(0,4)}"></label></div>
     ${sel.some(x=>x.dup)?'<p class="neg" style="font-size:13px">Có dòng mà kỳ mới đã có trích trước – kiểm tra kỹ để tránh trích trùng.</p>':''}
     <div class="row"><div style="flex:1"></div><button class="btn primary" id="mkGo2">${ic('download')}Xuất file .xls</button></div></div></div>`;
  $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
  $('#mkGo2').onclick=async()=>{const o={date:$('#mkDate').value,due:$('#mkDue').value,dept:$('#mkDept').value.trim(),docType:$('#mkType').value.trim(),docNo:$('#mkNo').value.trim(),desc:$('#mkDesc').value.trim(),target:MK.to};
    try{const r=await api.accrueErp(sel.map(x=>({id:x.id,amt:+x.amt,desc:x.desc,per:x.per,dup:x.dup})),o);if(r){alert(`Đã xuất ${num(r.lines)} dòng trích trước, tổng ${fmt2(r.total)}:\n${r.file}\n\nFile kiểm tra: ${r.check}`);closeDetail()}}catch(e){alert(e.message)}};
}
function revForm(){const sel=RVG.filter(g=>RVSEL.has(g.key));const last=sel.reduce((m,g)=>g.asOf>m?g.asOf:m,'');const eom=(d=>{const x=new Date(+d.slice(0,4),+d.slice(5,7),0);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`})(last||new Date().toISOString().slice(0,10));
  const O=ls.get('revErp',{dept:'VTL_Finance Dept.',docType:'GL Journal (Sub)',prefix:'VTL: Adjust '});CUR=-1;
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Xuất file GL Journal để import vào ERP</div><h2 style="font-size:20px">Huỷ trích ${num(sel.length)} khoản · ${fmt2(sel.reduce((s,g)=>s+g.remain,0))}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
   <div class="pb"><div class="card"><div class="filters" style="grid-template-columns:repeat(2,1fr)">
     <label style="display:grid;gap:4px">Ngày hạch toán (DateAcct)<input type="date" id="rvDate" value="${eom}"></label><label style="display:grid;gap:4px">Hạn thanh toán dòng (DueDate)<input type="date" id="rvDue" value="${eom}"></label>
     <label style="display:grid;gap:4px">Bộ phận (Department)<input id="rvDept" value="${esc(O.dept)}"></label><label style="display:grid;gap:4px">Loại chứng từ (DocType)<input id="rvType" value="${esc(O.docType)}"></label>
     <label style="display:grid;gap:4px">Số chứng từ (để trống cho ERP tự đánh số)<input id="rvNo" value=""></label><label style="display:grid;gap:4px">Tiền tố diễn giải dòng<input id="rvPre" value="${esc(O.prefix)}"></label>
     <label style="grid-column:1/-1;display:grid;gap:4px">Diễn giải chứng từ<input id="rvDesc" value="VTL: Adjust Estimate expense not yet reversed (actual cost recorded) – ${esc(sel.map(g=>g.per).sort()[0]||'')}${sel.length>1?' → '+esc(sel.map(g=>g.per).sort().at(-1)):''}"></label></div>
     <p class="mut" style="font-size:12px">Mỗi dòng huỷ trích đảo dòng trích gốc (cùng TK Nợ/Có, đối tượng, khoản mục, Group cost, Services, Location) với số tiền ÂM bằng số còn treo – giống file mẫu 2026.08_HUY_IT_SLA. Kèm file _DoiChieu.xlsx liệt kê chứng từ trích gốc để kiểm tra trước khi import.</p>
     <div class="row"><div style="flex:1"></div><button class="btn primary" id="rvGo">${ic('download')}Xuất file .xls</button></div></div>
     <div class="card"><div class="card-h"><h3>Các khoản sẽ huỷ trích</h3></div>${tbl(['Đối tượng','Khoản mục','Kỳ DV','#Còn treo','CT trích'],sel.map(g=>`<tr><td>${esc(g.name||g.p)}</td><td>${esc(g.t)}</td><td>${ymLbl(g.per)}</td><td class=n>${fmt2(g.remain)}</td><td>${g.accDocs.map(esc).join(', ')}</td></tr>`))}</div></div>`;
  $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
  $('#rvGo').onclick=async()=>{const o={date:$('#rvDate').value,due:$('#rvDue').value,dept:$('#rvDept').value.trim(),docType:$('#rvType').value.trim(),docNo:$('#rvNo').value.trim(),prefix:$('#rvPre').value,desc:$('#rvDesc').value.trim()};
    if(!o.date)return alert('Chọn ngày hạch toán');ls.set('revErp',{dept:o.dept,docType:o.docType,prefix:o.prefix});
    try{const r=await api.reversalErp(sel.map(g=>g.key),o);if(r){alert(`Đã xuất ${num(r.lines)} dòng huỷ trích, tổng ${fmt2(-r.total)}:\n${r.file}\n\nFile kiểm tra: ${r.check}\n\nSau khi import và nạp lại dữ liệu, các khoản này sẽ chuyển sang "Đã huỷ trích".`);closeDetail()}}catch(e){alert(e.message)}};
}
$('#dpTabs').onclick=e=>{const b=e.target.closest('[data-d]');if(!b)return;DP=b.dataset.d;ls.set('deepTab',DP);vDeep()};
$('#dpCtl').onchange=e=>{const k=e.target.dataset.k;if(!k)return;DPS[k]=e.target.value;ls.set('deepPick',DPS);vDeep()};

/* ---------- Cài đặt ngưỡng, số dư đầu kỳ, sao lưu ---------- */
const THL={dueBefore:'Thanh toán trước hạn (ngày)',dueLong:'Hạn thanh toán quá dài (ngày)',cashRound:'Tiền mặt số tròn ≥',bigExpense:'Chi phí lớn thiếu khoản mục ≥',roundExpense:'Chi phí số tròn ≥',monthEndLarge:'Bút toán lớn cuối tháng ≥',manualJe:'Bút toán thủ công lớn ≥',outlierFactor:'Số tiền bất thường (× trung vị)',advDays:'Tạm ứng quá hạn (ngày)',accrualDays:'335 chưa quyết toán (ngày)',variancePct:'Biến động bất thường (%)',varianceMin:'Biến động tối thiểu (giá trị)',recurringShare:'Chi phí định kỳ: % số tháng có phát sinh'};
let TH={};
async function loadTh(){TH=await api.q('getThresholds');$('#thForm').innerHTML=Object.keys(THL).map(k=>`<label>${THL[k]}<input type="number" data-th="${k}" value="${TH.cfg[k]}" title="Mặc định ${TH.def[k]}"></label>`).join('')}
$('#thSave').onclick=async()=>{const c={};$$('[data-th]').forEach(x=>c[x.dataset.th]=+x.value);await api.q('setThresholds',c);alert('Đã lưu. Các tháng được đánh dấu "Cần phân tích lại" – bấm "Phân tích dữ liệu" để áp dụng ngưỡng mới.');await refreshSide();vData()};
$('#thReset').onclick=()=>$$('[data-th]').forEach(x=>x.value=TH.def[x.dataset.th]);
async function loadBk(){const l=await api.listBackups();$('#tBk').innerHTML='<thead><tr><th>Bản sao lưu</th><th>Lúc</th><th class=n>MB</th><th></th></tr></thead><tbody>'+(l.map(b=>`<tr><td>${esc(b.name)}</td><td class=nw>${esc(b.at)}</td><td class=n>${(b.size/1048576).toFixed(1)}</td><td><button class="btn sm" data-rst="${esc(b.file)}">Khôi phục</button></td></tr>`).join('')||'<tr><td colspan=4 class=mut>Chưa có bản sao lưu</td></tr>')+'</tbody>'}
$('#bkNow').onclick=async()=>{try{const f=await api.backupNow();alert('Đã sao lưu: '+f);loadBk()}catch(e){alert(e.message)}};
$('#bkPick').onclick=async()=>{const f=await api.pickBackup();if(f)api.restoreBackup(f).catch(e=>alert(e.message))};
$('#tBk').onclick=e=>{const f=e.target.closest('[data-rst]')?.dataset.rst;if(f)api.restoreBackup(f).catch(e=>alert(e.message))};
$('#obTpl').onclick=()=>api.openingTemplate().catch(e=>alert(e.message));
$('#obImp').onclick=async()=>{try{const r=await api.importOpening();if(r){alert(`Đã nạp số dư đầu kỳ: ${num(r.rows)} dòng`+(r.skipped?`, bỏ qua ${num(r.skipped)} dòng ví dụ`:''));await refreshSide();vData()}}catch(e){alert(e.message)}};
$('#repPdf').onclick=async()=>{try{const f=await api.riskPdf();if(f)alert('Đã lưu báo cáo: '+f)}catch(e){alert(e.message)}};

const VIEWS={overview:vOverview,errors:()=>vErrors(),aging:()=>vAging(true),inv:()=>vInv(true),pl:vPL,cost:()=>vCost(true),deep:vDeep,report:vReport,data:vData};
(async()=>{
  META=await api.q('meta');RULE=Object.fromEntries(META.rules.map(r=>[r.k,r]));
  const info=await api.info();$('#ver').textContent='v'+info.version;
  await refreshSide();go('overview');
})();
