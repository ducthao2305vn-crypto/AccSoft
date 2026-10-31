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
  pl:['Kết quả kinh doanh','Doanh thu, chi phí, lợi nhuận theo năm và tháng'],cost:['Doanh thu & Chi phí','Phân tích theo tài khoản, khoản mục, bộ phận và kỳ'],report:['Báo cáo & Thông báo','Báo cáo kiểm tra và gửi yêu cầu khắc phục'],data:['Quản lý dữ liệu','Tháng dữ liệu, lần nạp file và bảo trì CSDL']};

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
  try{await VIEWS[p]()}catch(e){console.error(e);api.logError(`Mở trang ${p}: ${e.message}`,e.stack)}
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
const BUCKETS=['Chưa đến hạn','1–30','31–60','61–90','91–180','181–365','> 365'];
const BCOL=[C.ok,'#FFD4BD','#FF9C6B','#FF6929','#FA4700','#D63600','#8A2200'];
const GRPN={thu:'Phải thu',tra:'Phải trả'};
let AGDATA=null;
async function vAging(reload=true){
  if(!$('#asOf').value){const s=await api.q('overview');if(s.dmax)$('#asOf').value=s.dmax}if(!$('#asOf').value)return;
  if(reload||!AGDATA)AGDATA=await api.q('aging',$('#asOf').value,+$('#term').value||0,$('#agLevel').value);
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
  const row=x=>{const t=x.bal;return `<tr class="click" data-acc="${esc(x.acc)}"><td class=nw><b>${esc(x.acc)}</b></td><td style="min-width:240px">${esc(x.name)}</td><td class=n>${num(x.n)}</td><td class=n><b>${fmt2(t)}</b></td>${x.b.map(v=>`<td class=n>${Math.abs(v)>=0.005?fmt2(v):''}</td>`).join('')}<td class=n>${pct((t-x.b[0])/t)}</td><td class="n neg">${Math.abs(x.abn)>=0.005?fmt2(x.abn):''}</td></tr>`};
  $('#tAgSum').innerHTML='<thead><tr><th>TK</th><th>Tên tài khoản</th><th class=n>Đối tượng</th><th class=n>Số dư</th>'+BUCKETS.map(b=>`<th class=n>${b}</th>`).join('')+'<th class=n>% quá hạn</th><th class=n>Dư ngược chiều</th></tr></thead><tbody>'+
    ['thu','tra'].map(g=>SL.filter(x=>x.grp===g).map(row).join('')+sub(g)).join('')+'</tbody>';
  chart('chAging',{type:'bar',data:{labels:SL.map(x=>x.acc),datasets:BUCKETS.map((b,i)=>({label:b,data:SL.map(x=>x.b[i]),backgroundColor:BCOL[i],borderRadius:0,maxBarThickness:48}))},
    options:{scales:{x:{stacked:true},y:{stacked:true}},plugins:{tooltip:{callbacks:{title:i=>{const x=SL[i[0].dataIndex];return x.acc+' – '+x.name}}}}}});
  $('#tAbn').innerHTML='<thead><tr><th>TK</th><th>Đối tượng</th><th class=n>PS Nợ</th><th class=n>PS Có</th><th class=n>Dư ngược</th></tr></thead><tbody>'+
    abn.sort((a,b)=>a.bal-b.bal).map(o=>`<tr><td title="${esc(o.accName)}">${esc(o.acc)}</td><td>${esc(o.bp)}</td><td class=n>${fmt2(o.dr)}</td><td class=n>${fmt2(o.cr)}</td><td class="n neg">${fmt2(o.bal)}</td></tr>`).join('')+'</tbody>';
  const det=pos.filter(o=>!find||o.bp.toLowerCase().includes(find)).sort((a,b)=>b.bal-a.bal);
  $('#tAging').innerHTML='<thead><tr><th>Nhóm</th><th>TK</th><th>Đối tượng</th><th class=n>PS Nợ</th><th class=n>PS Có</th><th class=n>Số dư</th>'+BUCKETS.map(b=>`<th class=n>${b}</th>`).join('')+'<th class=n>Tuổi tối đa</th><th>Đánh giá</th></tr></thead><tbody>'+
   det.slice(0,3000).map(o=>{const o90=o.b[4]+o.b[5]+o.b[6];
    const risk=o.bp.startsWith('(không')?'<span class="badge b-H">Thiếu đối tượng</span>':o.b[6]>0?`<span class="badge b-H">${o.grp==='thu'?'Xem xét dự phòng':'Quá hạn > 1 năm'}</span>`:o90>0?`<span class="badge b-M">${o.grp==='thu'?'Đôn đốc thu':'Ưu tiên thanh toán'}</span>`:'';
    return `<tr><td><span class="badge ${o.grp==='thu'?'b-L':'s-doing'}">${GRPN[o.grp]}</span></td><td class=nw title="${esc(o.accName)}">${esc(o.acc)}</td><td>${esc(o.bp)}</td><td class=n>${fmt2(o.dr)}</td><td class=n>${fmt2(o.cr)}</td><td class=n><b>${fmt2(o.bal)}</b></td>${o.b.map(v=>`<td class=n>${Math.abs(v)>=0.005?fmt2(v):''}</td>`).join('')}<td class=n>${o.maxAge}</td><td>${risk}</td></tr>`}).join('')+'</tbody>';
}
['#asOf','#term','#agLevel'].forEach(s=>$(s).onchange=()=>{if(s==='#agLevel')$('#agAcc').value='';vAging(true)});
['#agGrp','#agAcc'].forEach(s=>$(s).onchange=()=>vAging(false));
$('#agFind').oninput=()=>vAging(false);
$('#tAgSum').onclick=e=>{const tr=e.target.closest('[data-acc]');if(tr){$('#agAcc').value=tr.dataset.acc;vAging(false);$('#tAging').scrollIntoView({behavior:'smooth'})}};
$('#expAg').onclick=()=>api.exportAging($('#asOf').value,+$('#term').value||0,$('#agLevel').value,$('#agGrp').value,$('#agAcc').value);

