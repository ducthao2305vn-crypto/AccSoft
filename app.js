"use strict";
// Logic giao diện AccSoft – mọi dữ liệu lấy qua window.api (SQLite ở tiến trình chính)
// window.api do preload.js cung cấp
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
const TITLES={overview:['Tổng quan','Bức tranh chung về dữ liệu hạch toán'],errors:['Lỗi nhập liệu','Phát hiện, theo dõi và xử lý bút toán sai'],aging:['Công nợ & tuổi nợ','Phải thu, phải trả, tạm ứng theo đối tượng'],
  pl:['Kết quả kinh doanh','Doanh thu, chi phí, lợi nhuận theo năm và tháng'],cost:['Cơ cấu chi phí','Khoản mục và bộ phận phát sinh chi phí'],report:['Báo cáo & Thông báo','Báo cáo kiểm tra và gửi yêu cầu khắc phục'],data:['Quản lý dữ liệu','Tháng dữ liệu, lần nạp file và bảo trì CSDL']};

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
  try{await VIEWS[p]()}catch(e){console.error(e)}
}
$('#nav').onclick=e=>{const b=e.target.closest('[data-p]');if(b)go(b.dataset.p)};
document.addEventListener('click',e=>{const g=e.target.closest('[data-go]');if(g)go(g.dataset.go);if(e.target.closest('[data-act=import]'))doImport()});
async function refreshSide(){
  const s=await api.q('stats');
  $('#sideFoot').innerHTML=`<b>${num(s.entries)}</b> dòng · <b>${s.monthsOn}/${s.months}</b> tháng đang phân tích`;
  const f=await api.q('errorFacets');const n=f.status.open+f.status.doing;
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
  $('#hRows').textContent=num(o.rows);$('#hDocs').textContent=num(o.docs);$('#hErr').textContent=num(o.errs);$('#hHigh').textContent=num(o.high);
  $('#ovKpi').innerHTML=kpi('','file','Dòng có cảnh báo',num(o.errRows),pct(o.errRows/o.rows)+' tổng số dòng')+kpi('red','alert','Lỗi mức cao',num(o.high),'cần xử lý ưu tiên')
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
function readFil(){const v=id=>$(id).value;return {status:FIL.status||'',sev:v('#fSev'),rule:v('#fRule'),user:v('#fUser'),month:v('#fMonth'),dept:v('#fDept'),acc:v('#fAcc').trim(),min:v('#fMin'),max:v('#fMax'),text:v('#fText').trim()}}
function fillSel(id,items,label,cur){$(id).innerHTML=`<option value="">${label}</option>`+items.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('');$(id).value=cur||''}
async function vErrors(keep){
  const f=await api.q('errorFacets');
  if(!keep){
    fillSel('#fRule',f.rules.map(r=>[r.k,`${RULE[r.k]?.n||r.k} (${num(r.n)})`]),'Tất cả loại lỗi',FIL.rule);
    fillSel('#fUser',f.users.map(u=>[u,short(u)]),'Tất cả người nhập',FIL.user);
    fillSel('#fMonth',f.months.map(m=>[m,m]),'Tất cả tháng',FIL.month);
    fillSel('#fDept',f.depts.map(d=>[d,d]),'Tất cả bộ phận',FIL.dept);
    for(const [k,id] of [['sev','#fSev'],['acc','#fAcc'],['min','#fMin'],['max','#fMax'],['text','#fText']])$(id).value=FIL[k]||'';
  }
  FIL=readFil();
  const all=Object.values(f.status).reduce((a,b)=>a+b,0);
  $('#stTabs').innerHTML=[['','Tất cả',all],...Object.entries(META.status).map(([k,n])=>[k,n,f.status[k]])]
    .map(([k,n,c])=>`<button class="${(FIL.status||'')===k?'on':''}" data-st="${k}">${n}<b>${num(c)}</b></button>`).join('')+
    (f.gone.length?`<button data-gone="1">${ic('check')}Đã sửa trong ERP<b>${f.gone.length}</b></button>`:'');
  $('#goneCard').classList.toggle('hide',!f.gone.length);
  $('#tGone').innerHTML='<thead><tr><th>Loại lỗi</th><th>Chứng từ</th><th>Trạng thái đã ghi</th><th>Ghi chú</th><th>Cập nhật</th></tr></thead><tbody>'+f.gone.map(r=>`<tr><td>${esc(RULE[r.rule]?.n||r.rule)}</td><td>${esc(r.doc)}</td><td><span class="badge s-${r.status}">${META.status[r.status]||''}</span></td><td>${esc(r.note)}</td><td class=nw>${esc(r.at)}</td></tr>`).join('')+'</tbody>';
  const cnt=Object.fromEntries(f.rules.map(r=>[r.k,r.n]));
  $('#tRules').innerHTML='<thead><tr><th>Mức</th><th>Quy tắc</th><th>Ý nghĩa / rủi ro</th><th>Cách khắc phục</th><th class=n>Cảnh báo</th></tr></thead><tbody>'+
    META.rules.map(r=>`<tr class="r${r.s}"><td><span class="badge b-${r.s}">${SEVL[r.s]}</span></td><td><b>${esc(r.n)}</b><div class=mut style="font-size:12px">${r.k}</div></td><td>${esc(r.d)}</td><td>${esc(r.fix)}</td><td class=n>${num(cnt[r.k])}</td></tr>`).join('')+'</tbody>';
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
$('#fReset').onclick=()=>{FIL={};OFF=0;vErrors()};
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
       <div class="mut" style="margin-top:6px;font-size:13px">${esc(RULE[x.k]?.d)}</div><div class="how"><b>Cần chỉnh sửa:</b> ${esc(RULE[x.k]?.fix||'Kiểm tra lại chứng từ gốc.')}</div></div>`).join('')}</div>
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

/* ---------- Chi phí ---------- */
async function vCost(){
  const c=await api.q('cost');const tc={},ty={};
  for(const r of c.byType){tc[r.t]=(tc[r.t]||0)+r.v;(ty[r.t]??={})[r.y]=r.v}
  const top=Object.entries(tc).sort((a,b)=>b[1]-a[1]),t1=top.slice(0,15);
  chart('chCost',{type:'bar',data:{labels:t1.map(x=>x[0].slice(0,42)),datasets:[{data:t1.map(x=>x[1]),backgroundColor:t1.map((_,i)=>i<3?C.brand:C.brand3),barThickness:16}]},options:{indexAxis:'y',plugins:{legend:{display:false}}}});
  chart('chDept',{type:'bar',data:{labels:c.byDept.map(x=>x.d.slice(0,32)),datasets:[{data:c.byDept.map(x=>x.v),backgroundColor:C.navy,barThickness:16}]},options:{indexAxis:'y',plugins:{legend:{display:false}}}});
  const ys=[...new Set(c.byType.map(r=>r.y))].sort(),tot=top.reduce((a,b)=>a+b[1],0);
  $('#tCost').innerHTML='<thead><tr><th>Khoản mục</th>'+ys.map(y=>`<th class=n>${y}</th>`).join('')+'<th class=n>Tỷ trọng</th>'+(ys.length>1?'<th class=n>Biến động năm cuối</th>':'')+'</tr></thead><tbody>'+
   top.slice(0,80).map(([t,v])=>{const a=ty[t]||{},l=a[ys.at(-1)]||0,p=a[ys.at(-2)]||0;return `<tr><td>${esc(t)}</td>${ys.map(y=>`<td class=n>${fmt(a[y]||0)}</td>`).join('')}<td class=n><b>${pct(v/tot)}</b></td>`+(ys.length>1?`<td class=n>${p?pct((l-p)/Math.abs(p)):'mới'}</td>`:'')+'</tr>'}).join('')+'</tbody>';
}

/* ---------- Báo cáo & thông báo ---------- */
let MAILTO=ls.get('mailto',{});
const mailOpts=(test=false)=>({minSev:$('#rSev').value,deadline:$('#rDeadline').value,intro:$('#rIntro').value,sign:$('#rSign').value,mark:$('#rMark').checked,test});
async function vReport(){
  const [rep,todo,log]=await Promise.all([api.q('report'),api.q('todo',$('#rSev').value),api.q('mailLog')]);
  const sum=k=>rep.byRule.reduce((a,r)=>a+r[k],0),n=sum('n'),done=sum('fixed')+sum('ignore');
  $('#repPeriod').textContent=`Kỳ dữ liệu ${rep.months[0]||''} → ${rep.months.at(-1)||''} · Lập ngày ${new Date().toLocaleDateString('vi')}`;
  $('#repKpi').innerHTML=kpi('','alert','Cảnh báo phát hiện',num(n))+kpi('green','check','Đã kiểm tra xong',num(done),pct(done/n))+kpi('green','check','Đã khắc phục',num(sum('fixed')))
    +kpi('','file','Còn phải khắc phục',num(sum('open')+sum('doing')))+kpi('red','alert','Lỗi mức cao',num(sum('high')),'tổng phát hiện');
  const cross=(rows,label,name)=>`<thead><tr><th>${label}</th><th class=n>Tổng</th><th class=n>Cao</th><th class=n>Chưa XL</th><th class=n>Đang XL</th><th class=n>Đã sửa</th><th class=n>Không lỗi</th><th class=n>Hoàn thành</th></tr></thead><tbody>`+
    rows.map(r=>{const p=(r.fixed+r.ignore)/r.n;return `<tr><td>${esc(name(r.k))}</td><td class=n>${num(r.n)}</td><td class="n ${r.high?'neg':''}">${r.high||''}</td><td class=n>${num(r.open)}</td><td class=n>${num(r.doing)}</td><td class="n pos">${num(r.fixed)}</td><td class=n>${num(r.ignore)}</td>
      <td class=n><div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><div style="width:60px;height:6px;border-radius:9px;background:var(--gray-200)"><div style="width:${p*100}%;height:100%;border-radius:9px;background:var(--brand-500)"></div></div><b>${pct(p)}</b></div></td></tr>`}).join('')+'</tbody>';
  $('#tRepRule').innerHTML=cross(rep.byRule,'Loại lỗi',k=>RULE[k]?.n||k);$('#tRepUser').innerHTML=cross(rep.byUser,'Người nhập',short);
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
['rIntro','rSign','rDeadline','rSev'].forEach(id=>{const v=ls.get(id,null);if(v!=null)$('#'+id).value=v;$('#'+id).addEventListener('change',()=>{ls.set(id,$('#'+id).value);if(id==='rSev')vReport()})});
$('#repPrint').onclick=()=>window.print();$('#repXls').onclick=()=>api.exportReport($('#rSev').value);
$('#tTodo').onchange=e=>{if(e.target.id==='mAllEmp')$$('.empChk').forEach(c=>c.checked=e.target.checked);
  if(e.target.classList.contains('empMail')){MAILTO[e.target.dataset.u]=e.target.value.trim();ls.set('mailto',MAILTO)}};
$('#tTodo').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.prev)previewMail(b.dataset.prev);if(b.dataset.xls)api.exportEmployee(b.dataset.xls,$('#rSev').value)};
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
async function vData(){
  const [ms,imps,info,s]=await Promise.all([api.q('months'),api.q('imports'),api.info(),api.q('stats')]);
  const years={};ms.forEach(m=>(years[m.ym.slice(0,4)]??=[]).push(m));
  $('#months').innerHTML=Object.entries(years).map(([y,arr])=>`<h4 style="margin:16px 0 10px">Năm ${y}</h4><div class="month-grid">`+
    arr.map(m=>`<div class="mcard ${m.included?'on':''}"><div class="x"><span class="m">Tháng ${m.ym.slice(5)}</span><input type="checkbox" data-m="${m.ym}" ${m.included?'checked':''} title="Đưa vào phân tích"></div>
      <div class="mut" style="font-size:12px">${num(m.n)} dòng</div><div class="mut" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(m.files)}">${esc(m.files||'')}</div>
      <button class="btn sm danger" data-delm="${m.ym}">Xoá tháng</button></div>`).join('')+'</div>').join('')||'<div class="empty"><h2>Chưa có dữ liệu</h2><p>Bấm "Nạp dữ liệu" để bắt đầu.</p></div>';
  $('#tImports').innerHTML='<thead><tr><th>File</th><th class=n>Số dòng</th><th>Từ ngày</th><th>Đến ngày</th><th>Nạp lúc</th><th></th></tr></thead><tbody>'+
    imps.map(i=>`<tr><td>${esc(i.file)}</td><td class=n>${num(i.rows)}</td><td>${vn(i.from)}</td><td>${vn(i.to)}</td><td class=nw>${esc(i.at)}</td><td><button class="btn sm danger" data-deli="${i.id}">Xoá</button></td></tr>`).join('')+'</tbody>';
  $('#dbInfo').innerHTML=`<div>File CSDL</div><div><code>${esc(info.dbFile)}</code>${info.fallback?'<div class="neg" style="font-size:12px">Không ghi được vào thư mục ứng dụng ('+esc(info.appDir)+') nên đang lưu ở thư mục người dùng. Hãy đặt AccSoft ở thư mục có quyền ghi (vd D:\\AccSoft).</div>':''}${info.migratedFrom?'<div class="pos" style="font-size:12px">Đã chuyển dữ liệu từ '+esc(info.migratedFrom)+'</div>':''}</div><div>Dòng hạch toán</div><div>${num(s.entries)}</div><div>Cảnh báo</div><div>${num(s.errors)}</div><div>Phiên bản</div><div>${esc(info.version)}</div>`;
}
const runT=async(t,a,msg)=>{try{await api.task(t,a);if(msg)alert(msg)}catch(e){alert(e.message)}await refreshSide();go(PAGE)};
$('#months').onchange=async e=>{const m=e.target.dataset.m;if(!m)return;await api.q('setMonths',[m],e.target.checked);await refreshSide();vData()};
$('#months').onclick=e=>{const m=e.target.dataset.delm;if(m&&confirm(`Xoá hẳn toàn bộ dữ liệu tháng ${m}?`))runT('deleteMonth',{ym:m})};
$('#tImports').onclick=e=>{const id=e.target.closest('[data-deli]')?.dataset.deli;if(id&&confirm('Xoá toàn bộ dữ liệu của lần nạp này?'))runT('deleteImport',{id:+id})};
$('#mAll').onclick=async()=>{await api.q('setAllMonths',true);await refreshSide();vData()};$('#mNone').onclick=async()=>{await api.q('setAllMonths',false);await refreshSide();vData()};
$('#openDb').onclick=()=>api.openDbFolder();
$('#btnRecheck').onclick=()=>runT('recheck',{},'Đã kiểm tra lại toàn bộ dữ liệu.');
$('#btnClear').onclick=()=>{if(confirm('Xoá TOÀN BỘ dữ liệu hạch toán và cảnh báo? (giữ lại trạng thái/ghi chú và cấu hình mail)'))runT('clear',{})};

const VIEWS={overview:vOverview,errors:()=>vErrors(),aging:()=>vAging(true),pl:vPL,cost:vCost,report:vReport,data:vData};
(async()=>{
  META=await api.q('meta');RULE=Object.fromEntries(META.rules.map(r=>[r.k,r]));
  const info=await api.info();$('#ver').textContent='v'+info.version;
  await refreshSide();go('overview');
})();