/* ---------- Tuổi hàng tồn kho ---------- */
const IBUCKETS=['0–30 ngày','31–90','91–180','181–365','1–2 năm','> 2 năm'];
const IBCOL=[C.ok,'#FFD4BD','#FF9C6B','#FA4700','#D63600','#8A2200'];
let IV={data:null,flag:''};
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
    SL.map(x=>`<tr class="click" data-acc="${esc(x.acc)}"><td class=nw><b>${esc(x.acc)}</b></td><td style="min-width:220px">${esc(x.name)}</td><td class=n>${num(x.n)}</td><td class=n><b>${fmt2(x.bal)}</b></td>${x.b.map(v=>`<td class=n>${c(v)}</td>`).join('')}<td class=n>${pct((x.b[3]+x.b[4]+x.b[5])/x.bal)}</td><td class="n neg">${c(x.neg)}</td></tr>`).join('')+
    `<tr style="background:var(--brand-25)"><td colspan=2><b>Tổng cộng</b></td><td class=n><b>${num(pos.length)}</b></td><td class=n><b>${fmt2(tot)}</b></td>${b.map(v=>`<td class=n><b>${c(v)}</b></td>`).join('')}<td class=n><b>${pct(o180/tot)}</b></td><td class="n neg">${c(neg.reduce((s,o)=>s+o.bal,0))}</td></tr></tbody>`;
  chart('chIv',{type:'bar',data:{labels:IBUCKETS,datasets:[{data:b,backgroundColor:IBCOL,barThickness:40}]},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:x=>`${fmt(x.raw)} (${pct(x.raw/tot)})`}}}}});
  const objH={product:'Mặt hàng',product_loc:'Mặt hàng @ Kho',loc:'Kho',bp:'Đối tượng'}[$('#ivBy').value];
  $('#tIvNeg').innerHTML=`<thead><tr><th>TK</th><th>${objH}</th><th class=n>SL tồn</th><th class=n>Giá trị tồn</th><th>Xuất gần nhất</th></tr></thead><tbody>`+
    neg.sort((a,b)=>a.bal-b.bal).map(o=>`<tr><td>${esc(o.acc)}</td><td><div class=clamp title="${esc(o.obj)}">${esc(o.obj)}</div></td><td class="n neg">${fmt2(o.qtyBal)} ${esc(o.uom)}</td><td class="n neg">${fmt2(o.bal)}</td><td class=nw>${vn(o.lastOut)}</td></tr>`).join('')+'</tbody>';
  const f={slow,old,noprod}[IV.flag]||(()=>true);
  const det=pos.filter(f).filter(o=>!find||o.obj.toLowerCase().includes(find)).sort((a,b)=>b.bal-a.bal);
  $('#tIv').innerHTML=`<thead><tr><th>TK</th><th>${objH}</th><th>ĐVT</th><th class=n>SL nhập</th><th class=n>SL xuất</th><th class=n>SL tồn</th><th class=n>Giá trị tồn</th>`+IBUCKETS.map(x=>`<th class=n>${x}</th>`).join('')+'<th>Nhập gần nhất</th><th>Xuất gần nhất</th><th>Đánh giá</th></tr></thead><tbody>'+
    det.slice(0,3000).map(o=>{const tags=[];if(noprod(o))tags.push('<span class="badge b-H">Thiếu mã hàng</span>');if(o.b[5]>0.005)tags.push('<span class="badge b-H">Tồn > 2 năm</span>');else if(old(o))tags.push('<span class="badge b-M">Tồn > 1 năm</span>');if(slow(o))tags.push(`<span class="badge b-M">${o.sinceOut==null?'Chưa xuất':o.sinceOut+' ngày không xuất'}</span>`);
      return `<tr><td class=nw title="${esc(o.accName)}">${esc(o.acc)}</td><td><div class=clamp title="${esc(o.obj)}">${esc(o.obj)}</div></td><td>${esc(o.uom)}</td><td class=n>${o.qtyIn?fmt2(o.qtyIn):''}</td><td class=n>${o.qtyOut?fmt2(o.qtyOut):''}</td><td class=n>${o.qtyIn||o.qtyOut?fmt2(o.qtyBal):''}</td>
      <td class=n><b>${fmt2(o.bal)}</b></td>${o.b.map(v=>`<td class=n>${c(v)}</td>`).join('')}<td class=nw>${vn(o.lastIn)}</td><td class=nw>${vn(o.lastOut)}</td><td>${tags.join(' ')}</td></tr>`}).join('')+'</tbody>';
}
['#ivAsOf','#ivBy','#ivLevel'].forEach(s=>$(s).onchange=()=>{if(s!=='#ivAsOf')$('#ivAcc').value='';vInv(true)});
$('#ivAcc').onchange=()=>vInv(false);$('#ivFind').oninput=()=>vInv(false);
$('#ivFlag').onclick=e=>{const b=e.target.closest('[data-f]');if(!b)return;IV.flag=b.dataset.f;$$('#ivFlag button').forEach(x=>x.classList.toggle('on',x===b));vInv(false)};
$('#tIvSum').onclick=e=>{const tr=e.target.closest('[data-acc]');if(tr){$('#ivAcc').value=tr.dataset.acc;vInv(false);$('#tIv').scrollIntoView({behavior:'smooth'})}};
$('#ivXls').onclick=()=>api.exportInventory($('#ivAsOf').value,$('#ivBy').value,$('#ivLevel').value,$('#ivAcc').value);

/* ---------- Kết quả kinh doanh ---------- */
async function vPL(){
  const {years:ys,months:ms}=await api.q('pl');
  const L=[['Doanh thu bán hàng & CCDV','rev'],['Giảm trừ doanh thu','ded'],['Doanh thu thuần','net',1],['Giá vốn / chi phí SX','cogs'],['Lợi nhuận gộp','gp',1],['Doanh thu tài chính','finInc'],['Chi phí tài chính','finExp'],
    ['Chi phí bán hàng','sell'],['Chi phí quản lý DN','admin'],['Lợi nhuận thuần từ HĐKD','op',1],['Lợi nhuận khác','other'],['Lợi nhuận trước thuế','pbt',1],['Chi phí thuế TNDN','tax'],['Lợi nhuận sau thuế','pat',1],
    ['Biên lợi nhuận gộp',y=>y.gp/y.net,2],['Biên LN thuần HĐKD',y=>y.op/y.net,2],['CP bán hàng + QLDN / DT',y=>(y.sell+y.admin)/y.net,2]];
  const val=(y,f)=>typeof f==='function'?f(y):y[f];
  $('#tPL').innerHTML='<thead><tr><th>Chỉ tiêu</th>'+ys.map((y,i)=>`<th class=n>${y.k}</th>`+(i?`<th class=n>± ${ys[i-1].k}</th>`:'')).join('')+'</tr></thead><tbody>'+
   L.map(([n,f,t])=>`<tr style="${t===1?'background:var(--brand-25)':''}"><td>${t===1?'<b>'+n+'</b>':n}</td>${ys.map((y,i)=>{const v=val(y,f),p=i?val(ys[i-1],f):null;
     const cell=t===2?pct(v):fmt(v),ch=i?(t===2?((v-p)*100).toFixed(1)+' đ%':pct((v-p)/Math.abs(p))):'';
     return `<td class="n ${v<0?'neg':''}">${t===1?'<b>'+cell+'</b>':cell}</td>`+(i?`<td class="n mut">${ch}</td>`:'')}).join('')}</tr>`).join('')+'</tbody>';
  chart('chMonth',{data:{labels:ms.map(m=>m.k),datasets:[{type:'bar',label:'Doanh thu thuần',data:ms.map(m=>m.net),backgroundColor:C.brand,maxBarThickness:32},
    {type:'bar',label:'Tổng chi phí',data:ms.map(m=>m.net-m.pbt),backgroundColor:C.gray,maxBarThickness:32},{type:'line',label:'LN trước thuế',data:ms.map(m=>m.pbt),borderColor:C.navy,backgroundColor:C.navy,tension:.3}]}});
  const notes=[],last=ys.at(-1),prev=ys.at(-2),N=(cls,t)=>notes.push(`<div class="note ${cls}">${t}</div>`);
  if(!last)N('','Chưa có dữ liệu.');
  else{
    if(ys.length===1)N('brand',`Dữ liệu chỉ có năm <b>${last.k}</b> (${ms.length} tháng). Nạp thêm các năm khác để so sánh xu hướng.`);
    if(last.net<=0&&last.cogs>0)N('','⚠ Có chi phí nhưng doanh thu ghi nhận rất ít – kiểm tra doanh thu hạch toán ở phân hệ khác (BCCS) hoặc chưa kết chuyển.');
    if(last.gp<0)N('','⚠ Lợi nhuận gộp âm: chi phí sản xuất vượt doanh thu.');
    if(prev){const g=(last.net-prev.net)/Math.abs(prev.net),c=(last.cogs-prev.cogs)/Math.abs(prev.cogs);
      N('brand',`Doanh thu thuần ${last.k} <b>${g>=0?'tăng':'giảm'} ${pct(Math.abs(g))}</b> so với ${prev.k}; giá vốn ${c>=0?'tăng':'giảm'} ${pct(Math.abs(c))}.`);
      if(c>g+0.05)N('','⚠ Chi phí tăng nhanh hơn doanh thu → biên lợi nhuận bị thu hẹp.');
      if(ms.length/ys.length<12)N('','Các năm có số tháng dữ liệu khác nhau – nên so sánh lũy kế cùng kỳ.')}
  }
  $('#plNotes').innerHTML=notes.join('');
}

/* ---------- Doanh thu & chi phí theo tài khoản / khoản mục ---------- */
const AN_BY={acc1:'Tài khoản',acc:'Tài khoản chi tiết',item:'Khoản mục',dept:'Bộ phận'};
const PAL=['#FA4700','#001A79','#FF9C6B','#2970FF','#D63600','#875BF7','#17B26A','#EAAA08','#A4A7AE'];
let AN={kind:'exp',data:null,view:[]};
async function vCost(reload=true){
  const by=$('#anBy').value,per=$('#anPer').value,find=$('#anFind').value.trim().toLowerCase();
  if(reload||!AN.data)AN.data=await api.q('analysis',AN.kind,by,per);
  const {rows,periods}=AN.data,G=new Map();
  for(const r of rows){const g=G.get(r.g)||G.set(r.g,{g:r.g,name:r.name,tot:0,n:0,by:{}}).get(r.g);g.tot+=r.v;g.n+=r.n;g.by[r.p]=(g.by[r.p]||0)+r.v}
  const all=[...G.values()].sort((a,b)=>b.tot-a.tot),total=all.reduce((s,x)=>s+x.tot,0);
  const list=all.filter(x=>!find||(x.g+' '+x.name).toLowerCase().includes(find));AN.view=list;
  const last=periods.at(-1),prev=periods.at(-2),sumP=p=>all.reduce((s,x)=>s+(x.by[p]||0),0),lv=sumP(last),pv=sumP(prev);
  const label=AN.kind==='rev'?'doanh thu':'chi phí',lbl=s=>s.charAt(0).toUpperCase()+s.slice(1);
  // Biến động mạnh nhất kỳ cuối
  const mv=prev?all.map(x=>({x,d:(x.by[last]||0)-(x.by[prev]||0)})).sort((a,b)=>Math.abs(b.d)-Math.abs(a.d))[0]:null;
  $('#anKpi').innerHTML=kpi(AN.kind==='rev'?'blue':'','coins',`Tổng ${label}`,fmt(total),`${periods.length} kỳ · ${num(all.length)} nhóm`)
    +kpi('',AN.kind==='rev'?'trend':'pie',`${lbl(label)} kỳ ${last||''}`,fmt(lv),prev?`${lv>=pv?'▲':'▼'} ${pct(Math.abs((lv-pv)/pv))} so với ${prev}`:'')
    +kpi('','chart',`Lớn nhất: ${esc(String(all[0]?.g||'').slice(0,28))}`,all[0]?pct(all[0].tot/total):'–',esc(all[0]?.name||'tỷ trọng trong tổng'))
    +(mv?kpi(mv.d>0&&AN.kind==='exp'?'red':'green','alert','Biến động mạnh nhất kỳ cuối',(mv.d>0?'+':'')+fmt(mv.d),esc(String(mv.x.g).slice(0,40))):'');
  $('#anChartT').textContent=`Diễn biến ${label} theo ${{m:'tháng',q:'quý',y:'năm'}[per]}`;
  const top=all.slice(0,8),other=all.slice(8);
  const ds=top.map((x,i)=>({label:String(x.g).slice(0,40),data:periods.map(p=>x.by[p]||0),backgroundColor:PAL[i],borderRadius:0,maxBarThickness:42}));
  if(other.length)ds.push({label:'Khác',data:periods.map(p=>other.reduce((s,x)=>s+(x.by[p]||0),0)),backgroundColor:PAL[8],borderRadius:0,maxBarThickness:42});
  chart('chAn',{type:'bar',data:{labels:periods,datasets:ds},options:{scales:{x:{stacked:true},y:{stacked:true}},plugins:{legend:{position:'bottom',labels:{font:{size:11}}}}}});
  chart('chAnPie',{type:'doughnut',data:{labels:[...top.map(x=>String(x.g).slice(0,30)),...(other.length?['Khác']:[])],datasets:[{data:[...top.map(x=>Math.max(0,x.tot)),...(other.length?[other.reduce((s,x)=>s+Math.max(0,x.tot),0)]:[])],backgroundColor:PAL,borderWidth:2,borderColor:'#fff'}]},
    options:{cutout:'62%',plugins:{legend:{position:'bottom',labels:{font:{size:11}}},tooltip:{callbacks:{label:c=>`${c.label}: ${fmt(c.raw)} (${pct(c.raw/total)})`}}}}});
  // Bảng: nhóm × kỳ
  const P=periods.length>36?periods.slice(-36):periods;
  $('#anTblT').textContent=`${lbl(label)} theo ${AN_BY[by].toLowerCase()} × ${{m:'tháng',q:'quý',y:'năm'}[per]}`;
  $('#anHint').textContent=(periods.length>P.length?`hiển thị ${P.length} kỳ gần nhất · `:'')+`${num(list.length)} nhóm`;
  const head='<thead><tr><th style="position:sticky;left:0;z-index:2;background:var(--gray-50)">'+AN_BY[by]+'</th>'+(by==='acc1'?'<th>Tên</th>':'')+'<th class=n>Tổng</th><th class=n>Tỷ trọng</th>'+(prev?`<th class=n>± ${last} / ${prev}</th>`:'')+P.map(p=>`<th class=n>${p}</th>`).join('')+'<th class=n>Số dòng</th></tr></thead>';
  const body=list.slice(0,1000).map((x,i)=>{const l=x.by[last]||0,p=x.by[prev]||0,ch=p?(l-p)/Math.abs(p):null;
    const chc=ch==null?'':(AN.kind==='exp'?(ch>0.2?'neg':ch<-0.2?'pos':''):(ch<-0.2?'neg':ch>0.2?'pos':''));
    return `<tr class="click" data-i="${i}"><td style="position:sticky;left:0;background:#fff;min-width:200px"><b>${esc(x.g)}</b></td>${by==='acc1'?`<td class=nw>${esc(x.name)}</td>`:''}
      <td class=n><b>${fmt(x.tot)}</b></td><td class=n><div style="display:flex;align-items:center;gap:6px;justify-content:flex-end"><div style="width:50px;height:6px;border-radius:9px;background:var(--gray-200)"><div style="width:${Math.max(0,Math.min(100,x.tot/total*100))}%;height:100%;border-radius:9px;background:var(--brand-500)"></div></div>${pct(x.tot/total)}</div></td>
      ${prev?`<td class="n ${chc}">${ch==null?(l?'mới':''):(ch>0?'▲ ':'▼ ')+pct(Math.abs(ch))}</td>`:''}${P.map(p=>`<td class=n>${x.by[p]?fmt(x.by[p]):''}</td>`).join('')}<td class="n mut">${num(x.n)}</td></tr>`}).join('');
  const foot=`<tr style="background:var(--brand-25)"><td style="position:sticky;left:0;background:var(--brand-25)"><b>Tổng cộng</b></td>${by==='acc1'?'<td></td>':''}<td class=n><b>${fmt(total)}</b></td><td class=n>100%</td>${prev?`<td class=n>${pv?pct((lv-pv)/Math.abs(pv)):''}</td>`:''}${P.map(p=>`<td class=n><b>${fmt(sumP(p))}</b></td>`).join('')}<td></td></tr>`;
  $('#tAn').innerHTML=head+'<tbody>'+body+foot+'</tbody>';
}
$('#anKind').onclick=e=>{const b=e.target.closest('[data-k]');if(!b)return;AN.kind=b.dataset.k;$$('#anKind button').forEach(x=>x.classList.toggle('on',x===b));vCost(true)};
['#anBy','#anPer'].forEach(s=>$(s).onchange=()=>vCost(true));$('#anFind').oninput=()=>vCost(false);
$('#tAn').onclick=e=>{const tr=e.target.closest('tr[data-i]');if(tr)drill(AN.view[+tr.dataset.i])};
$('#anXls').onclick=()=>{const {periods}=AN.data,by=$('#anBy').value;
  api.exportAnalysis((AN.kind==='rev'?'DoanhThu':'ChiPhi')+'_'+by,AN.view.map(x=>Object.assign({[AN_BY[by]]:x.g},by==='acc1'?{'Tên':x.name}:{},{'Tổng':x.tot},...periods.map(p=>({[p]:x.by[p]||0})),{'Số dòng':x.n})))};
async function drill(x){
  const d=await api.q('analysisDrill',AN.kind,$('#anBy').value,x.g,$('#anPer').value,null);CUR=-1;
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">${AN_BY[$('#anBy').value]}</div><h2 style="font-size:20px">${esc(x.g)} ${x.name?'<span class=mut style="font-weight:400">– '+esc(x.name)+'</span>':''}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
   <div class="pb"><div class="kpis">${kpi('','coins','Tổng',fmt(d.sum),num(d.total)+' bút toán')}${kpi('','file','Đang hiển thị',num(d.rows.length),'bút toán có số tiền lớn nhất')}</div>
   <div class="card"><div class="card-h"><h3>Bút toán chi tiết</h3><span class="hint">bấm dòng có biểu tượng cảnh báo để xem lỗi</span></div><div class="tbl"><table><thead><tr><th></th><th>Ngày</th><th>Chứng từ</th><th>TK Nợ</th><th>TK Có</th><th class=n>Số tiền</th><th>Diễn giải</th><th>Khoản mục</th><th>Bộ phận</th><th>Người nhập</th></tr></thead><tbody>
   ${d.rows.map(r=>`<tr class="${r.eid?'click':''}" data-eid="${r.eid||''}"><td>${r.eid?'<span class="badge b-M">Có lỗi</span>':''}</td><td class=nw>${vn(r.date)}</td><td class=nw>${esc(r.doc)}</td><td>${esc(r.drName)}</td><td>${esc(r.crName)}</td><td class="n ${r.amt<0?'neg':''}">${fmt2(r.amt)}</td><td><div class=clamp title="${esc(r.desc)}">${esc(r.desc)}</div></td><td>${esc(AN.kind==='rev'?r.trev:r.tcost)}</td><td>${esc(r.dept)}</td><td class=nw>${esc(short(r.user))}</td></tr>`).join('')}
   </tbody></table></div></div></div>`;
  $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
  $('#dPane').querySelector('tbody').onclick=e=>{const tr=e.target.closest('tr[data-eid]');if(tr&&tr.dataset.eid)showDetail(null,+tr.dataset.eid)};
}

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

const VIEWS={overview:vOverview,errors:()=>vErrors(),aging:()=>vAging(true),inv:()=>vInv(true),pl:vPL,cost:()=>vCost(true),report:vReport,data:vData};
(async()=>{
  META=await api.q('meta');RULE=Object.fromEntries(META.rules.map(r=>[r.k,r]));
  const info=await api.info();$('#ver').textContent='v'+info.version;
  await refreshSide();go('overview');
})();
