"use strict";
// Sau hộp thoại alert / confirm / prompt (Windows) trả lại focus bàn phím cho cửa sổ, tránh phải chuyển ứng dụng mới gõ được
(()=>{const fix=()=>{const el=document.activeElement;try{window.api&&api.refocus&&api.refocus().then(()=>{if(el&&el!==document.body&&el.isConnected)el.focus()})}catch{}};
  for(const k of ['prompt']){const o=window[k];if(typeof o!=='function')continue;window[k]=function(...a){const r=o.apply(window,a);setTimeout(fix,0);return r}}
})();
// Chờ người dùng ngừng gõ rồi mới lọc / vẽ lại (tránh đơ khi bảng lớn)
const deb=(fn,ms=250)=>{let t=0;return function(...a){clearTimeout(t);t=setTimeout(()=>fn.apply(this,a),ms)}};
// Logic giao diện AccSoft – mọi dữ liệu lấy qua window.api (SQLite ở tiến trình chính)
// window.api do preload.js cung cấp
// Mọi lỗi giao diện đều ghi vào nhật ký
window.addEventListener('error',e=>api.logError(e.message,e.error&&e.error.stack||`${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection',e=>api.logError(String(e.reason&&e.reason.message||e.reason),e.reason&&e.reason.stack));
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
// Theo dõi số truy vấn đang chạy của trang để hiện thanh tiến độ tải dữ liệu
const QT={n:0,done:0};
const aq=(...a)=>{QT.n++;return window.api.q(...a).finally(()=>{QT.done++})};
const fmt=v=>v==null||isNaN(v)?'':Math.round(v).toLocaleString('en-US');
const fmt2=v=>v==null?'':(+v).toLocaleString('en-US',{maximumFractionDigits:2});
const pct=v=>isFinite(v)?(v*100).toFixed(1)+'%':'–';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const vn=s=>s?s.split('-').reverse().join('/'):'';
const short=u=>String(u||'').split('_')[0];
const num=v=>(+v||0).toLocaleString('en-US');
const ic=n=>`<svg class="icon"><use href="#i-${n}"/></svg>`;
const kpi=(cls,icon,lb,v,s)=>`<div class="kpi ${cls}"><div class="ic">${ic(icon)}</div><div class="lb">${lb}</div><div class="v">${v}</div><div class="s">${s||''}</div></div>`;
const ls={get:(k,d)=>{try{const v=localStorage.getItem('accsoft.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem('accsoft.'+k,JSON.stringify(v))}catch(e){}}};
const SEVL={H:'Cao',M:'Trung bình',L:'Thấp'};
let META={rules:[],status:{}},RULE={},PAGE='overview',charts={};
const TITLES={lgr:['Phân tích sổ chi tiết (ledger)','Chọn kỳ, tài khoản, đối tượng → tình trạng khớp từng dòng hạch toán (khớp / chưa khớp / cần phân tích), ghi chú – kết quả tự lưu'],ap331:['Đối chiếu công nợ 331 theo hợp đồng','Số dư phải trả / ứng trước theo đối tượng × hợp đồng; điều chỉnh hợp đồng; xuất biên bản đối chiếu Word + Excel'],inv88:['Đối chiếu hóa đơn – 138812','So sánh doanh thu / thu cước theo hóa đơn với ghi nhận ERP TK 138812 theo tháng và đối tượng; map account khách hàng ↔ mã đối tượng ERP'],r88:['Công nợ phải thu 1388 / 131','Phải thu khác theo đối tượng – FIFO theo đối tượng; đánh dấu bút toán ghi sai đối tượng để loại khỏi tuổi nợ hoặc chuyển sang đối tượng đúng'],landl:['Chủ nhà trạm','Danh mục chủ nhà trạm từ sổ (Nợ 24211 / Có 331, thanh toán Nợ 331 / Có 112): tên, số tài khoản, mã nhà trạm, hợp đồng thuê, kỳ thuê, công nợ'],adv:['Công nợ tạm ứng','Tạm ứng (TK 141) theo nhân viên – số dư, khoản còn treo, tuổi nợ và đối chiếu với nhân viên'],staff:['Danh mục nhân viên','Danh sách CBCNV – tra cứu, thêm / sửa / xoá, nạp từ file, gửi email; dùng cho báo cáo quản trị và gửi thư lỗi nhập liệu'],fcst:['Dự báo tài chính','Dự báo kết quả kinh doanh (B02) và cân đối kế toán (B01) cho các năm tới bằng nhiều mô hình'],vehc:['Chi phí theo xe','Xăng dầu, sửa chữa, dầu – nước làm mát, thuê xe theo biển số – định mức và so sánh đội xe'],deptc:['Chi phí theo phòng ban','Chi phí theo phòng ban hạch toán × nhóm chi phí × tháng – điều chỉnh đúng phòng ban ngân sách'],locc:['Chi phí theo vị trí','Thuê trạm, văn phòng, nhà nghỉ, điện trạm, xăng dầu máy phát theo mã vị trí và tháng – phát hiện tháng thiếu chi phí'],dmc:['Danh mục phòng ban & khoản mục chi phí','Danh mục phục vụ báo cáo quản trị – ánh xạ phòng ban dữ liệu gốc'],fadj:['Điều chỉnh dữ liệu','Hợp đồng, mã vị trí, biển số xe, loại dòng tiền – phục vụ báo cáo quản trị và đối chiếu công nợ'],overview:['Tổng quan','Bức tranh chung về dữ liệu hạch toán'],errors:['Lỗi nhập liệu','Phát hiện, theo dõi và xử lý bút toán sai'],inv:['Tuổi hàng tồn kho','Tồn kho theo mặt hàng, kho, đối tượng – FIFO theo ngày nhập'],aging:['Công nợ & tuổi nợ','Phải thu, phải trả, tạm ứng theo đối tượng'],
  pl:['Kết quả kinh doanh','Doanh thu, chi phí, lợi nhuận theo năm và tháng'],cost:['Doanh thu & Chi phí','Phân tích theo tài khoản, khoản mục, bộ phận và kỳ'],cat:['Danh mục đối tượng','Nhân viên, đối tác Timor, đối tác quốc tế, nội bộ… – thêm, sửa, xoá, nạp từ Excel'],fin:['Báo cáo tài chính','Theo Thông tư 99/2025/TT-BTC – Bảng CĐSPS, B01, B02, B03, B09 lập tự động từ dữ liệu hạch toán'],deep:['Phân tích chuyên sâu','Chi phí định kỳ, biến động, 335/242, nhân viên, Benford, nhà cung cấp, tỷ giá'],report:['Báo cáo & Thông báo','Báo cáo kiểm tra và gửi yêu cầu khắc phục'],data:['Quản lý dữ liệu','Tháng dữ liệu, lần nạp file và bảo trì CSDL']};

/* ---------- Biểu đồ: bảng màu TLM, cam chủ đạo ---------- */
const C_={},C={brand:'#FA4700',brand3:'#FF9C6B',brand1:'#FFD4BD',navy:'#001A79',ok:'#17B26A',err:'#F04438',gray:'#D5D7DA',grid:'#F5F5F5',txt:'#535862'};Object.assign(C_,C);
Chart.defaults.font.family=getComputedStyle(document.body).fontFamily;Chart.defaults.color=C.txt;Chart.defaults.maintainAspectRatio=false;Chart.defaults.animation={duration:350};
Chart.defaults.plugins.legend.labels.usePointStyle=true;Chart.defaults.plugins.legend.labels.boxWidth=8;Chart.defaults.scale.grid.color=C.grid;Chart.defaults.elements.bar.borderRadius=6;
Chart.defaults.plugins.tooltip.backgroundColor='#181D27';Chart.defaults.plugins.tooltip.padding=10;Chart.defaults.plugins.tooltip.cornerRadius=8;
function chart(id,cfg){charts[id]?.destroy();charts[id]=new Chart($('#'+id),cfg)}

/* ---------- Điều hướng ---------- */
let GOSEQ=0;
// Chạy hàm tải dữ liệu của trang/tab kèm thanh tiến độ (ước lượng theo thời gian lần trước + số phần đã tải xong)
async function loadWith(p,sec,fn){
  sec.classList.add('loading');
  // Thanh tiến độ: ước lượng theo thời gian các lần mở trước (lưu trên máy) + số truy vấn đã xong
  const PM=ls.get('pageMs',{}),est=PM[p]||1200,t0=performance.now(),PL=$('#pageLoad'),my=++GOSEQ;QT.n=0;QT.done=0;
  const tick=()=>{if(my!==GOSEQ)return;const el=performance.now()-t0,tp=1-Math.exp(-el/est*1.6),qp=QT.n?QT.done/QT.n:0,pc=Math.min(97,Math.round(100*Math.max(tp*0.9,qp*0.85)));
    if(el>250)PL.classList.remove('hide');$('#plBar').style.width=pc+'%';const left=Math.max(0,(est-el)/1000);
    $('#plTxt').textContent=`Đang tải dữ liệu… ${pc}%`+(QT.n?` · ${QT.done}/${QT.n} phần`:'')+(left>=1?` · còn khoảng ${Math.ceil(left)} giây`:el>est?' · sắp xong':'')};
  const iv=setInterval(tick,120);tick();
  try{await fn()}catch(e){console.error(e);api.logError(`Mở trang ${p}: ${e.message}`,e.stack)}
  finally{clearInterval(iv);sec.classList.remove('loading');if(my===GOSEQ){const el=performance.now()-t0;PM[p]=Math.round(PM[p]?PM[p]*0.6+el*0.4:el);ls.set('pageMs',PM);
    $('#plBar').style.width='100%';setTimeout(()=>{if(my===GOSEQ)PL.classList.add('hide')},el>250?250:0)}}
}
async function go(p){
  PAGE=p;$$('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.p===p));
  $$('.content>section').forEach(s=>s.classList.toggle('hide',s.id!==p));
  $('#pTitle').textContent=TITLES[p][0];$('#pSub').textContent=TITLES[p][1];$('#content').scrollTop=0;
  await loadWith(p,$('#'+p),VIEWS[p]);
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
  const [p,ms]=await Promise.all([aq('reviewPeriod'),aq('months')]);const yms=ms.map(m=>m.ym).sort();
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
    await aq('setReviewPeriod',from,to);OFF=0;FIL={...FIL,month:''};await refreshSide();go(PAGE)};
}

/* ---------- Phân tích dữ liệu (tách khỏi bước nạp) ---------- */
async function refreshPending(){
  const st=await aq('analysisStatus'),n=st.pending.length;
  $('#anPending').textContent=n;$('#anPending').classList.toggle('hide',!n);
  const old=st.pending.filter(x=>x.old).length,list=st.pending.slice(0,6).map(x=>x.ym.slice(5)+'/'+x.ym.slice(0,4)).join(', ')+(n>6?'…':'');
  $$('.pendNote').forEach(el=>{el.classList.toggle('hide',!n);
    el.innerHTML=n?`${ic('alert')}<span><b>${n} tháng trong kỳ rà soát chưa được phân tích${old?` (${old} tháng phân tích bằng bộ quy tắc cũ)`:''}</b>: ${list}. Kết quả lỗi đang hiển thị chưa đầy đủ.</span><button class="btn sm primary" data-act="analyze">Phân tích ngay</button>`:''});
  return st;
}
async function runAnalyze(all=false){
  const st=await aq('analysisStatus');
  const label=all?'TOÀN BỘ dữ liệu (mọi tháng)':`kỳ rà soát: ${rvLabel(st.review)} (${st.months} tháng)`;
  if(!await ask(`Phân tích ${label}?\n\nKết quả lỗi cũ của các tháng này được tính lại; trạng thái và ghi chú xử lý vẫn được giữ.`))return;
  try{const r=await api.task(all?'recheck':'analyze',all?{}:st.review);alert(`Đã phân tích ${num(r.rows)} dòng · ${r.months} tháng · ${Math.round(r.secs)} giây.`)}catch(e){alert(e.message)}
  await refreshSide();go(PAGE);
}
$('#btnAnalyze').onclick=()=>runAnalyze(false);
document.addEventListener('click',e=>{if(e.target.closest('[data-act=analyze]'))runAnalyze(false)});

async function refreshSide(){
  refreshPending();
  const s=await aq('stats');
  $('#sideFoot').innerHTML=`<b>${num(s.entries)}</b> dòng · <b>${s.monthsOn}/${s.months}</b> tháng đang phân tích`;
  const [f,rp]=await Promise.all([aq('errorFacets'),aq('reviewPeriod')]);const n=f.status.open+f.status.doing;
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
  const o=await aq('overview');const empty=!o.rows;
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
  const f=await aq('errorFacets');
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
    const r=await aq('errorGroups',FIL,OFF,LIM);TOTAL=r.total;VIEW=[];
    $('#errCount').innerHTML=`<b>${num(r.total)}</b> chứng từ có cảnh báo`;
    $('#tErr').innerHTML='<thead><tr><th>Chứng từ</th><th>Ngày</th><th class=n>Cảnh báo</th><th class=n>Mức cao</th><th class=n>Chưa xử lý</th><th>Các loại lỗi</th><th>Người nhập</th></tr></thead><tbody>'+
      r.rows.map(g=>`<tr class="click r${g.high?'H':'M'}" data-eid="${g.eid}"><td><b>${esc(g.doc)}</b></td><td class=nw>${vn(g.date)}</td><td class=n>${g.n}</td><td class="n ${g.high?'neg':''}">${g.high||''}</td><td class=n>${g.open||'<span class=pos>✓</span>'}</td><td>${esc(String(g.rules).split(',').map(k=>RULE[k]?.n||k).join(' · '))}</td><td>${esc(short(g.user))}</td></tr>`).join('')+'</tbody>';
  }else{
    const r=await aq('errors',FIL,SORT,OFF,LIM);TOTAL=r.total;VIEW=r.rows;
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
['#fSev','#fRule','#fUser','#fMonth','#fDept','#fGroup'].forEach(s=>$(s).onchange=refilter);['#fAcc','#fMin','#fMax','#fText'].forEach(s=>$(s).oninput=deb(refilter));
$('#fReset').onclick=()=>{FIL={group:FIL.group};OFF=0;vErrors()};
$('#grpTabs').onclick=e=>{const b=e.target.closest('[data-g]');if(!b)return;FIL.group=b.dataset.g;FIL.rule='';OFF=0;vErrors()};
$('#stTabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.gone){$('#goneCard').scrollIntoView({behavior:'smooth'});return}FIL.status=b.dataset.st;OFF=0;vErrors(true)};
$('#pgErr').onclick=e=>{const b=e.target.closest('[data-pg]');if(!b)return;OFF=Math.max(0,OFF+ +b.dataset.pg*LIM);loadErrTable();$('#content').scrollTop=0};
$('#tErr').onclick=e=>{const th=e.target.closest('th[data-s]');if(th){SORT=SORT.k===th.dataset.s?{k:SORT.k,d:-SORT.d}:{k:th.dataset.s,d:1};OFF=0;return loadErrTable()}
  const tr=e.target.closest('tr.click');if(!tr)return;if(tr.dataset.eid)showDetail(null,+tr.dataset.eid);else showDetail(+tr.dataset.i)};
$('#expErr').onclick=()=>api.exportErrors(readFil(),SORT);
$('#bulkSt').onchange=async e=>{const st=e.target.value;e.target.value='';if(!st)return;
  if(!await ask(`Đặt trạng thái "${META.status[st]}" cho ${num(TOTAL)} cảnh báo đang lọc?`))return;
  await aq('setStatusWhere',readFil(),st);vErrors(true);refreshSide()};

const FIELDS=[['doc','Chứng từ'],['line','Line No'],['date','Ngày hạch toán'],['due','Hạn thanh toán'],['drName','TK Nợ'],['crName','TK Có'],['amt','Số tiền'],['qty','Số lượng'],['price','Đơn giá'],
  ['bp','Đối tượng Nợ'],['bpCr','Đối tượng Có'],['desc','Diễn giải'],['descP','Diễn giải chứng từ'],['dept','Bộ phận'],['deptSub','Bộ phận con'],['tcost','Khoản mục chi phí'],['trev','Loại doanh thu'],
  ['inv','Invoice'],['adv','Advance Request'],['contract','Hợp đồng'],['table','Nguồn (Table)'],['cf','Lưu chuyển tiền'],['user','Người tạo'],['updUser','Người sửa'],['file','File nguồn']];
async function showDetail(i,eid){
  if(i!=null){CUR=i;eid=VIEW[i]?.eid}else CUR=-1;if(!eid)return;
  const d=await aq('errorDetail',eid);if(!d)return;const e=d.e,full=d.full;
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
    if($('#dAll').checked)await aq('setStatusDoc',e.doc,status,note);
    else await aq('setReviews',[{key:e.key,rule:e.k,doc:e.doc,status,note,snapshot:JSON.stringify({m:e.ym,amt:e.amt,desc:String(e.desc||'').slice(0,200)})}]);
    refreshSide();if(PAGE==='errors')await loadErrTable()};
  $('#dClose').onclick=closeDetail;
  if(nav){$('#dPrev').onclick=()=>step(-1);$('#dNext').onclick=()=>step(1);$('#dSaveNext').onclick=async()=>{await save();step(1)}}
  $('#dSave').onclick=async()=>{await save();$('#dMsg').textContent='✓ Đã lưu'};
}
async function step(d){let j=CUR+d;
  if(j<0&&OFF>0){OFF-=LIM;await loadErrTable();j=VIEW.length-1}else if(j>=VIEW.length&&OFF+LIM<TOTAL){OFF+=LIM;await loadErrTable();j=0}
  if(j>=0&&j<VIEW.length)showDetail(j)}
function closeDetail(){$('#drawer').classList.add('hide');$('#drawer').classList.remove('full');CUR=-1}
$('#drawer').onclick=e=>{if(e.target.id==='drawer')closeDetail()};
document.addEventListener('keydown',e=>{if($('#drawer').classList.contains('hide')||/TEXTAREA|INPUT|SELECT/.test(e.target.tagName))return;
  if(e.key==='Escape')closeDetail();if(CUR>=0&&(e.key==='ArrowDown'||e.key==='ArrowRight'))step(1);if(CUR>=0&&(e.key==='ArrowUp'||e.key==='ArrowLeft'))step(-1)});

/* ---------- Công nợ ---------- */
const refShort=v=>{const p=String(v??'').split('_'),h=p.length/2;return p.length%2===0&&p.slice(0,h).join('_')===p.slice(h).join('_')?p.slice(0,h).join('_'):String(v??'')}; // 'NO: 05/..._NO: 05/...' → 'NO: 05/...'
const BUCKETS=['Chưa đến hạn','1–30','31–60','61–90','91–180','181–365','> 365'];
const BCOL=[C.ok,'#FFD4BD','#FF9C6B','#FF6929','#FA4700','#D63600','#8A2200'];
const GRPN={thu:'Phải thu',tra:'Phải trả'};
let AGDATA=null,AGBP=null,AGV={det:[],abn:[]};
async function vAging(reload=true){
  if(!$('#asOf').value){const s=await aq('overview');if(s.dmax)$('#asOf').value=s.dmax}if(!$('#asOf').value)return;
  if(reload||!AGDATA){const a=[$('#asOf').value,+$('#term').value||0,$('#agLevel').value];AGDATA=await aq('aging',...a,$('#agDim').value);
    // Tổng hợp (KPI, theo TK, theo đối tượng) luôn tính FIFO ở cấp đối tượng – bù trừ giữa các hợp đồng / đề nghị TU / khoản mục để bằng đúng số dư
    AGBP=$('#agDim').value==='bp'?AGDATA:await aq('aging',...a,'bp')}
  const grp=$('#agGrp').value,cur=$('#agAcc').value,find=$('#agFind').value.trim().toLowerCase();
  const inGrp=AGDATA.items.filter(o=>!grp||o.grp===grp);
  const accs=[...new Map(inGrp.map(o=>[o.acc,o])).values()].sort((a,b)=>a.acc.localeCompare(b.acc));
  fillSel('#agAcc',accs.map(o=>[o.acc,`${o.acc} – ${o.accName}`]),'Tất cả tài khoản',accs.some(o=>o.acc===cur)?cur:'');
  const selD=inGrp.filter(o=>!$('#agAcc').value||o.acc===$('#agAcc').value),posD=selD.filter(o=>o.bal>0),abnD=selD.filter(o=>o.bal<0);
  const sel=AGBP.items.filter(o=>(!grp||o.grp===grp)&&(!$('#agAcc').value||o.acc===$('#agAcc').value)),pos=sel.filter(o=>o.bal>0),abn=sel.filter(o=>o.bal<0);
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
    return `<tr style="background:var(--brand-25)"><td colspan=2><b>Cộng ${GRPN[g].toLowerCase()}</b></td><td class=n><b>${num(L.reduce((p,x)=>p+x.n,0))}</b></td><td class=n><b>${fmt2(t)}</b></td>${b.map(v=>`<td class=n><b>${Math.abs(v)>=0.005?fmt2(v):''}</b></td>`).join('')}<td class=n><b>${pct((t-b[0])/t)}</b></td><td class="n neg">${ab?fmt2(ab):''}</td>${AGLG(L.map(x=>x.acc),t+ab,1)}</tr>`};
  const row=x=>{const t=x.bal;return `<tr class="click dbl" title="Bấm: lọc chi tiết · Nhấn đúp: xem bút toán" data-acc="${esc(x.acc)}"><td class=nw><b>${esc(x.acc)}</b></td><td style="min-width:240px">${esc(x.name)}</td><td class=n>${num(x.n)}</td><td class=n><b>${fmt2(t)}</b></td>${x.b.map(v=>`<td class=n>${Math.abs(v)>=0.005?fmt2(v):''}</td>`).join('')}<td class=n>${pct((t-x.b[0])/t)}</td><td class="n neg">${Math.abs(x.abn)>=0.005?fmt2(x.abn):''}</td>${AGLG(x.acc,t+x.abn)}</tr>`};
  function AGLG(acc,net,b){const L=[].concat(acc).reduce((s,a)=>s+(AGDATA.ledger?.[a]||0),0),df=net-L,w=v=>b?`<b>${v}</b>`:v;return `<td class=n>${w(fmt2(net))}</td><td class=n>${w(fmt2(L))}</td><td class="n ${Math.abs(df)>=0.01?'neg':''}">${Math.abs(df)>=0.01?fmt2(df):'✓'}</td>`}
  $('#tAgSum').innerHTML='<thead><tr><th>TK</th><th>Tên tài khoản</th><th class=n>Đối tượng</th><th class=n>Số dư</th>'+BUCKETS.map(b=>`<th class=n>${b}</th>`).join('')+'<th class=n>% quá hạn</th><th class=n>Dư ngược chiều</th><th class=n title="Số dư + dư ngược chiều">Số dư thuần</th><th class=n title="Toàn bộ bút toán đến ngày, theo bản chất TK">Số dư sổ cái</th><th class=n>Chênh lệch</th></tr></thead><tbody>'+
    ['thu','tra'].map(g=>SL.filter(x=>x.grp===g).map(row).join('')+sub(g)).join('')+'</tbody>';
  chart('chAging',{type:'bar',data:{labels:SL.map(x=>x.acc),datasets:BUCKETS.map((b,i)=>({label:b,data:SL.map(x=>x.b[i]),backgroundColor:BCOL[i],borderRadius:0,maxBarThickness:48}))},
    options:{scales:{x:{stacked:true},y:{stacked:true}},plugins:{tooltip:{callbacks:{title:i=>{const x=SL[i[0].dataIndex];return x.acc+' – '+x.name}}}}}});
  const REFH0={contract:'Hợp đồng',adv:'Đề nghị TU',tcost:'Khoản mục'}[$('#agDim').value];AGV.abn=abnD;
  $('#tAbn').innerHTML='<thead><tr><th>TK</th><th>Đối tượng</th>'+(REFH0?`<th>${REFH0}</th>`:'')+'<th class=n>PS Nợ</th><th class=n>PS Có</th><th class=n>Dư ngược</th></tr></thead><tbody>'+
    abnD.sort((a,b)=>a.bal-b.bal).map((o,i)=>`<tr class=dbl data-agn="${i}"><td title="${esc(o.accName)}">${esc(o.acc)}</td><td>${esc(o.bp)}</td>${REFH0?`<td class=nw title="${esc(o.ref)}">${esc(refShort(o.ref))}</td>`:''}<td class=n>${fmt2(o.dr)}</td><td class=n>${fmt2(o.cr)}</td><td class="n neg">${fmt2(o.bal)}</td></tr>`).join('')+'</tbody>';
  const dim=$('#agDim').value,REFH={contract:'Hợp đồng',adv:'Đề nghị tạm ứng',tcost:'Khoản mục chi phí'}[dim],refCell=o=>REFH?`<td class=nw title="${esc(o.ref)}">${esc(refShort(o.ref))}</td>`:'';
  // Tuổi nợ theo từng đối tượng (gộp mọi TK)
  const BPM=new Map();for(const o of sel){const x=BPM.get(o.bp)||BPM.set(o.bp,{bp:o.bp,accs:new Set(),thu:0,tra:0,abn:0,b:Array(7).fill(0),maxAge:0,items:[]}).get(o.bp);
    x.accs.add(o.acc);x.items.push(o);if(o.bal>0){x[o.grp]+=o.bal;o.b.forEach((v,i)=>x.b[i]+=v);x.maxAge=Math.max(x.maxAge,o.maxAge)}else x.abn+=o.bal}
  const BPL=[...BPM.values()],bpCur=$('#agBpSel').value;
  fillSel('#agBpSel',BPL.slice().sort((a,b)=>a.bp.localeCompare(b.bp)).map(x=>[x.bp,`${x.bp} · ${fmt(x.thu+x.tra)}`]),`Tất cả đối tượng (${num(BPL.length)})`,BPM.has(bpCur)?bpCur:'');
  const bq=$('#agBpQ').value.trim().toLowerCase(),bsel=$('#agBpSel').value,bs=$('#agBpSort').value;
  const BPV=BPL.filter(x=>(!bsel||x.bp===bsel)&&(!bq||x.bp.toLowerCase().includes(bq))).sort(bs==='over'?(a,b)=>(b.b[4]+b.b[5]+b.b[6])-(a.b[4]+a.b[5]+a.b[6]):bs==='age'?(a,b)=>b.maxAge-a.maxAge:bs==='abn'?(a,b)=>a.abn-b.abn:(a,b)=>(b.thu+b.tra)-(a.thu+a.tra));
  AGV.bp=BPV;
  $('#tAgBp').innerHTML='<thead><tr><th>Đối tượng</th><th>Tài khoản</th><th class=n>Phải thu</th><th class=n>Phải trả</th><th class=n>Ròng (thu − trả)</th>'+BUCKETS.map(b=>`<th class=n>${b}</th>`).join('')+'<th class=n>Tuổi tối đa</th><th class=n>Dư ngược chiều</th></tr></thead><tbody>'+
    (BPV.slice(0,2000).map((x,i)=>`<tr class="click dbl" data-agb="${i}"${bsel===x.bp||AGV.bpPick===x.bp?' style="background:var(--brand-25)"':''}><td><b>${esc(x.bp)}</b></td><td style="font-size:12px">${[...x.accs].sort().map(esc).join(', ')}</td><td class=n>${x.thu?fmt2(x.thu):''}</td><td class=n>${x.tra?fmt2(x.tra):''}</td><td class="n ${x.thu-x.tra<0?'neg':''}"><b>${fmt2(x.thu-x.tra)}</b></td>${x.b.map(v=>`<td class=n>${Math.abs(v)>=0.005?fmt2(v):''}</td>`).join('')}<td class=n>${x.maxAge||''}</td><td class="n neg">${Math.abs(x.abn)>=0.005?fmt2(x.abn):''}</td></tr>`).join('')||'<tr><td colspan=14 class=mut style="text-align:center;padding:20px">Không có đối tượng</td></tr>')+(BPV.length>2000?`<tr><td colspan=14 class=mut style="text-align:center">… còn ${num(BPV.length-2000)} đối tượng – dùng ô tìm kiếm</td></tr>`:'')+'</tbody>';
  const pickBp=bsel||AGV.bpPick||'';
  const det=posD.filter(o=>(!pickBp||o.bp===pickBp)&&(!find||(o.bp+' '+(o.ref||'')).toLowerCase().includes(find))).sort((a,b)=>b.bal-a.bal);
  AGV.det=det;
  $('#tAging').innerHTML='<thead><tr><th>Nhóm</th><th>TK</th><th>Đối tượng</th>'+(REFH?`<th>${REFH}</th><th>Phát sinh đầu</th>`:'')+'<th class=n>PS Nợ</th><th class=n>PS Có</th><th class=n>Số dư</th>'+BUCKETS.map(b=>`<th class=n>${b}</th>`).join('')+'<th class=n>Tuổi tối đa</th><th>Đánh giá</th></tr></thead><tbody>'+
   det.slice(0,3000).map((o,i)=>{const o90=o.b[4]+o.b[5]+o.b[6];
    const risk=o.bp.startsWith('(không')?'<span class="badge b-H">Thiếu đối tượng</span>':REFH&&String(o.ref).startsWith('(không')?`<span class="badge b-M">Thiếu ${REFH.toLowerCase()}</span>`:dim==='adv'&&o.maxAge>30?`<span class="badge b-H">Tạm ứng quá ${o.maxAge} ngày chưa quyết toán</span>`:o.acc.startsWith('335')&&o.maxAge>90?`<span class="badge b-H">Trích trước ${o.maxAge} ngày chưa quyết toán/hoàn nhập</span>`:o.b[6]>0?`<span class="badge b-H">${o.grp==='thu'?'Xem xét dự phòng':'Quá hạn > 1 năm'}</span>`:o90>0?`<span class="badge b-M">${o.grp==='thu'?'Đôn đốc thu':'Ưu tiên thanh toán'}</span>`:'';
    return `<tr class=dbl data-ag="${i}"><td><span class="badge ${o.grp==='thu'?'b-L':'s-doing'}">${GRPN[o.grp]}</span></td><td class=nw title="${esc(o.accName)}">${esc(o.acc)}</td><td>${esc(o.bp)}</td>${refCell(o)}${REFH?`<td class=nw>${vn(o.first)}</td>`:''}<td class=n>${fmt2(o.dr)}</td><td class=n>${fmt2(o.cr)}</td><td class=n><b>${fmt2(o.bal)}</b></td>${o.b.map(v=>`<td class=n>${Math.abs(v)>=0.005?fmt2(v):''}</td>`).join('')}<td class=n>${o.maxAge}</td><td>${risk}</td></tr>`}).join('')+'</tbody>';
}
['#asOf','#term','#agLevel','#agDim'].forEach(s=>$(s).onchange=()=>{if(s==='#agLevel')$('#agAcc').value='';vAging(true)});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-preset]');if(!b)return;
  const P={'331c':{grp:'tra',level:'l1',dim:'contract',acc:'331'},'335t':{grp:'tra',level:'l1',dim:'tcost',acc:'335'},'1411a':{grp:'thu',level:'detail',dim:'adv',acc:'1411'},'1412b':{grp:'thu',level:'l1',dim:'bp',acc:'1412'},all:{grp:'',level:'l1',dim:'bp',acc:''}}[b.dataset.preset];
  $('#agGrp').value=P.grp;$('#agLevel').value=P.level;$('#agDim').value=P.dim;$('#agAcc').value='';await vAging(true);
  if(P.acc){const opt=[...$('#agAcc').options].find(o=>o.value===P.acc||o.value.startsWith(P.acc));if(opt){$('#agAcc').value=opt.value;vAging(false)}}});
['#agGrp','#agAcc'].forEach(s=>$(s).onchange=()=>vAging(false));
$('#agFind').oninput=deb(()=>vAging(false));
['#agBpSel','#agBpSort'].forEach(s=>$(s).onchange=()=>{AGV.bpPick='';vAging(false)});$('#agBpQ').oninput=deb(()=>vAging(false));
let AGBT=0;$('#tAgBp').onclick=e=>{const tr=e.target.closest('[data-agb]');if(!tr)return;const x=AGV.bp[+tr.dataset.agb];clearTimeout(AGBT);if(e.detail>1)return;AGBT=setTimeout(()=>{AGV.bpPick=AGV.bpPick===x.bp?'':x.bp;vAging(false)},280)};
$('#tAgBp').ondblclick=e=>{clearTimeout(AGBT);const tr=e.target.closest('[data-agb]');if(!tr)return;agBpDetail(AGV.bp[+tr.dataset.agb])};
async function agBpDetail(x,tab='acc'){CUR=-1;const asOf=$('#asOf').value,term=+$('#term').value||0,level=$('#agLevel').value,dim0=$('#agDim').value;
  const head=`<div class="ph"><div><div class="mut" style="font-size:12px">Tuổi nợ theo đối tượng · đến ${vn(asOf)}</div><h2 style="font-size:20px">${esc(x.bp)}</h2></div><div style="flex:1"></div><div class="subtabs" id="abTab"><button data-abt="acc" class="${tab==='acc'?'on':''}">Theo tài khoản</button><button data-abt="ct" class="${tab==='ct'?'on':''}">Theo hợp đồng</button></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>`;
  $('#dPane').innerHTML=head+`<div class="pb"><div class="card"><span class="spin"></span> Đang tính…</div></div>`;$('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
  const bind=()=>{$('#dClose').onclick=closeDetail;$('#abTab').onclick=e=>{const b=e.target.closest('[data-abt]');if(b)agBpDetail(x,b.dataset.abt)}};bind();
  // Dữ liệu tuổi nợ của đối tượng (theo TK hoặc theo hợp đồng)
  const data=tab==='ct'?(dim0==='contract'&&AGDATA?AGDATA:await aq('aging',asOf,term,level,'contract')):(AGBP||await aq('aging',asOf,term,level,'bp'));
  const L=data.items.filter(o=>o.bp===x.bp).sort((a,b)=>a.grp.localeCompare(b.grp)*-1||a.acc.localeCompare(b.acc)||String(a.ref).localeCompare(String(b.ref)));AGV.bpItems=L;
  const PB=tab==='ct'?(AGBP||await aq('aging',asOf,term,level,'bp')).items.filter(o=>o.bp===x.bp):L;
  const S=g=>PB.filter(o=>o.grp===g).reduce((s,o)=>s+o.bal,0),thu=S('thu'),tra=S('tra'),b=Array(7).fill(0);PB.forEach(o=>o.bal>0&&o.b.forEach((v,i)=>b[i]+=v));const maxAge=Math.max(0,...PB.map(o=>o.maxAge||0));
  const ctPos=L.filter(o=>o.bal>0).reduce((s,o)=>s+o.bal,0),ctNeg=L.filter(o=>o.bal<0).reduce((s,o)=>s+o.bal,0);
  // Đối chiếu với CĐPS theo đối tượng (dữ liệu gốc, đến cuối tháng của ngày báo cáo)
  const accs=uniq(L.map(o=>o.acc)),ptb=accs.length?await aq('finPartnerTB','',asOf.slice(0,7),accs,[],'',x.bp):{rows:[]};
  const pr=ptb.rows.filter(o=>o.p===x.bp),ptNet=g=>pr.filter(o=>accs.some(a=>o.acc.startsWith(a))&&(AG_GRP(o.acc)===g)).reduce((s,o)=>s+(g==='thu'?o.cb:-o.cb),0);
  const pThu=ptNet('thu'),pTra=ptNet('tra'),eom=asOf===new Date(Date.UTC(+asOf.slice(0,4),+asOf.slice(5,7),0)).toISOString().slice(0,10),ok=Math.abs(pThu-thu)<0.01&&Math.abs(pTra-tra)<0.01;
  const REF=tab==='ct'?'Hợp đồng':null;
  $('#dPane').innerHTML=head+`<div class="pb"><div class="kpis">${kpi('blue','wallet','Phải thu (ròng)',fmt2(thu))}${kpi('','coins','Phải trả (ròng)',fmt2(tra))}${kpi(thu-tra<0?'red':'green','wallet','Bù trừ thu − trả',fmt2(thu-tra))}${kpi('red','alert','Quá hạn > 90 ngày',fmt2(b[4]+b[5]+b[6]),'tuổi tối đa '+maxAge+' ngày')}</div>
    <div class="card" style="background:${ok?'#ECFDF3':'#FFFAEB'}"><b>${ok?'✓ Khớp':'⚠ Chênh lệch'} với Bảng cân đối phát sinh theo đối tượng</b> (dữ liệu gốc, TK ${esc(accs.join(', '))}, đến ${eom?vn(asOf):'cuối tháng '+ymLbl(asOf.slice(0,7))}): phải thu ${fmt2(pThu)} · phải trả ${fmt2(pTra)}${ok?'':` · lệch thu ${fmt2(thu-pThu)}, trả ${fmt2(tra-pTra)}${eom?'':' – ngày báo cáo không phải cuối tháng nên CĐPS (theo tháng) gồm cả phát sinh sau ngày này'}`}</div>
    ${tab==='ct'&&ctNeg<-0.005?`<div class="card" style="background:#FFF6F2"><b>Lưu ý:</b> tuổi nợ và số dư của đối tượng (các ô phía trên) tính FIFO ở cấp đối tượng – bù trừ giữa các hợp đồng. Theo từng hợp đồng: dư theo chiều ${fmt2(ctPos)} · dư ngược chiều ${fmt2(ctNeg)} (thường do thanh toán / hoá đơn ghi khác hợp đồng). Nhấn đúp hợp đồng dư ngược để xem bút toán và <b>đổi hợp đồng</b> cho đúng.</div>`:''}
    <div class="card"><div class="card-h"><h3>${tab==='ct'?'Theo hợp đồng':'Theo tài khoản'}</h3><span class="dblhint">🖱 nhấn đúp để xem bút toán${tab==='ct'?' & đổi hợp đồng':''}</span><div class="sp"></div><input id="abQ" placeholder="Tìm ${tab==='ct'?'hợp đồng':'tài khoản'}…" style="width:220px"></div><div id="abT"></div></div></div>`;
  bind();
  const draw=()=>{const q=$('#abQ').value.trim().toLowerCase(),V=L.map((o,i)=>({...o,i})).filter(o=>!q||[o.acc,o.accName,o.ref].some(v=>String(v||'').toLowerCase().includes(q)));
    const tot=Array(7).fill(0);V.forEach(o=>o.b.forEach((v,i)=>tot[i]+=v));
    $('#abT').innerHTML=tbl0(['Nhóm','TK','Tên tài khoản',...(REF?[REF]:[]),'#PS Nợ','#PS Có','#Số dư',...BUCKETS.map(b=>'#'+b),'#Tuổi tối đa','PS đầu','PS cuối'],V.map(o=>`<tr class=dbl data-agi="${o.i}"><td><span class="badge ${o.grp==='thu'?'b-L':'s-doing'}">${GRPN[o.grp]}</span></td><td class=nw><b>${esc(o.acc)}</b></td><td>${esc(o.accName)}</td>${REF?`<td class=nw title="${esc(o.ref)}">${esc(refShort(o.ref))}</td>`:''}<td class=n>${fmt2(o.dr)}</td><td class=n>${fmt2(o.cr)}</td><td class="n ${o.bal<0?'neg':''}"><b>${fmt2(o.bal)}</b></td>${o.b.map(v=>`<td class=n>${Math.abs(v)>=0.005?fmt2(v):''}</td>`).join('')}<td class=n>${o.maxAge||''}</td><td class=nw>${vn(o.first)}</td><td class=nw>${vn(o.last)}</td></tr>`)
      .concat([`<tr style="font-weight:700;background:#FFF6F2"><td colspan=${REF?4:3}>Cộng (${num(V.length)} dòng)</td><td class=n>${fmt2(V.reduce((s,o)=>s+o.dr,0))}</td><td class=n>${fmt2(V.reduce((s,o)=>s+o.cr,0))}</td><td class=n>${fmt2(V.reduce((s,o)=>s+o.bal,0))}</td>${tot.map(v=>`<td class=n>${Math.abs(v)>=0.005?fmt2(v):''}</td>`).join('')}<td></td><td></td><td></td></tr>`]),'Không có số dư')};
  $('#abQ').oninput=deb(draw);draw();
  $('#abT').ondblclick=e=>{const tr=e.target.closest('[data-agi]');if(!tr)return;const o=AGV.bpItems[+tr.dataset.agi],dim=tab==='ct'?'contract':'bp';
    openLedger(o.bp+(o.ref?' · '+refShort(o.ref):''),`TK ${o.acc} – ${o.accName} · đến ${vn(asOf)}`,{kind:'ag',acc:o.acc,bp:o.bp,dim,ref:o.ref,asOf},AGNAT(o.acc),()=>{})};
}
const AG_GRP=a=>/^(331|335|336|334|3388)/.test(a)?'tra':'thu';
$('#tAgSum').onclick=e=>{const tr=e.target.closest('[data-acc]');if(tr){$('#agAcc').value=tr.dataset.acc;vAging(false);$('#tAging').scrollIntoView({behavior:'smooth'})}};
$('#expAg').onclick=()=>api.exportAging($('#asOf').value,+$('#term').value||0,$('#agLevel').value,$('#agGrp').value,$('#agAcc').value,$('#agDim').value);

/* ---------- Tuổi hàng tồn kho ---------- */
const IBUCKETS=['0–30 ngày','31–90','91–180','181–365','1–2 năm','> 2 năm'];
const IBCOL=[C.ok,'#FFD4BD','#FF9C6B','#FA4700','#D63600','#8A2200'];
let IV={data:null,flag:''},IVV={det:[],neg:[]};
async function vInv(reload=true){
  if(!$('#ivAsOf').value){const s=await aq('overview');if(s.dmax)$('#ivAsOf').value=s.dmax}if(!$('#ivAsOf').value)return;
  if(reload||!IV.data)IV.data=await aq('inventory',$('#ivAsOf').value,$('#ivBy').value,$('#ivLevel').value);
  const d=IV.data,cur=$('#ivAcc').value,find=$('#ivFind').value.trim().toLowerCase();
  $('#ivOld').classList.toggle('hide',!d.oldImportRows);
  $('#ivOld').innerHTML=`⚠ ${num(d.oldImportRows)} dòng hàng tồn kho được nạp bằng phiên bản cũ nên chưa có mã hàng/kho. Hãy <b>nạp lại các file đó</b> (chọn "Thay thế") để tính tuổi theo mặt hàng chính xác.`;
  const accs=[...new Map(d.items.map(o=>[o.acc,o])).values()].sort((a,b)=>a.acc.localeCompare(b.acc));
  fillSel('#ivAcc',accs.map(o=>[o.acc,`${o.acc} – ${o.accName}`]),'Tất cả tài khoản',accs.some(o=>o.acc===cur)?cur:'');
  const bpCur=$('#ivBp').value,bpS=new Map();d.items.forEach(o=>{if(o.bal>0.005)bpS.set(o.bp,(bpS.get(o.bp)||0)+o.bal);else if(!bpS.has(o.bp))bpS.set(o.bp,0)});
  fillSel('#ivBp',[...bpS].sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,`${k} · ${fmt(v)}`]),`Tất cả đối tượng (${num(bpS.size)})`,bpS.has(bpCur)?bpCur:'');
  const sel=d.items.filter(o=>(!$('#ivAcc').value||o.acc===$('#ivAcc').value)&&(!$('#ivBp').value||o.bp===$('#ivBp').value)),pos=sel.filter(o=>o.bal>0.005),neg=sel.filter(o=>o.bal<-0.005);
  const slow=o=>o.bal>0.005&&(o.sinceOut==null?o.sinceIn>180:o.sinceOut>180),old=o=>o.b[4]+o.b[5]>0.005,noprod=o=>/^\(không có/.test(o.obj);
  const b=Array(6).fill(0);pos.forEach(o=>o.b.forEach((v,i)=>b[i]+=v));const tot=b.reduce((x,y)=>x+y,0),o180=b[3]+b[4]+b[5],o365=b[4]+b[5];
  $('#ivKpi').innerHTML=kpi('','box','Giá trị hàng tồn',fmt(tot),`${num(pos.length)} dòng còn tồn · số dư thuần (gồm tồn âm) ${fmt(tot+neg.reduce((s,o)=>s+o.bal,0))}`)+kpi('','alert','Tồn trên 180 ngày',fmt(o180),pct(o180/tot)+' giá trị tồn')
    +kpi('red','alert','Tồn trên 1 năm',fmt(o365),'xem xét dự phòng giảm giá')+kpi('','refresh','Chậm luân chuyển',num(pos.filter(slow).length),'> 180 ngày không xuất')
    +kpi(neg.length?'red':'green','alert','Tồn âm',num(neg.length),'mặt hàng xuất vượt nhập');
  const S=new Map();
  for(const o of sel){const x=S.get(o.acc)||S.set(o.acc,{acc:o.acc,name:o.accName,n:0,bal:0,b:Array(6).fill(0),neg:0}).get(o.acc);if(o.bal>0.005){x.n++;x.bal+=o.bal;o.b.forEach((v,i)=>x.b[i]+=v)}else if(o.bal<-0.005)x.neg+=o.bal}
  const SL=[...S.values()].sort((a,b)=>a.acc.localeCompare(b.acc)),c=v=>Math.abs(v)>=0.005?fmt2(v):'';
  const LG=(acc,net,b)=>{if($('#ivBp').value)return `<td class=n>${fmt2(net)}</td><td class=mut colspan=2 title="Sổ cái tính cho toàn bộ đối tượng – bỏ lọc đối tượng để đối chiếu">bỏ lọc đối tượng để đối chiếu</td>`;const L=[].concat(acc).reduce((s,a)=>s+(d.ledger?.[a]||0),0),df=net-L;return `<td class=n>${b?'<b>':''}${fmt2(net)}${b?'</b>':''}</td><td class=n>${b?'<b>':''}${fmt2(L)}${b?'</b>':''}</td><td class="n ${Math.abs(df)>=0.01?'neg':''}">${Math.abs(df)>=0.01?fmt2(df):'✓'}</td>`};
  $('#tIvSum').innerHTML='<thead><tr><th>TK</th><th>Tên tài khoản</th><th class=n>Mặt hàng</th><th class=n>Giá trị tồn</th>'+IBUCKETS.map(x=>`<th class=n>${x}</th>`).join('')+'<th class=n>% > 180 ngày</th><th class=n>Tồn âm</th><th class=n title="Giá trị tồn + tồn âm">Số dư thuần</th><th class=n title="Nợ − Có toàn bộ bút toán đến ngày">Số dư sổ cái</th><th class=n>Chênh lệch</th></tr></thead><tbody>'+
    SL.map(x=>`<tr class="click dbl" data-acc="${esc(x.acc)}"><td class=nw><b>${esc(x.acc)}</b></td><td style="min-width:220px">${esc(x.name)}</td><td class=n>${num(x.n)}</td><td class=n><b>${fmt2(x.bal)}</b></td>${x.b.map(v=>`<td class=n>${c(v)}</td>`).join('')}<td class=n>${pct((x.b[3]+x.b[4]+x.b[5])/x.bal)}</td><td class="n neg">${c(x.neg)}</td>${LG(x.acc,x.bal+x.neg)}</tr>`).join('')+
    `<tr style="background:var(--brand-25)"><td colspan=2><b>Tổng cộng</b></td><td class=n><b>${num(pos.length)}</b></td><td class=n><b>${fmt2(tot)}</b></td>${b.map(v=>`<td class=n><b>${c(v)}</b></td>`).join('')}<td class=n><b>${pct(o180/tot)}</b></td><td class="n neg">${c(neg.reduce((s,o)=>s+o.bal,0))}</td>${LG(SL.map(x=>x.acc),tot+neg.reduce((s,o)=>s+o.bal,0),1)}</tr></tbody>`;
  setTimeout(()=>chart('chIv',{type:'bar',data:{labels:IBUCKETS,datasets:[{data:b,backgroundColor:IBCOL,barThickness:40}]},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:x=>`${fmt(x.raw)} (${pct(x.raw/tot)})`}}},maintainAspectRatio:false}}),0);
  const BYV=$('#ivBy').value,objH={product:'Mặt hàng',product_loc:'Mặt hàng @ Kho',loc:'Kho',bp:'Đối tượng',bp_product:'Đối tượng · Mặt hàng'}[BYV];
  $('#tIvNeg').innerHTML=`<thead><tr><th>TK</th><th>${objH}</th><th class=n>SL tồn</th><th class=n>Giá trị tồn</th><th>Xuất gần nhất</th></tr></thead><tbody>`+
    neg.sort((a,b)=>a.bal-b.bal).map((o,i)=>`<tr class=dbl data-ivn="${i}"><td>${esc(o.acc)}</td><td><div class=clamp title="${esc(o.obj)}">${esc(o.obj)}</div></td><td class="n neg">${fmt2(o.qtyBal)} ${esc(o.uom)}</td><td class="n neg">${fmt2(o.bal)}</td><td class=nw>${vn(o.lastOut)}</td></tr>`).join('')+'</tbody>';
  const f={slow,old,noprod}[IV.flag]||(()=>true);
  IVV.neg=neg;
  const det=pos.filter(f).filter(o=>!find||o.obj.toLowerCase().includes(find)).sort((a,b)=>b.bal-a.bal);
  IVV.det=det;
  $('#tIv').innerHTML=`<thead><tr><th>TK</th>${BYV==='bp_product'?'<th>Đối tượng</th><th>Mặt hàng</th>':`<th>${objH}</th>`}<th>ĐVT</th><th class=n>SL nhập</th><th class=n>SL xuất</th><th class=n>SL tồn</th><th class=n>Giá trị tồn</th>`+IBUCKETS.map(x=>`<th class=n>${x}</th>`).join('')+'<th>Nhập gần nhất</th><th>Xuất gần nhất</th><th>Đánh giá</th></tr></thead><tbody>'+
    det.slice(0,3000).map((o,i)=>{const tags=[];if(noprod(o))tags.push('<span class="badge b-H">Thiếu mã hàng</span>');if(o.b[5]>0.005)tags.push('<span class="badge b-H">Tồn > 2 năm</span>');else if(old(o))tags.push('<span class="badge b-M">Tồn > 1 năm</span>');if(slow(o))tags.push(`<span class="badge b-M">${o.sinceOut==null?'Chưa xuất':o.sinceOut+' ngày không xuất'}</span>`);
      return `<tr class=dbl data-iv="${i}"><td class=nw title="${esc(o.accName)}">${esc(o.acc)}</td>${BYV==='bp_product'?`<td><div class="clamp s" title="${esc(o.bp)}">${esc(o.bp)}</div></td><td><div class=clamp title="${esc(o.prod)}">${esc(o.prod)}</div></td>`:`<td><div class=clamp title="${esc(o.obj)}">${esc(o.obj)}</div></td>`}<td>${esc(o.uom)}</td><td class=n>${o.qtyIn?fmt2(o.qtyIn):''}</td><td class=n>${o.qtyOut?fmt2(o.qtyOut):''}</td><td class=n>${o.qtyIn||o.qtyOut?fmt2(o.qtyBal):''}</td>
      <td class=n><b>${fmt2(o.bal)}</b></td>${o.b.map(v=>`<td class=n>${c(v)}</td>`).join('')}<td class=nw>${vn(o.lastIn)}</td><td class=nw>${vn(o.lastOut)}</td><td>${tags.join(' ')}</td></tr>`}).join('')+'</tbody>';
}
['#ivAsOf','#ivBy','#ivLevel'].forEach(s=>$(s).onchange=()=>{if(s!=='#ivAsOf')$('#ivAcc').value='';vInv(true)});
$('#ivAcc').onchange=()=>vInv(false);
$('#ivBp').onchange=()=>{if($('#ivBp').value&&!['bp','bp_product'].includes($('#ivBy').value)||$('#ivBp').value&&$('#ivBy').value==='bp'){$('#ivBy').value='bp_product';vInv(true)}else vInv(false)};$('#ivFind').oninput=deb(()=>vInv(false));
$('#ivFlag').onclick=e=>{const b=e.target.closest('[data-f]');if(!b)return;IV.flag=b.dataset.f;$$('#ivFlag button').forEach(x=>x.classList.toggle('on',x===b));vInv(false)};
$('#tIvSum').onclick=e=>{const tr=e.target.closest('[data-acc]');if(tr){$('#ivAcc').value=tr.dataset.acc;vInv(false);$('#tIv').scrollIntoView({behavior:'smooth'})}};
$('#ivXls').onclick=()=>api.exportInventory($('#ivAsOf').value,$('#ivBy').value,$('#ivLevel').value,$('#ivAcc').value,$('#ivBp').value);

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
  const yms=(await aq('months')).filter(m=>m.included).map(m=>m.ym).sort();
  if(!yms.length){$('#plPick').innerHTML='<span class=mut>Chưa có dữ liệu.</span>';return}
  renderPick($('#plPick'),PLST,yms,()=>{ls.set('plPick',PLST);vPL()});
  const R=perRange(PLST,yms.at(-1));
  const [cur,...cmps]=await Promise.all([aq('plRange',R.cur.from,R.cur.to),...R.cmp.map(c=>aq('plRange',c.from,c.to))]);
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
  const tr=await aq('plTrend',R.trend.from,R.trend.to,R.trend.gran);
  $('#plTrendT').textContent=`Xu hướng theo ${{m:'tháng',q:'quý',y:'năm'}[R.trend.gran]} – ${SPANS[PLST.span].toLowerCase()} đến ${ymLbl(R.trend.to)}`;
  const inCur=k=>{const s=R.cur.from,e=R.cur.to;if(R.trend.gran==='m')return k>=s&&k<=e;if(R.trend.gran==='y')return k>=s.slice(0,4)&&k<=e.slice(0,4);const qs=`${s.slice(0,4)}-Q${QN(s)}`,qe=`${e.slice(0,4)}-Q${QN(e)}`;return k>=qs&&k<=qe};
  chart('chMonth',{data:{labels:tr.map(m=>m.k),datasets:[{type:'bar',label:'Doanh thu thuần',data:tr.map(m=>m.net),backgroundColor:tr.map(m=>inCur(m.k)?C.brand:C.brand1),maxBarThickness:36},
    {type:'bar',label:'Tổng chi phí',data:tr.map(m=>m.net-m.pbt),backgroundColor:tr.map(m=>inCur(m.k)?'#A4A7AE':C.gray),maxBarThickness:36},{type:'line',label:'LN trước thuế',data:tr.map(m=>m.pbt),borderColor:C.navy,backgroundColor:C.navy,tension:.3}]}});
  // So sánh nhiều năm: cùng khoảng tháng trong từng năm có dữ liệu
  const years=[...new Set(yms.map(m=>m.slice(0,4)))],off=+R.cur.to.slice(0,4)-+R.cur.from.slice(0,4)===0;
  const ranges=off?years.map(y=>({y,from:y+R.cur.from.slice(4),to:y+R.cur.to.slice(4)})):years.map(y=>({y,from:y+'-01',to:y+'-12'}));
  PLV.R=R;PLV.ranges=ranges;const multi=(await Promise.all(ranges.map(r=>aq('plRange',r.from,r.to)))).map((v,i)=>({...v,y:ranges[i].y})).filter(v=>v.net||v.cogs||v.pbt);PLV.multi=multi;
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
  const yms=(await aq('months')).filter(m=>m.included).map(m=>m.ym).sort();
  if(!yms.length){$('#anPick').innerHTML='<span class=mut>Chưa có dữ liệu.</span>';return}
  renderPick($('#anPick'),ANST,yms,()=>{ls.set('anPick',ANST);vCost()});
  const R=perRange(ANST,yms.at(-1));AN.R=R;const by=$('#anBy').value,find=$('#anFind').value.trim().toLowerCase();
  const [cur,...cmps]=await Promise.all([aq('analysisRange',AN.kind,by,R.cur.from,R.cur.to),...R.cmp.map(c=>aq('analysisRange',AN.kind,by,c.from,c.to))]);
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
  const tr=await aq('analysis',AN.kind,by,R.trend.gran,R.trend.from,R.trend.to),periods=[...new Set(tr.rows.map(r=>r.p))].sort();
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
  const R=AN.R,d=await aq('analysisDrill',AN.kind,$('#anBy').value,x.g,R.cur.from,R.cur.to);CUR=-1;
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
async function openLedger(title,sub,spec,nat=1,after){
  CUR=-1;$('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">${esc(sub)}</div><h2 style="font-size:20px">${esc(title)}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div><div class="pb"><div class="row"><span class="spin"></span> Đang tải bút toán…</div></div>`;
  $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
  const d=await aq('ledger',spec);let run=d.before*nat;
  const bal=(d.debit-d.credit)*nat,rows=d.rows.map((r,i)=>{run+=(r.debit-r.credit)*nat;return {...r,run,i}});
  const REF=spec.dim==='contract'||spec.kind==='ag'?['contract','Hợp đồng']:spec.dim==='adv'?['adv','Đề nghị TU']:spec.dim==='tcost'||spec.kind==='pl'?['tcost','Khoản mục']:spec.kind==='inv'?['product','Mặt hàng']:null;
  const canC=spec.kind==='ag',F={q:'',ctr:'',ym:'',ref:'',side:'',min:'',max:'',err:''},sel=new Set();
  const ctrOf=r=>String(r.side==='dr'?r.cr:r.dr).slice(0,3);
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">${esc(sub)}</div><h2 style="font-size:20px">${esc(title)}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
   <div class="pb"><div class="kpis">${kpi('','file','Số bút toán',num(d.total),d.truncated?`hiển thị ${num(d.rows.length)} dòng gần nhất`:'')}${kpi('blue','coins','Phát sinh Nợ',fmt2(d.debit))}${kpi('','coins','Phát sinh Có',fmt2(d.credit))}${kpi(bal<0?'red':'green','wallet','Số dư / Lũy kế',fmt2(bal),nat>0?'dư Nợ (+)':'dư Có (+)')}</div>
   <div class="card"><div class="card-h"><h3>Bút toán chi tiết</h3><span class="hint">nhấn tiêu đề cột để sắp xếp · nhấn đúp dòng có nhãn lỗi để mở phần xử lý lỗi · chuột phải để sao chép</span></div>
   ${fltBar('lF',F,[{t:'q',k:'q',p:'Tìm chứng từ, diễn giải, đối tượng, người nhập…'},{k:'side',p:'Nợ & Có',o:[['dr','Phát sinh Nợ'],['cr','Phát sinh Có']]},{k:'ctr',p:'Mọi TK đối ứng',o:uniq(rows.map(ctrOf))},{k:'ym',p:'Mọi tháng',o:uniq(rows.map(r=>String(r.date).slice(0,7))).map(m=>[m,ymLbl(m)])},
     ...(REF?[{k:'ref',p:'Mọi '+REF[1].toLowerCase(),o:uniq(rows.map(r=>r[REF[0]]||'(trống)')).slice(0,2000).map(v=>[v,refShort(v)])}]:[]),{k:'err',p:'Tất cả dòng',o:[['1','Chỉ dòng có lỗi']]},{t:'n',k:'min',p:'Số tiền từ'},{t:'n',k:'max',p:'đến'}])}
   ${canC?`<div class="row" style="flex-wrap:wrap;gap:8px;align-items:center;background:#FFF6F2;padding:8px 10px;border-radius:8px;margin-top:8px"><b id="lSum"></b><div style="flex:1"></div><span id="lSel" class="mut">Chưa chọn dòng</span>
     <select id="lHdS" class="srch" style="max-width:420px"><option value="">Đang tải hợp đồng của đối tượng…</option></select><input id="lHd" class="hide" placeholder="Nhập hợp đồng mới" style="width:240px">
     <label style="display:flex;gap:4px;align-items:center;font-size:13px"><input type="checkbox" id="lHdM">Nhập thủ công</label><input id="lNote" placeholder="Ghi chú" style="width:150px">
     <button class="btn sm primary" id="lHdGo" disabled>Đổi hợp đồng</button></div>`:'<div id="lSum" style="margin:8px 0;font-weight:600"></div>'}
   <div id="lT" style="margin-top:8px"></div></div></div>`;
  $('#dClose').onclick=closeDetail;
  let cur=[];
  const draw=()=>{const q=F.q.trim().toLowerCase();cur=rows.filter(r=>(!F.side||r.side===F.side)&&(!F.ctr||ctrOf(r)===F.ctr)&&(!F.ym||String(r.date).startsWith(F.ym))&&(!F.ref||(r[REF[0]]||'(trống)')===F.ref)&&(!F.err||r.eid)&&inRange(r.debit||r.credit,F.min,F.max)
      &&(!q||[r.doc,r.desc,r.bp,r.bpCr,r.user,r.drName,r.crName,REF?r[REF[0]]:''].some(v=>String(v||'').toLowerCase().includes(q))));
    const dr=cur.reduce((s,r)=>s+r.debit,0),cr=cur.reduce((s,r)=>s+r.credit,0);
    $('#lSum').textContent=`${num(cur.length)} / ${num(rows.length)} dòng · PS Nợ ${fmt2(dr)} · PS Có ${fmt2(cr)} · chênh lệch ${fmt2((dr-cr)*nat)}`;
    const show=cur.slice(0,3000);
    $('#lT').innerHTML=`<div class="tbl" style="max-height:calc(100vh - 400px)"><table><thead><tr>${canC?'<th><input type="checkbox" id="lAll"></th>':''}<th></th><th>Ngày</th><th>Chứng từ</th><th>TK Nợ</th><th>TK Có</th><th>Đối tượng</th>${REF?`<th>${REF[1]}</th>`:''}<th class=n>PS Nợ</th><th class=n>PS Có</th><th class=n>Lũy kế</th><th>Diễn giải</th><th>Người nhập</th></tr></thead><tbody>
     ${show.map(r=>`<tr class="${r.eid?'dbl':''}" data-eid="${r.eid||''}">${canC?`<td><input type="checkbox" data-li="${r.i}" ${sel.has(r.i)?'checked':''}></td>`:''}<td>${r.eid?'<span class="badge b-M">Có lỗi</span>':''}</td><td class=nw>${vn(r.date)}</td><td class=nw>${esc(r.doc)}</td><td>${esc(r.drName)}</td><td>${esc(r.crName)}</td>
       <td><div class="clamp s" title="${esc(r.side==='dr'?r.bp:r.bpCr)}">${esc(r.side==='dr'?r.bp:r.bpCr)}</div></td>${REF?`<td><div class="clamp s" title="${esc(r[REF[0]])}">${esc(refShort(r[REF[0]]))}</div></td>`:''}
       <td class=n>${r.debit?fmt2(r.debit):''}</td><td class=n>${r.credit?fmt2(r.credit):''}</td><td class="n ${r.run<0?'neg':''}"><b>${fmt2(r.run)}</b></td><td><div class=clamp title="${esc(r.desc)}">${esc(r.desc)}</div></td><td class=nw>${esc(short(r.user))}</td></tr>`).join('')||`<tr><td colspan=13 class=mut style="text-align:center;padding:20px">Không có bút toán phù hợp</td></tr>`}
     ${cur.length>3000?`<tr><td colspan=13 class=mut style="text-align:center">… còn ${num(cur.length-3000)} dòng – lọc thêm</td></tr>`:''}</tbody></table></div>`;
    if(canC){$('#lAll').checked=show.length>0&&show.every(r=>sel.has(r.i));$('#lAll').onchange=e=>{show.forEach(r=>e.target.checked?sel.add(r.i):sel.delete(r.i));draw()}}upd()};
  const upd=()=>{if(!canC)return;$('#lSel').textContent=sel.size?`Đã chọn ${num(sel.size)} dòng`:'Chưa chọn dòng';$('#lHdGo').disabled=!sel.size};
  bindFlt($('#lF'),F,draw);draw();
  $('#lT').onchange=e=>{const i=e.target.dataset.li;if(i==null)return;e.target.checked?sel.add(+i):sel.delete(+i);upd()};
  $('#lT').ondblclick=e=>{if(e.target.type==='checkbox')return;const tr=e.target.closest('tr[data-eid]');if(tr&&tr.dataset.eid)showDetail(null,+tr.dataset.eid)};
  if(canC){['#lHd','#lNote','#lHdS','#lHdM'].forEach(s=>$(s).addEventListener('change',e=>e.stopPropagation()));
    // Danh sách hợp đồng của đối tượng (mọi TK, cả hợp đồng đã điều chỉnh) – chọn thay vì gõ để tránh sai tên
    aq('faContracts',spec.bp||'').then(L=>{const s=$('#lHdS');if(!s)return;s.innerHTML=`<option value="">— Chọn hợp đồng của đối tượng (${num(L.length)}) —</option><option value="__EMPTY__">(Xoá trống hợp đồng)</option>`+L.map(o=>`<option value="${esc(o.v)}">${esc(refShort(o.v))} · ${num(o.n)} dòng${o.last?' · '+vn(o.last):''}</option>`).join('')}).catch(()=>{});
    $('#lHdM').onchange=e=>{e.stopPropagation();$('#lHd').classList.toggle('hide',!e.target.checked);$('#lHdS').classList.toggle('hide',e.target.checked);if(e.target.checked)$('#lHd').focus()};
    $('#lHdGo').onclick=async()=>{const man=$('#lHdM').checked,sv=$('#lHdS').value;if(!man&&!sv)return alert('Chọn hợp đồng trong danh sách, hoặc tích "Nhập thủ công"');const v=man?$('#lHd').value.trim():sv==='__EMPTY__'?'':sv;if(man&&!v&&!await ask('Hợp đồng nhập thủ công đang trống – xoá trống hợp đồng?'))return;const p=rows.filter(r=>sel.has(r.i)).map(r=>({id:r.rid,doc:r.doc,d:r.date,dr:r.dr,cr:r.cr,a:r.amt,bp:r.bp,bpCr:r.bpCr,contract:r.contract}));
      if(!await ask(`Đổi hợp đồng của ${p.length} bút toán thành "${v||'(trống)'}"?\nDữ liệu gốc không bị sửa – xem / bỏ ở Kiểm soát → Điều chỉnh dữ liệu.`))return;
      try{await aq('faSet',p,'contract',v,$('#lNote').value.trim());AGDATA=null;await openLedger(title,sub,spec,nat,after);after&&after()}catch(e){alert(e.message)}};}
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
  const [rep,todo,log]=await Promise.all([aq('report'),aq('todo',$('#rSev').value,$('#rGroup').value),aq('mailLog')]);
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
  if(!test&&!await ask(`Gửi email cho ${list.length} nhân viên?\n`+list.map(x=>`• ${short(x.user)} <${x.to}>`).join('\n')))return;
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
  const [ms,imps,info,s,ast]=await Promise.all([aq('months'),aq('imports'),api.info(),aq('stats'),aq('analysisStatus')]);INFO_VER=ast.version;
  const years={};ms.forEach(m=>(years[m.ym.slice(0,4)]??=[]).push(m));
  $('#months').innerHTML=Object.entries(years).map(([y,arr])=>`<h4 style="margin:16px 0 10px">Năm ${y}</h4><div class="month-grid">`+
    arr.map(m=>`<div class="mcard ${m.included?'on':''}"><div class="x"><span class="m">Tháng ${m.ym.slice(5)}</span><input type="checkbox" data-m="${m.ym}" ${m.included?'checked':''} title="Đưa vào phân tích"></div>
      <div class="mut" style="font-size:12px">${num(m.n)} dòng</div><div>${m.analyzed_ver==null?'<span class="badge s-open">Chưa phân tích</span>':m.analyzed_ver===INFO_VER?'<span class="badge s-fixed">Đã phân tích</span>':'<span class="badge b-M">Cần phân tích lại</span>'}</div><div class="mut" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(m.files)}">${esc(m.files||'')}</div>
      <button class="btn sm danger" data-delm="${m.ym}">Xoá tháng</button></div>`).join('')+'</div>').join('')||'<div class="empty"><h2>Chưa có dữ liệu</h2><p>Bấm "Nạp dữ liệu" để bắt đầu.</p></div>';
  $('#tImports').innerHTML='<thead><tr><th>File</th><th class=n>Số dòng</th><th>Từ ngày</th><th>Đến ngày</th><th>Nạp lúc</th><th></th></tr></thead><tbody>'+
    imps.map(i=>`<tr><td>${esc(i.file)}</td><td class=n>${num(i.rows)}</td><td>${vn(i.from)}</td><td>${vn(i.to)}</td><td class=nw>${esc(i.at)}</td><td><button class="btn sm danger" data-deli="${i.id}">Xoá</button></td></tr>`).join('')+'</tbody>';
  aq('inventory',new Date().toISOString().slice(0,10),'product','l1').then(r=>{$('#enrichInfo').innerHTML=r.oldImportRows?`<span class=neg>${num(r.oldImportRows)} dòng hàng tồn kho chưa có mã hàng/kho (nạp bằng phiên bản cũ).</span>`:'<span class=pos>✓ Tất cả dòng hàng tồn kho đã có thông tin mã hàng/kho.</span>'});
  loadTh();loadBk();
  $('#dbInfo').innerHTML=`<div>File CSDL</div><div><code>${esc(info.dbFile)}</code>${info.fallback?'<div class="neg" style="font-size:12px">Không ghi được vào thư mục ứng dụng ('+esc(info.appDir)+') nên đang lưu ở thư mục người dùng. Hãy đặt AccSoft ở thư mục có quyền ghi (vd D:\\AccSoft).</div>':''}${info.migratedFrom?'<div class="pos" style="font-size:12px">Đã chuyển dữ liệu từ '+esc(info.migratedFrom)+'</div>':''}</div><div>Dòng hạch toán</div><div>${num(s.entries)}</div><div>Cảnh báo</div><div>${num(s.errors)}</div><div>Phiên bản</div><div>${esc(info.version)}</div>`;
}
const runT=async(t,a,msg)=>{try{await api.task(t,a);if(msg)alert(msg)}catch(e){alert(e.message)}await refreshSide();go(PAGE)};
$('#months').onchange=async e=>{const m=e.target.dataset.m;if(!m)return;await aq('setMonths',[m],e.target.checked);await refreshSide();vData()};
$('#months').onclick=async e=>{const m=e.target.dataset.delm;if(m&&await ask(`Xoá hẳn toàn bộ dữ liệu tháng ${m}?`))runT('deleteMonth',{ym:m})};
$('#tImports').onclick=async e=>{const id=e.target.closest('[data-deli]')?.dataset.deli;if(id&&await ask('Xoá toàn bộ dữ liệu của lần nạp này?'))runT('deleteImport',{id:+id})};
$('#mAll').onclick=async()=>{await aq('setAllMonths',true);await refreshSide();vData()};$('#mNone').onclick=async()=>{await aq('setAllMonths',false);await refreshSide();vData()};
$('#btnEnrich').onclick=async()=>{try{const log=await api.pickAndEnrich();if(log){alert('Kết quả bổ sung thông tin hàng tồn kho:\n\n'+log.join('\n'));await refreshSide();go(PAGE)}}catch(e){alert(e.message)}};
$('#openDb').onclick=()=>api.openDbFolder();$('#btnLogs').onclick=()=>api.openLogs();
$('#btnRecheck').onclick=()=>runAnalyze(true);
$('#btnClear').onclick=async ()=>{if(await ask('Xoá TOÀN BỘ dữ liệu hạch toán và cảnh báo? (giữ lại trạng thái/ghi chú và cấu hình mail)'))runT('clear',{})};

/* ---------- Phân tích chuyên sâu ---------- */
let DP=ls.get('deepTab','reversal');let RCT='';const RCF=Object.assign({q:'',p:'',risk:'',flag:false,type:'',bal:''},ls.get('rcFilter',{}));const RVSEL=new Set();let RVG=[];let RVST='Chưa huỷ trích',RVM=ls.get('rvMode','detail');const DPS=ls.get('deepPick',{});
const flagB=f=>'<div style="display:flex;flex-direction:column;gap:3px;min-width:240px;white-space:normal">'+f.map(([s,t])=>`<span class="badge b-${s}">${esc(t)}</span>`).join('')+'</div>';
const spark=a=>{const mx=Math.max(...a.map(Math.abs),1);return `<span style="display:inline-flex;gap:1px;align-items:flex-end;height:22px">${a.map((v,i)=>`<i style="width:4px;height:${Math.max(1,Math.abs(v)/mx*22)}px;background:${i===a.length-1?C.brand:v?C.brand3:C.gray}"></i>`).join('')}</span>`};
const TBLMAX=1000; // bảng quá lớn làm trình duyệt dàn trang rất lâu → chỉ hiển thị 1.000 dòng đầu (xuất Excel để xem đủ)
const tbl=(head,rows,empty)=>{const more=rows.length-TBLMAX;if(more>0)rows=rows.slice(0,TBLMAX).concat(`<tr><td colspan=${head.length} class=mut style="text-align:center;padding:12px">… còn ${num(more)} dòng nữa – thu hẹp bộ lọc hoặc xuất Excel để xem đủ</td></tr>`);return tbl0(head,rows,empty)};
const tbl0=(head,rows,empty)=>`<div class="tbl" style="max-height:calc(100vh - 340px)"><table><thead><tr>${head.map(h=>`<th${h[0]==='#'?' class=n':''}>${h.replace(/^#/,'')}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan=${head.length} class=mut style="text-align:center;padding:24px">${empty||'Không có dữ liệu'}</td></tr>`}</tbody></table></div>`;
async function vDeep(){
  $$('#dpTabs [data-d]').forEach(b=>b.classList.toggle('on',b.dataset.d===DP));
  const yms=(await aq('months')).map(m=>m.ym).sort(),last=yms.at(-1)||'';
  const opt=(v)=>yms.slice().reverse().map(m=>`<option value="${m}" ${m===v?'selected':''}>${ymLbl(m)}</option>`).join('');
  DPS.end??=last;DPS.from??=yms[Math.max(0,yms.length-12)]||'';DPS.by??='tcost';DPS.kind??='exp';DPS.asOf??=new Date().toISOString().slice(0,10);
  if(!yms.includes(DPS.end))DPS.end=last;if(!yms.includes(DPS.from))DPS.from=yms[Math.max(0,yms.length-12)]||'';
  // TK chi tiết 335 (3351, 3353, 3358…): lọc phân tích trích trước – huỷ trích theo từng TK
  const L335=DP==='reversal'||DP==='accrual'?await aq('acc335List'):[];if(DPS.a335&&!L335.some(x=>x.acc===DPS.a335))DPS.a335='';
  const sel335=L335.length?`<label>TK chi tiết <select data-k="a335"><option value="">Tất cả TK 335</option>${L335.map(x=>`<option value="${esc(x.acc)}" ${DPS.a335===x.acc?'selected':''}>${esc(String(x.name||x.acc).replace('_',' – '))}</option>`).join('')}</select></label>`:'';
  const rangeCtl=`<label>Từ tháng <select data-k="from">${opt(DPS.from)}</select></label><label>Đến tháng <select data-k="end">${opt(DPS.end)}</select></label>`;
  const ctl={recurring:`<label>Đến tháng <select data-k="end">${opt(DPS.end)}</select></label><span class="hint">Xét 12 tháng; khoản mục × đối tượng phát sinh ≥ ${'ngưỡng'} số tháng được coi là định kỳ</span>`,
    variance:`<label>Tháng <select data-k="end">${opt(DPS.end)}</select></label><label>Loại <select data-k="kind"><option value="exp">Chi phí</option><option value="rev">Doanh thu</option></select></label><label>Theo <select data-k="by"><option value="tcost">Khoản mục</option><option value="tcost_bp">Khoản mục × đối tượng</option><option value="acc">Tài khoản</option><option value="dept">Bộ phận</option></select></label><span class="hint">So với trung bình 12 tháng trước</span>`,
    intg:'<div id="igCtl" style="display:contents"></div>',
    intl:rangeCtl+`<label>Phí cố định / lần <input type="number" step="0.01" data-k="feeFlat" value="${DPS.feeFlat??25}" style="width:80px"></label><label>Phí % <input type="number" step="0.001" data-k="feePct" value="${DPS.feePct??0.1}" style="width:70px"></label><label>Tối thiểu <input type="number" data-k="feeMin" value="${DPS.feeMin??0}" style="width:70px"></label><label>Tối đa <input type="number" data-k="feeMax" value="${DPS.feeMax??0}" style="width:70px"></label><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-k="intlRoam" ${DPS.intlRoam!==false&&DPS.intlRoam!=='false'?'checked':''}>Gồm roaming</label><button class="btn sm" id="ilXls">${ic('download')}Xuất Excel</button>`,
    recv:`<label>Tài khoản <input data-k="racc" value="${esc(DPS.racc||'138812')}" style="width:100px"></label><label>Tại ngày <input type="date" data-k="asOf" value="${DPS.asOf}"></label><label>Hạn thanh toán (ngày) <input type="number" data-k="rterm" value="${DPS.rterm||30}" style="width:80px"></label><button class="btn sm" id="rcXls">${ic('download')}Xuất Excel</button>`,
    reversal:rangeCtl+sel335+`<span class="hint">Kỳ dịch vụ / kỳ ghi chi phí thực tế</span>`,
    accrual:`<label>Tại ngày <input type="date" data-k="asOf" value="${DPS.asOf}"></label>`+sel335,fx:rangeCtl,staff:rangeCtl,benford:rangeCtl,vendors:rangeCtl}[DP];
  $('#dpCtl').innerHTML=`<div class="row">${ctl}</div>`;$$('#dpCtl select').forEach(x=>{if(DPS[x.dataset.k])x.value=DPS[x.dataset.k]});
  const B=$('#dpBody');B.innerHTML='<div class="card"><span class="spin"></span> Đang phân tích…</div>';
  B.onclick=null;B.ondblclick=null;B.onchange=null;B.oninput=null;B.onfocusin=null; // mỗi tab tự gắn sự kiện của mình
  if(!last){B.innerHTML='<div class="empty"><h2>Chưa có dữ liệu</h2></div>';return}
  const card=(t,h,body)=>`<div class="card"><div class="card-h"><div><h3>${t}</h3>${h?`<div class="hint">${h}</div>`:''}</div></div>${body}</div>`;
  if(DP==='recurring'){const r=await aq('deepRecurring',DPS.end,12);
    B.innerHTML=r.note?card('Chi phí định kỳ',r.note,''):`<div class="kpis">${kpi('','file','Khoản định kỳ có bất thường',num(r.items.length),`${r.from} → ${r.end}`)}${kpi('red','coins','Tháng bị thiếu',num(r.items.reduce((s,x)=>s+x.missing.length,0)))}${kpi('','coins','Tháng ghi trùng (×1.8)',num(r.items.reduce((s,x)=>s+x.double.length,0)))}</div>`+
      card('Thiếu / trùng chi phí định kỳ',`Định kỳ = phát sinh ≥ ${r.need}/${r.months.length} tháng. Thiếu tháng → có thể chưa trích trước/chưa hạch toán; ghi gấp đôi → có thể trùng hoá đơn.`,
      tbl(['Khoản mục','Đối tượng','#Số tháng','#Mức thường (median)','Tháng thiếu','Tháng trùng','Xu hướng','#Ảnh hưởng ước tính'],r.items.map(x=>`<tr><td>${esc(x.t)}</td><td><div class="clamp s" title="${esc(x.p)}">${esc(x.name||x.p)}</div></td><td class=n>${x.present}/${x.total}</td><td class=n>${fmt(x.med)}</td><td>${x.missing.map(m=>`<span class="badge b-H">${ymLbl(m)}</span>`).join(' ')}</td><td>${x.double.map(m=>`<span class="badge b-M">${ymLbl(m)}</span>`).join(' ')}</td><td>${spark(x.series)}</td><td class=n><b>${fmt(x.impact)}</b></td></tr>`),'Không phát hiện thiếu/trùng chi phí định kỳ'));}
  if(DP==='intg'){await vInternal(B,yms);}
  if(DP==='intl'){const fee={flat:+(DPS.feeFlat??25),pct:+(DPS.feePct??0.1),min:+(DPS.feeMin??0),max:+(DPS.feeMax??0),kinds:DPS.intlRoam===false||DPS.intlRoam==='false'?['BN_QT']:['BN_QT','ROAMING']};
    const r=await aq('grpIntl',DPS.from,DPS.end,fee),T=r.tot;
    if(!T.n){B.innerHTML=await grpEmpty('Thanh toán quốc tế',fee.kinds);return}
    B.innerHTML=`<div class="kpis">${kpi('','send','Số lần chuyển tiền quốc tế',num(T.n),`${num(r.partners.length)} đối tác`)}${kpi('','coins','Tổng tiền đã chuyển',fmt(T.a))}${kpi('red','wallet','Phí chuyển tiền ước tính',fmt2(T.fee),`${fee.flat}/lần + ${fee.pct}%${fee.min?' · tối thiểu '+fee.min:''}${fee.max?' · tối đa '+fee.max:''}`)}${kpi('blue','file','Phí ngân hàng đã hạch toán',fmt2(T.actFee),'Nợ 635/642/627, diễn giải có bank charge / fee / SWIFT…')}</div>`+
      card('Theo tháng','Mỗi lần chuyển = một chứng từ chi tiền cho một đối tác (gộp các dòng cùng chứng từ). So sánh phí ước tính với phí ngân hàng thực tế đã hạch toán.','<div style="height:260px"><canvas id="cIl"></canvas></div>'+tbl(['Tháng','#Số lần','#Số đối tác','#Tổng tiền','#Phí ước tính','#Phí đã hạch toán','#Chênh lệch','TK ngân hàng'],r.months.map(m=>`<tr><td>${ymLbl(m.ym)}</td><td class=n>${num(m.n)}</td><td class=n>${num(m.partners)}</td><td class=n>${fmt2(m.a)}</td><td class=n>${fmt2(m.fee)}</td><td class=n>${m.actFee?fmt2(m.actFee):''}</td><td class="n ${m.actFee-m.fee>0.5?'neg':''}">${fmt2(m.actFee-m.fee)}</td><td style="font-size:12px">${Object.entries(m.banks).map(([b,n])=>esc(String(b).replace(/^[^_]*_/,''))+' ('+n+')').join('<br>')}</td></tr>`)))+
      card('Theo đối tác','',tbl(['Đối tác','Nhóm','#Số lần','#Số tháng có chuyển','#Tổng tiền','#Phí ước tính','Lần gần nhất'],r.partners.map(o=>`<tr><td><div class="clamp s" title="${esc(o.p)}">${esc(o.name)}</div></td><td>${esc(o.kind)}</td><td class=n>${num(o.n)}</td><td class=n>${o.months}</td><td class=n>${fmt2(o.a)}</td><td class=n>${fmt2(o.fee)}</td><td class=nw>${vn(o.last)}</td></tr>`)))+
      card('Danh sách lần chuyển tiền','',tbl(['Ngày','Chứng từ','Đối tác','TK ngân hàng','#Số tiền','#Phí ước tính','Diễn giải','Người nhập'],r.list.slice().reverse().map(x=>`<tr><td class=nw>${vn(x.d)}</td><td class=nw>${esc(x.doc)}</td><td><div class="clamp s">${esc(x.name)}</div></td><td style="font-size:12px">${esc(String(x.bank).replace(/^[^_]*_/,''))}</td><td class=n>${fmt2(x.a)}</td><td class=n>${fmt2(x.fee)}</td><td><div class=clamp title="${esc(x.ds)}">${esc(x.ds)}</div></td><td class=nw>${esc(short(x.u))}</td></tr>`)));
    setTimeout(()=>chart('cIl',{data:{labels:r.months.map(m=>ymLbl(m.ym)),datasets:[{type:'bar',label:'Số lần chuyển',data:r.months.map(m=>m.n),backgroundColor:C_.brand3,yAxisID:'y1'},{type:'line',label:'Phí ước tính',data:r.months.map(m=>m.fee),borderColor:C_.err},{type:'line',label:'Phí đã hạch toán',data:r.months.map(m=>m.actFee),borderColor:C_.navy}]},options:{scales:{y1:{position:'right',grid:{display:false}}}}}));
    $('#ilXls').onclick=async()=>{try{const f=await api.xlsxSheets(`AccSoft_ThanhToanQuocTe_${DPS.from}_${DPS.end}.xlsx`,[['Theo thang',r.months.map(m=>({'Tháng':m.ym,'Số lần':m.n,'Số đối tác':m.partners,'Tổng tiền':m.a,'Phí ước tính':m.fee,'Phí đã hạch toán':m.actFee}))],['Theo doi tac',r.partners.map(o=>({'Đối tác':o.p,'Nhóm':o.kind,'Số lần':o.n,'Số tháng':o.months,'Tổng tiền':o.a,'Phí ước tính':o.fee,'Lần gần nhất':o.last}))],['Chi tiet',r.list.map(x=>({'Ngày':x.d,'Chứng từ':x.doc,'Đối tác':x.p,'TK ngân hàng':x.bank,'Số tiền':x.a,'Phí ước tính':x.fee,'Diễn giải':x.ds,'Người nhập':x.u}))],['Cach tinh phi',[{'Phí cố định / lần':fee.flat,'Phí %':fee.pct,'Tối thiểu':fee.min,'Tối đa':fee.max,'Nhóm':fee.kinds.join(', ')}]]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};}
  if(DP==='recv'){const r0=await aq('recvAnalyze',DPS.racc||'138812',DPS.asOf,+(DPS.rterm||30));
    // Bộ lọc: đối tượng (tìm theo tên/mã), mức rủi ro, chỉ đối tượng có cảnh báo, loại cảnh báo
    if(RCF.p&&!r0.partners.some(o=>o.p===RCF.p))RCF.p='';
    const qq=RCF.q.trim().toLowerCase(),exact=RCF.p?r0.partners.find(o=>o.p===RCF.p):r0.partners.find(o=>o.p.toLowerCase()===qq||o.name.toLowerCase()===qq);
    const hasT=new Set(r0.flags.filter(f=>!RCF.type||f.type===RCF.type).map(f=>f.p));
    // số dư tại ngày đang chọn: còn nợ (dư Nợ) / dư Có / có số dư / hết số dư
    const BALF={debt:o=>o.bal>0.5,credit:o=>o.bal<-0.5,any:o=>Math.abs(o.bal)>0.5,zero:o=>Math.abs(o.bal)<=0.5},balOk=o=>!RCF.bal||BALF[RCF.bal](o);
    const keep=o=>balOk(o)&&(!(qq||RCF.p)||(exact?o.p===exact.p:(o.p+' '+o.name).toLowerCase().includes(qq)))&&(!RCF.risk||o.risk===RCF.risk)&&(!RCF.flag||o.flagN>0)&&(!RCF.type||hasT.has(o.p));
    const parts=r0.partners.filter(keep),pset=new Set(parts.map(o=>o.p)),flt=!!(qq||RCF.p||RCF.risk||RCF.flag||RCF.type||RCF.bal);
    const sm=k=>parts.reduce((t,o)=>t+o[k],0);
    const r={...r0,partners:parts,flags:r0.flags.filter(f=>pset.has(f.p)&&(!RCF.type||f.type===RCF.type)),
      summary:flt?{...r0.summary,partners:parts.length,rev:sm('rev'),paid:sm('paid'),adj:sm('adj'),bal:sm('bal'),overdue:sm('overdue'),od90:sm('od90'),b:r0.buckets.map((_,i)=>parts.reduce((t,o)=>t+o.b[i],0)),high:parts.filter(o=>o.risk==='H').length,nRev:sm('nRev'),nPay:sm('nPay')}:r0.summary},S=r.summary;
    const one=parts.length===1&&(qq||RCF.p)?parts[0]:null;
    const TYN={PAY_OTHER:'Tiền thu có thể của đối tượng khác',REV_OTHER:'Doanh thu / khoản nợ nghi sai đối tượng',REV_MISSING:'Thu tiền nhưng chưa có doanh thu',OVERPAID:'Thu vượt phải thu',REV_PERIOD:'Thu tiền kỳ chưa ghi doanh thu',REV_GAP:'Doanh thu định kỳ thiếu tháng',CREDIT_BAL:'Dư Có',GENERIC_PARTNER:'Thu tiền ghi vào đối tượng chung'};
    const filterBar=`<div class="card" style="padding:12px 16px"><div class="row" style="flex-wrap:wrap;gap:12px;align-items:center">
      <label style="display:flex;gap:6px;align-items:center">Đối tượng <select id="rcSel" style="max-width:360px"><option value="">— Tất cả đối tượng (${num(r0.partners.length)}) —</option>${[...r0.partners].filter(o=>balOk(o)||o.p===RCF.p).sort((a,b)=>a.name.localeCompare(b.name)).map(o=>`<option value="${esc(o.p)}" ${RCF.p===o.p?'selected':''}>${esc(o.name)} — ${o.bal>0.5?'còn nợ '+fmt2(o.bal):o.bal<-0.5?'dư Có '+fmt2(-o.bal):'hết số dư'}${o.risk==='H'?' ⚠':''}</option>`).join('')}</select></label>
      <label>Số dư tại ${vn(r0.asOf)} <select id="rcBal"><option value="">Tất cả</option><option value="debt" ${RCF.bal==='debt'?'selected':''}>Còn nợ (dư Nợ) – ${num(r0.partners.filter(BALF.debt).length)}</option><option value="credit" ${RCF.bal==='credit'?'selected':''}>Dư Có – ${num(r0.partners.filter(BALF.credit).length)}</option><option value="any" ${RCF.bal==='any'?'selected':''}>Còn số dư (Nợ hoặc Có) – ${num(r0.partners.filter(BALF.any).length)}</option><option value="zero" ${RCF.bal==='zero'?'selected':''}>Hết số dư – ${num(r0.partners.filter(BALF.zero).length)}</option></select></label>
      <label style="display:flex;gap:6px;align-items:center">Tìm <input id="rcQ" value="${esc(RCF.q)}" placeholder="một phần tên / mã…" style="width:200px"></label>
      <label>Rủi ro <select id="rcRisk"><option value="">Tất cả</option><option value="H" ${RCF.risk==='H'?'selected':''}>Cao</option><option value="M" ${RCF.risk==='M'?'selected':''}>Trung bình</option><option value="L" ${RCF.risk==='L'?'selected':''}>Thấp</option></select></label>
      <label>Loại cảnh báo <select id="rcType"><option value="">Tất cả</option>${Object.entries(TYN).map(([k,v])=>`<option value="${k}" ${RCF.type===k?'selected':''}>${v}</option>`).join('')}</select></label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="rcFlag" ${RCF.flag?'checked':''}>Chỉ đối tượng có cảnh báo</label>
      ${flt?`<button class="btn sm ghost" id="rcClear">${ic('x')}Xoá lọc</button><span class="badge b-M">Đang lọc: ${num(parts.length)} / ${num(r0.partners.length)} đối tượng</span>`:''}</div></div>`;
    const oneHtml=one?recvDetailHtml(await aq('recvDetail',DPS.racc||'138812',one.p,DPS.asOf,+(DPS.rterm||30)),true):'';
    const TY={PAY_OTHER:'Tiền thu có thể của đối tượng khác',REV_OTHER:'Doanh thu / khoản nợ nghi sai đối tượng',REV_MISSING:'Thu tiền nhưng chưa có doanh thu',OVERPAID:'Thu vượt phải thu',REV_PERIOD:'Thu tiền kỳ chưa ghi doanh thu',REV_GAP:'Doanh thu định kỳ thiếu tháng',CREDIT_BAL:'Dư Có (thu nhiều hơn phải thu)',GENERIC_PARTNER:'Thu tiền ghi vào đối tượng chung'};
    const RK={H:'<span class="badge b-H">Cao</span>',M:'<span class="badge b-M">Trung bình</span>',L:'<span class="badge s-fixed">Thấp</span>'},cnt=t=>r.flags.filter(f=>f.type===t).length;
    const FL=r.flags.filter(f=>!RCT||f.type===RCT);
    B.innerHTML=(r.noRevenue?`<div class="card" style="background:#FFFAEB"><b>Chưa có bút toán ghi nhận doanh thu / phải thu (Nợ ${esc(r.acc)})</b> trong dữ liệu đã nạp đến ${vn(r.asOf)} – chỉ có ${num(S.nPay)} lần thu tiền. Nạp các tháng có bút toán ghi Nợ ${esc(r.acc)} (doanh thu trả sau, thường lập cuối tháng) hoặc số dư đầu kỳ theo đối tượng để phân bổ tiền thu và tính quá hạn.</div>`:'')+
      filterBar+`<div class="kpis">${kpi('','file','Phải thu đã ghi nhận',fmt(S.rev),`${num(S.nRev)} bút toán · ${num(S.partners)} đối tượng`)}${kpi('green','coins','Đã thu / giảm trừ',fmt(S.paid+S.adj),`${num(S.nPay)} lần thu`)}${kpi(S.bal<0?'red':'','wallet','Còn phải thu',fmt(S.bal),S.bal<0?'dư Có – thu nhiều hơn phải thu':'')}${kpi('red','alert','Quá hạn > 90 ngày',fmt(S.od90),`quá hạn tất cả ${fmt(S.overdue)}`)}${kpi('red','users','Đối tượng rủi ro cao',num(S.high),`${num(r.flags.filter(f=>f.sev==='H').length)} cảnh báo mức cao`)}</div>`+oneHtml+
      `<div class="grid g2">${card('Tuổi nợ khoản phải thu chưa thu',`Hạn = Due Date của bút toán, nếu trống = ngày ghi nhận + ${r.term} ngày. Tiền thu được trừ cho khoản cùng mã tham chiếu / đúng số tiền trước, còn lại trừ khoản cũ nhất.`,'<div style="height:240px"><canvas id="cRcAge"></canvas></div>')}
        ${card('Cách nhận định','',`<div style="font-size:13px;line-height:1.6"><b>(1) Tiền thu có thể của đối tượng khác:</b> diễn giải chứa mã thuê bao/số ĐT/hợp đồng của khoản phải thu thuộc đối tượng khác; hoặc thu tiền khi đối tượng không còn nợ mà số tiền khớp đúng khoản đang nợ của đối tượng khác; hoặc diễn giải nêu tên đối tượng khác.<br><b>(2) Doanh thu sai đối tượng / thiếu doanh thu:</b> khoản nợ còn treo trong khi tiền thu cùng mã lại ghi cho đối tượng khác; thu tiền nhưng chưa ghi doanh thu; thu tiền kỳ X nhưng không có doanh thu kỳ X; doanh thu hàng tháng bị thiếu tháng.<br><b>(3) Rủi ro:</b> Cao = có cảnh báo mức cao hoặc nợ quá hạn > 90 ngày kèm dấu hiệu khác; Trung bình = có quá hạn hoặc cảnh báo; Thấp = còn lại.</div>`)}</div>`+
      card('Cảnh báo','Nhấn đúp để mở chi tiết đối tượng (doanh thu nào đã được trừ bởi khoản thu nào, còn nợ bao nhiêu). Bấm tên đối tượng nghi ngờ để xem chi tiết đối tượng đó.',`<div class="row" style="margin-bottom:10px;flex-wrap:wrap">${['',...Object.keys(TY)].filter(t=>!t||cnt(t)).map(t=>`<button class="btn sm ${RCT===t?'primary':''}" data-rct="${t}">${t?TY[t]:'Tất cả'} (${t?cnt(t):r.flags.length})</button>`).join('')}</div>`+
        tbl(['Mức','Loại','Đối tượng ghi sổ','Ngày','Chứng từ','#Số tiền','Nhận định','Đối tượng nghi ngờ','Người nhập'],FL.map(f=>`<tr class="dbl ${f.sev==='H'?'rH':''}" data-rcp="${esc(f.p)}"><td>${RK[f.sev]}</td><td style="font-size:12px">${TY[f.type]}</td><td><div class="clamp s" title="${esc(f.p)}">${esc(f.name)}</div></td><td class=nw>${vn(f.d)}</td><td class=nw>${esc(f.doc||'')}</td><td class=n>${f.amt!=null?fmt2(f.amt):''}</td><td style="font-size:12px">${esc(f.msg)}</td><td>${f.cand.map(c=>`<a href="#" data-rcp="${esc(c.p)}">${esc(c.name)}</a>`).join('<br>')}</td><td class=nw>${esc(short(f.u||''))}</td></tr>`),'Không có cảnh báo'))+
      card('Theo đối tượng','Nhấn đúp để xem chi tiết từng khoản doanh thu và tiền thu.',tbl(['Rủi ro','Đối tượng','#Phải thu','#Giảm trừ','#Đã thu','#Còn nợ',...r.buckets.map(b=>'#'+b),'#Tuổi tối đa','Thu gần nhất','#Cảnh báo'],r.partners.map(o=>`<tr class="dbl ${o.risk==='H'?'rH':''}" data-rcp="${esc(o.p)}"><td>${RK[o.risk]}</td><td><a href="#" data-rcf="${esc(o.name)}" data-rcfp="${esc(o.p)}" title="Lọc theo đối tượng này · ${esc(o.p)}"><div class="clamp s">${esc(o.name)}</div></a>${o.generic?'<span class="badge">đối tượng chung</span>':''}</td><td class=n>${fmt2(o.rev)}</td><td class=n>${o.adj?fmt2(o.adj):''}</td><td class=n>${fmt2(o.paid)}</td><td class="n ${o.bal<0?'neg':''}"><b>${fmt2(o.bal)}</b></td>${o.b.map((v,i)=>`<td class="n ${i>=4&&v?'neg':''}">${v?fmt2(v):''}</td>`).join('')}<td class=n>${o.maxAge||''}</td><td class=nw>${vn(o.lastPay)}</td><td class=n>${o.flagN?`<span class="badge ${o.flagH?'b-H':'b-M'}">${o.flagN}</span>`:''}</td></tr>`)));
    if(window.__rcFocus){const i=$('#rcQ');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}window.__rcFocus=0}
    setTimeout(()=>chart('cRcAge',{type:'bar',data:{labels:r.buckets,datasets:[{data:S.b,backgroundColor:[C.ok,'#FFD4BD','#FF9C6B','#FF6929','#FA4700','#D63600','#8A2200']}]},options:{plugins:{legend:{display:false}}}}));
    B.onclick=e=>{const t=e.target.closest('[data-rct]');if(t){RCT=t.dataset.rct;vDeep();return}const a=e.target.closest('a[data-rcp]');if(a){e.preventDefault();recvDetail(a.dataset.rcp);return}
      const fl=e.target.closest('a[data-rcf]');if(fl){e.preventDefault();RCF.p=fl.dataset.rcfp||'';RCF.q=RCF.p?'':fl.dataset.rcf;ls.set('rcFilter',RCF);vDeep();$('#content').scrollTop=0;return}
      if(e.target.id==='rcClear'){Object.assign(RCF,{q:'',p:'',risk:'',flag:false,type:'',bal:''});ls.set('rcFilter',RCF);vDeep()}};
    const reF=()=>{ls.set('rcFilter',RCF);vDeep()};let qT;
    B.onchange=e=>{const id=e.target.id;if(id==='rcRisk'){RCF.risk=e.target.value;reF()}else if(id==='rcType'){RCF.type=e.target.value;reF()}else if(id==='rcFlag'){RCF.flag=e.target.checked;reF()}else if(id==='rcQ'&&e.target.value!==RCF.q){clearTimeout(qT);RCF.q=e.target.value;RCF.p='';reF()}else if(id==='rcSel'){RCF.p=e.target.value;RCF.q='';reF()}else if(id==='rcBal'){RCF.bal=e.target.value;reF()}};
    B.onfocusin=e=>{if(e.target.id==='rcQ')e.target.select()};
    B.oninput=e=>{if(e.target.id==='rcQ'){clearTimeout(qT);qT=setTimeout(()=>{RCF.q=e.target.value;RCF.p='';window.__rcFocus=1;reF()},600)}};
    B.ondblclick=e=>{const tr=e.target.closest('tr[data-rcp]');if(tr)recvDetail(tr.dataset.rcp)};
    $('#rcXls').onclick=async()=>{try{const f=await api.recvXlsx(DPS.racc||'138812',DPS.asOf,+(DPS.rterm||30));if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};}
  if(DP==='reversal'){const r=await aq('deepReversal',DPS.from,DPS.end,DPS.a335||''),G=r.groups,open=G.filter(g=>g.status==='Chưa huỷ trích');
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
    $('#rvXls').onclick=async()=>{try{const f=await api.accrualXlsx(DPS.from,DPS.end,DPS.a335||'');if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
    B.onclick=e=>{const sv=e.target.closest('[data-rvsel]');if(sv){if(sv.dataset.rvsel==='none')RVSEL.clear();else G.filter(g=>g.status==='Chưa huỷ trích').forEach(g=>RVSEL.add(g.key));vDeep();return}
      if(e.target.closest('#rvErp')){revForm();return}
      const m=e.target.closest('[data-rvm]');if(m){RVM=m.dataset.rvm;ls.set('rvMode',RVM);vDeep();return}const s=e.target.closest('[data-rvst]');if(s){RVST=s.dataset.rvst;vDeep();return}const u=e.target.closest('[data-rvu]');if(u){FIL={rule:'ACCRUAL_NOT_REVERSED',user:u.dataset.rvu};OFF=0;go('errors')}};
    B.ondblclick=e=>{const tr=e.target.closest('[data-rvp]');if(tr)openLedger(tr.dataset.rvp||'(trống)',`TK ${DPS.a335||'335'} · `+tr.dataset.rvt,{kind:'ag',acc:DPS.a335||'335',bp:tr.dataset.rvp,dim:'tcost',ref:tr.dataset.rvt},-1)};}
  if(DP==='variance'){const r=await aq('deepVariance',DPS.end,DPS.by,DPS.kind);
    B.innerHTML=r.note?card('Biến động bất thường',r.note,''):card(`Biến động bất thường tháng ${ymLbl(r.ym)}`,'Chênh lệch so với trung bình các tháng trước vượt ngưỡng % và giá trị tối thiểu (Cài đặt ngưỡng trong Quản lý dữ liệu).',
      tbl(['Nhóm','Loại','#Tháng này','#TB 12 tháng','#Chênh lệch','#%','Xu hướng'],r.items.map(x=>`<tr><td><div class="clamp" title="${esc(x.g)}">${esc(x.g)}</div></td><td><span class="badge ${x.diff>0?'b-H':'b-L'}">${x.type}</span></td><td class=n>${fmt(x.cur)}</td><td class=n>${fmt(x.avg)}</td><td class="n ${x.diff<0?'neg':''}"><b>${fmt(x.diff)}</b></td><td class=n>${x.pct==null?'mới':pct(x.pct)}</td><td>${spark(x.series)}</td></tr>`),'Không có biến động vượt ngưỡng'));}
  if(DP==='accrual'){const [a,p]=await Promise.all([aq('deepAccruals',DPS.asOf,DPS.a335||''),aq('deepPrepaid',DPS.asOf)]);
    B.innerHTML=card(`TK ${DPS.a335||'335'} – Trích trước theo đối tượng × khoản mục`,'Nhấn đúp dòng để xem bút toán. Cảnh báo: quá hạn quyết toán, quyết toán vượt trích, trích liên tục không quyết toán.',
      tbl(['Đối tượng','Khoản mục','#Đã trích','#Đã quyết toán','#Số dư','#Tuổi (ngày)','Trích gần nhất','QT gần nhất','Cảnh báo'],a.items.map(x=>`<tr class="dbl" data-acc335="${esc(x.p)}" data-t="${esc(x.t)}"><td><div class="clamp s" title="${esc(x.p)}">${esc(x.name||x.p)}</div></td><td>${esc(x.t)}</td><td class=n>${fmt(x.accrued)}</td><td class=n>${fmt(x.settled)}</td><td class="n ${x.bal<0?'neg':''}"><b>${fmt(x.bal)}</b></td><td class=n>${x.age||''}</td><td class=nw>${vn(x.lastAcc)}</td><td class=nw>${vn(x.lastSet)}</td><td>${flagB(x.flags)}</td></tr>`)))+
      card('TK 242 – Chi phí trả trước theo hợp đồng','So sánh số đã phân bổ với lịch phân bổ (Distribution From/To).',
      tbl(['Hợp đồng / nhóm','Khoản mục','#Trả trước','#Đã phân bổ','#Theo lịch','#Còn lại','Kỳ phân bổ','Cảnh báo'],p.items.map(x=>`<tr><td><div class="clamp s" title="${esc(x.k)}">${esc(refShort(x.k))}</div></td><td>${esc(x.t||'')}</td><td class=n>${fmt(x.pre)}</td><td class=n>${fmt(x.amo)}</td><td class=n>${x.expected==null?'':fmt(x.expected)}</td><td class="n ${x.bal<0?'neg':''}"><b>${fmt(x.bal)}</b></td><td class=nw>${x.f?vn(x.f)+' → '+vn(x.to):''}</td><td>${flagB(x.flags)}</td></tr>`)));
    B.ondblclick=e=>{const tr=e.target.closest('[data-acc335]');if(tr)openLedger(tr.dataset.acc335,`TK ${DPS.a335||'335'} · `+tr.dataset.t,{kind:'ag',acc:DPS.a335||'335',bp:tr.dataset.acc335,dim:'tcost',ref:tr.dataset.t,asOf:DPS.asOf},-1)};}
  if(DP==='staff'){const r=await aq('deepStaff',DPS.from,DPS.end);
    B.innerHTML=card('Chấm điểm chất lượng hạch toán theo nhân viên','Điểm = 100 − (lỗi NV + 2×lỗi kiểm toán + 3×lỗi nghiêm trọng)/số dòng. Lỗi lặp = cùng quy tắc ≥ 3 tháng → cần đào tạo.',
      tbl(['Nhân viên','#Điểm','#Số dòng','#Lỗi','#Tỷ lệ %','#NV','#KT','#Cao','#Đã sửa','#Còn mở','Lỗi hay gặp','Lỗi lặp lại',`Tỷ lệ lỗi ${r.months.length} tháng`],r.items.map(x=>`<tr><td class=nw><b>${esc(short(x.u))}</b></td><td class=n><span class="badge ${x.score<70?'b-H':x.score<90?'b-M':'s-fixed'}">${x.score}</span></td><td class=n>${num(x.entries)}</td><td class=n>${num(x.errors)}</td><td class=n>${x.rate.toFixed(1)}</td><td class=n>${num(x.staff)}</td><td class=n>${num(x.audit)}</td><td class=n>${num(x.high)}</td><td class=n>${num(x.fixed)}</td><td class=n>${num(x.open)}</td>
        <td>${x.top.map(([k,n])=>`<div class="mut" style="font-size:12px">${esc(RULE[k]?.n||k)}: ${num(n)}</div>`).join('')}</td><td>${x.repeat.map(o=>`<span class="badge b-M" title="${o.months} tháng">${esc(RULE[o.k]?.n||o.k)}</span>`).join(' ')}</td><td>${spark(x.trend.map(v=>v||0))}</td></tr>`),'Chưa có dữ liệu – hãy "Phân tích dữ liệu" trước'));}
  if(DP==='benford'){const r=await aq('deepBenford',DPS.from,DPS.end),t=r.total;
    B.innerHTML=`<div class="grid g2">${card('Định luật Benford – chữ số đầu',`Toàn bộ: ${num(t.n)} số tiền, MAD = ${t.mad.toFixed(4)} → <b>${t.level}</b>. Lệch nhiều có thể do số bị "làm tròn", chia nhỏ, hoặc nhập tay bất thường.`,'<div style="height:260px"><canvas id="cBen"></canvas></div>')}
      ${card('Tỷ lệ số tròn','Tỷ lệ số tiền chia hết cho 1.000 (không có số lẻ).',`<div style="height:260px"><canvas id="cRound"></canvas></div>`)}</div>`+
      card('Theo người nhập','Xếp theo mức lệch Benford (MAD). Cần ≥ 300 số tiền để kết luận.',tbl(['Người nhập','#Số lượng','#MAD','Đánh giá','#Tỷ lệ số tròn'],r.users.map(x=>`<tr><td><b>${esc(short(x.u))}</b></td><td class=n>${num(x.n)}</td><td class=n>${x.mad.toFixed(4)}</td><td><span class="badge ${x.level==='Không phù hợp'?'b-H':x.level==='Cận biên'?'b-M':''}">${x.level}</span></td><td class=n>${pct(x.round)}</td></tr>`)));
    chart('cBen',{type:'bar',data:{labels:[1,2,3,4,5,6,7,8,9],datasets:[{label:'Thực tế',data:t.obs.map(v=>v*100),backgroundColor:C.brand},{type:'line',label:'Benford',data:r.expected.map(v=>v*100),borderColor:C.navy,pointRadius:3}]},options:{scales:{y:{ticks:{callback:v=>v+'%'}}}}});
    const us=r.users.filter(x=>x.n>=50).slice(0,15);chart('cRound',{type:'bar',data:{labels:us.map(x=>short(x.u)),datasets:[{label:'% số tròn',data:us.map(x=>x.round*100),backgroundColor:C.brand3}]},options:{indexAxis:'y',scales:{x:{ticks:{callback:v=>v+'%'}}}}});}
  if(DP==='vendors'){const r=await aq('deepVendors',DPS.from,DPS.end);
    B.innerHTML=`<div class="kpis">${kpi('','coins','Giá trị mua (Có 331)',fmt(r.total))}${kpi('','file','Số nhà cung cấp',num(r.count))}${kpi(r.top10>0.8?'red':'','pie','Tỷ trọng top 10',pct(r.top10))}${kpi('blue','file','NCC mới trong kỳ',num(r.newVendors.length))}</div>`+
      card('Mức độ tập trung nhà cung cấp','Nhấn đúp để xem bút toán 331 của nhà cung cấp.',tbl(['#','Nhà cung cấp','#Giá trị','#Số dòng','#Tỷ trọng','#Lũy kế','Lần đầu','Mới'],r.list.slice(0,100).map((x,i)=>`<tr class="dbl" data-v331="${esc(x.p)}"><td class=n>${i+1}</td><td><div class="clamp s" title="${esc(x.p)}">${esc(x.name||x.p)}</div></td><td class=n>${fmt(x.v)}</td><td class=n>${num(x.n)}</td><td class=n>${pct(x.share)}</td><td class=n>${pct(x.cum)}</td><td class=nw>${vn(x.first)}</td><td>${x.isNew?'<span class="badge b-M">Mới</span>':''}</td></tr>`)))+
      `<div class="grid g2">${card('Tên gần giống nhau – nghi trùng mã NCC','Cùng tên sau khi bỏ dấu, loại hình DN (Co., Ltd, Lda…). Rủi ro thanh toán trùng / NCC "ma".',tbl(['Tên chuẩn hoá','Các mã'],r.similar.map(x=>`<tr><td>${esc(x.k)}</td><td>${x.codes.map(c=>`<div class="mut" style="font-size:12px">${esc(c)}</div>`).join('')}</td></tr>`),'Không có'))}
      ${card('Trả tiền trước khi có hoá đơn','Lần ghi Nợ 331 đầu tiên sớm hơn lần ghi Có 331 đầu tiên.',tbl(['Nhà cung cấp','Trả lần đầu','Hoá đơn lần đầu','#Đã trả'],r.prepay.slice(0,200).map(x=>`<tr class="dbl" data-v331="${esc(x.p)}"><td><div class="clamp s" title="${esc(x.p)}">${esc(x.name||x.p)}</div></td><td class=nw>${vn(x.firstPay)}</td><td class=nw>${x.firstInv?vn(x.firstInv):'<span class=neg>chưa có</span>'}</td><td class=n>${fmt(x.paid)}</td></tr>`),'Không có'))}</div>`;
    B.ondblclick=e=>{const tr=e.target.closest('[data-v331]');if(tr)openLedger(tr.dataset.v331,'TK 331',{kind:'ag',acc:'331',bp:tr.dataset.v331,dim:'bp'},-1)};}
  if(DP==='fx'){const r=await aq('deepFx',DPS.from,DPS.end);
    B.innerHTML=r.noData?card('Kiểm tra tỷ giá',`Dữ liệu không có tỷ giá (cột RateToVND/Currency rate đều bằng 0 hoặc trống trên ${num(r.rows)} dòng) nên không kiểm tra được. Tiền tệ: ${r.currencies.map(c=>esc(c.c||'(trống)')+' '+num(c.n)).join(', ')}.`,'')
      :card('Nhiều tỷ giá trong cùng ngày','',tbl(['Ngày','Tiền tệ','#Số tỷ giá','#Thấp','#Cao','#Số dòng'],r.multi.map(x=>`<tr><td>${vn(x.d)}</td><td>${esc(x.c)}</td><td class=n>${x.k}</td><td class=n>${fmt(x.lo)}</td><td class=n>${fmt(x.hi)}</td><td class=n>${num(x.n)}</td></tr>`)))+
       card('Tỷ giá lệch > 2% so với bình quân tháng','',tbl(['Ngày','Chứng từ','Tiền tệ','#Tỷ giá','#BQ tháng','#Số tiền','Người nhập'],r.dev.map(x=>`<tr><td>${vn(x.d)}</td><td>${esc(x.doc)}</td><td>${esc(x.c)}</td><td class=n>${fmt(x.r)}</td><td class=n>${fmt(x.avg)}</td><td class=n>${fmt2(x.amt)}</td><td>${esc(short(x.u))}</td></tr>`)));}
}
/* ---------- Báo cáo tài chính ---------- */
let FT=ls.get('finTab','tb');const FP=ls.get('finPick',{});
/* ---------- Truy nguồn số liệu báo cáo tài chính & điều chỉnh dòng tiền ---------- */
const BACC={'110':['111','112','113'],'120':['121','128'],'131':['131'],'132':['331'],'133b':['136'],'136':['138','141','338','244'],'138':['229'],'140':['151','152','153','154','155','156','157','158'],'152b':['133'],'153b':['333'],
  '221':['211','212'],'227':['213'],'229b':['214'],'240':['241'],'250':['221','222','228'],'260':['242','243'],'311':['331'],'312':['131'],'313':['333'],'314':['334'],'315':['335'],'316':['336'],'319':['338','138','141','344'],
  '320':['341','343'],'322':['352','353','356','347'],'411':['411','419'],'416':['412','413'],'418':['414','418','441'],'421':['421'],'421b':['5','6','7','8','9'],'OB':['OB']};
const PLA={rev:['511','512'],ded:['521'],cogs:['621','622','623','627','632'],finInc:['515'],finExp:['635'],sell:['641'],admin:['642'],othInc:['711'],othExp:['811'],tax:['821']};
const PLK={net:['rev','ded'],gp:['rev','ded','cogs'],op:['rev','ded','cogs','finInc','finExp','sell','admin'],other:['othInc','othExp'],pbt:['rev','ded','cogs','finInc','finExp','sell','admin','othInc','othExp'],pat:Object.keys(PLA)};
const plAccs=k=>PLA[k]||(PLK[k]||[]).flatMap(x=>PLA[x]);
const uniq=a=>[...new Set(a.filter(x=>x!=null&&x!==''))].sort();
function fltBar(id,F,defs){return `<div class="row" style="flex-wrap:wrap;gap:8px;align-items:center" id="${id}">${defs.map(d=>d.t==='q'?`<input data-ff="${d.k}" placeholder="${d.p}" style="flex:1;min-width:220px" value="${esc(F[d.k]||'')}">`:d.t==='n'?`<input data-ff="${d.k}" type="number" placeholder="${d.p}" style="width:110px" value="${esc(F[d.k]||'')}">`:
  `<select data-ff="${d.k}" style="max-width:240px"><option value="">${d.p}</option>${d.o.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}" ${String(F[d.k]||'')===String(v)?'selected':''}>${esc(l)}</option>`}).join('')}</select>`).join('')}<button class="btn sm ghost" data-ffclr>Xoá lọc</button></div>`}
function bindFlt(host,F,redraw){host.querySelectorAll('[data-ff]').forEach(el=>{let T=0;el.addEventListener(el.tagName==='SELECT'?'change':'input',e=>{e.stopPropagation();F[el.dataset.ff]=el.value;clearTimeout(T);if(el.tagName==='SELECT')redraw();else T=setTimeout(redraw,250)})});
  const c=host.querySelector('[data-ffclr]');if(c)c.onclick=()=>{for(const k in F)F[k]='';host.querySelectorAll('[data-ff]').forEach(el=>el.value='');redraw()}}
const inRange=(v,mn,mx)=>(mn===''||mn==null||Math.abs(v)>=+mn)&&(mx===''||mx==null||Math.abs(v)<=+mx);
const txt=(x,ks)=>ks.map(k=>x[k]||'').join(' ').toLowerCase();
/* (1) Nhấn vào chỉ tiêu → TK chi tiết + bút toán gốc trong kỳ, có bộ lọc */
async function finDrawer(title,sub,spec){CUR=-1;const D=$('#drawer');D.classList.add('full');
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">${esc(sub||'')}</div><h2 style="font-size:20px">${esc(title)}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div><div class="pb"><div class="card"><span class="spin"></span> Đang truy nguồn số liệu…</div></div>`;
  D.classList.remove('hide');$('#dClose').onclick=closeDetail;
  const r=await aq('finDrill',spec),F={q:'',acc:'',ctr:'',side:'',ym:'',bp:'',u:'',t:'',min:'',max:''},N2=v=>Math.abs(v)<0.005?'':fmt2(v);
  const pb=$('#dPane .pb');
  pb.innerHTML=`<div class="card"><div class="card-h"><div><h3>Tài khoản cấu thành</h3><div class="hint">Kỳ ${ymLbl(spec.from)} – ${ymLbl(spec.to)} · bấm một TK để lọc bút toán bên dưới${spec.pl?' · loại bút toán kết chuyển 911':''}</div></div></div>
    ${tbl0(['TK','Tên tài khoản','#Dư đầu kỳ','#PS Nợ','#PS Có','#Dư cuối kỳ'],r.accounts.map(a=>`<tr class="click" data-dacc="${esc(a.a)}"><td class=nw><b>${esc(a.a)}</b></td><td>${esc(a.n)}</td><td class=n>${N2(a.ob)}</td><td class=n>${N2(a.dr)}</td><td class=n>${N2(a.cr)}</td><td class=n><b>${N2(a.cb)}</b></td></tr>`).concat(r.accounts.length>1?[`<tr style="font-weight:700;background:#FFF6F2"><td></td><td>Cộng</td>${['ob','dr','cr','cb'].map(k=>`<td class=n>${N2(r.accounts.reduce((s,a)=>s+a[k],0))}</td>`).join('')}</tr>`]:[]),'Không có số dư / phát sinh')}</div>
    <div class="card"><div class="card-h"><div><h3>Bút toán gốc trong kỳ</h3><div class="hint">${num(r.total)} dòng${r.truncated?' (hiển thị 50.000 dòng đầu)':''} · nhấn đúp để xem chi tiết bút toán</div></div></div>
    ${fltBar('dF',F,[{t:'q',k:'q',p:'Tìm chứng từ, diễn giải, đối tượng…'},{k:'acc',p:'Mọi TK',o:uniq(r.rows.map(x=>x.acc))},{k:'ctr',p:'Mọi TK đối ứng',o:uniq(r.rows.map(x=>String(x.ctr||'').slice(0,3)))},{k:'side',p:'Nợ & Có',o:['Nợ','Có']},
      {k:'ym',p:'Mọi tháng',o:uniq(r.rows.map(x=>x.ym)).map(m=>[m,ymLbl(m)])},{k:'bp',p:'Mọi đối tượng',o:uniq(r.rows.map(x=>x.bpS)).slice(0,3000)},{k:'t',p:'Mọi khoản mục',o:uniq(r.rows.map(x=>x.t)).slice(0,2000)},{k:'u',p:'Mọi người nhập',o:uniq(r.rows.map(x=>x.u)).map(u=>[u,short(u)])},{t:'n',k:'min',p:'Số tiền từ'},{t:'n',k:'max',p:'đến'}])}
    <div id="dSum" style="margin:8px 0;font-weight:600"></div><div id="dT"></div></div>`;
  let cur=[];
  const draw=()=>{const q=F.q.trim().toLowerCase();cur=r.rows.filter(x=>(!F.acc||x.acc===F.acc)&&(!F.ctr||String(x.ctr||'').startsWith(F.ctr))&&(!F.side||x.side===F.side||x.side==='Nợ & Có')&&(!F.ym||x.ym===F.ym)&&(!F.bp||x.bpS===F.bp)&&(!F.t||x.t===F.t)&&(!F.u||x.u===F.u)&&inRange(x.a,F.min,F.max)&&(!q||txt(x,['doc','ds','bp','bpCr','u','t','dep','accName','ctrName']).includes(q)));
    const dr=cur.reduce((s,x)=>s+(x.side!=='Có'?x.a:0),0),cr=cur.reduce((s,x)=>s+(x.side!=='Nợ'?x.a:0),0);
    $('#dSum').innerHTML=`${num(cur.length)} / ${num(r.rows.length)} dòng · PS Nợ ${fmt2(dr)} · PS Có ${fmt2(cr)} · Chênh lệch (Nợ − Có) ${fmt2(dr-cr)}`;
    $('#dT').innerHTML=tbl(['Ngày','Chứng từ','TK','Nợ/Có','TK đối ứng','Đối tượng','#PS Nợ','#PS Có','Diễn giải','Khoản mục','Dòng tiền','Người nhập'],cur.map(x=>`<tr class=dbl data-eid="${x.id}"><td class=nw>${vn(x.d)}</td><td class=nw>${esc(x.doc)}</td><td><div class="clamp s" title="${esc(x.accName)}">${esc(x.accName||x.acc)}</div></td><td>${x.side}</td><td><div class="clamp s" title="${esc(x.ctrName)}">${esc(x.ctrName||x.ctr)}</div></td><td><div class="clamp s" title="${esc(x.bpS||'')}">${esc(x.bpS||'')}</div></td><td class=n>${x.side!=='Có'?fmt2(x.a):''}</td><td class=n>${x.side!=='Nợ'?fmt2(x.a):''}</td><td><div class=clamp title="${esc(x.ds)}">${esc(x.ds)}</div></td><td style="font-size:12px">${esc(x.t||'')}</td><td style="font-size:12px">${esc(x.cf||'')}</td><td class=nw>${esc(short(x.u))}</td></tr>`),'Không có bút toán phù hợp')};
  bindFlt($('#dF'),F,draw);draw();
  pb.querySelector('table').onclick=e=>{const tr=e.target.closest('[data-dacc]');if(!tr)return;F.acc=F.acc===tr.dataset.dacc?'':tr.dataset.dacc;const s=$('#dF [data-ff=acc]');if(s)s.value=F.acc;draw()};
  $('#dT').ondblclick=e=>{const tr=e.target.closest('tr[data-eid]');if(tr)showDetail(null,+tr.dataset.eid)};
}
/* (2) Dòng tiền: xem bút toán tiền gốc, điều chỉnh mã dòng tiền */
async function cfDrawer(code,label,onChange){CUR=-1;const D=$('#drawer');D.classList.add('full');
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Dòng tiền · kỳ ${ymLbl(FP.from)} – ${ymLbl(FP.to)}</div><h2 style="font-size:20px">${esc(label)}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div><div class="pb"><div class="card"><span class="spin"></span> Đang tải bút toán tiền…</div></div>`;
  D.classList.remove('hide');$('#dClose').onclick=()=>{closeDetail();onChange&&CFCHG&&onChange();CFCHG=false};
  const r=await aq('cfRows',FP.from,FP.to,code,'after',30000),C=r.codes,F={q:'',dir:'',ctr:'',fl:'',cb:'',bp:'',u:'',min:'',max:''},sel=new Set(),cn=c=>c?`${c} – ${C[c]||''}`:'';
  const pb=$('#dPane .pb');
  pb.innerHTML=`<div class="card"><div class="hint" style="margin-bottom:8px">${num(r.total)} bút toán thu/chi tiền${code?` đang xếp vào mã ${esc(code)} (sau điều chỉnh)`:''}${r.total>r.rows.length?' · hiển thị 30.000 dòng đầu':''}. Cột <b>"NV chọn"</b> là dòng tiền nhân viên chọn trên ERP; <b>"Gợi ý theo TK"</b> là phân loại theo TK đối ứng – khác nhau được tô vàng. Tích chọn dòng, chọn mã đúng rồi bấm <b>Điều chỉnh</b>.</div>
    ${fltBar('cF',F,[{t:'q',k:'q',p:'Tìm chứng từ, diễn giải, đối tượng…'},{k:'dir',p:'Thu & Chi',o:['Thu','Chi']},{k:'ctr',p:'Mọi TK đối ứng',o:uniq(r.rows.map(x=>String(x.other).slice(0,3)))},
      {k:'fl',p:'Tất cả dòng',o:[['diff','⚠ NV chọn khác gợi ý theo TK'],['nocf','Chưa chọn dòng tiền / chọn "chuyển nội bộ"'],['adj','Đã điều chỉnh'],['noadj','Chưa điều chỉnh']]},
      {k:'cb',p:'Mọi mã (trước ĐC)',o:uniq(r.rows.map(x=>x.before)).map(c=>[c,cn(c)])},{k:'bp',p:'Mọi đối tượng',o:uniq(r.rows.map(x=>x.bpo)).slice(0,3000)},{k:'u',p:'Mọi người nhập',o:uniq(r.rows.map(x=>x.u)).map(u=>[u,short(u)])},{t:'n',k:'min',p:'Số tiền từ'},{t:'n',k:'max',p:'đến'}])}
    <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center;background:#FFF6F2;padding:8px 10px;border-radius:8px;margin-top:8px"><b id="cSum"></b><div style="flex:1"></div><span id="cSel" class="mut">Chưa chọn dòng</span>
      <select id="cTo" style="max-width:340px"><option value="">Chuyển sang dòng tiền…</option>${Object.entries(C).map(([k,v])=>`<option value="${k}">${k} – ${esc(v)}</option>`).join('')}</select>
      <input id="cNote" placeholder="Ghi chú lý do" style="width:180px"><button class="btn sm primary" id="cApply" disabled>Điều chỉnh</button><button class="btn sm" id="cAuto" disabled title="Đặt mã theo gợi ý TK đối ứng">Theo gợi ý TK</button><button class="btn sm ghost" id="cUndo" disabled>Bỏ điều chỉnh</button></div>
    <div id="cT" style="margin-top:8px"></div></div>`;
  let cur=[];
  const draw=()=>{const q=F.q.trim().toLowerCase();cur=r.rows.filter(x=>(!F.dir||x.dir===F.dir)&&(!F.ctr||String(x.other).startsWith(F.ctr))&&(!F.cb||x.before===F.cb)&&(!F.bp||x.bpo===F.bp)&&(!F.u||x.u===F.u)&&inRange(x.a,F.min,F.max)
      &&(!F.fl||(F.fl==='diff'?x.diff:F.fl==='nocf'?x.noCf:F.fl==='adj'?x.adj:!x.adj))&&(!q||txt(x,['doc','ds','bp','bpCr','u','cf','otherName']).includes(q)));
    $('#cSum').textContent=`${num(cur.length)} / ${num(r.rows.length)} dòng · thu ${fmt2(cur.filter(x=>x.v>0).reduce((s,x)=>s+x.v,0))} · chi ${fmt2(-cur.filter(x=>x.v<0).reduce((s,x)=>s+x.v,0))} · ${num(cur.filter(x=>x.diff).length)} dòng khác gợi ý`;
    const show=cur.slice(0,1000);
    $('#cT').innerHTML=`<div class="tbl" style="max-height:calc(100vh - 330px)"><table><thead><tr><th><input type="checkbox" id="cAll"></th><th>Ngày</th><th>Chứng từ</th><th>Thu/Chi</th><th>TK tiền</th><th>TK đối ứng</th><th>Đối tượng</th><th class=n>Số tiền</th><th>NV chọn (ERP)</th><th>Gợi ý theo TK</th><th>Sau điều chỉnh</th><th>Diễn giải</th><th>Người nhập</th></tr></thead><tbody>${show.map((x,i)=>`<tr class=dbl data-eid="${x.id}"${x.diff&&!x.adj?' style="background:#FFFAEB"':''}><td><input type="checkbox" data-ci="${i}" ${sel.has(x.sig)?'checked':''}></td><td class=nw>${vn(x.d)}</td><td class=nw>${esc(x.doc)}</td><td>${x.dir}</td><td class=nw>${esc(x.cash)}</td><td><div class="clamp s" title="${esc(x.otherName)}">${esc(x.otherName||x.other)}</div></td><td><div class="clamp s" title="${esc(x.bpo||'')}">${esc(x.bpo||'')}</div></td><td class="n ${x.v<0?'neg':''}">${fmt2(x.v)}</td><td style="font-size:12px">${x.cf?esc(x.cf):'<span class="badge b-M">chưa chọn</span>'}</td><td style="font-size:12px">${esc(cn(x.auto))}</td><td style="font-size:12px">${x.adj?`<span class="badge b-H" title="${esc(x.adjNote||'')}">${esc(cn(x.after))}</span>`:esc(cn(x.after))}</td><td><div class=clamp title="${esc(x.ds)}">${esc(x.ds)}</div></td><td class=nw>${esc(short(x.u))}</td></tr>`).join('')||'<tr><td colspan=13 class=mut style="text-align:center;padding:24px">Không có bút toán phù hợp</td></tr>'}${cur.length>1000?`<tr><td colspan=13 class=mut style="text-align:center;padding:12px">… còn ${num(cur.length-1000)} dòng – thu hẹp bộ lọc</td></tr>`:''}</tbody></table></div>`;
    $('#cAll').checked=show.length>0&&show.every(x=>sel.has(x.sig));$('#cAll').onchange=e=>{show.forEach(x=>e.target.checked?sel.add(x.sig):sel.delete(x.sig));draw()};upd()};
  const upd=()=>{const n=sel.size;$('#cSel').textContent=n?`Đã chọn ${num(n)} dòng · ${fmt2(r.rows.filter(x=>sel.has(x.sig)).reduce((s,x)=>s+x.v,0))}`:'Chưa chọn dòng';['#cApply','#cAuto','#cUndo'].forEach(s=>$(s).disabled=!n)};
  bindFlt($('#cF'),F,draw);draw();
  $('#cT').onchange=e=>{const i=e.target.dataset.ci;if(i==null)return;const x=cur[+i];e.target.checked?sel.add(x.sig):sel.delete(x.sig);upd()};
  $('#cT').ondblclick=e=>{if(e.target.type==='checkbox')return;const tr=e.target.closest('tr[data-eid]');if(tr)showDetail(null,+tr.dataset.eid)};
  ['#cTo','#cNote'].forEach(s=>$(s).addEventListener('change',e=>e.stopPropagation()));
  const picked=()=>r.rows.filter(x=>sel.has(x.sig));
  const done=()=>{CFCHG=true;cfDrawer(code,label,onChange)};
  $('#cApply').onclick=async()=>{const to=$('#cTo').value;if(!to)return alert('Chọn dòng tiền đúng');const p=picked();if(!await ask(`Chuyển ${p.length} dòng sang ${cn(to)}?`))return;try{await aq('cfAdjSet',p,to,$('#cNote').value.trim());done()}catch(e){alert(e.message)}};
  $('#cAuto').onclick=async()=>{const p=picked(),g={};p.forEach(x=>(g[x.auto]??=[]).push(x));if(!await ask(`Đặt ${p.length} dòng theo gợi ý TK đối ứng?`))return;try{for(const [c,L] of Object.entries(g))await aq('cfAdjSet',L,c,$('#cNote').value.trim()||'Theo gợi ý TK đối ứng');done()}catch(e){alert(e.message)}};
  $('#cUndo').onclick=async()=>{const p=picked().filter(x=>x.adj);if(!p.length)return alert('Các dòng đã chọn chưa được điều chỉnh');if(!await ask(`Bỏ điều chỉnh ${p.length} dòng?`))return;await aq('cfAdjRemove',p.map(x=>x.sig));done()};
}
let CFCHG=false;
/* Ánh xạ dòng lá của mẫu KQKD ↔ khoản mục chi phí / loại doanh thu / tiền tố TK */
async function kqMapDrawer(r){CUR=-1;const D=$('#drawer');D.classList.add('full');const src=await aq('kqSources');let F={q:'',st:''};
  const leaves=r.lines.filter(l=>l.kind==='leaf');
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">KQKD theo mẫu</div><h2 style="font-size:20px">Ánh xạ chỉ tiêu ↔ dữ liệu</h2></div><div style="flex:1"></div><button class="btn sm" id="kmAuto">Tự ánh xạ theo tên</button><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
    <div class="pb"><div class="card"><div class="hint">Mỗi dòng lá lấy số từ: <b>khoản mục chi phí</b> (mã Type of cost, TK 6xx/8xx: Nợ − Có), <b>loại doanh thu</b> (Type of revenue, TK 5xx/7xx: Có − Nợ) và/hoặc <b>tiền tố TK</b> (vd 515:cr = Có − Nợ TK 515; 635:dr = Nợ − Có). Một chỉ tiêu có thể gồm nhiều mã.</div>
    <div class="filterrow" style="margin-top:8px"><input id="kmQ" placeholder="Tìm chỉ tiêu, mã…" style="width:280px"><select id="kmS"><option value="">Tất cả dòng lá (${leaves.length})</option><option value="no">Chưa ánh xạ</option><option value="yes">Đã ánh xạ</option></select></div><div id="kmT" style="margin-top:8px"></div></div></div>`;
  D.classList.remove('hide');$('#dClose').onclick=()=>{closeDetail();vFin()};
  const costL=`<datalist id="kmCostL">${src.cost.map(c=>`<option value="${esc(c.code)}">${esc(c.name)}${c.vn?' – '+esc(c.vn):''}</option>`).join('')}</datalist><datalist id="kmRevL">${src.rev.map(x=>`<option value="${esc(x.t)}">${fmt2(x.a)}</option>`).join('')}</datalist>`;
  const draw=()=>{const q=F.q.toLowerCase(),L=leaves.filter(l=>(!F.st||(F.st==='no'?!l.map:!!l.map))&&(!q||[l.stt,l.en,l.vn,...(l.map?[...l.map.cost,...l.map.rev]:[])].some(v=>String(v||'').toLowerCase().includes(q))));
    $('#kmT').innerHTML=costL+tbl0(['Dòng','STT','Khoản mục (EN)','Khoản mục (VN)','Khoản mục chi phí (mã, cách nhau dấu phẩy)','Loại doanh thu (cách nhau dấu ;)','TK (vd 515:cr, 635:dr)',''],L.map(l=>{const m=l.map||{cost:[],rev:[],acc:[]};return `<tr data-kmr="${l.row}"${l.map?'':' style="background:#FFFAEB"'}><td>${l.row}</td><td class=nw>${esc(l.stt)}</td><td style="font-size:12px">${esc(l.en)}</td><td style="font-size:12px">${esc(l.vn)}</td>
      <td><input data-k="cost" list="kmCostL" value="${esc(m.cost.join(', '))}" style="width:220px"></td><td><input data-k="rev" list="kmRevL" value="${esc(m.rev.join('; '))}" style="width:260px"></td><td><input data-k="acc" value="${esc(m.acc.map(a=>a.p+':'+a.side).join(', '))}" style="width:130px"></td><td class=nw><button class="btn sm primary" data-kms="${l.row}">Lưu</button> <button class="btn sm ghost" data-kmc="${l.row}" title="Xoá ánh xạ">${ic('x')}</button></td></tr>`}),'Không có dòng phù hợp')};
  draw();$('#kmQ').oninput=deb(e=>{F.q=e.target.value;draw()});$('#kmS').onchange=e=>{e.stopPropagation();F.st=e.target.value;draw()};
  $('#kmT').onclick=async e=>{const s=e.target.closest('[data-kms]'),c=e.target.closest('[data-kmc]');const row=+(s||c||{}).dataset?.kms||+(c||{}).dataset?.kmc;if(!s&&!c)return;
    const tr=e.target.closest('tr'),l=leaves.find(x=>x.row===(s?+s.dataset.kms:+c.dataset.kmc));
    if(c){await aq('kqClearMap',l.row);l.map=null;return draw()}
    const g=k=>tr.querySelector(`[data-k="${k}"]`).value,m={cost:g('cost').split(/[,\s]+/).filter(Boolean),rev:g('rev').split(/\s*;\s*/).filter(Boolean),acc:g('acc').split(/[,\s]+/).filter(Boolean).map(x=>{const [p,side]=x.split(':');return {p,side:side==='dr'?'dr':'cr'}})};
    await aq('kqSetMap',l.row,m);l.map=m;tr.style.background='';s.textContent='✓ Đã lưu';setTimeout(()=>{s.textContent='Lưu'},1200)};
  $('#kmAuto').onclick=async()=>{const x=await aq('kqAutoMap');alert(`Đã tự ánh xạ ${num(x.n)} dòng`);const rr=await aq('kqCompute',[{key:'cur',from:FP.from,to:FP.to}]);kqMapDrawer(rr)};
}
async function vFin(){
  $$('#fnTabs [data-f]').forEach(b=>b.classList.toggle('on',b.dataset.f===FT));
  const yms=(await aq('months')).map(m=>m.ym).sort(),last=yms.at(-1)||'';if(!last){$('#fnBody').innerHTML='<div class="empty"><h2>Chưa có dữ liệu</h2></div>';return}
  if(!yms.includes(FP.to))FP.to=last;if(!yms.includes(FP.from))FP.from=yms.find(m=>m.slice(0,4)===FP.to.slice(0,4))||yms[0];FP.level??='1';FP.cmp??='ly';FP.mode??='y';
  // Kỳ báo cáo: tháng / quý / năm / luỹ kế từ đầu năm / khoảng tháng – suy ra from/to
  const qOf=m=>`${m.slice(0,4)}-Q${Math.floor((+m.slice(5)-1)/3)+1}`,yrs=[...new Set(yms.map(m=>m.slice(0,4)))].reverse(),qs=[...new Set(yms.map(qOf))].reverse();
  FP.pm??=FP.to;FP.pq??=qOf(FP.to);FP.py??=FP.to.slice(0,4);if(!yms.includes(FP.pm))FP.pm=last;if(!qs.includes(FP.pq))FP.pq=qs[0];if(!yrs.includes(FP.py))FP.py=yrs[0];
  if(FP.mode==='m'){FP.from=FP.to=FP.pm}
  else if(FP.mode==='q'){const y=FP.pq.slice(0,4),q=+FP.pq.slice(-1);FP.from=`${y}-${String(q*3-2).padStart(2,'0')}`;FP.to=`${y}-${String(q*3).padStart(2,'0')}`}
  else if(FP.mode==='y'){FP.from=FP.py+'-01';FP.to=FP.py+'-12'}
  else if(FP.mode==='ytd'){FP.from=FP.pm.slice(0,4)+'-01';FP.to=FP.pm}
  const lastIn=yms.filter(m=>m>=FP.from&&m<=FP.to).at(-1),partial=lastIn&&lastIn<FP.to;if(partial)FP.to=lastIn; // kỳ chưa đủ tháng: cắt đến tháng cuối có dữ liệu
  const opt=v=>yms.slice().reverse().map(m=>`<option value="${m}" ${m===v?'selected':''}>${ymLbl(m)}</option>`).join('');
  const sel=(k,arr,lab)=>`<select data-fk="${k}">${arr.map(v=>`<option value="${v}" ${v===FP[k]?'selected':''}>${lab(v)}</option>`).join('')}</select>`;
  const pick=FP.mode==='m'||FP.mode==='ytd'?`<label>${FP.mode==='m'?'Tháng':'Đến tháng'} <select data-fk="pm">${opt(FP.pm)}</select></label>`:FP.mode==='q'?`<label>Quý ${sel('pq',qs,v=>`Quý ${v.slice(-1)}/${v.slice(0,4)}`)}</label>`:FP.mode==='y'?`<label>Năm ${sel('py',yrs,v=>v)}</label>`
    :`<label>Từ tháng <select data-fk="from">${opt(FP.from)}</select></label><label>Đến tháng <select data-fk="to">${opt(FP.to)}</select></label>`;
  $('#fnCtl').innerHTML=`<div class="row" style="flex-wrap:wrap;gap:12px"><label>Kỳ báo cáo <select data-fk="mode">${[['m','Tháng'],['q','Quý'],['y','Năm'],['ytd','Luỹ kế từ đầu năm'],['r','Khoảng tháng']].map(([v,t])=>`<option value="${v}" ${FP.mode===v?'selected':''}>${t}</option>`).join('')}</select></label>${pick}
    ${partial?`<span class="badge b-M">Dữ liệu đến ${ymLbl(FP.to)}</span>`:''}
    ${FT==='tb'?`<label>Cấp TK <select data-fk="level"><option value="1" ${FP.level==='1'?'selected':''}>Cấp 1 (3 số)</option><option value="0" ${FP.level==='0'?'selected':''}>Chi tiết</option></select></label>`:''}
    ${FT==='pl'||FT==='kq'?`<label>So sánh <select data-fk="cmp"><option value="ly" ${FP.cmp==='ly'?'selected':''}>Cùng kỳ năm trước</option><option value="prev" ${FP.cmp==='prev'?'selected':''}>Kỳ liền trước (${FP.mode==='m'?'tháng trước':FP.mode==='q'?'quý trước':FP.mode==='y'?'năm trước':'cùng độ dài'})</option><option value="none" ${FP.cmp==='none'?'selected':''}>Không</option></select></label>`:''}
    <span class="hint">Số đầu kỳ = số dư cuối tháng trước kỳ trên sổ số dư tổng hợp; không có dữ liệu trước đó thì bằng 0.</span></div>
    <div class="row" id="fnSt" style="margin-top:8px;font-size:12px"></div>`;
  aq('finStatus').then(s=>{const el=$('#fnSt');if(!el)return;el.innerHTML=`<span class="badge s-fixed">Sổ số dư tổng hợp</span><span class="mut">${s.months?`${num(s.months)} tháng (${ymLbl(s.from)} → ${ymLbl(s.to)}) · ${num(s.rows)} dòng phát sinh tổng hợp · cập nhật ${esc(s.built||'')}`:'chưa tổng hợp'} – tự cập nhật khi nạp/xoá dữ liệu, chỉ tính lại tháng thay đổi.</span><button class="btn sm ghost" id="fnRebuild">Tổng hợp lại toàn bộ</button>`;
    $('#fnRebuild').onclick=async()=>{try{await api.task('buildAgg',{});vFin()}catch(e){alert(e.message)}}});
  const B=$('#fnBody');B.innerHTML='<div class="card"><span class="spin"></span> Đang lập báo cáo…</div>';
  const n={m:1,q:3,y:12,ytd:12}[FP.mode]||mdiff(FP.from,FP.to)+1,cmp=FP.cmp==='ly'?[addM(FP.from,-12),addM(FP.to,-12)]:FP.cmp==='prev'?[addM(FP.from,-n),addM(FP.to,-n)]:[null,null]; // so sánh tương đương: cùng số tháng
  const per=FP.mode==='m'?`Tháng ${ymLbl(FP.from)}`:FP.mode==='q'?`Quý ${FP.pq.slice(-1)}/${FP.pq.slice(0,4)}${partial?` (đến ${ymLbl(FP.to)})`:''}`:FP.mode==='y'?`Năm ${FP.py}${partial?` (đến ${ymLbl(FP.to)})`:''}`:FP.mode==='ytd'?`Luỹ kế ${ymLbl(FP.from)} – ${ymLbl(FP.to)}`:`${ymLbl(FP.from)} – ${ymLbl(FP.to)}`;
  const N=v=>Math.abs(v)<0.005?'':`<span class="${v<0?'neg':''}">${v<0?'('+fmt2(-v)+')':fmt2(v)}</span>`;
  if(FT==='tb'){const r=await aq('finTrial',FP.from,FP.to,+FP.level),t=r.tot,ok=Math.abs(t.dr-t.cr)<0.01&&Math.abs(t.cbDr-t.cbCr)<0.01;
    B.innerHTML=(r.hasOpening?'':`<div class="card" style="background:#FFFAEB"><b>Không có số dư đầu kỳ</b> – trước ${ymLbl(FP.from)} chưa có dữ liệu nên số dư đầu kỳ = 0. Có thể nạp "Số dư đầu kỳ" ở Quản lý dữ liệu.</div>`)+
      `<div class="card"><div class="card-h"><div><h3>BẢNG CÂN ĐỐI SỐ PHÁT SINH</h3><div class="hint">Kỳ ${per} · ${num(r.rows.length)} tài khoản · ${ok?'<span class=pos>✓ Tổng Nợ = Tổng Có</span>':'<span class=neg>Lệch Nợ/Có – kiểm tra dữ liệu</span>'}</div></div></div>
      <div class="tbl" style="max-height:calc(100vh - 300px)"><table><thead><tr><th rowspan=2>Số hiệu TK</th><th rowspan=2>Tên tài khoản</th><th colspan=2 style="text-align:center">Số dư đầu kỳ</th><th colspan=2 style="text-align:center">Số phát sinh trong kỳ</th><th colspan=2 style="text-align:center">Số dư cuối kỳ</th></tr>
      <tr><th class=n>Nợ</th><th class=n>Có</th><th class=n>Nợ</th><th class=n>Có</th><th class=n>Nợ</th><th class=n>Có</th></tr></thead><tbody>
      ${r.rows.map(x=>`<tr class="dbl" data-fa="${esc(x.a)}" title="Nhấn đúp: xem bút toán cấu thành"><td class=nw><b>${esc(x.a)}</b></td><td>${esc(x.n)}</td>${['obDr','obCr','dr','cr','cbDr','cbCr'].map(k=>`<td class=n>${x[k]?fmt2(x[k]):''}</td>`).join('')}</tr>`).join('')}
      <tr style="font-weight:700;background:#FFF6F2"><td></td><td>TỔNG CỘNG</td>${['obDr','obCr','dr','cr','cbDr','cbCr'].map(k=>`<td class=n>${fmt2(t[k])}</td>`).join('')}</tr></tbody></table></div><p class="mut" style="font-size:12px">Nhấn đúp một tài khoản để xem bút toán cấu thành.</p></div>`;
    B.ondblclick=e=>{const tr=e.target.closest('[data-fa]');if(tr)finDrawer('TK '+tr.dataset.fa+' – '+tr.cells[1].innerText,'Bảng cân đối số phát sinh · kỳ '+per,{accs:[tr.dataset.fa],from:FP.from,to:FP.to})}}
  if(FT==='ptb'){FP.ptbAcc??='debt';FP.ptbKind??='';FP.ptbCo??='';FP.ptbQ??='';FP.ptbV??='pa';FP.ptbCustom??='';
    const DEBT=['131','136','138','141','244','128','331','333','334','335','336','337','338','341','344'];
    const accs=FP.ptbAcc==='debt'?DEBT:FP.ptbAcc==='all'?[]:String(FP.ptbCustom).split(/[,;\s]+/).filter(Boolean);
    const [cat,cos]=await Promise.all([aq('catList','','',0,1),aq('grpCompanies',true)]);const K=cat.kinds||{};
    const par=(ls.get('igPick',{}).par||'TFU,VTC,STL,VTG').toUpperCase(),GF=g=>`G:${g}:${par}`;
    B.innerHTML=`<div class="card"><div class="filterrow">
      <label>Tài khoản <select data-pt="ptbAcc"><option value="debt" ${FP.ptbAcc==='debt'?'selected':''}>TK công nợ (13x, 14x, 33x, 34x…)</option><option value="all" ${FP.ptbAcc==='all'?'selected':''}>Mọi TK có đối tượng</option><option value="custom" ${FP.ptbAcc==='custom'?'selected':''}>Tự nhập…</option></select></label>
      ${FP.ptbAcc==='custom'?`<label>TK (cách nhau dấu phẩy) <input data-pt="ptbCustom" value="${esc(FP.ptbCustom)}" placeholder="vd 13888, 331" style="width:180px"></label>`:''}
      <label>Nhóm đối tượng <select data-pt="ptbKind"><option value="">Tất cả</option>${Object.entries(K).map(([k,v])=>`<option value="${k}" ${FP.ptbKind===k?'selected':''}>${k} – ${esc(v)}</option>`).join('')}</select></label>
      <label>Công ty nội bộ <select data-pt="ptbCo" style="max-width:380px"><option value="">—</option><option value="${GF(1)}" ${FP.ptbCo===GF(1)?'selected':''}>▸ Nhóm 1 – mẹ & con (${esc(par)})</option><option value="${GF(2)}" ${FP.ptbCo===GF(2)?'selected':''}>▸ Nhóm 2 – cùng tập đoàn</option>${cos.map(c=>`<option value="${esc(c.key)}" ${FP.ptbCo===c.key?'selected':''}>${esc(c.name)} (${esc(c.key)})</option>`).join('')}</select></label>
      <label>Tìm đối tượng <input data-pt="ptbQ" value="${esc(FP.ptbQ)}" placeholder="mã, tên, mã nội bộ…" style="width:200px"></label>
      <label>Xem theo <select data-pt="ptbV"><option value="pa" ${FP.ptbV==='pa'?'selected':''}>Đối tượng × tài khoản</option><option value="p" ${FP.ptbV==='p'?'selected':''}>Đối tượng</option><option value="a" ${FP.ptbV==='a'?'selected':''}>Tài khoản</option></select></label>
      <button class="btn sm" id="ptXls">${ic('download')}Xuất Excel</button></div></div><div id="ptBody"><div class="card"><span class="spin"></span> Đang lập bảng cân đối theo đối tượng…</div></div>`;
    B.querySelectorAll('[data-pt]').forEach(el=>el.addEventListener('change',e=>{e.stopPropagation();FP[el.dataset.pt]=el.value;ls.set('finPick',FP);vFin()}));
    const r=await aq('finPartnerTB',FP.from,FP.to,accs,FP.ptbKind?[FP.ptbKind]:[],FP.ptbCo,FP.ptbQ),sp=(v,s)=>s>0?Math.max(0,v):Math.max(0,-v),nv=v=>Math.abs(v)>=0.005?fmt2(v):'';
    const V=FP.ptbV,G=new Map();for(const o of r.rows){const k=V==='p'?o.p:V==='a'?o.acc:o.p+'|'+o.acc,x=G.get(k)||G.set(k,{...o,ob:0,dr:0,cr:0,cb:0,n:0}).get(k);x.ob+=o.ob;x.dr+=o.dr;x.cr+=o.cr;x.cb+=o.cb;x.n++}
    const L=[...G.values()],t=r.tot;
    const head=V==='a'?['TK','Tên tài khoản','#Số đối tượng']:V==='p'?['Đối tượng','Nhóm','Công ty nội bộ','#Số TK']:['Đối tượng','Nhóm','Công ty nội bộ','TK','Tên tài khoản'];
    const cells=o=>V==='a'?`<td class=nw><b>${esc(o.acc)}</b></td><td>${esc(o.accName)}</td><td class=n>${o.n}</td>`:V==='p'?`<td><div class="clamp s" title="${esc(o.p)}">${esc(o.p)}</div></td><td>${esc(o.kind)}</td><td>${esc(o.coKey||'')}</td><td class=n>${o.n}</td>`:`<td><div class="clamp s" title="${esc(o.p)}">${esc(o.p)}</div></td><td>${esc(o.kind)}</td><td>${esc(o.coKey||'')}</td><td class=nw>${esc(o.acc)}</td><td><div class="clamp s">${esc(o.accName)}</div></td>`;
    $('#ptBody').innerHTML=`<div class="card"><div class="card-h"><div><h3>BẢNG CÂN ĐỐI PHÁT SINH THEO ĐỐI TƯỢNG CÔNG NỢ</h3><div class="hint">Kỳ ${per} · dữ liệu gốc (không áp dụng điều chỉnh) · TK ghi Nợ ↔ đối tượng Nợ, TK ghi Có ↔ đối tượng Có · ${num(r.partners)} đối tượng · ${num(r.rows.length)} dòng đối tượng × TK${r.accs.length?' · TK: '+esc(r.accs.join(', ')):''} · ${Math.abs(t.dr-t.cr)<0.01?'<span class=pos>PS Nợ = PS Có</span>':'<span class=mut>PS Nợ ≠ PS Có (do lọc TK / đối tượng – bình thường)</span>'}. Nhấn đúp để xem bút toán.</div></div></div>
      <div class="tbl" style="max-height:calc(100vh - 360px)"><table><thead><tr>${head.map(h=>`<th rowspan=2${h[0]==='#'?' class=n':''}>${h.replace('#','')}</th>`).join('')}<th colspan=2 style="text-align:center">Số dư đầu kỳ</th><th colspan=2 style="text-align:center">Phát sinh trong kỳ</th><th colspan=2 style="text-align:center">Số dư cuối kỳ</th></tr><tr><th class=n>Nợ</th><th class=n>Có</th><th class=n>Nợ</th><th class=n>Có</th><th class=n>Nợ</th><th class=n>Có</th></tr></thead><tbody>
      ${L.slice(0,3000).map((o,i)=>`<tr class="dbl" data-pti="${i}">${cells(o)}<td class=n>${nv(sp(o.ob,1))}</td><td class=n>${nv(sp(o.ob,-1))}</td><td class=n>${nv(o.dr)}</td><td class=n>${nv(o.cr)}</td><td class=n>${nv(sp(o.cb,1))}</td><td class=n>${nv(sp(o.cb,-1))}</td></tr>`).join('')}
      ${L.length>3000?`<tr><td colspan=${head.length+6} class=mut style="text-align:center">… còn ${num(L.length-3000)} dòng – lọc thêm hoặc xuất Excel</td></tr>`:''}
      <tr style="font-weight:700;background:#FFF6F2"><td colspan=${head.length}>TỔNG CỘNG</td>${['obDr','obCr','dr','cr','cbDr','cbCr'].map(k=>`<td class=n>${fmt2(t[k])}</td>`).join('')}</tr></tbody></table></div></div>`;
    $('#ptBody').ondblclick=e=>{const tr=e.target.closest('[data-pti]');if(!tr)return;const o=L[+tr.dataset.pti];
      finDrawer(V==='a'?'TK '+o.acc:(o.p+(V==='pa'?' · TK '+o.acc:'')),'CĐPS theo đối tượng · kỳ '+per,{accs:V==='p'?(accs.length?accs:['1','2','3','4']):[o.acc],from:FP.from,to:FP.to,...(V==='a'?{}:{bp:o.p==='(không có đối tượng)'?'':o.p})})};
    $('#ptXls').onclick=async()=>{try{const f=await api.xlsxSheets(`AccSoft_CDPS_DoiTuong_${FP.from}_${FP.to}.xlsx`,[['CDPS theo doi tuong',r.rows.map(o=>({'Đối tượng':o.p,'Nhóm':o.kind,'Công ty nội bộ':o.coKey,'TK':o.acc,'Tên tài khoản':o.accName,'Dư Nợ đầu kỳ':sp(o.ob,1),'Dư Có đầu kỳ':sp(o.ob,-1),'PS Nợ':o.dr,'PS Có':o.cr,'Dư Nợ cuối kỳ':sp(o.cb,1),'Dư Có cuối kỳ':sp(o.cb,-1)})).concat([{'Đối tượng':'TỔNG CỘNG','Dư Nợ đầu kỳ':t.obDr,'Dư Có đầu kỳ':t.obCr,'PS Nợ':t.dr,'PS Có':t.cr,'Dư Nợ cuối kỳ':t.cbDr,'Dư Có cuối kỳ':t.cbCr}])],['Thong tin',[{'Kỳ':per,'Tài khoản':r.accs.join(', ')||'Mọi TK có đối tượng','Nhóm đối tượng':FP.ptbKind||'Tất cả','Công ty nội bộ':FP.ptbCo||'—','Tìm':FP.ptbQ}]]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}}}
  if(FT==='kq'){FP.kqSec??='both';FP.kqM??=false;if(FP.kqZv!==2){FP.kqZ=false;FP.kqZv=2}
    const cols=[{key:'cur',from:FP.from,to:FP.to},...(cmp[0]?[{key:'prev',from:cmp[0],to:cmp[1]}]:[])];
    const months=FP.kqM?yms.filter(m=>m>=FP.from&&m<=FP.to):[];months.forEach(m=>cols.push({key:'m'+m,from:m,to:m}));
    B.innerHTML='<div class="card"><span class="spin"></span> Đang lập báo cáo theo mẫu…</div>';
    let r=await aq('kqCompute',cols);if(!r.lines.some(l=>l.map)){await aq('kqAutoMap');r=await aq('kqCompute',cols)} // lần đầu: tự ánh xạ theo tên khoản mục
    const V=k=>r.values[cols.findIndex(c=>c.key===k)]||{},r0auto=r.autoOn;
    const pct=l=>/Tỷ|Margin|Thuế suất|Tỷ lê/i.test(l.vn+' '+l.en)&&l.kind!=='leaf',F=(l,v)=>v==null?'':pct(l)?(Math.abs(v)<1e-9?'':(v*100).toFixed(1)+'%'):N(v);
    const T=r.totals[0],okR=Math.abs(T.rev-T.mRev)<0.01,okE=Math.abs(T.exp-T.mExp)<0.01;
    const L=r.lines.filter(l=>l.kind!=='label'&&(FP.kqSec==='both'||l.sec===FP.kqSec)).filter(l=>!FP.kqZ||l.sec==='sum'||l.kind!=='leaf'||cols.some((c,i)=>Math.abs(r.values[i][l.row]||0)>0.004));
    B.innerHTML=`<div class="card"><div class="filterrow"><label>Phần <select data-kq="kqSec"><option value="both" ${FP.kqSec==='both'?'selected':''}>Tóm tắt + chi tiết</option><option value="sum" ${FP.kqSec==='sum'?'selected':''}>Chỉ tóm tắt</option><option value="det" ${FP.kqSec==='det'?'selected':''}>Chỉ chi tiết</option></select></label>
      <label><input type="checkbox" data-kq="kqM" ${FP.kqM?'checked':''}>Hiện từng tháng trong kỳ</label><label><input type="checkbox" data-kq="kqZ" ${FP.kqZ?'checked':''}>Ẩn dòng chi tiết bằng 0</label><label title="Doanh thu / chi phí chưa ánh xạ tay được tự xếp vào chỉ tiêu: doanh thu theo TK + tên loại doanh thu; chi phí theo TK (632 → giá vốn khác, 635 → phí tài chính khác, 811 → chi trả khác, còn lại → chi phí bằng tiền khác)"><input type="checkbox" id="kqAuto" ${r0auto?'checked':''}>Tự phân loại phần chưa ánh xạ</label>
      <div style="flex:1"></div><button class="btn sm" id="kqMap">Ánh xạ chỉ tiêu</button><button class="btn sm" id="kqPar">Tham số</button><button class="btn sm ghost" id="kqTpl">Nạp mẫu khác</button><button class="btn sm" id="kqXls">${ic('download')}Xuất Excel</button></div></div>
      ${(()=>{const b=r.b02[0];if(!b)return '';const e=V('cur')[68]||0,p=V('cur')[76]||0,o1=Math.abs(e-b.pbt)<0.01,o2=Math.abs(p-b.pat)<0.01;
        return `<div class="card" style="background:${o1&&o2?'#ECFDF3':'#FEF3F2'}"><b>${o1&&o2?'✓ Khớp báo cáo tài chính (B02-DN)':'⚠ Chưa khớp B02-DN'}:</b> EBT (100% CLTG) ${fmt2(e)} ${o1?'=':'≠'} LN trước thuế B02 (mã 50) ${fmt2(b.pbt)} · LNST (100% CLTG) ${fmt2(p)} ${o2?'=':'≠'} LN sau thuế B02 (mã 60) ${fmt2(b.pat)}${o1&&o2?'':` · lệch EBT ${fmt2(e-b.pbt)}, LNST ${fmt2(p-b.pat)}`} · thuế TNDN: 8211 → dòng 11 (hiện hành), 8212 → dòng 12 (hoãn lại)</div>`})()}
      <div class="card" style="background:${okR&&okE?'#ECFDF3':'#FFFAEB'}"><b>Đối chiếu với sổ (kỳ ${per}):</b> doanh thu TK 511/512/515/711 (trừ 521) ${fmt2(T.rev)} – đã vào mẫu ${fmt2(T.mRev)} ${okR?'✓':`<span class=neg>(chưa ánh xạ ${fmt2(T.rev-T.mRev)})</span>`} · chi phí TK 621–627, 632, 635, 641, 642, 811 ${fmt2(T.exp)} – đã vào mẫu ${fmt2(T.mExp)} ${okE?'✓':`<span class=neg>(chưa ánh xạ ${fmt2(T.exp-T.mExp)})</span>`}
        ${r.unmapped.length?`<details style="margin-top:8px"><summary style="cursor:pointer">${num(r.unmapped.length)} khoản mục / loại doanh thu chưa vào mẫu – bấm để xem và gán nhanh</summary>${tbl0(['Loại','Khoản mục / loại doanh thu trong dữ liệu','TK','#Kỳ này','Gán vào chỉ tiêu'],r.unmapped.map((u,i)=>`<tr><td>${u.kind==='cost'?'Chi phí':'Doanh thu'}</td><td>${esc(u.key||'(trống)')}</td><td>${u.acc}</td><td class=n>${fmt2(u.v[0])}</td><td><input list="kqLeafL" data-kqu="${i}" placeholder="Chọn chỉ tiêu (gõ để tìm)…" style="width:340px"></td></tr>`))}</details>`:''}</div>
      <datalist id="kqLeafL">${r.lines.filter(l=>l.kind==='leaf').map(l=>`<option value="${l.row} · ${esc(l.vn||l.en)}">${esc(l.en)}</option>`).join('')}</datalist>
      <div class="card"><div class="card-h"><div><h3>BÁO CÁO KẾT QUẢ KINH DOANH (theo mẫu đơn vị)</h3><div class="hint">Kỳ ${per}${cmp[0]?` · so sánh ${ymLbl(cmp[0])} – ${ymLbl(cmp[1])}`:''} · chi phí = Nợ − Có TK 6xx/8xx theo khoản mục; doanh thu = Có − Nợ TK 5xx/7xx theo loại doanh thu (không gồm kết chuyển 911) · dòng đậm = công thức của mẫu · nhấn đúp dòng lá để xem bút toán</div></div></div>
      <div class="tbl" style="max-height:calc(100vh - 330px)"><table data-nosort><thead><tr><th>STT</th><th>Khoản mục (Tiếng Anh)</th><th>Khoản mục (Tiếng Việt)</th><th class=n>Kỳ này</th>${cmp[0]?'<th class=n>Cùng kỳ</th><th class=n>Chênh lệch</th><th class=n>%</th>':''}${months.map(m=>`<th class=n>${ymLbl(m)}</th>`).join('')}<th>Ánh xạ</th></tr></thead><tbody>
      ${L.map(l=>{const a=V('cur')[l.row],b=cmp[0]?V('prev')[l.row]:null,bold=l.kind==='calc',sumH=l.sec==='det'&&/^[A-Z]$/.test(l.stt);
        return `<tr class="${l.kind==='leaf'?'dbl':''}" data-kql="${l.row}" style="${bold?'font-weight:'+(sumH||/^\d+$/.test(l.stt)?700:600)+';':''}${sumH?'background:#FFF6F2;':''}"><td class=nw>${esc(l.stt)}</td><td style="font-size:12px">${esc(l.en)}</td><td>${esc(l.vn)}</td><td class=n>${F(l,a)}</td>${cmp[0]?`<td class=n>${F(l,b)}</td><td class=n>${pct(l)?'':N(a-b)}</td>${pct(l)?'<td></td>':chgTd(a,b,l.sec==='det'&&l.row>=160||/chi phí|Thuế/i.test(l.vn)?-1:1)}`:''}${months.map(m=>`<td class=n>${F(l,V('m'+m)[l.row])}</td>`).join('')}<td style="font-size:11px" class=mut title="${esc((l.auto||[]).join('\n'))}">${l.kind==='leaf'&&!l.map&&l.auto?`<span class="badge">tự động · ${l.auto.length} loại</span>`:l.kind==='leaf'?(l.map?[...l.map.cost,...l.map.rev.map(x=>String(x).split('_')[0]),...l.map.acc.map(x=>'TK '+x.p)].slice(0,3).join(', ')+((l.map.cost.length+l.map.rev.length+l.map.acc.length)>3?'…':''):'<span class=neg>chưa ánh xạ</span>'):l.kind==='param'?'tham số':''}</td></tr>`}).join('')}</tbody></table></div></div>`;
    B.querySelectorAll('[data-kq]').forEach(el=>el.addEventListener('change',e=>{e.stopPropagation();FP[el.dataset.kq]=el.type==='checkbox'?el.checked:el.value;vFin()}));
    B.querySelectorAll('[data-kqu]').forEach(el=>el.addEventListener('change',async e=>{e.stopPropagation();const row=+String(el.value).split(' ')[0];if(!row)return;const u=r.unmapped[+el.dataset.kqu],m=(r.lines.find(l=>l.row===row)||{}).map||{cost:[],rev:[],acc:[]};
      if(u.kind==='cost')m.cost=[...new Set([...(m.cost||[]),String(u.key).split('_')[0]])];else m.rev=[...new Set([...(m.rev||[]),u.key])];await aq('kqSetMap',row,{...m,note:'gán từ danh sách chưa ánh xạ'});vFin()}));
    B.ondblclick=e=>{const tr=e.target.closest('[data-kql]');if(!tr)return;const l=r.lines.find(x=>x.row===+tr.dataset.kql);if(!l||l.kind!=='leaf'||!l.map)return;const m=l.map;
      const spec=m.cost.length?{accs:['6','8'],tc:m.cost}:m.rev.length?{accs:['5','7'],tr:m.rev}:{accs:m.acc.map(x=>x.p)};finDrawer(l.vn||l.en,'KQKD theo mẫu · dòng '+l.row+' · kỳ '+per,{...spec,from:FP.from,to:FP.to,pl:true})};
    $('#kqMap').onclick=()=>kqMapDrawer(r);$('#kqAuto').onchange=async e=>{e.stopPropagation();await aq('kqSetAutoRev',e.target.checked);vFin()};
    $('#kqPar').onclick=async()=>{const ps=r.lines.filter(l=>l.kind==='param');const nv={};for(const l of ps){const v=prompt(`${l.vn} (dòng ${l.row}) – nhập số (vd 0.1 = 10%):`,r.params[l.row]??l.param);if(v===null)return;nv[l.row]=+v||0}await aq('kqSetParams',nv);vFin()};
    $('#kqTpl').onclick=async()=>{if(!await ask('Nạp file mẫu khác thay mẫu hiện tại? Ánh xạ theo số dòng sẽ được giữ.'))return;try{const x=await api.kqTemplate();if(x){alert(`Đã nạp mẫu ${x.file} (${num(x.n)} dòng)`);vFin()}}catch(e){alert(e.message)}};
    $('#kqXls').onclick=async()=>{const rows=r.lines.filter(l=>l.kind!=='label'&&(FP.kqSec==='both'||l.sec===FP.kqSec)).map(l=>Object.assign({'STT':l.stt,'Khoản mục (Tiếng Anh)':l.en,'Khoản mục (Tiếng Việt)':l.vn,'Kỳ này':V('cur')[l.row]},cmp[0]?{'Cùng kỳ':V('prev')[l.row],'Chênh lệch':pct(l)?null:V('cur')[l.row]-V('prev')[l.row]}:{},...months.map(m=>({[ymLbl(m)]:V('m'+m)[l.row]}))));
      try{const f=await api.xlsxSheets(`AccSoft_KQKD_Mau_${FP.from}_${FP.to}.xlsx`,[['KQKD theo mau',rows],...(r.unmapped.length?[['Chua anh xa',r.unmapped.map(u=>({'Loại':u.kind==='cost'?'Chi phí':'Doanh thu','Khoản mục / loại doanh thu':u.key,'TK':u.acc,'Kỳ này':u.v[0]}))]]:[])]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};}
  if(FT==='bs'){const r=await aq('finBalance',FP.from,FP.to),ok=Math.abs(r.diff)<0.01;
    B.innerHTML=`<div class="card"><div class="card-h"><div><h3>BÁO CÁO TÌNH HÌNH TÀI CHÍNH (Mẫu B01-DN – TT99/2025)</h3><div class="hint">Tại ngày cuối tháng ${ymLbl(FP.to)}; số đầu kỳ tại cuối tháng trước ${ymLbl(FP.from)} · ${ok?'<span class=pos>✓ Tổng tài sản = Tổng nguồn vốn</span>':`<span class=neg>Chênh lệch ${fmt2(r.diff)}</span>`} · Công nợ 131/331/138/338/141/136/336 tách dư Nợ – dư Có theo từng đối tượng.</div></div></div>
      ${r.unmapped.length?`<p class=neg style="font-size:13px">TK chưa đưa vào chỉ tiêu: ${r.unmapped.map(u=>esc(u.a)+' ('+fmt2(u.bal)+')').join(', ')}</p>`:''}
      <div class="tbl" style="max-height:calc(100vh - 300px)"><table><thead><tr><th>Chỉ tiêu</th><th>Mã số</th><th class=n>Số cuối kỳ</th><th class=n>Số đầu kỳ</th></tr></thead><tbody>
      ${r.lines.map(l=>`<tr style="${l.lvl===0?'font-weight:700;background:#FFF6F2':l.lvl===1?'font-weight:600':''}"${BACC[l.code]?` class="dbl" data-bsk="${l.code}" title="Nhấn đúp: xem số liệu cấu thành"`:''}><td style="padding-left:${12+l.lvl*18}px">${esc(l.name)}</td><td>${/^\d+$/.test(l.code)?l.code:''}</td><td class=n>${N(l.cb)}</td><td class=n>${N(l.ob)}</td></tr>`).join('')}</tbody></table></div><p class="mut" style="font-size:12px">Nhấn đúp một chỉ tiêu để xem TK và bút toán cấu thành. Chỉ tiêu công nợ tách dư Nợ / dư Có theo đối tượng nên số chỉ tiêu có thể khác số dư thuần của TK.</p></div>`;
    B.ondblclick=e=>{const tr=e.target.closest('[data-bsk]');if(tr)finDrawer(tr.cells[0].innerText.trim()+' (mã '+tr.dataset.bsk+')','B01-DN · tại '+ymLbl(FP.to)+' · phát sinh kỳ '+per,{accs:BACC[tr.dataset.bsk],from:FP.from,to:FP.to})}}
  if(FT==='pl'){const r=await aq('finIncome',FP.from,FP.to,cmp[0],cmp[1]);
    B.innerHTML=`<div class="card"><div class="card-h"><div><h3>BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH (Mẫu B02-DN – TT99/2025)</h3><div class="hint">Kỳ ${per}${cmp[0]?` · so sánh ${ymLbl(cmp[0])} – ${ymLbl(cmp[1])}`:''} · loại trừ bút toán kết chuyển 911</div></div></div>
      <div class="tbl"><table><thead><tr><th>Chỉ tiêu</th><th>Mã số</th><th class=n>Kỳ này</th>${cmp[0]?'<th class=n>Kỳ so sánh</th><th class=n>Chênh lệch</th><th class=n>%</th>':''}</tr></thead><tbody>
      ${r.lines.map(l=>`<tr style="${l.bold?'font-weight:700;background:#FFF6F2':''}" class="dbl" data-plk="${l.k}"><td>${esc(l.name)}</td><td>${l.code}</td><td class=n>${N(l.cur)}</td>${cmp[0]?`<td class=n>${N(l.prev)}</td><td class=n>${N(l.cur-l.prev)}</td>${chgTd(l.cur,l.prev,['11','22','25','26','32','51','02'].includes(l.code)?-1:1)}`:''}</tr>`).join('')}</tbody></table></div><p class="mut" style="font-size:12px">Nhấn đúp một chỉ tiêu để xem bút toán chi tiết.</p></div>`;
    B.ondblclick=e=>{const tr=e.target.closest('[data-plk]');if(tr)finDrawer(tr.cells[0].innerText,'B02-DN · kỳ '+per,{accs:plAccs(tr.dataset.plk),from:FP.from,to:FP.to,pl:true})}}
  if(FT==='cf'){const r=await aq('finCash',FP.from,FP.to),M=FP.cfm||'d',L=M==='d'?r.direct:r.indirect,L0=M==='d'?r.directBefore:r.indirectBefore,ok=Math.abs(r.check)<0.01;
    const bv=new Map(L0.map(l=>[l.code+'|'+l.name,l.v]));
    B.innerHTML=(r.hasOpening?'':`<div class="card" style="background:#FFFAEB"><b>Không có số dư đầu kỳ</b> – tiền đầu kỳ = 0.</div>`)+`<div class="card"><div class="card-h"><div><h3>BÁO CÁO LƯU CHUYỂN TIỀN TỆ (Mẫu B03-DN – TT99/2025) · ${M==='d'?'Phương pháp trực tiếp':'Phương pháp gián tiếp'}</h3>
      <div class="hint">Kỳ ${per} · Tiền = TK 111, 112, 113 · ${ok?'<span class=pos>✓ Tiền đầu kỳ + lưu chuyển = tiền cuối kỳ trên sổ</span>':`<span class=neg>Lệch ${fmt2(r.check)}</span>`} · Trước điều chỉnh = dòng tiền nhân viên chọn trên ERP (chưa chọn thì phân loại theo TK đối ứng) · <b>${num(r.adjN)}</b> bút toán đã điều chỉnh${r.noCf.n?` · <span class=neg>${num(r.noCf.n)} bút toán tiền chưa chọn dòng tiền</span>`:''}</div></div><div class="sp" style="flex:1"></div>
      <button class="btn sm" id="cfAll">Rà soát & điều chỉnh dòng tiền</button><div class="tabs" id="cfM"><button data-cfm="d" class="${M==='d'?'on':''}">Trực tiếp</button><button data-cfm="i" class="${M==='i'?'on':''}">Gián tiếp</button></div></div>
      <div class="tbl"><table><thead><tr><th>Chỉ tiêu</th><th>Mã số</th><th class=n>Trước điều chỉnh</th><th class=n>Sau điều chỉnh</th><th class=n>Chênh lệch</th></tr></thead><tbody>
      ${L.map(l=>{const b=bv.get(l.code+'|'+l.name),d=l.v!=null&&b!=null?l.v-b:0,click=l.code&&(/^(2[1-7]|3[1-6]|61)$/.test(l.code)||(M==='d'?/^0[1-7]$/.test(l.code):!!(l.accs&&l.accs.length)));
        return `<tr style="${l.bold?'font-weight:700;background:#FFF6F2':''}"${click?` class="dbl" data-cfc="${l.code}" title="Nhấn đúp: xem bút toán gốc${M==='d'?' & điều chỉnh dòng tiền':''}"`:''}><td style="padding-left:${l.code&&!l.bold?30:12}px">${esc(l.name)}</td><td>${l.code}</td><td class=n>${l.v==null?'':N(b)}</td><td class=n>${l.v==null?'':N(l.v)}</td><td class=n>${Math.abs(d)>=0.005?N(d):''}</td></tr>`}).join('')}</tbody></table></div>
      ${M==='i'?`<p class="mut" style="font-size:12px">Lập từ biến động Nợ − Có trong kỳ của từng TK không phải tiền (bút toán kép), loại phần thu/chi tiền đã xếp vào đầu tư/tài chính theo <b>dòng tiền sau điều chỉnh</b> → mục II, III (vd mã 21 mua sắm TSCĐ) bằng đúng báo cáo trực tiếp sau điều chỉnh; các khoản phải trả, phải thu… tự cân đối lại. ${Math.abs(r.indCheck)<0.01?'<span class=pos>✓ Mã 20 gián tiếp = mã 20 trực tiếp</span>':`<span class=neg>Lệch với trực tiếp ${fmt2(r.indCheck)}</span>`} · ${Math.abs(r.indirect[1].v-r.pbtB02)<0.01?'<span class=pos>✓ Lợi nhuận trước thuế khớp B02 (mã 50)</span>':`<span class=neg>LNTT khác B02: ${fmt2(r.pbtB02)}</span>`}</p>`:`<p class="mut" style="font-size:12px">Nhấn đúp một chỉ tiêu để xem bút toán tiền gốc và điều chỉnh dòng tiền nhân viên chọn sai.</p>`}</div>
      ${M==='i'&&r.indOther.length?`<div class="card"><div class="card-h"><div><h3>Chi tiết mã 07 – Các khoản điều chỉnh khác</h3><div class="hint">Biến động phi tiền tệ của TK ngoài vốn lưu động (vd mua TSCĐ/XDCB ghi nhận qua công nợ: Nợ 211, 241 / Có 331). Số âm = tăng tài sản.</div></div></div>${tbl(['TK','Tên tài khoản','#Điều chỉnh'],r.indOther.map(o=>`<tr class="dbl" data-cfa="${esc(o.a)}"><td>${esc(o.a)}</td><td>${esc(o.n)}</td><td class=n>${N(o.v)}</td></tr>`))}</div>`:''}
      ${M==='d'?`<div class="card"><div class="card-h"><div><h3>Dòng tiền sau điều chỉnh theo TK đối ứng</h3><div class="hint">Nhấn đúp để xem bút toán gốc của mã dòng tiền đó.</div></div></div>
      ${tbl(['Mã số','Thu / Chi','TK đối ứng','Tên TK','#Số tiền'],r.detail.map(d=>`<tr class="dbl" data-cfc="${d.code}"><td>${d.code}</td><td>${d.dir}</td><td>${esc(d.a)}</td><td>${esc(d.n)}</td><td class=n>${N(d.v)}</td></tr>`))}</div>`:''}`;
    $('#cfM').onclick=e=>{const b=e.target.closest('[data-cfm]');if(b){FP.cfm=b.dataset.cfm;vFin()}};
    $('#cfAll').onclick=()=>cfDrawer('','Rà soát toàn bộ dòng tiền',vFin);
    B.ondblclick=e=>{const a=e.target.closest('[data-cfa]');if(a)return finDrawer('TK '+a.dataset.cfa,'B03 gián tiếp · mã 07 · kỳ '+per,{accs:[a.dataset.cfa],from:FP.from,to:FP.to});
      const tr=e.target.closest('[data-cfc]');if(!tr)return;const c=tr.dataset.cfc;
      if(M==='d'||/^(2[1-7]|3[1-6]|61)$/.test(c))return cfDrawer(c,`${c} – ${r.codes[c]||''}`,vFin);
      const l=L.find(x=>x.code===c);finDrawer(l.name,'B03 gián tiếp · kỳ '+per,{accs:l.accs,from:FP.from,to:FP.to,pl:c==='01'})}}
  if(FT==='nt'){const [r,saved]=await Promise.all([aq('finNotes',FP.from,FP.to),aq('getB09Info')]),T=Object.assign(b09Def(r.currency),saved||{});
    const H=(c,t,body)=>`<div class="card"><div class="card-h"><h3>${c}. ${esc(t)}</h3></div>${body}</div>`;
    const mt=s=>{const c=s.cols||['Đầu kỳ','Tăng','Giảm','Cuối kỳ'];return `<div class="tbl"><table><thead><tr><th>Tài khoản</th><th class=n>${c[0]||'Đầu kỳ'}</th><th class=n>${c[1]}</th><th class=n>${c[2]}</th><th class=n>${c[3]}</th></tr></thead><tbody>${s.rows.map(x=>`<tr><td>${esc(x.a)} – ${esc(x.n)}</td><td class=n>${c[0]===''?'':N(x.ob)}</td><td class=n>${N(x.inc)}</td><td class=n>${N(x.dec)}</td><td class=n><b>${N(x.cb)}</b></td></tr>`).join('')||'<tr><td colspan=5 class=mut>Không phát sinh</td></tr>'}
      <tr style="font-weight:700;background:#FFF6F2"><td>Cộng</td><td class=n>${c[0]===''?'':N(s.tot.ob)}</td><td class=n>${N(s.tot.inc)}</td><td class=n>${N(s.tot.dec)}</td><td class=n>${N(s.tot.cb)}</td></tr></tbody></table></div>`};
    const tp=s=>`<div class="tbl"><table><thead><tr><th>Đối tượng</th><th class=n>Cuối kỳ</th></tr></thead><tbody>${s.rows.map(x=>`<tr><td>${esc(x.p)}</td><td class=n>${N(x.v)}</td></tr>`).join('')}<tr><td>Các đối tượng khác (${num(Math.max(0,s.count-s.rows.length))})</td><td class=n>${N(s.other)}</td></tr><tr style="font-weight:700;background:#FFF6F2"><td>Cộng cuối kỳ · đầu kỳ ${fmt2(s.ob)}</td><td class=n>${N(s.total)}</td></tr></tbody></table></div>`;
    const kv=s=>`<div class="tbl"><table><tbody>${s.rows.map(([k,v])=>`<tr><td>${esc(k)}</td><td class=n>${N(v)}</td></tr>`).join('')}</tbody></table></div>`;
    const TX=[['I','Đặc điểm hoạt động của doanh nghiệp','p1'],['II','Kỳ kế toán, đơn vị tiền tệ sử dụng trong kế toán','p2'],['III','Chuẩn mực và chế độ kế toán áp dụng','p3'],['IV','Các chính sách kế toán áp dụng','p4']];
    B.innerHTML=`<div class="card"><div class="card-h"><div><h3>THUYẾT MINH BÁO CÁO TÀI CHÍNH (Mẫu B09-DN – TT99/2025)</h3><div class="hint">Kỳ ${per}. Phần I–IV và VII là nội dung văn bản – sửa trực tiếp rồi bấm Lưu (dùng lại cho các kỳ sau). Phần V–VI lập tự động từ số liệu, khớp với B01/B02.</div></div><div class="sp" style="flex:1"></div><button class="btn primary" id="b09Save">Lưu nội dung</button></div></div>`+
      TX.map(([c,t,k])=>H(c,t,`<textarea data-b09="${k}" rows="${Math.min(14,Math.max(4,String(T[k]).split('\n').length+1))}" style="width:100%;font:inherit;padding:10px;border:1px solid var(--gray-300,#D5D7DA);border-radius:8px">${esc(T[k])}</textarea>`)).join('')+
      `<h3 style="margin:8px 0 0">V. Thông tin bổ sung cho các khoản mục trình bày trong Báo cáo tình hình tài chính</h3>`+r.sections.filter(s=>s.code.startsWith('V.')).map(s=>H(s.code,s.title,s.type==='mov'?mt(s):s.type==='top'?tp(s):kv(s))).join('')+
      `<h3 style="margin:8px 0 0">VI. Thông tin bổ sung cho các khoản mục trình bày trong Báo cáo kết quả hoạt động kinh doanh</h3>`+r.sections.filter(s=>s.code.startsWith('VI.')).map(s=>H(s.code,s.title,s.type==='mov'?mt(s):s.type==='top'?tp(s):kv(s))).join('')+
      H('VII','Những thông tin khác',`<textarea data-b09="p7" rows="5" style="width:100%;font:inherit;padding:10px;border:1px solid var(--gray-300,#D5D7DA);border-radius:8px">${esc(T.p7)}</textarea>`);
    $('#b09Save').onclick=async()=>{const o={};$$('[data-b09]').forEach(x=>o[x.dataset.b09]=x.value);await aq('setB09Info',o);alert('Đã lưu nội dung thuyết minh.')}}
  FP._cmp=cmp;
}
function b09Def(cur){return {
  p1:'1. Hình thức sở hữu vốn: …\n2. Lĩnh vực kinh doanh: Viễn thông\n3. Ngành nghề kinh doanh: Cung cấp dịch vụ viễn thông di động, cố định, Internet và giá trị gia tăng\n4. Chu kỳ sản xuất, kinh doanh thông thường: 12 tháng\n5. Đặc điểm hoạt động trong năm có ảnh hưởng đến BCTC: …\n6. Cấu trúc doanh nghiệp: …',
  p2:`1. Kỳ kế toán năm bắt đầu từ ngày 01/01 và kết thúc vào ngày 31/12.\n2. Đơn vị tiền tệ sử dụng trong kế toán: ${cur}.`,
  p3:'1. Chế độ kế toán áp dụng: Chế độ kế toán doanh nghiệp ban hành theo Thông tư số 99/2025/TT-BTC của Bộ Tài chính.\n2. Tuyên bố về việc tuân thủ Chuẩn mực kế toán và Chế độ kế toán: Ban Giám đốc đảm bảo đã tuân thủ yêu cầu của các chuẩn mực kế toán và Chế độ kế toán doanh nghiệp hiện hành trong việc lập và trình bày báo cáo tài chính.',
  p4:'1. Tiền và các khoản tương đương tiền: gồm tiền mặt, tiền gửi ngân hàng không kỳ hạn, tiền đang chuyển.\n2. Các khoản đầu tư tài chính: tiền gửi có kỳ hạn được ghi nhận theo giá gốc.\n3. Nợ phải thu: theo dõi chi tiết theo đối tượng, kỳ hạn; lập dự phòng phải thu khó đòi theo quy định.\n4. Hàng tồn kho: ghi nhận theo giá gốc; giá xuất kho theo phương pháp …; hạch toán theo phương pháp kê khai thường xuyên.\n5. Tài sản cố định: ghi nhận theo nguyên giá; khấu hao theo phương pháp đường thẳng dựa trên thời gian sử dụng ước tính.\n6. Chi phí trả trước: phân bổ vào chi phí theo thời gian hưởng lợi.\n7. Chi phí phải trả: trích trước các khoản chi phí đã phát sinh trong kỳ nhưng chưa có hoá đơn, chứng từ; khi có chứng từ thực tế thì huỷ / quyết toán số đã trích.\n8. Doanh thu: ghi nhận khi dịch vụ đã cung cấp và xác định được kết quả.\n9. Ngoại tệ: các nghiệp vụ phát sinh bằng ngoại tệ quy đổi theo tỷ giá thực tế tại ngày giao dịch.',
  p7:'Những sự kiện phát sinh sau ngày kết thúc kỳ kế toán: …\nThông tin về các bên liên quan: …'}}
$('#fnTabs').onclick=e=>{const b=e.target.closest('[data-f]');if(!b)return;FT=b.dataset.f;ls.set('finTab',FT);loadWith('fin:'+FT,$('#fin'),vFin)};
$('#fnCtl').onchange=e=>{const k=e.target.dataset.fk;if(!k)return;FP[k]=e.target.value;if(FP.mode==='r'&&FP.from>FP.to)k==='from'?FP.to=FP.from:FP.from=FP.to;ls.set('finPick',{from:FP.from,to:FP.to,level:FP.level,cmp:FP.cmp,mode:FP.mode,pm:FP.pm,pq:FP.pq,py:FP.py});vFin()};
$('#fnXls').onclick=async()=>{try{const f=await api.finXlsx({b09Def:b09Def('USD'),from:FP.from,to:FP.to,level:+FP.level,cmpFrom:FP._cmp?.[0],cmpTo:FP._cmp?.[1]});if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};

// Trang phân tích theo nhóm đối tượng không có số liệu: chỉ rõ nguyên nhân (chưa nạp danh mục / chưa phân nhóm / không phát sinh trong kỳ)
async function grpEmpty(title,kinds){const st=await aq('catStats'),inData=kinds.reduce((s,k)=>s+(st.byKind[k]||0),0);
  const why=!st.catalog?`<b>Chưa nạp danh mục đối tượng.</b> Ứng dụng cần biết đối tượng nào thuộc nhóm ${kinds.join(', ')}. Bấm nút dưới để nạp file danh mục (ví dụ <code>2026.10_DANH_MUC_KHACH_HANG_TIMOR.xlsx</code>) – chỉ cần làm một lần.`
    :!inData?`Danh mục có ${num(st.catalog)} đối tượng nhưng <b>không đối tượng nào trong dữ liệu thuộc nhóm ${kinds.join(', ')}</b>. Kiểm tra cột "Kind Of Customer" của các đối tượng nội bộ / quốc tế trong Danh mục đối tượng.`
    :`Dữ liệu có ${num(inData)} đối tượng thuộc nhóm ${kinds.join(', ')} nhưng <b>không có phát sinh phù hợp trong kỳ ${ymLbl(DPS.from)} – ${ymLbl(DPS.end)}</b>. Thử chọn kỳ rộng hơn.`;
  setTimeout(()=>{const b=$('#grpImp');if(b)b.onclick=async()=>{try{const r=await api.catImport('merge');if(r){alert(`Đã nạp ${num(r.n)} đối tượng từ ${r.file}.`);vDeep()}}catch(e){alert(e.message)}};const g=$('#grpGo');if(g)g.onclick=()=>go('cat')});
  return `<div class="card"><div class="card-h"><h3>${title}</h3></div><p>${why}</p><div class="row" style="gap:8px">${!st.catalog?`<button class="btn primary" id="grpImp">${ic('upload')}Nạp file danh mục đối tượng</button>`:''}<button class="btn" id="grpGo">Mở Danh mục đối tượng</button></div>
    <p class="mut" style="font-size:12px;margin-top:10px">Danh mục: ${num(st.catalog)} đối tượng · dữ liệu có ${num(st.partners)} đối tượng, khớp danh mục ${num(st.matched)} · ${Object.entries(st.byKind).map(([k,n])=>esc(k)+': '+num(n)).join(' · ')}</p></div>`;
}

/* ---------- Giao dịch nội bộ: tổng hợp kỳ · số dư · chi tiết · theo năm ---------- */
const IG=Object.assign({m:'sum',co:'',tt:false,ex:false,years:[],par:'TFU,VTC,STL,VTG',split:true},ls.get('igPick',{}));
/* ---- Lưới bút toán nội bộ: lọc / tìm kiếm / loại khỏi nội bộ / gán lại công ty ---- */
const IGF0={q:'',cat:'',co:'',acc:'',min:'',max:'',fl:'',sort:'d'},IGF={...IGF0};
function igGrid(host,rows,cos,onChange,opt={}){const Q=x=>host.querySelector(x);if(!opt.keep)Object.assign(IGF,IGF0);
  const sel=new Set(),cats=[...new Set(rows.map(x=>x.cat))].sort(),cmp=[...new Set(rows.map(x=>x.company))].sort();
  const accs=[...new Set(rows.flatMap(x=>[x.drName||x.dr,x.crName||x.cr]))].filter(Boolean).sort();
  host.innerHTML=`<div class="card" style="gap:10px"><div class="row" style="flex-wrap:wrap;gap:8px;align-items:center">
    <input id="gQ" placeholder="Tìm chứng từ, diễn giải, đối tượng, người nhập…" style="flex:1;min-width:240px" value="${esc(IGF.q)}">
    <select id="gCat"><option value="">Mọi nghiệp vụ</option>${cats.map(c=>`<option ${IGF.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
    <select id="gCo"><option value="">Mọi công ty</option>${cmp.map(c=>`<option ${IGF.co===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
    <input id="gAcc" list="gAccL" placeholder="Tài khoản (vd 627, 13888)" style="width:170px" value="${esc(IGF.acc)}"><datalist id="gAccL">${accs.slice(0,500).map(a=>`<option value="${esc(a)}">`).join('')}</datalist>
    <input id="gMin" type="number" placeholder="Số tiền từ" style="width:110px" value="${esc(IGF.min)}"><input id="gMax" type="number" placeholder="đến" style="width:110px" value="${esc(IGF.max)}">
    <select id="gFl"><option value="">Tất cả dòng</option><option value="sus" ${IGF.fl==='sus'?'selected':''}>⚠ Nghi ngờ sai đối tượng</option><option value="est" ${IGF.fl==='est'?'selected':''}>Chỉ TK ước tính</option><option value="noest" ${IGF.fl==='noest'?'selected':''}>Không gồm ước tính</option><option value="adj" ${IGF.fl==='adj'?'selected':''}>Đã gán lại</option></select>
    <select id="gSort"><option value="d">Sắp theo ngày</option><option value="a" ${IGF.sort==='a'?'selected':''}>Số tiền giảm dần</option><option value="doc" ${IGF.sort==='doc'?'selected':''}>Theo chứng từ</option></select>
    <button class="btn sm ghost" id="gClr">Xoá lọc</button></div>
    <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center;background:#FFF6F2;padding:8px 10px;border-radius:8px">
    <b id="gInfo"></b><div style="flex:1"></div><span id="gSel" class="mut">Chưa chọn dòng</span>
    <input id="gNote" placeholder="Ghi chú lý do (tuỳ chọn)" style="width:200px">
    <button class="btn sm" id="gOut" disabled title="Bút toán không thuộc giao dịch nội bộ (nhân viên chọn nhầm đối tượng nội bộ)">Loại khỏi nội bộ</button>
    <button class="btn sm" id="gOutDoc" disabled title="Loại toàn bộ các dòng cùng chứng từ">Loại cả chứng từ</button>
    <select id="gTo" style="max-width:220px"><option value="">Gán lại sang công ty…</option>${cos.map(c=>`<option value="${esc(c.key)}">${esc(c.name)}</option>`).join('')}</select>
    <button class="btn sm primary" id="gMove" disabled>Gán lại</button></div><div id="gT"></div></div>`;
  let cur=[];
  const N=v=>v===''||v==null?null:+v;
  const apply=()=>{const q=IGF.q.trim().toLowerCase(),mn=N(IGF.min),mx=N(IGF.max),ac=IGF.acc.trim().toLowerCase();
    cur=rows.filter(x=>(!IGF.cat||x.cat===IGF.cat)&&(!IGF.co||x.company===IGF.co)&&(mn==null||x.a>=mn)&&(mx==null||x.a<=mx)
      &&(!ac||[x.dr,x.cr,x.drName,x.crName].some(v=>String(v||'').toLowerCase().includes(ac)))
      &&(!IGF.fl||(IGF.fl==='sus'?x.sus:IGF.fl==='est'?x.est:IGF.fl==='noest'?!x.est:x.adj))
      &&(!q||[x.doc,x.ds,x.bp,x.bpCr,x.u,x.company,x.drName,x.crName].some(v=>String(v||'').toLowerCase().includes(q))));
    cur.sort(IGF.sort==='a'?(a,b)=>b.a-a.a:IGF.sort==='doc'?(a,b)=>String(a.doc).localeCompare(b.doc)||a.d.localeCompare(b.d):(a,b)=>a.d.localeCompare(b.d)||String(a.doc).localeCompare(b.doc));
    Q('#gInfo').textContent=`${num(cur.length)} / ${num(rows.length)} dòng · tổng ${fmt2(cur.reduce((s,x)=>s+x.a,0))} · ${num(cur.filter(x=>x.sus).length)} dòng nghi ngờ`;
    const show=cur.slice(0,1000);
    Q('#gT').innerHTML=`<div class="tbl" style="max-height:${opt.h||'calc(100vh - 260px)'}"><table><thead><tr><th><input type="checkbox" id="gAll"></th><th>Ngày</th><th>Chứng từ</th><th>Công ty nội bộ</th><th>Nghiệp vụ</th><th>TK Nợ</th><th>TK Có</th><th>Đối tượng Nợ</th><th>Đối tượng Có</th><th class=n>Số tiền</th><th>Diễn giải</th><th>Người nhập</th></tr></thead><tbody>${show.map((x,i)=>`<tr${x.sus?' style="background:#FFFAEB"':''}><td><input type="checkbox" data-gi="${i}" ${sel.has(x.sig)?'checked':''}></td><td class=nw>${vn(x.d)}</td><td class=nw>${esc(x.doc)}</td><td>${esc(x.company)}${x.adj?` <span class="badge b-H">${esc(x.adj)}</span>`:''}</td><td style="font-size:12px">${esc(x.cat)}${x.est?' <span class="badge b-M">ước tính</span>':''}${x.sus?`<div class="badge b-H" title="${esc(x.sus)}">⚠ ${esc(x.sus)}</div>`:''}</td><td><div class="clamp s">${esc(x.drName||x.dr)}</div></td><td><div class="clamp s">${esc(x.crName||x.cr)}</div></td><td><div class="clamp s" title="${esc(x.bp||'')}">${esc(x.bp||'')}</div></td><td><div class="clamp s" title="${esc(x.bpCr||'')}">${esc(x.bpCr||'')}</div></td><td class=n>${fmt2(x.a)}</td><td><div class=clamp title="${esc(x.ds)}">${esc(x.ds)}</div></td><td class=nw>${esc(short(x.u))}</td></tr>`).join('')||'<tr><td colspan=12 class=mut style="text-align:center;padding:24px">Không có dòng phù hợp</td></tr>'}${cur.length>1000?`<tr><td colspan=12 class=mut style="text-align:center;padding:12px">… còn ${num(cur.length-1000)} dòng – thu hẹp bộ lọc</td></tr>`:''}</tbody></table></div>`;
    Q('#gAll').onchange=e=>{show.forEach(x=>e.target.checked?sel.add(x.sig):sel.delete(x.sig));apply()};upd()};
  const upd=()=>{const n=sel.size;Q('#gSel').textContent=n?`Đã chọn ${num(n)} dòng · ${fmt2(rows.filter(x=>sel.has(x.sig)).reduce((s,x)=>s+x.a,0))}`:'Chưa chọn dòng';['#gOut','#gOutDoc','#gMove'].forEach(s=>Q(s).disabled=!n)};
  const bind=(id,k,ev='input')=>{Q(id).addEventListener(ev,e=>{e.stopPropagation();IGF[k]=e.target.value;apply()})};
  [['#gQ','q'],['#gAcc','acc'],['#gMin','min'],['#gMax','max']].forEach(([i,k])=>bind(i,k));[['#gCat','cat'],['#gCo','co'],['#gFl','fl'],['#gSort','sort']].forEach(([i,k])=>bind(i,k,'change'));
  ['#gNote','#gTo'].forEach(i=>Q(i).addEventListener('change',e=>e.stopPropagation()));
  Q('#gClr').onclick=()=>igGrid(host,rows,cos,onChange,{...opt,keep:false});
  host.onchange=e=>{const i=e.target.dataset.gi;if(i==null)return;e.stopPropagation();const x=cur[+i];e.target.checked?sel.add(x.sig):sel.delete(x.sig);upd()};
  const act=async(action,scope)=>{const picked=rows.filter(x=>sel.has(x.sig)),to=Q('#gTo').value;if(action==='move'&&!to)return alert('Chọn công ty nội bộ cần gán');
    const items=scope==='doc'?[...new Map(picked.map(x=>[x.doc,{doc:x.doc,d:x.d,ds:x.ds,coKey:x.coKey,scope:'doc'}])).values()]:picked;
    if(!await ask(`${action==='out'?'Loại khỏi giao dịch nội bộ':'Gán lại sang '+to}: ${scope==='doc'?items.length+' chứng từ':items.length+' dòng'}?\nCó thể bỏ điều chỉnh ở chế độ "Điều chỉnh đối tượng".`))return;
    try{const r=await aq('igAdjSet',items,action,to,Q('#gNote').value.trim());onChange&&onChange()}catch(e){alert(e.message)}};
  Q('#gOut').onclick=()=>act('out','row');Q('#gOutDoc').onclick=()=>act('out','doc');Q('#gMove').onclick=()=>act('move','row');
  apply();
}
function igDrawer(title,sub,rows,cos,onChange){CUR=-1;const D=$('#drawer');if(ls.get('igFull',true))D.classList.add('full');
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">${esc(sub||'')}</div><h2 style="font-size:20px">${esc(title)}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dFull">${D.classList.contains('full')?'Thu nhỏ':'Toàn màn hình'}</button><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div><div class="pb" id="dGrid"></div>`;
  D.classList.remove('hide');$('#dClose').onclick=closeDetail;
  $('#dFull').onclick=()=>{D.classList.toggle('full');ls.set('igFull',D.classList.contains('full'));$('#dFull').textContent=D.classList.contains('full')?'Thu nhỏ':'Toàn màn hình'};
  igGrid($('#dGrid'),rows,cos,()=>{closeDetail();onChange&&onChange()});
}
async function vInternal(B,yms){
  const card=(t,h,body)=>`<div class="card"><div class="card-h"><div><h3>${t}</h3>${h?`<div class="hint">${h}</div>`:''}</div></div>${body}</div>`;
  const MODES={sum:'Tổng hợp kỳ',bal:'Số dư nội bộ (đầu kỳ → cuối kỳ)',det:'Chi tiết giao dịch',year:'Tổng hợp theo năm (mua / bán)',adj:'Điều chỉnh đối tượng'};
  const yrs=[...new Set(yms.map(m=>m.slice(0,4)))].sort().reverse();if(!IG.years.length)IG.years=yrs.slice(0,2);
  const cos=await aq('grpCompanies',IG.tt);
  // Nhóm nội bộ: 1 = công ty mẹ & công ty con (danh sách mã người dùng nhập), 2 = cùng tập đoàn (các đơn vị còn lại)
  const G1=String(IG.par||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean),gOf=k=>G1.includes(String(k).toUpperCase())?1:2,GN={1:`Nhóm 1 – Công ty mẹ & công ty con (${G1.join(', ')})`,2:'Nhóm 2 – Cùng tập đoàn (các đơn vị còn lại)'},GF=g=>`G:${g}:${G1.join(',')}`;
  if(/^G:[12]:/.test(IG.co||''))IG.co=GF(IG.co[2]);else if(IG.co&&!cos.some(c=>c.key===IG.co))IG.co='';
  const SPL=(list,key,row,sub,nc)=>!IG.split||(IG.co&&!IG.co.startsWith('G:'))?list.map(row):[1,2].flatMap(g=>{const L=list.filter(o=>gOf(key(o))===g);return L.length?[`<tr style="font-weight:700;background:#FFF1EB"><td colspan=${nc}>${esc(GN[g])}</td></tr>`,...L.map(row),sub(L,'Cộng nhóm '+g)]:[]});
  const opt=v=>yms.slice().reverse().map(m=>`<option value="${m}" ${m===v?'selected':''}>${ymLbl(m)}</option>`).join('');
  $('#igCtl').innerHTML=`<div class="subbar"><span class="crumb">Giao dịch nội bộ</span><div class="subtabs" id="igModes">${Object.entries(MODES).map(([k,v])=>`<button data-igm="${k}" class="${IG.m===k?'on':''}">${v}</button>`).join('')}</div></div>
    <div class="filterrow">
    ${IG.m==='sum'||IG.m==='det'?`<label>Từ tháng <select data-ig="from">${opt(DPS.from)}</select></label><label>Đến tháng <select data-ig="end">${opt(DPS.end)}</select></label>`:''}
    ${IG.m==='bal'?`<label>Từ ngày <input type="date" data-ig="balFrom" value="${DPS.balFrom||DPS.asOf.slice(0,4)+'-01-01'}"></label><label>Đến ngày <input type="date" data-ig="asOf" value="${DPS.asOf}"></label>`:''}
    ${IG.m==='year'?`<span>Năm:</span>${yrs.map(y=>`<label style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-igy="${y}" ${IG.years.includes(y)?'checked':''}>${y}</label>`).join('')}`:''}
    <label>Công ty nội bộ <select data-ig="co" style="max-width:420px"><option value="">Tất cả (${cos.length})</option>${[1,2].map(g=>`<option value="${esc(GF(g))}" ${IG.co===GF(g)?'selected':''}>▸ ${esc(GN[g])}</option>`).join('')}${cos.map(c=>({...c,name:`[N${gOf(c.key)}] ${c.name}`})).map(c=>`<option value="${esc(c.key)}" ${IG.co===c.key?'selected':''}>${esc(c.name)}${c.key!==c.name?' ('+esc(c.key)+')':''}</option>`).join('')}</select></label>
    <label>Nhóm 1 (mẹ – con) <input data-ig="par" value="${esc(IG.par||'')}" style="width:160px" title="Mã công ty nội bộ (Code_NB) thuộc nhóm công ty mẹ – con, cách nhau dấu phẩy"></label>
    <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-ig="split" ${IG.split?'checked':''}>Tách theo nhóm</label>
    <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-ig="ex" ${IG.ex?'checked':''}>Không tính TK ước tính (335, 1317)</label>
    <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-ig="tt" ${IG.tt?'checked':''}>Gồm trung tâm / chi nhánh (TT)</label>
    <button class="btn sm" id="igXls">${ic('download')}Xuất Excel</button></div>`;
  const save=()=>{ls.set('igPick',IG);ls.set('deepPick',DPS);loadWith('deep:intg',$('#deep'),vDeep)};
  $('#igCtl').onclick=e=>{const b=e.target.closest('[data-igm]');if(b){IG.m=b.dataset.igm;save()}};
  $('#igCtl').onchange=e=>{e.stopPropagation();const t=e.target,k=t.dataset.ig,y=t.dataset.igy;
    if(y){IG.years=t.checked?[...new Set([...IG.years,y])]:IG.years.filter(x=>x!==y);return save()}
    if(k==='from'||k==='end'||k==='asOf'||k==='balFrom')DPS[k]=t.value;else if(k==='ex'||k==='tt'||k==='split')IG[k]=t.checked;else if(k==='par')IG.par=t.value.toUpperCase();else if(k==='co')IG.co=t.value;save()};
  const EXN=IG.ex?' · không tính 335/1317':'',CO=IG.co?' · '+(IG.co.startsWith('G:')?GN[IG.co[2]]:(cos.find(c=>c.key===IG.co)?.name||IG.co)):'';
  const xls=(name,sheets)=>{$('#igXls').onclick=async()=>{try{const f=await api.xlsxSheets(name,sheets());if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}}};
  const drill=(title,rows)=>igDrawer(title,'Giao dịch nội bộ'+EXN+CO,rows,cos,save);
  if(IG.m==='sum'){const r=await aq('grpInternal',DPS.from,DPS.end,IG.tt,IG.ex,IG.co),T=r.tot,C=r.cats;
    if(!r.n){B.innerHTML=await grpEmpty('Giao dịch nội bộ',IG.tt?['NB','TT']:['NB']);return}
    const CC={'Doanh thu':'green','Chi phí':'red','Mua hàng hoá, vật tư, tài sản':'blue','Thu tiền':'green','Trả tiền':''};
    B.innerHTML=`<div class="kpis">${['Doanh thu','Chi phí','Mua hàng hoá, vật tư, tài sản','Thu tiền','Trả tiền'].map(k=>kpi(CC[k]||'','coins',k,fmt(T[k]))).join('')}</div>`+
      card('Theo tháng',`${num(r.n)} dòng · ${num(r.companies.length)} công ty / đơn vị nội bộ · kỳ ${ymLbl(r.from)} – ${ymLbl(r.to)}${EXN}${CO}`,'<div style="height:280px"><canvas id="cIg"></canvas></div>')+
      card('Theo công ty nội bộ','Nhấn đúp một ô để xem bút toán chi tiết.',tbl(['Công ty / đơn vị','Nhóm','#Số dòng',...C.map(c=>'#'+c)],SPL(r.companies,o=>o.key,o=>`<tr><td><b>${esc(o.company)}</b><div class=mut style="font-size:12px">${esc(o.code||'')} · ${o.partners} mã đối tượng</div></td><td>${esc(o.kind)} · N${gOf(o.key)}</td><td class=n>${num(o.n)}</td>${C.map(c=>`<td class="n dbl" data-igk="${esc(o.key)}" data-igc="${esc(c)}">${o.by[c]?fmt2(o.by[c]):''}</td>`).join('')}</tr>`,
        (L,lab)=>`<tr style="font-weight:700;background:#FFF6F2"><td>${lab}</td><td></td><td class=n>${num(L.reduce((x,o)=>x+o.n,0))}</td>${C.map(c=>`<td class=n>${fmt2(L.reduce((x,o)=>x+(o.by[c]||0),0))}</td>`).join('')}</tr>`,3+C.length)))+
      card('Theo mã đối tượng','',tbl(['Đối tượng','Công ty','#Số dòng',...C.map(c=>'#'+c)],r.partners.map(o=>`<tr><td><div class="clamp s" title="${esc(o.p)}">${esc(o.name)}</div></td><td>${esc(o.company)}</td><td class=n>${num(o.n)}</td>${C.map(c=>`<td class=n>${o.by[c]?fmt2(o.by[c]):''}</td>`).join('')}</tr>`)));
    setTimeout(()=>chart('cIg',{type:'bar',data:{labels:r.months.map(m=>ymLbl(m.ym)),datasets:[['Doanh thu',C_.ok],['Chi phí',C_.err],['Mua hàng hoá, vật tư, tài sản',C_.navy],['Thu tiền','#7DD3A8'],['Trả tiền',C_.brand]].map(([k,c])=>({label:k,data:r.months.map(m=>m[k]),backgroundColor:c}))},options:{maintainAspectRatio:false,responsive:true}}),50);
    B.ondblclick=async e=>{const td=e.target.closest('[data-igk]');if(!td)return;const d=await aq('grpInternalRows',DPS.from,DPS.end,IG.tt,td.dataset.igk,td.dataset.igc,20000,IG.ex);drill(`${td.dataset.igk} · ${td.dataset.igc} · ${ymLbl(DPS.from)}–${ymLbl(DPS.end)}`,d.rows)};
    xls(`AccSoft_NoiBo_TongHop_${DPS.from}_${DPS.end}${IG.ex?'_khongUocTinh':''}.xlsx`,()=>[['Theo cong ty',r.companies.map(o=>({'Công ty':o.company,'Mã nội bộ':o.code,'Nhóm nội bộ':GN[gOf(o.key)],'Nhóm':o.kind,'Số dòng':o.n,...o.by}))],['Theo doi tuong',r.partners.map(o=>({'Đối tượng':o.p,'Công ty':o.company,'Nhóm':o.kind,'Số dòng':o.n,...o.by}))],['Theo thang',r.months.map(m=>({'Tháng':m.ym,...Object.fromEntries(C.map(c=>[c,m[c]]))}))],['Thong tin',[{'Kỳ':DPS.from+' → '+DPS.end,'Không tính TK ước tính':IG.ex?'Có (bỏ 335, 1317)':'Không','Công ty':IG.co||'Tất cả','Gồm TT':IG.tt?'Có':'Không'}]]]);}
  if(IG.m==='bal'){DPS.balFrom??=DPS.asOf.slice(0,4)+'-01-01';if(DPS.balFrom>DPS.asOf)DPS.balFrom=DPS.asOf.slice(0,4)+'-01-01';
    const r=await aq('grpBalance',DPS.asOf,IG.tt,IG.ex,IG.co,DPS.balFrom),GT={thu:0,tra:0,obThu:0,obTra:0};r.companies.forEach(o=>{GT.thu+=o.thu;GT.tra+=o.tra;GT.obThu+=o.obThu;GT.obTra+=o.obTra});
    const nv=v=>Math.abs(v)>=0.005?fmt2(v):'',sg=g=>g==='thu'?1:-1,chg=(a,b)=>{const d=a-b;return Math.abs(d)>=0.005?`<span class="${d>0?'pos':'neg'}">${d>0?'+':''}${fmt2(d)}</span>`:''};
    const P=`từ ${vn(r.from||DPS.balFrom)} đến ${vn(r.asOf)}`;
    const R3=(lab,o,g,attr,pad,b)=>{const ob=sg(g)*o.ob,cb=sg(g)*(o.dr-o.cr);return `<tr ${attr} style="${b?'font-weight:'+b+';':''}"><td style="padding-left:${pad}px">${lab}</td><td>${esc(o.name||'')}${o.est?' <span class="badge b-M">ước tính</span>':''}</td><td class=n>${nv(ob)}</td><td class=n>${nv(o.ps)}</td><td class=n>${nv(o.pc)}</td><td class=n>${nv(o.dr)}</td><td class=n>${nv(o.cr)}</td><td class=n><b>${fmt2(cb)}</b></td><td class=n>${chg(cb,ob)}</td><td class=n>${o.cos??''}</td></tr>`};
    const grpRows=r.groups.map(g=>`<tr style="background:#FFF6F2;font-weight:700"><td colspan=2>${esc(g.name)}</td><td class=n>${nv(sg(g.grp)*g.ob)}</td><td class=n>${nv(g.ps)}</td><td class=n>${nv(g.pc)}</td><td class=n>${nv(g.dr)}</td><td class=n>${nv(g.cr)}</td><td class=n>${fmt2(sg(g.grp)*(g.dr-g.cr))}</td><td class=n>${chg(sg(g.grp)*(g.dr-g.cr),sg(g.grp)*g.ob)}</td><td></td></tr>`+
      g.accs.map(t=>R3(esc(t.a3),{...t,name:t.name||t.sub[0]?.name},g.grp,`class="dbl" data-iga3="${esc(t.a3)}"`,18,600)+(t.sub.length>1||t.sub[0]?.acc!==t.a3?t.sub.map(u=>R3(`<span class=mut>${esc(u.acc)}</span>`,u,g.grp,`class="dbl" data-iga="${esc(u.acc)}"`,36)).join(''):'')).join('')).join('');
    B.innerHTML=`<div class="kpis">${kpi('blue','wallet','Phải thu nội bộ cuối kỳ',fmt2(GT.thu),`đầu kỳ ${fmt2(GT.obThu)} · ${GT.thu-GT.obThu>=0?'tăng':'giảm'} ${fmt2(Math.abs(GT.thu-GT.obThu))}`)}${kpi('red','wallet','Phải trả nội bộ cuối kỳ',fmt2(GT.tra),`đầu kỳ ${fmt2(GT.obTra)} · ${GT.tra-GT.obTra>=0?'tăng':'giảm'} ${fmt2(Math.abs(GT.tra-GT.obTra))}`)}${kpi(GT.thu-GT.tra<0?'red':'green','coins','Bù trừ thu − trả cuối kỳ',fmt2(GT.thu-GT.tra),'đầu kỳ '+fmt2(GT.obThu-GT.obTra))}${kpi('','users','Số công ty có số dư',num(r.companies.length))}</div>`+
      card(`Số dư nội bộ theo nhóm & tài khoản · ${P}`,`<b>Số dư lấy từ dữ liệu gốc</b> (không áp dụng điều chỉnh loại / gán lại – điều chỉnh chỉ dùng cho chi tiết giao dịch) · đối chiếu tại <b>Báo cáo tài chính → CĐPS theo đối tượng</b>. Chỉ tính TK công nợ: ${r.accs.join(', ')} (gồm TK chi tiết). Không gồm tiền 111/112/113, tài sản 211/213/241/242, thuế 133/333, lương 334, quỹ 353, vốn – lợi nhuận 4xx. Đầu kỳ = số dư trước ngày ${vn(r.from||DPS.balFrom)}; số dư tính theo bản chất nhóm (phải thu = Nợ − Có, phải trả = Có − Nợ)${EXN}${CO}. Nhấn đúp để xem bút toán.`,
        `<div class="tbl" style="max-height:calc(100vh - 330px)"><table data-nosort><thead><tr><th rowspan=2>TK</th><th rowspan=2>Tên tài khoản</th><th rowspan=2 class=n>Số dư đầu kỳ</th><th colspan=2 style="text-align:center">Phát sinh trong kỳ</th><th colspan=3 style="text-align:center">Số dư cuối kỳ</th><th rowspan=2 class=n>Tăng / giảm so với đầu kỳ</th><th rowspan=2 class=n>Số công ty</th></tr><tr><th class=n>Nợ</th><th class=n>Có</th><th class=n>Dư Nợ</th><th class=n>Dư Có</th><th class=n>Ròng</th></tr></thead><tbody>${grpRows||'<tr><td colspan=10 class=mut style="text-align:center;padding:20px">Không có số dư nội bộ</td></tr>'}</tbody></table></div>`)+
      card(`Số dư theo công ty nội bộ · ${P}`,'Chọn một công ty ở ô "Công ty nội bộ" để xem riêng công ty đó. Nhấn đúp để xem bút toán.',
        tbl(['Công ty nội bộ','#Phải thu đầu kỳ','#Phải thu cuối kỳ','#Phải trả đầu kỳ','#Phải trả cuối kỳ','#Bù trừ cuối kỳ (thu − trả)','#Thay đổi bù trừ','#PS Nợ trong kỳ','#PS Có trong kỳ','#Số TK','Cảnh báo'],SPL(r.companies,o=>o.key,o=>`<tr class="dbl" data-igb="${esc(o.key)}"><td><b>${esc(o.company)}</b></td><td class=n>${nv(o.obThu)}</td><td class=n>${nv(o.thu)}</td><td class=n>${nv(o.obTra)}</td><td class=n>${nv(o.tra)}</td><td class="n ${o.thu-o.tra<0?'neg':''}"><b>${fmt2(o.thu-o.tra)}</b></td><td class=n>${chg(o.thu-o.tra,o.obThu-o.obTra)}</td><td class=n>${nv(o.psDr)}</td><td class=n>${nv(o.psCr)}</td><td class=n>${o.n}</td><td>${o.rev?`<span class="badge b-H">${o.rev} TK dư ngược chiều</span>`:''}</td></tr>`,
          (L,lab)=>{const S=k=>L.reduce((x,o)=>x+o[k],0),t=S('thu')-S('tra'),t0=S('obThu')-S('obTra');return `<tr style="font-weight:700;background:#FFF6F2"><td>${lab}</td><td class=n>${nv(S('obThu'))}</td><td class=n>${nv(S('thu'))}</td><td class=n>${nv(S('obTra'))}</td><td class=n>${nv(S('tra'))}</td><td class=n>${fmt2(t)}</td><td class=n>${chg(t,t0)}</td><td class=n>${nv(S('psDr'))}</td><td class=n>${nv(S('psCr'))}</td><td class=n>${S('n')}</td><td></td></tr>`},11),'Không có số dư nội bộ'))+
      card(`Chi tiết công ty × tài khoản · ${P}`,'Dư ngược chiều được đánh dấu (vd 331 dư Nợ = trả trước người bán).',tbl(['Công ty','Nhóm','TK cấp 3','Tài khoản chi tiết','#Đầu kỳ (Nợ − Có)','#PS Nợ','#PS Có','#Dư Nợ cuối kỳ','#Dư Có cuối kỳ','#Tăng / giảm (Nợ − Có)','PS gần nhất','Ghi chú'],r.lines.slice().sort((a,b)=>a.company.localeCompare(b.company)||a.grp.localeCompare(b.grp)*-1||a.acc.localeCompare(b.acc)).map(o=>`<tr class="dbl" data-igb="${esc(o.key)}" data-iga="${esc(o.acc)}"><td>${esc(o.company)}</td><td><span class="badge ${o.grp==='thu'?'b-L':'s-doing'}">${o.grp==='thu'?'Phải thu':'Phải trả'}</span></td><td class=nw>${esc(o.a3)} ${esc(o.a3Name)}</td><td>${esc(o.accName)}${o.est?' <span class="badge b-M">ước tính</span>':''}</td><td class=n>${nv(o.ob)}</td><td class=n>${nv(o.dr)}</td><td class=n>${nv(o.cr)}</td><td class=n>${o.bal>0?fmt2(o.bal):''}</td><td class=n>${o.bal<0?fmt2(-o.bal):''}</td><td class=n>${chg(o.bal,o.ob)}</td><td class=nw>${vn(o.last)}</td><td>${o.rev?`<span class="badge b-H">${esc(o.revName)}</span>`:''}</td></tr>`)));
    B.ondblclick=async e=>{const tr=e.target.closest('[data-igb],[data-iga],[data-iga3]');if(!tr)return;const k=tr.dataset.igb||'',a=tr.dataset.iga||'',a3=tr.dataset.iga3||'';const d=await aq('grpInternalRows',DPS.balFrom.slice(0,7),DPS.asOf.slice(0,7),IG.tt,k,'',20000,IG.ex);
      drill(`${k?k+' · ':''}${a?'TK '+a:a3?'TK '+a3:''} · ${P}`,d.rows.filter(x=>x.d>=DPS.balFrom&&x.d<=DPS.asOf&&(!a||x.dr===a||x.cr===a)&&(!a3||String(x.dr).startsWith(a3)||String(x.cr).startsWith(a3))))};
    xls(`AccSoft_NoiBo_SoDu_${DPS.balFrom}_${DPS.asOf}${IG.ex?'_khongUocTinh':''}.xlsx`,()=>[['Theo nhom tai khoan',r.groups.flatMap(g=>g.accs.flatMap(t=>t.sub.map(u=>({'Nhóm':g.name,'TK cấp 3':t.a3,'Tên TK cấp 3':t.name,'Tài khoản':u.acc,'Tên tài khoản':u.name,'Đầu kỳ (ròng)':sg(g.grp)*u.ob,'PS Nợ':u.ps,'PS Có':u.pc,'Dư Nợ cuối kỳ':u.dr,'Dư Có cuối kỳ':u.cr,'Cuối kỳ (ròng)':sg(g.grp)*(u.dr-u.cr),'Số công ty':u.cos}))))],
      ['So du theo cong ty',r.companies.map(o=>({'Nhóm nội bộ':GN[gOf(o.key)],'Công ty':o.company,'Mã':o.key,'Phải thu đầu kỳ':o.obThu,'Phải thu cuối kỳ':o.thu,'Phải trả đầu kỳ':o.obTra,'Phải trả cuối kỳ':o.tra,'Bù trừ cuối kỳ':o.thu-o.tra,'Bù trừ đầu kỳ':o.obThu-o.obTra,'PS Nợ':o.psDr,'PS Có':o.psCr,'TK dư ngược':o.rev}))],
      ['Chi tiet tai khoan',r.lines.map(o=>({'Công ty':o.company,'Nhóm':o.grpName,'TK cấp 3':o.a3+' '+o.a3Name,'Tài khoản':o.accName,'Ước tính':o.est?'x':'','Đầu kỳ (Nợ − Có)':o.ob,'PS Nợ':o.dr,'PS Có':o.cr,'Dư Nợ cuối kỳ':o.bal>0?o.bal:0,'Dư Có cuối kỳ':o.bal<0?-o.bal:0,'PS gần nhất':o.last,'Ghi chú':o.revName}))],['Thong tin',[{'Từ ngày':DPS.balFrom,'Đến ngày':DPS.asOf,'TK tính':r.accs.join(', '),'Không tính TK ước tính':IG.ex?'Có':'Không','Công ty':IG.co||'Tất cả'}]]]);}
  if(IG.m==='det'){const r=await aq('grpInternalRows',DPS.from,DPS.end,IG.tt,IG.co,'',20000,IG.ex);
    B.innerHTML=card(`Chi tiết giao dịch nội bộ ${ymLbl(DPS.from)} – ${ymLbl(DPS.end)}`,`${num(r.total)} bút toán${EXN}${CO}${r.total>r.rows.length?' · tải '+num(r.rows.length)+' dòng đầu (xuất Excel để xem đủ)':''}. Tích chọn dòng nhân viên chọn sai đối tượng để loại khỏi nội bộ hoặc gán lại công ty.`,'<div id="igGrid"></div>');igGrid($('#igGrid'),r.rows,cos,save,{h:'calc(100vh - 420px)',keep:true});
    xls(`AccSoft_NoiBo_ChiTiet_${DPS.from}_${DPS.end}${IG.ex?'_khongUocTinh':''}.xlsx`,()=>[['Chi tiet',r.rows.map(x=>({'Ngày':x.d,'Chứng từ':x.doc,'Công ty nội bộ':x.company,'Nghiệp vụ':x.cat,'Ước tính':x.est?'x':'','TK Nợ':x.drName,'TK Có':x.crName,'Đối tượng Nợ':x.bp,'Đối tượng Có':x.bpCr,'Số tiền':x.a,'Diễn giải':x.ds,'Người nhập':x.u}))]]);}
  if(IG.m==='adj'){const L=await aq('igAdjList');
    B.innerHTML=card('Thêm vào nội bộ theo chứng từ','Khi nhân viên chọn nhầm đối tượng bên ngoài cho giao dịch thực chất là nội bộ: nhập số chứng từ, chọn dòng rồi bấm "Gán lại" sang công ty nội bộ đúng.',`<div class="row" style="gap:8px"><input id="adDoc" placeholder="Số chứng từ, vd VTLMN26100059" style="width:320px"><button class="btn sm" id="adFind">Tìm</button></div><div id="adGrid" style="margin-top:10px"></div>`)+
      card(`Các điều chỉnh đã lưu (${num(L.length)})`,'Điều chỉnh áp dụng cho mọi báo cáo nội bộ (tổng hợp, số dư, chi tiết, theo năm). Bỏ điều chỉnh để trả về đối tượng gốc.',
        `<div class="row" style="margin-bottom:8px"><div style="flex:1"></div><button class="btn sm" id="adDel" disabled>Bỏ điều chỉnh đã chọn</button></div>`+tbl0(['<input type="checkbox" id="adAll">','Phạm vi','Hành động','Chứng từ','Ngày','#Số tiền','Công ty gốc','Diễn giải','Ghi chú','Cập nhật'],L.map(x=>`<tr><td><input type="checkbox" data-ads="${esc(x.sig)}"></td><td>${x.scope==='doc'?'Cả chứng từ':'Một dòng'}</td><td>${x.action==='out'?'<span class="badge b-H">Loại khỏi nội bộ</span>':'<span class="badge b-M">Gán lại → '+esc(x.to_key)+'</span>'}</td><td class=nw>${esc(x.doc)}</td><td class=nw>${vn(x.d)}</td><td class=n>${x.a!=null?fmt2(x.a):''}</td><td>${esc(x.from_key||'')}</td><td><div class=clamp title="${esc(x.ds)}">${esc(x.ds||'')}</div></td><td>${esc(x.note||'')}</td><td class=nw>${esc(x.updated_at||'')}</td></tr>`),'Chưa có điều chỉnh nào'));
    const chk=()=>{const n=B.querySelectorAll('[data-ads]:checked').length;$('#adDel').disabled=!n;$('#adDel').textContent=n?`Bỏ ${n} điều chỉnh`:'Bỏ điều chỉnh đã chọn'};
    B.onchange=e=>{if(e.target.id==='adAll')B.querySelectorAll('[data-ads]').forEach(c=>c.checked=e.target.checked);if(e.target.id==='adAll'||e.target.dataset.ads)chk()};
    $('#adDel').onclick=async()=>{const s=[...B.querySelectorAll('[data-ads]:checked')].map(c=>c.dataset.ads);if(!await ask(`Bỏ ${s.length} điều chỉnh?`))return;await aq('igAdjRemove',s);save()};
    const find=async()=>{const d=$('#adDoc').value.trim();if(!d)return;const rows=await aq('igDocLines',d,IG.tt);if(!rows.length){$('#adGrid').innerHTML='<div class=mut>Không tìm thấy chứng từ</div>';return}igGrid($('#adGrid'),rows,cos,save,{h:'420px'})};
    $('#adFind').onclick=find;$('#adDoc').onkeydown=e=>{if(e.key==='Enter')find()};
    xls(`AccSoft_NoiBo_DieuChinh.xlsx`,()=>[['Dieu chinh',L.map(x=>({'Phạm vi':x.scope==='doc'?'Cả chứng từ':'Một dòng','Hành động':x.action==='out'?'Loại khỏi nội bộ':'Gán lại → '+x.to_key,'Chứng từ':x.doc,'Ngày':x.d,'Số tiền':x.a,'Công ty gốc':x.from_key,'Diễn giải':x.ds,'Ghi chú':x.note,'Cập nhật':x.updated_at}))]]);}
  if(IG.m==='year'){const r=await aq('grpYears',IG.years,IG.tt,IG.ex,IG.co),Y=r.years;
    if(!Y.length){B.innerHTML=card('Tổng hợp theo năm','Chọn ít nhất một năm.','');return}
    const cols=r.cols.filter(([k])=>!['salesAdj'].includes(k)||Y.some(y=>r.tot[y].salesAdj));
    B.innerHTML=`<div class="kpis">${Y.map(y=>kpi('','coins',`Tổng mua nội bộ ${y}`,fmt(r.tot[y].buyTot),`chi phí ${fmt(r.tot[y].buy627+r.tot[y].buy641+r.tot[y].buy642+r.tot[y].buyExpO)} · hàng hoá ${fmt(r.tot[y].buyGoods)}`)+kpi('green','coins',`Bán nội bộ ${y}`,fmt(r.tot[y].salesNet))).join('')}</div>`+
      card(`Giao dịch nội bộ theo năm ${Y.join(' – ')}`,`Mua: tách ghi chi phí 627 / 641 / 642 / chi phí khác, mua hàng hoá – vật tư (15x), mua tài sản – XDCB – trả trước. Bán: doanh thu 511/512/515/711 trừ giảm trừ${EXN}${CO}.`,
        `<div class="tbl" style="max-height:calc(100vh - 330px)"><table><thead><tr><th rowspan=2>Công ty nội bộ</th>${cols.map(([,l])=>`<th colspan=${Y.length} style="text-align:center">${l}</th>`).join('')}</tr><tr>${cols.map(()=>Y.map(y=>`<th class=n>${y}</th>`).join('')).join('')}</tr></thead><tbody>
        ${SPL(r.rows,o=>o.key,o=>`<tr><td><b>${esc(o.company)}</b><div class=mut style="font-size:12px">${esc(o.key)}</div></td>${cols.map(([k])=>Y.map(y=>`<td class="n" style="${['buyTot','salesNet'].includes(k)?'font-weight:700':''}">${o.y[y][k]?fmt2(o.y[y][k]):''}</td>`).join('')).join('')}</tr>`,
          (L,lab)=>`<tr style="font-weight:700;background:#FFF6F2"><td>${lab}</td>${cols.map(([k])=>Y.map(y=>`<td class=n>${fmt2(L.reduce((x,o)=>x+o.y[y][k],0))}</td>`).join('')).join('')}</tr>`,1+cols.length*Y.length).join('')}
        <tr style="font-weight:700;background:#FFF6F2"><td>Tổng cộng</td>${cols.map(([k])=>Y.map(y=>`<td class=n>${fmt2(r.tot[y][k])}</td>`).join('')).join('')}</tr></tbody></table></div>`);
    xls(`AccSoft_NoiBo_TheoNam_${Y.join('_')}${IG.ex?'_khongUocTinh':''}.xlsx`,()=>[['Theo nam',r.rows.map(o=>Object.assign({'Nhóm nội bộ':GN[gOf(o.key)],'Công ty nội bộ':o.company,'Mã':o.key},...cols.flatMap(([k,l])=>Y.map(y=>({[`${l} ${y}`]:o.y[y][k]})))))],['Thong tin',[{'Năm':Y.join(', '),'Không tính TK ước tính':IG.ex?'Có':'Không','Công ty':IG.co||'Tất cả'}]]]);}
}

/* ---------- Danh mục đối tượng ---------- */
const CATF=Object.assign({q:'',kind:'',off:0},ls.get('catFilter',{}));let CATK={},CATSEL=new Set();
const kindBadge=k=>k?`<span class="badge ${k==='NB'||k==='TT'?'b-M':k==='BN_QT'||k==='ROAMING'?'b-H':k==='NV'?'s-fixed':''}" title="${esc(CATK[k]||'')}">${esc(k)}</span>`:'<span class="mut">–</span>';
async function vCat(){
  const [r,st]=await Promise.all([aq('catList',CATF.q,CATF.kind,CATF.off,200),aq('catStats')]);CATK=r.kinds;
  $('#catStats').innerHTML=`<span class="badge s-fixed">${num(st.catalog)} đối tượng trong danh mục</span><span class="mut">Dữ liệu có ${num(st.partners)} đối tượng · khớp danh mục ${num(st.matched)}</span>`+Object.entries(st.byKind).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<span class="badge">${esc(k)} ${esc(CATK[k]||'')}: ${num(n)}</span>`).join('');
  $('#catKind').innerHTML=`<option value="">Tất cả nhóm</option>`+r.counts.map(c=>`<option value="${esc(c.k||'(trống)')}" ${CATF.kind===(c.k||'(trống)')?'selected':''}>${esc(c.k||'(trống)')} ${esc(CATK[c.k]||'')} – ${num(c.n)}</option>`).join('');
  $('#catQ').value=CATF.q;$('#catInfo').textContent=`${num(r.total)} dòng`;
  $('#tCat').innerHTML='<thead><tr><th><input type="checkbox" id="catAll"></th><th>Nhóm</th><th>Mã_Tên đối tượng (Code_Name)</th><th>Mã</th><th>Tên</th><th>Mã nội bộ</th><th>Công ty nội bộ</th><th>Ghi chú</th><th></th></tr></thead><tbody>'+
    (r.rows.map(x=>`<tr data-ck="${esc(x.code_name)}"><td><input type="checkbox" data-cks="${esc(x.code_name)}" ${CATSEL.has(x.code_name)?'checked':''}></td><td>${kindBadge(x.kind)}</td><td><div class="clamp s" title="${esc(x.code_name)}">${esc(x.code_name)}</div></td><td class=nw>${esc(x.code||'')}</td><td><div class="clamp s">${esc(x.name||'')}</div></td><td>${esc(x.nb_code||'')}</td><td>${esc(x.nb_name||'')}</td><td style="font-size:12px">${esc(x.note||'')}</td><td class=nw><button class="btn sm" data-ced="${esc(x.code_name)}">Sửa</button> <button class="btn sm ghost" data-cdel="${esc(x.code_name)}">${ic('x')}</button></td></tr>`).join('')||'<tr><td colspan=9 class=mut style="text-align:center;padding:24px">Chưa có đối tượng – bấm "Nạp file" để nạp danh mục (ví dụ 2026.10_DANH_MUC_KHACH_HANG_TIMOR.xlsx)</td></tr>')+'</tbody>';
  const pages=Math.max(1,Math.ceil(r.total/200)),pg=Math.floor(CATF.off/200)+1;
  $('#pgCat').innerHTML=`Trang <b>${pg}</b> / ${pages}<button class="btn sm" data-cpg="-1" ${pg<=1?'disabled':''}>‹ Trước</button><button class="btn sm" data-cpg="1" ${pg>=pages?'disabled':''}>Sau ›</button>`;
  $('#catDel').disabled=!CATSEL.size;$('#catDel').textContent=CATSEL.size?`Xoá ${CATSEL.size} dòng đã chọn`:'Xoá các dòng đã chọn';
  aq('catUnmatched',300).then(m=>{$('#tCatMiss').innerHTML='<thead><tr><th>Đối tượng trong dữ liệu</th><th class=n>Số dòng</th><th>Phát sinh gần nhất</th><th></th></tr></thead><tbody>'+(m.map(x=>`<tr><td>${esc(x.code_name)}</td><td class=n>${num(x.n)}</td><td>${vn(x.last)}</td><td><button class="btn sm" data-cnew="${esc(x.code_name)}">Thêm</button></td></tr>`).join('')||'<tr><td colspan=4 class=mut style="text-align:center;padding:16px">✓ Mọi đối tượng trong dữ liệu đã có trong danh mục</td></tr>')+'</tbody>'});
  VCATROWS=r.rows;
}
let VCATROWS=[];
function catForm(x,isNew){CUR=-1;const K=Object.entries(CATK),L='style="display:grid;gap:4px"';
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Danh mục đối tượng</div><h2 style="font-size:20px">${isNew?'Thêm đối tượng':'Sửa đối tượng'}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
   <div class="pb"><div class="card"><div class="filters" style="grid-template-columns:repeat(2,1fr)">
     <label ${L} style="grid-column:1/-1;display:grid;gap:4px">Mã_Tên đối tượng (đúng như cột Business Partner / Bpartner credit trong dữ liệu)<input id="cfCN" value="${esc(x.code_name||'')}"></label>
     <label ${L}>Mã (Code)<input id="cfCode" value="${esc(x.code||'')}" placeholder="tự lấy phần trước tên nếu để trống"></label><label ${L}>Tên<input id="cfName" value="${esc(x.name||'')}"></label>
     <label ${L}>Nhóm đối tượng<select id="cfKind"><option value="">– chưa phân nhóm –</option>${K.map(([k,v])=>`<option value="${k}" ${x.kind===k?'selected':''}>${k} – ${esc(v)}</option>`).join('')}${x.kind&&!CATK[x.kind]?`<option selected value="${esc(x.kind)}">${esc(x.kind)}</option>`:''}</select></label>
     <label ${L}>Nhóm khác (nếu không có trong danh sách)<input id="cfKind2" placeholder="vd. DT_KHAC"></label>
     <label ${L}>Mã nội bộ (Code_NB)<input id="cfNbC" value="${esc(x.nb_code||'')}" placeholder="vd. TFU, VTC"></label><label ${L}>Công ty nội bộ (Name_NB)<input id="cfNbN" value="${esc(x.nb_name||'')}"></label>
     <label style="grid-column:1/-1;display:grid;gap:4px">Ghi chú<input id="cfNote" value="${esc(x.note||'')}"></label></div>
     <div class="row"><div style="flex:1"></div><button class="btn primary" id="cfSave">Lưu</button></div></div></div>`;
  $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
  $('#cfSave').onclick=async()=>{const r={code_name:$('#cfCN').value.trim(),code:$('#cfCode').value.trim(),name:$('#cfName').value.trim(),kind:($('#cfKind2').value.trim()||$('#cfKind').value).toUpperCase(),nb_code:$('#cfNbC').value.trim(),nb_name:$('#cfNbN').value.trim(),note:$('#cfNote').value.trim()};
    if(!r.code_name)return alert('Nhập Mã_Tên đối tượng');try{await aq('catUpsert',r,isNew?null:x.code_name);closeDetail();vCat()}catch(e){alert(e.message)}};
}
$('#catAdd').onclick=()=>catForm({},true);
$('#catQ').oninput=(()=>{let t;return e=>{clearTimeout(t);t=setTimeout(()=>{CATF.q=e.target.value.trim();CATF.off=0;ls.set('catFilter',CATF);vCat()},400)}})();
$('#catKind').onchange=e=>{CATF.kind=e.target.value;CATF.off=0;ls.set('catFilter',CATF);vCat()};
$('#pgCat').onclick=e=>{const b=e.target.closest('[data-cpg]');if(b){CATF.off=Math.max(0,CATF.off+ +b.dataset.cpg*200);vCat()}};
$('#tCat').onclick=async e=>{const ed=e.target.closest('[data-ced]'),dl=e.target.closest('[data-cdel]');
  if(ed)catForm(VCATROWS.find(x=>x.code_name===ed.dataset.ced)||{code_name:ed.dataset.ced},false);
  if(dl&&await ask('Xoá đối tượng khỏi danh mục?\n'+dl.dataset.cdel)){await aq('catRemove',[dl.dataset.cdel]);CATSEL.delete(dl.dataset.cdel);vCat()}};
$('#tCat').onchange=e=>{const c=e.target.dataset.cks;if(c!=null){e.target.checked?CATSEL.add(c):CATSEL.delete(c)}else if(e.target.id==='catAll'){$$('[data-cks]').forEach(x=>{x.checked=e.target.checked;e.target.checked?CATSEL.add(x.dataset.cks):CATSEL.delete(x.dataset.cks)})}
  $('#catDel').disabled=!CATSEL.size;$('#catDel').textContent=CATSEL.size?`Xoá ${CATSEL.size} dòng đã chọn`:'Xoá các dòng đã chọn'};
$('#catDel').onclick=async()=>{if(!CATSEL.size||!await ask(`Xoá ${CATSEL.size} đối tượng khỏi danh mục?`))return;await aq('catRemove',[...CATSEL]);CATSEL.clear();vCat()};
$('#tCatMiss').onclick=e=>{const b=e.target.closest('[data-cnew]');if(b){const cn=b.dataset.cnew,seg=cn.split('_');catForm({code_name:cn,code:seg.slice(0,-1).join('_'),name:seg.at(-1)},true)}};
const catImp=async mode=>{if(mode==='replace'&&!await ask('Xoá toàn bộ danh mục hiện tại và nạp lại từ file?'))return;try{const r=await api.catImport(mode);if(r){alert(`Đã nạp ${num(r.n)} dòng từ ${r.file}. Danh mục hiện có ${num(r.total)} đối tượng.`);vCat()}}catch(e){alert(e.message)}};
$('#catImpM').onclick=()=>catImp('merge');$('#catImpR').onclick=()=>catImp('replace');
$('#catXls').onclick=async()=>{const rows=await aq('catExport');try{const f=await api.xlsxSheets(`DANH_MUC_DOI_TUONG_${new Date().toISOString().slice(0,10)}.xlsx`,[['Danh muc',rows.map((x,i)=>({NO:i+1,Code_Name:x.code_name,Code:x.code,Name:x.name,'Kind Of Customer':x.kind,Code_NB:x.nb_code,Name_NB:x.nb_name,'Ghi chú':x.note}))],['Nhom',Object.entries(CATK).map(([k,v])=>({'Kind Of Customer':k,'Ý nghĩa':v}))]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};

/* ---------- Chi tiết phải thu một đối tượng ---------- */
async function recvDetail(p){CUR=-1;$('#dPane').innerHTML=`<div class="ph"><div><h2 style="font-size:20px">Đang tải…</h2></div></div>`;$('#drawer').classList.remove('hide');
  const d=await aq('recvDetail',DPS.racc||'138812',p,DPS.asOf,+(DPS.rterm||30));if(!d){closeDetail();return}
  $('#dPane').innerHTML=recvDetailHtml(d,false);$('#dClose').onclick=closeDetail;
}
// Chi tiết đối tượng: dùng cho cửa sổ trượt (nhấn đúp) và hiển thị ngay trong trang khi lọc một đối tượng
function recvDetailHtml(d,inline){const o=d.partner;
  const RK={H:'<span class="badge b-H">Cao</span>',M:'<span class="badge b-M">Trung bình</span>',L:'<span class="badge s-fixed">Thấp</span>'};
  const al=a=>a.map(x=>`<div style="font-size:12px">${esc(x.doc)} · ${vn(x.d)} · <b>${fmt2(x.v)}</b> <span class=mut>(${esc(x.how)})</span></div>`).join('');
  const head=`<div class="ph"><div><div class="mut" style="font-size:12px">TK ${esc(d.acc)} · tại ${vn(d.asOf)}</div><h2 style="font-size:20px">${esc(d.name)} ${RK[o.risk]}</h2><div class="mut" style="font-size:12px">${esc(d.p)}</div></div><div style="flex:1"></div>${inline?'':`<button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button>`}</div>`;
  const kp=`<div class="kpis">${kpi('','file','Phải thu',fmt2(o.rev),`${o.nRev} khoản`)}${kpi('green','coins','Đã thu / giảm trừ',fmt2(o.paid+o.adj),`${o.nPay} lần thu`)}${kpi(o.bal<0?'red':'','wallet','Còn nợ',fmt2(o.bal))}${kpi('red','alert','Quá hạn > 90 ngày',fmt2(o.od90),`tuổi tối đa ${o.maxAge||0} ngày`)}</div>`;
  const main=`${d.flags.length?`<div class="card"><div class="card-h"><h3>Cảnh báo (${d.flags.length})</h3></div>${d.flags.map(f=>`<div style="padding:6px 0;border-bottom:1px solid var(--gray-100,#F5F5F5)">${RK[f.sev]} ${f.doc?`<b>${esc(f.doc)}</b> ${vn(f.d)} · ${f.amt!=null?fmt2(f.amt):''} · `:''}${esc(f.msg)}${f.cand.length?` → <b>${f.cand.map(c=>esc(c.name)).join(', ')}</b>`:''}</div>`).join('')}</div>`:''}
   <div class="card"><div class="card-h"><h3>Doanh thu / phải thu (Nợ ${esc(d.acc)}) và tiền đã trừ cho từng khoản</h3></div>${tbl0(['Ngày','Chứng từ','Diễn giải','#Phải thu','Đã thu bởi','#Còn nợ','Hạn','#Quá hạn (ngày)'],d.rev.map(x=>`<tr class="${x.open>0.004&&x.age>90?'rH':''}"><td class=nw>${vn(x.d)}</td><td class=nw>${esc(x.doc)}</td><td><div class=clamp title="${esc(x.ds)}">${esc(x.ds)}</div></td><td class=n>${fmt2(x.amt)}</td><td>${al(x.alloc)}</td><td class="n ${x.open>0.004?'neg':''}"><b>${x.open>0.004?fmt2(x.open):'–'}</b></td><td class=nw>${x.amt>0?vn(x.due):''}</td><td class=n>${x.open>0.004&&x.age>0?x.age:''}</td></tr>`),'Không có bút toán ghi nhận phải thu')}</div>
   <div class="card"><div class="card-h"><h3>Tiền thu / giảm trừ (Có ${esc(d.acc)}) và khoản phải thu được trừ</h3></div>${tbl0(['Ngày','Chứng từ','Diễn giải','#Số tiền','Trừ cho khoản phải thu','#Chưa phân bổ','Mã tham chiếu','Người nhập'],d.pay.map(x=>`<tr class="${x.left>0.004?'rM':''}"><td class=nw>${vn(x.d)}</td><td class=nw>${esc(x.doc)}</td><td><div class=clamp title="${esc(x.ds)}">${esc(x.ds)}</div></td><td class=n>${fmt2(x.amt)}</td><td>${al(x.alloc)}</td><td class="n ${x.left>0.004?'neg':''}">${x.left>0.004?fmt2(x.left):''}</td><td style="font-size:12px">${esc((x.refs||[]).join(', '))}</td><td class=nw>${esc(short(x.u))}</td></tr>`),'Chưa có lần thu tiền')}</div>`;
  return inline?`<div class="card" style="border:2px solid var(--brand-200,#FFC4A8)">${head}${main}</div>`:head+`<div class="pb">${kp}${main}</div>`;
}

/* ---------- Lập trích trước kỳ mới (file GL Journal import ERP) ---------- */
const MN=['January','February','March','April','May','June','July','August','September','October','November','December'];
function swapPeriod(s,from,to){const [fy,fm]=[+from.slice(0,4),+from.slice(5)],[ty,tm]=[+to.slice(0,4),+to.slice(5)];let x=String(s||'');
  x=x.replace(new RegExp(`\\b${MN[fm-1]}(\\s*,?\\s*)${fy}\\b`,'gi'),`${MN[tm-1]}$1${ty}`).replace(new RegExp(`\\b${MN[fm-1].slice(0,3)}\\.?(\\s*,?\\s*)${fy}\\b`,'gi'),`${MN[tm-1].slice(0,3)}$1${ty}`);
  x=x.replace(new RegExp(`(tháng|thang|T)\\s*0?${fm}\\s*([/-]|năm)\\s*${fy}`,'gi'),(m,a,b)=>`${a} ${String(tm).padStart(2,'0')}${b==='năm'?' năm ':'/'}${ty}`).replace(new RegExp(`\\b0?${fm}/${fy}\\b`,'g'),`${String(tm).padStart(2,'0')}/${ty}`);
  return x}
let MK=ls.get('mkPick',{});let MKROWS=[],MKLIM=300,MKQ='';
async function mkView(){const box=$('#mkBox');if(!box)return;box.innerHTML='<div class="card"><span class="spin"></span> Đang tải các khoản trích…</div>';
  let r=await aq('accrualSource',MK.src||'',MK.to||'',DPS.a335||'');if(!MK.src||!r.pers.includes(MK.src)){MK.src=r.pers[0]||'';MK.to=MK.to&&MK.to>MK.src?MK.to:addM(MK.src||'2026-01',1);if(MK.src)r=await aq('accrualSource',MK.src,MK.to,DPS.a335||'')}
  MKROWS=r.rows.map(x=>({...x,on:!x.dup,amt:x.a,desc:swapPeriod(x.ds,x.per,MK.to)}));
  const tot=()=>MKROWS.filter(x=>x.on).reduce((s,x)=>s+(+x.amt||0),0);
  box.innerHTML=`<div class="card"><div class="card-h"><div><h3>Lập trích trước kỳ mới từ khoản trích kỳ trước</h3><div class="hint">Chọn kỳ dịch vụ mẫu → các dòng trích (Nợ 6xx / Có 335) được sao chép sang kỳ mới: giữ TK, đối tượng, khoản mục, Group cost, Services, Location; diễn giải tự đổi tháng ("In ${MN[+MK.src.slice(5)-1]||''} ${MK.src.slice(0,4)}" → kỳ mới). Sửa số tiền theo ước tính, bỏ chọn dòng không trích, rồi xuất file .xls để import ERP.</div></div></div>
    <div class="row" style="flex-wrap:wrap;gap:12px"><label>Kỳ dịch vụ mẫu <select id="mkSrc">${r.pers.map(p=>`<option ${p===MK.src?'selected':''} value="${p}">${ymLbl(p)}</option>`).join('')}</select></label>
    <label>Kỳ trích mới <input type="month" id="mkTo" value="${MK.to}"></label><span class="mut" id="mkSum"></span><div style="flex:1"></div><button class="btn primary" id="mkGo">${ic('download')}Xuất file trích trước (import ERP)</button></div></div>
    <div class="card"><div class="row" style="margin-bottom:10px"><input id="mkQ" placeholder="Tìm đối tượng, khoản mục, diễn giải…" value="${esc(MKQ)}" style="flex:1;max-width:420px"><span class="mut" id="mkShown"></span></div><div id="mkTbl"></div></div>`;
  const mkTable=()=>{if(!$('#mkShown'))return;const q=MKQ.toLowerCase(),idx=MKROWS.map((x,i)=>i).filter(i=>!q||[MKROWS[i].bpCr,MKROWS[i].bp,MKROWS[i].t,MKROWS[i].desc].some(v=>String(v||'').toLowerCase().includes(q))),show=idx.slice(0,MKLIM);
    $('#mkShown').textContent=`Hiển thị ${num(show.length)} / ${num(idx.length)} dòng`+(idx.length<MKROWS.length?` (lọc từ ${num(MKROWS.length)})`:'');
    $('#mkTbl').innerHTML=tbl0(['<input type="checkbox" id="mkAll" title="Chọn / bỏ chọn các dòng đang lọc">','Đối tượng','Khoản mục','TK Nợ / Có','#Số kỳ mẫu','#Số trích kỳ mới','Diễn giải kỳ mới','Ghi chú'],show.map(i=>[MKROWS[i],i]).map(([x,i])=>`<tr class="${x.dup?'rM':''}"><td><input type="checkbox" data-mk="${i}" ${x.on?'checked':''}></td><td><div class="clamp s" title="${esc(x.bpCr)}">${esc(String(x.bpCr||x.bp||'').split('_').slice(2).join('_')||x.bpCr||x.bp||'')}</div></td><td><div class="clamp s" title="${esc(x.t)}">${esc(x.t)}</div></td><td class=nw>${esc(String(x.drName).split('_')[0])} / ${esc(String(x.crName).split('_')[0])}</td>
      <td class=n>${fmt2(x.a)}</td><td><input type="number" step="0.01" data-mka="${i}" value="${x.a}" style="width:110px;text-align:right"></td><td><input data-mkd="${i}" value="${esc(x.desc)}" style="width:100%;min-width:340px"></td><td>${x.dup?'<span class="badge b-M">Kỳ mới đã có trích – bỏ chọn để tránh trùng</span>':''}${!x.grpCost?'<span class="badge">Thiếu Group cost</span>':''}</td></tr>`),'Không có khoản trích ở kỳ này')+(idx.length>show.length?`<div style="text-align:center;margin-top:10px"><button class="btn sm" id="mkMore">Hiển thị thêm ${num(Math.min(300,idx.length-show.length))} dòng</button></div>`:'');
    MKVIS=idx};let MKVIS=[];mkTable();
  const upd=()=>{if(!$('#mkSum'))return;$('#mkSum').textContent=`${num(MKROWS.filter(x=>x.on).length)} dòng · tổng ${fmt2(tot())}`};upd();
  box.onchange=e=>{const t=e.target,d=t.dataset;if(d.mk!=null){MKROWS[+d.mk].on=t.checked;upd()}else if(d.mka!=null){MKROWS[+d.mka].amt=+t.value;upd()}else if(d.mkd!=null)MKROWS[+d.mkd].desc=t.value;
    else if(t.id==='mkAll'){MKVIS.forEach(i=>MKROWS[i].on=t.checked);$$('[data-mk]').forEach(c=>c.checked=t.checked);upd()}
    else if(t.id==='mkSrc'||t.id==='mkTo'){MK={src:$('#mkSrc').value,to:$('#mkTo').value};ls.set('mkPick',MK);mkView()}};
  $('#mkGo').onclick=()=>mkForm();
  let qT;box.oninput=e=>{if(e.target.id==='mkQ'){clearTimeout(qT);qT=setTimeout(()=>{MKQ=e.target.value.trim();MKLIM=300;mkTable()},250)}};
  box.onclick=e=>{if(e.target.id==='mkMore'){MKLIM+=300;mkTable()}};
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
  $('#rvGo').onclick=async()=>{const o={acc335:DPS.a335||'',date:$('#rvDate').value,due:$('#rvDue').value,dept:$('#rvDept').value.trim(),docType:$('#rvType').value.trim(),docNo:$('#rvNo').value.trim(),prefix:$('#rvPre').value,desc:$('#rvDesc').value.trim()};
    if(!o.date)return alert('Chọn ngày hạch toán');ls.set('revErp',{dept:o.dept,docType:o.docType,prefix:o.prefix});
    try{const r=await api.reversalErp(sel.map(g=>g.key),o);if(r){alert(`Đã xuất ${num(r.lines)} dòng huỷ trích, tổng ${fmt2(-r.total)}:\n${r.file}\n\nFile kiểm tra: ${r.check}\n\nSau khi import và nạp lại dữ liệu, các khoản này sẽ chuyển sang "Đã huỷ trích".`);closeDetail()}}catch(e){alert(e.message)}};
}
$('#dpTabs').onclick=e=>{const b=e.target.closest('[data-d]');if(!b)return;DP=b.dataset.d;ls.set('deepTab',DP);loadWith('deep:'+DP,$('#deep'),vDeep)};
$('#dpCtl').onchange=e=>{const k=e.target.dataset.k;if(!k)return;DPS[k]=e.target.type==='checkbox'?e.target.checked:e.target.value;ls.set('deepPick',DPS);vDeep()};

/* ---------- Cài đặt ngưỡng, số dư đầu kỳ, sao lưu ---------- */
const THL={dueBefore:'Thanh toán trước hạn (ngày)',dueLong:'Hạn thanh toán quá dài (ngày)',cashRound:'Tiền mặt số tròn ≥',bigExpense:'Chi phí lớn thiếu khoản mục ≥',roundExpense:'Chi phí số tròn ≥',monthEndLarge:'Bút toán lớn cuối tháng ≥',manualJe:'Bút toán thủ công lớn ≥',outlierFactor:'Số tiền bất thường (× trung vị)',advDays:'Tạm ứng quá hạn (ngày)',accrualDays:'335 chưa quyết toán (ngày)',variancePct:'Biến động bất thường (%)',varianceMin:'Biến động tối thiểu (giá trị)',recurringShare:'Chi phí định kỳ: % số tháng có phát sinh'};
let TH={};
async function loadTh(){TH=await aq('getThresholds');$('#thForm').innerHTML=Object.keys(THL).map(k=>`<label>${THL[k]}<input type="number" data-th="${k}" value="${TH.cfg[k]}" title="Mặc định ${TH.def[k]}"></label>`).join('')}
$('#thSave').onclick=async()=>{const c={};$$('[data-th]').forEach(x=>c[x.dataset.th]=+x.value);await aq('setThresholds',c);alert('Đã lưu. Các tháng được đánh dấu "Cần phân tích lại" – bấm "Phân tích dữ liệu" để áp dụng ngưỡng mới.');await refreshSide();vData()};
$('#thReset').onclick=()=>$$('[data-th]').forEach(x=>x.value=TH.def[x.dataset.th]);
async function loadBk(){const l=await api.listBackups();$('#tBk').innerHTML='<thead><tr><th>Bản sao lưu</th><th>Lúc</th><th class=n>MB</th><th></th></tr></thead><tbody>'+(l.map(b=>`<tr><td>${esc(b.name)}</td><td class=nw>${esc(b.at)}</td><td class=n>${(b.size/1048576).toFixed(1)}</td><td><button class="btn sm" data-rst="${esc(b.file)}">Khôi phục</button></td></tr>`).join('')||'<tr><td colspan=4 class=mut>Chưa có bản sao lưu</td></tr>')+'</tbody>'}
$('#bkNow').onclick=async()=>{try{const f=await api.backupNow();alert('Đã sao lưu: '+f);loadBk()}catch(e){alert(e.message)}};
$('#bkPick').onclick=async()=>{const f=await api.pickBackup();if(f)api.restoreBackup(f).catch(e=>alert(e.message))};
$('#tBk').onclick=e=>{const f=e.target.closest('[data-rst]')?.dataset.rst;if(f)api.restoreBackup(f).catch(e=>alert(e.message))};
$('#obTpl').onclick=()=>api.openingTemplate().catch(e=>alert(e.message));
$('#obImp').onclick=async()=>{try{const r=await api.importOpening();if(r){alert(`Đã nạp số dư đầu kỳ: ${num(r.rows)} dòng`+(r.skipped?`, bỏ qua ${num(r.skipped)} dòng ví dụ`:''));await refreshSide();vData()}}catch(e){alert(e.message)}};
$('#repPdf').onclick=async()=>{try{const f=await api.riskPdf();if(f)alert('Đã lưu báo cáo: '+f)}catch(e){alert(e.message)}};


/* ---------- Điều chỉnh trường quản trị: Hợp đồng, Mã vị trí, Biển số xe, Loại dòng tiền (không sửa dữ liệu gốc) ---------- */
const FAF=Object.assign({from:'',to:'',doc:'',acc:'',bp:'',q:'',field:'contract',val:'',empty:false,cash:false,adjOnly:false,tab:'s'},ls.get('faPick',{}));
const FAN={contract:'Hợp đồng',location:'Mã vị trí (Location)',plate:'Biển số xe',dept:'Phòng ban (Department Sub)',cf:'Loại dòng tiền'};
const CFC={'01':'Thu bán hàng, cung cấp dịch vụ','02':'Chi trả người cung cấp','03':'Chi trả người lao động','04':'Lãi vay đã trả','05':'Thuế TNDN đã nộp','06':'Thu khác HĐKD','07':'Chi khác HĐKD','21':'Chi mua sắm TSCĐ, TS dài hạn','22':'Thu thanh lý TSCĐ','23':'Chi cho vay, mua công cụ nợ','24':'Thu hồi cho vay','25':'Chi góp vốn','26':'Thu hồi góp vốn','27':'Thu lãi, cổ tức','31':'Nhận vốn góp','32':'Trả lại vốn góp','33':'Thu đi vay','34':'Trả nợ gốc vay','35':'Trả nợ thuê tài chính','36':'Cổ tức đã trả','61':'Ảnh hưởng tỷ giá'};
let FAR=null,FASEL=new Set();
async function vFA(){
  if(!FAN[FAF.field])FAF.field='contract';
  const yms=(await aq('months')).map(m=>m.ym).sort();if(!FAF.to)FAF.to=yms.at(-1)||'';if(!FAF.from)FAF.from=FAF.to;
  const H=$('#faBody');
  H.innerHTML=`<div class="card"><div class="subbar"><span class="crumb">Điều chỉnh dữ liệu quản trị</span><div class="subtabs" id="faTabs"><button data-fat="s" class="${FAF.tab==='s'?'on':''}">Tìm & điều chỉnh</button><button data-fat="h" class="${FAF.tab==='h'?'on':''}">Lịch sử điều chỉnh</button></div></div>
    <div class="hint" style="margin-bottom:8px">Chỉnh <b>Hợp đồng, Mã vị trí, Biển số xe, Loại dòng tiền</b> cho báo cáo quản trị / đối chiếu công nợ. <b>Không sửa dữ liệu gốc</b> – giá trị mới được lưu riêng, có thể bỏ bất cứ lúc nào. Hợp đồng sau điều chỉnh dùng cho tuổi nợ theo hợp đồng; dòng tiền sau điều chỉnh dùng cho B03.</div>
    ${FAF.tab==='s'?`<div class="filterrow">
      <label>Từ tháng <input type="month" data-fa="from" value="${FAF.from}"></label><label>Đến tháng <input type="month" data-fa="to" value="${FAF.to}"></label>
      <label>Chứng từ <input data-fa="doc" value="${esc(FAF.doc)}" style="width:150px"></label><label>TK <input data-fa="acc" value="${esc(FAF.acc)}" placeholder="vd 331, 1388" style="width:120px"></label>
      <label>Đối tượng <input data-fa="bp" value="${esc(FAF.bp)}" style="width:170px"></label><label>Diễn giải <input data-fa="q" value="${esc(FAF.q)}" style="width:170px"></label>
      <label>Lọc theo <select data-fa="field">${Object.entries(FAN).map(([k,v])=>`<option value="${k}" ${FAF.field===k?'selected':''}>${v}</option>`).join('')}</select></label><label>giá trị chứa <input data-fa="val" value="${esc(FAF.val)}" style="width:150px"></label>
      <label><input type="checkbox" data-fa="empty" ${FAF.empty?'checked':''}>Chỉ dòng đang trống</label><label><input type="checkbox" data-fa="cash" ${FAF.cash?'checked':''}>Chỉ bút toán thu/chi tiền</label><label><input type="checkbox" data-fa="adjOnly" ${FAF.adjOnly?'checked':''}>Chỉ dòng đã điều chỉnh</label>
      <button class="btn sm primary" id="faGo">Tìm</button></div>`:''}</div><div id="faRes"></div>`;
  $('#faTabs').onclick=e=>{const b=e.target.closest('[data-fat]');if(b){FAF.tab=b.dataset.fat;ls.set('faPick',FAF);vFA()}};
  H.querySelectorAll('[data-fa]').forEach(el=>el.addEventListener('change',()=>{FAF[el.dataset.fa]=el.type==='checkbox'?el.checked:el.value;ls.set('faPick',FAF)}));
  if(FAF.tab==='h')return faHist();
  $('#faGo').onclick=()=>{H.querySelectorAll('[data-fa]').forEach(el=>FAF[el.dataset.fa]=el.type==='checkbox'?el.checked:el.value);ls.set('faPick',FAF);FASEL.clear();faRun()};
  H.querySelectorAll('input[data-fa]').forEach(el=>el.addEventListener('keydown',e=>{if(e.key==='Enter')$('#faGo').click()}));
  if(FAR)faDraw();else $('#faRes').innerHTML='<div class="card mut">Nhập điều kiện rồi bấm <b>Tìm</b>.</div>';
}
async function faRun(){$('#faRes').innerHTML='<div class="card"><span class="spin"></span> Đang tìm bút toán…</div>';FAR=await aq('faSearch',{...FAF,limit:5000});faDraw()}
function faDraw(){const r=FAR,cv=(o,k)=>{const n=o[k+'New'],g=o[k];return n!=null?`<div class=mut style="text-decoration:line-through;font-size:11px">${esc(g||'(trống)')}</div><span class="badge b-H" title="${esc(o[k+'Note']||'')}">${esc(n||'(xoá trống)')}</span>`:esc(g||'')};
  const cfv=o=>o.cfNew!=null?`<div class=mut style="text-decoration:line-through;font-size:11px">${esc(o.cf||'(trống)')}</div><span class="badge b-H" title="${esc(o.cfNote||'')}">${o.cfNew} – ${esc(CFC[o.cfNew]||'')}</span>`:o.cash?esc(o.cf||''):'<span class=mut>–</span>';
  $('#faRes').innerHTML=`<div class="card"><div class="row" style="flex-wrap:wrap;gap:8px;align-items:center;background:#FFF6F2;padding:8px 10px;border-radius:8px">
      <b>${r.total} bút toán${r.truncated?' (hiển thị 5.000 dòng đầu – thu hẹp điều kiện)':''}</b><div style="flex:1"></div><span id="faSelI" class="mut"></span>
      <label>Trường <select id="faF">${Object.entries(FAN).map(([k,v])=>`<option value="${k}" ${FAF.field===k?'selected':''}>${v}</option>`).join('')}</select></label>
      <span id="faValW"></span><input id="faNote" placeholder="Ghi chú lý do" style="width:170px">
      <button class="btn sm primary" id="faApply" disabled>Áp dụng</button><button class="btn sm ghost" id="faUndo" disabled>Bỏ điều chỉnh trường này</button><button class="btn sm" id="faXls">${ic('download')}Xuất Excel</button></div>
    <div class="tbl" style="max-height:calc(100vh - 420px);margin-top:8px"><table><thead><tr><th><input type="checkbox" id="faAll"></th><th>Ngày</th><th>Chứng từ</th><th>TK Nợ</th><th>TK Có</th><th>Đối tượng Nợ</th><th>Đối tượng Có</th><th class=n>Số tiền</th><th>Diễn giải</th><th>Hợp đồng</th><th>Mã vị trí</th><th>Biển số xe</th><th>Loại dòng tiền</th></tr></thead><tbody>
    ${r.rows.slice(0,2000).map((o,i)=>`<tr class=dbl data-eid="${o.id}"><td><input type="checkbox" data-fi="${i}" ${FASEL.has(o.id)?'checked':''}></td><td class=nw>${vn(o.d)}</td><td class=nw>${esc(o.doc)}</td><td><div class="clamp s">${esc(o.drName||o.dr)}</div></td><td><div class="clamp s">${esc(o.crName||o.cr)}</div></td><td><div class="clamp s" title="${esc(o.bp||'')}">${esc(o.bp||'')}</div></td><td><div class="clamp s" title="${esc(o.bpCr||'')}">${esc(o.bpCr||'')}</div></td><td class=n>${fmt2(o.a)}</td><td><div class=clamp title="${esc(o.ds)}">${esc(o.ds)}</div></td><td style="font-size:12px"><div class="clamp s">${cv(o,'contract')}</div></td><td style="font-size:12px">${cv(o,'location')}</td><td style="font-size:12px">${cv(o,'plate')}</td><td style="font-size:12px">${cfv(o)}</td></tr>`).join('')||'<tr><td colspan=13 class=mut style="text-align:center;padding:24px">Không có bút toán phù hợp</td></tr>'}
    ${r.rows.length>2000?`<tr><td colspan=13 class=mut style="text-align:center">… còn ${num(r.rows.length-2000)} dòng – thu hẹp điều kiện</td></tr>`:''}</tbody></table></div></div>`;
  const valW=async()=>{const f=$('#faF').value;if(f==='cf'){$('#faValW').innerHTML=`<select id="faV" style="max-width:300px"><option value="">Chọn dòng tiền…</option>${Object.entries(CFC).map(([k,v])=>`<option value="${k}">${k} – ${esc(v)}</option>`).join('')}</select>`;return}
    const v=await aq('faValues',f,'');if($('#faF').value!==f)return;
    $('#faValW').innerHTML=`<select id="faVS" class="srch" style="max-width:320px"><option value="">— Chọn giá trị mới (${num(v.length)}) —</option><option value="__EMPTY__">(Xoá trống)</option>${v.map(x=>`<option value="${esc(x.v)}">${esc(f==='contract'?refShort(x.v):x.v)} · ${num(x.n)} dòng</option>`).join('')}</select><input id="faVM" class="hide" placeholder="Nhập giá trị mới" style="width:220px"><label style="display:inline-flex;gap:4px;align-items:center;font-size:13px;margin-left:4px"><input type="checkbox" id="faMan">Nhập thủ công</label><input id="faV" type="hidden">`;
    const sync=()=>{const m=$('#faMan').checked,sv=$('#faVS').value;$('#faV').value=m?$('#faVM').value.trim():sv==='__EMPTY__'?'':sv;$('#faV').dataset.ok=(m||sv)?'1':''};
    ['#faVS','#faVM'].forEach(x=>{$(x).addEventListener('change',e=>{e.stopPropagation();sync()});$(x).addEventListener('input',sync)});
    $('#faMan').onchange=e=>{e.stopPropagation();const m=e.target.checked;$('#faVM').classList.toggle('hide',!m);$('#faVS').classList.toggle('hide',m);const si=$('#faVS').previousElementSibling;if(si&&si.classList.contains('selsrch'))si.classList.toggle('hide',m);sync()};sync()};
  valW();$('#faF').onchange=e=>{e.stopPropagation();valW()};
  const upd=()=>{const n=FASEL.size;$('#faSelI').textContent=n?`Đã chọn ${num(n)} dòng`:'Chưa chọn dòng';$('#faApply').disabled=$('#faUndo').disabled=!n};upd();
  const T=$('#faRes table');T.addEventListener('change',e=>{if(e.target.id==='faAll'){r.rows.slice(0,2000).forEach(o=>e.target.checked?FASEL.add(o.id):FASEL.delete(o.id));T.querySelectorAll('[data-fi]').forEach(c=>c.checked=e.target.checked);return upd()}
    const i=e.target.dataset.fi;if(i==null)return;const o=r.rows[+i];e.target.checked?FASEL.add(o.id):FASEL.delete(o.id);upd()});
  T.ondblclick=e=>{if(e.target.type==='checkbox')return;const tr=e.target.closest('tr[data-eid]');if(tr)showDetail(null,+tr.dataset.eid)};
  const picked=()=>r.rows.filter(o=>FASEL.has(o.id));
  $('#faApply').onclick=async()=>{const f=$('#faF').value,v=$('#faV').value,p=picked();if(f==='cf'&&!v)return alert('Chọn loại dòng tiền');if(f!=='cf'&&!$('#faV').dataset.ok)return alert('Chọn giá trị mới (gõ vào ô 🔍 để tìm), chọn (Xoá trống), hoặc tích "Nhập thủ công"');
    if(!await ask(`${FAN[f]}: đặt "${v||'(trống)'}" cho ${p.length} bút toán?`))return;try{const x=await aq('faSet',p,f,v,$('#faNote').value.trim());alert(`Đã điều chỉnh ${num(x.n)} dòng`);faRun()}catch(e){alert(e.message)}};
  $('#faUndo').onclick=async()=>{const f=$('#faF').value,p=picked().filter(o=>f==='cf'?o.cfNew!=null:o[f+'New']!=null);if(!p.length)return alert('Các dòng đã chọn chưa điều chỉnh '+FAN[f]);if(!await ask(`Bỏ điều chỉnh ${FAN[f]} của ${p.length} dòng?`))return;await aq('faRemove',p.map(o=>({id:o.id,field:f,sig:o.sig})));faRun()};
  $('#faXls').onclick=async()=>{try{const f=await api.xlsxSheets(`AccSoft_DieuChinhDuLieu_${FAF.from}_${FAF.to}.xlsx`,[['Chi tiet',r.rows.map(o=>({'Ngày':o.d,'Chứng từ':o.doc,'TK Nợ':o.drName||o.dr,'TK Có':o.crName||o.cr,'Đối tượng Nợ':o.bp,'Đối tượng Có':o.bpCr,'Số tiền':o.a,'Diễn giải':o.ds,
    'Hợp đồng (gốc)':o.contract,'Hợp đồng (sau ĐC)':o.contractNew??o.contract,'Mã vị trí (gốc)':o.location,'Mã vị trí (sau ĐC)':o.locationNew??o.location,'Biển số xe (gốc)':o.plate,'Biển số xe (sau ĐC)':o.plateNew??o.plate,'Dòng tiền (gốc)':o.cash?o.cf:'','Dòng tiền (sau ĐC)':o.cfNew!=null?o.cfNew+' – '+(CFC[o.cfNew]||''):o.cash?o.cf:''}))]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
}
async function faHist(){const L=await aq('faList');
  $('#faRes').innerHTML=`<div class="card"><div class="row" style="margin-bottom:8px"><b>${num(L.length)} điều chỉnh</b><div style="flex:1"></div><button class="btn sm ghost" id="faHDel" disabled>Bỏ điều chỉnh đã chọn</button><button class="btn sm" id="faHXls">${ic('download')}Xuất Excel</button></div>
    ${tbl0(['<input type="checkbox" id="faHAll">','Trường','Giá trị gốc','Giá trị sau điều chỉnh','Chứng từ','Ngày','TK Nợ','TK Có','#Số tiền','Đối tượng','Ghi chú','Cập nhật'],L.map((x,i)=>`<tr><td><input type="checkbox" data-hi="${i}"></td><td>${FAN[x.field]||x.field}</td><td class=mut>${esc(x.orig||'')}</td><td><b>${esc(x.field==='cf'?x.value+' – '+(CFC[x.value]||''):x.value||'(trống)')}</b></td><td class=nw>${esc(x.doc||'')}</td><td class=nw>${vn(x.d)}</td><td>${esc(x.dr||'')}</td><td>${esc(x.cr||'')}</td><td class=n>${x.a!=null?fmt2(x.a):''}</td><td><div class="clamp s">${esc(x.bp||x.bpCr||'')}</div></td><td>${esc(x.note||'')}</td><td class=nw>${esc(x.updated_at||'')}</td></tr>`),'Chưa có điều chỉnh nào')}</div>`;
  const B=$('#faRes'),chk=()=>{const n=B.querySelectorAll('[data-hi]:checked').length;$('#faHDel').disabled=!n};
  B.onchange=e=>{if(e.target.id==='faHAll')B.querySelectorAll('[data-hi]').forEach(c=>c.checked=e.target.checked);chk()};
  $('#faHDel').onclick=async()=>{const s=[...B.querySelectorAll('[data-hi]:checked')].map(c=>L[+c.dataset.hi]);if(!await ask(`Bỏ ${s.length} điều chỉnh?`))return;await aq('faRemove',s.map(x=>({id:x.id,field:x.field,sig:x.sig})));faHist()};
  $('#faHXls').onclick=async()=>{try{const f=await api.xlsxSheets(`AccSoft_LichSuDieuChinh.xlsx`,[['Dieu chinh',L.map(x=>({'Trường':FAN[x.field]||x.field,'Giá trị gốc':x.orig,'Giá trị sau điều chỉnh':x.value,'Chứng từ':x.doc,'Ngày':x.d,'TK Nợ':x.dr,'TK Có':x.cr,'Số tiền':x.a,'Đối tượng Nợ':x.bp,'Đối tượng Có':x.bpCr,'Ghi chú':x.note,'Cập nhật':x.updated_at}))]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
}

/* ---------- Danh mục phòng ban (ánh xạ phòng ban dữ liệu gốc) & khoản mục chi phí ---------- */
const DMF=Object.assign({tab:'dept',q:'',grp:''},ls.get('dmPick',{}));
async function vDM(){
  const H=$('#dmBody');ls.set('dmPick',DMF);
  H.innerHTML=`<div class="card"><div class="subbar"><span class="crumb">Danh mục báo cáo</span><div class="subtabs" id="dmTabs">${[['dept','Phòng ban'],['map','Ánh xạ phòng ban dữ liệu gốc'],['cost','Khoản mục chi phí']].map(([k,v])=>`<button data-dmt="${k}" class="${DMF.tab===k?'on':''}">${v}</button>`).join('')}</div>
    <div style="flex:1"></div>${DMF.tab!=='map'?`<button class="btn sm primary" id="dmAdd">Thêm</button><button class="btn sm" id="dmImp">${ic('upload')}Nạp file (thêm / cập nhật)</button><button class="btn sm ghost" id="dmImpR">Nạp thay toàn bộ</button>`:`<button class="btn sm primary" id="dmAuto">Tự ánh xạ theo tên trùng</button>`}<button class="btn sm" id="dmXls">${ic('download')}Xuất Excel</button></div><div id="dmIn"></div></div>`;
  $('#dmTabs').onclick=e=>{const b=e.target.closest('[data-dmt]');if(b){DMF.tab=b.dataset.dmt;vDM()}};
  const kind=DMF.tab==='cost'?'cost':'dept';
  if($('#dmImp'))$('#dmImp').onclick=async()=>{try{const r=await api.dmImport(kind,'merge');if(r){alert(`Đã nạp ${num(r.n)} dòng từ ${r.file} · danh mục có ${num(r.total)} mục`);vDM()}}catch(e){alert(e.message)}};
  if($('#dmImpR'))$('#dmImpR').onclick=async()=>{if(!await ask('Xoá toàn bộ danh mục hiện tại rồi nạp lại từ file?'))return;try{const r=await api.dmImport(kind,'replace');if(r){alert(`Đã nạp ${num(r.n)} dòng`);vDM()}}catch(e){alert(e.message)}};
  $('#dmXls').onclick=async()=>{const rows=DMF.tab==='map'?(await aq('dmDeptSources')).map(s=>({'Phòng ban dữ liệu gốc':s.src,'Phòng ban danh mục':s.code||'','Số dòng':s.n,'Từ ngày':s.f,'Đến ngày':s.l})):await aq('dmExport',kind);
    try{const f=await api.xlsxSheets(`DANH_MUC_${DMF.tab==='cost'?'KHOAN_MUC_CHI_PHI':DMF.tab==='map'?'ANH_XA_PHONG_BAN':'PHONG_BAN'}_${new Date().toISOString().slice(0,10)}.xlsx`,[['Danh muc',rows]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
  if(DMF.tab==='dept')await dmDept();else if(DMF.tab==='map')await dmMap();else return dmCost();dmRowSearch();
}
// Ô tìm nhanh dòng cho tab Phòng ban / Ánh xạ: gõ vài ký tự → chỉ hiện dòng chứa ký tự đó (mã, tên, tên gốc, phòng ban đã gắn)
function dmRowSearch(){const B=$('#dmIn');if(!B||B.querySelector('#dmRQ'))return;const tb=B.querySelector('tbody');if(!tb)return;
  const nm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
  const w=document.createElement('div');w.className='row';w.style.cssText='gap:8px;align-items:center;margin:6px 0';
  w.innerHTML=`<input id="dmRQ" type="search" placeholder="🔍 Tìm phòng ban (mã, tên, tên trong dữ liệu gốc…)" style="width:360px" value="${esc(DMF.rq||'')}"><span id="dmRN" class="mut"></span>`;
  const t=tb.closest('.tbl')||tb.closest('table');t.parentNode.insertBefore(w,t);
  const go=()=>{const q=nm($('#dmRQ').value.trim());DMF.rq=$('#dmRQ').value;let n=0,all=0;for(const tr of tb.rows){all++;const txt=nm([...tr.cells].filter(c=>!c.querySelector('select')).map(c=>c.textContent).join(' ')+' '+[...tr.querySelectorAll('select')].map(x=>x.selectedOptions[0]?x.selectedOptions[0].textContent:'').join(' '));const k=!q||txt.includes(q);tr.style.display=k?'':'none';if(k)n++}
    $('#dmRN').textContent=q?`${num(n)} / ${num(all)} dòng`:''};
  $('#dmRQ').addEventListener('input',deb(go,150));$('#dmRQ').addEventListener('change',e=>e.stopPropagation());go();
}
async function dmDept(){const L=await aq('dmDeptList');
  $('#dmIn').innerHTML=`<div class="hint" style="margin:8px 0">${num(L.length)} phòng ban · một phòng ban danh mục có thể gắn nhiều tên phòng ban trong dữ liệu gốc (xem / sửa ở tab "Ánh xạ").</div>`+tbl0(['Mã','Tên','Mô tả','Phòng ban dữ liệu gốc đã gắn','#Số dòng hạch toán','Ghi chú',''],L.map(d=>`<tr><td class=nw><b>${esc(d.code)}</b></td><td>${esc(d.name||'')}</td><td>${esc(d.descr||'')}</td><td style="font-size:12px">${d.maps.map(m=>`<span class="badge" title="${num(m.n)} dòng">${esc(m.src)}</span>`).join(' ')||'<span class=mut>chưa gắn</span>'}</td><td class=n>${num(d.n)}</td><td>${esc(d.note||'')}</td><td class=nw><button class="btn sm" data-dme="${esc(d.code)}">Sửa</button> <button class="btn sm ghost" data-dmd="${esc(d.code)}">${ic('x')}</button></td></tr>`),'Chưa có phòng ban');
  const form=(x,isNew)=>{CUR=-1;$('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Danh mục phòng ban</div><h2 style="font-size:20px">${isNew?'Thêm phòng ban':'Sửa phòng ban'}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
    <div class="pb"><div class="card"><div class="filters" style="grid-template-columns:repeat(2,1fr)">${[['code','Mã'],['name','Tên'],['descr','Mô tả'],['note','Ghi chú']].map(([k,l])=>`<label style="display:grid;gap:4px">${l}<input id="df_${k}" value="${esc(x[k]||'')}"></label>`).join('')}</div><div class="row"><div style="flex:1"></div><button class="btn primary" id="dfSave">Lưu</button></div></div></div>`;
    $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
    $('#dfSave').onclick=async()=>{try{await aq('dmDeptUpsert',Object.fromEntries(['code','name','descr','note'].map(k=>[k,$('#df_'+k).value])),isNew?null:x.code);closeDetail();vDM()}catch(e){alert(e.message)}}};
  if(DMF.tab!=='dept'||!$('#dmAdd'))return;$('#dmAdd').onclick=()=>form({},true);
  $('#dmIn').onclick=async e=>{const ed=e.target.closest('[data-dme]'),dl=e.target.closest('[data-dmd]');if(ed)form(L.find(d=>d.code===ed.dataset.dme),false);
    if(dl&&await ask(`Xoá phòng ban ${dl.dataset.dmd} (và các ánh xạ của nó)?`)){await aq('dmDeptRemove',[dl.dataset.dmd]);vDM()}};
}
async function dmMap(){const [S,D]=await Promise.all([aq('dmDeptSources'),aq('dmDeptList')]),un=S.filter(s=>!s.code);
  const opt=c=>`<option value="">— chưa gắn —</option>`+D.map(d=>`<option value="${esc(d.code)}" ${d.code===c?'selected':''}>${esc(d.code)} – ${esc(d.name||'')}</option>`).join('');
  $('#dmIn').innerHTML=`<div class="hint" style="margin:8px 0">${num(S.length)} tên phòng ban trong dữ liệu gốc · ${un.length?`<span class=neg>${num(un.length)} chưa gắn</span>`:'<span class=pos>✓ đã gắn đủ</span>'} · chọn phòng ban danh mục cho từng dòng (lưu ngay). Tích nhiều dòng để gắn cùng lúc.</div>
    <div class="row" style="gap:8px;margin-bottom:8px;background:#FFF6F2;padding:8px 10px;border-radius:8px"><span id="dmSel" class="mut">Chưa chọn dòng</span><div style="flex:1"></div><select id="dmTo" style="max-width:360px">${opt('')}</select><button class="btn sm primary" id="dmSet" disabled>Gắn các dòng đã chọn</button></div>`+
    tbl0(['<input type="checkbox" id="dmAll">','Phòng ban trong dữ liệu gốc','#Số dòng','Từ ngày','Đến ngày','Phòng ban danh mục'],S.map((s,i)=>`<tr${s.code?'':' style="background:#FFFAEB"'}><td><input type="checkbox" data-dms="${i}"></td><td><b>${esc(s.src)}</b></td><td class=n>${num(s.n)}</td><td class=nw>${vn(s.f)}</td><td class=nw>${vn(s.l)}</td><td><select data-dmm="${i}" style="max-width:380px">${opt(s.code)}</select></td></tr>`),'Không có phòng ban trong dữ liệu');
  if(DMF.tab!=='map'||!$('#dmAuto'))return;const B=$('#dmIn'),chk=()=>{const n=B.querySelectorAll('[data-dms]:checked').length;$('#dmSel').textContent=n?`Đã chọn ${n} dòng`:'Chưa chọn dòng';$('#dmSet').disabled=!n};
  B.onchange=async e=>{if(e.target.id==='dmAll'){B.querySelectorAll('[data-dms]').forEach(c=>c.checked=e.target.checked&&c.closest('tr').style.display!=='none');return chk()}if(e.target.dataset.dms!=null)return chk();
    const i=e.target.dataset.dmm;if(i==null)return;await aq('dmDeptMapSet',[S[+i].src],e.target.value);e.target.closest('tr').style.background=e.target.value?'':'#FFFAEB'};
  $('#dmSet').onclick=async()=>{const to=$('#dmTo').value;if(!to&&!await ask('Bỏ gắn các dòng đã chọn?'))return;await aq('dmDeptMapSet',[...B.querySelectorAll('[data-dms]:checked')].map(c=>S[+c.dataset.dms].src),to);vDM()};
  $('#dmAuto').onclick=async()=>{const r=await aq('dmDeptAutoMap');alert(`Đã tự gắn ${num(r.n)} tên phòng ban`);vDM()};
}
async function dmCost(){const r=await aq('dmCostList',DMF.q,DMF.grp,0,1000),U0=await aq('dmCostUnmatched'),nq=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d'),uq=nq(DMF.q.trim()),U=uq?U0.filter(u=>nq(u.code+' '+u.name).includes(uq)):U0;
  const F=[['code','Mã (Code)'],['name','Tên (Name)'],['descr','Mô tả'],['vn','Tiếng Việt'],['grp','Nhóm chi phí (Expense Group)'],['kd1','Khoản mục KD1'],['level','Summary Level'],['active','Active'],['has_loc','Has Location'],['has_prod','Has Product'],['note','Ghi chú']];
  $('#dmIn').innerHTML=`<div class="filterrow" style="margin:8px 0"><input id="dmQ" type="search" placeholder="🔍 Tìm khoản mục (mã, tên, mô tả, tiếng Việt, nhóm…)" value="${esc(DMF.q)}" style="width:360px"><select id="dmG"><option value="">Mọi nhóm chi phí</option>${r.groups.map(g=>`<option value="${esc(g.g||'(trống)')}" ${DMF.grp===(g.g||'(trống)')?'selected':''}>${esc(g.g||'(trống)')} – ${num(g.n)}</option>`).join('')}</select><span class="mut">${num(r.total)} khoản mục${r.total>r.rows.length?' · hiển thị '+num(r.rows.length):''}</span></div>`+
    tbl0(['Mã','Tên','Mô tả / Tiếng Việt','Nhóm chi phí','Khoản mục KD1','Tổng hợp','Active','#Số dòng hạch toán',''],r.rows.map(x=>`<tr${x.level==='Yes'?' style="font-weight:600;background:#F9FAFB"':''}><td class=nw>${esc(x.code)}</td><td>${esc(x.name||'')}</td><td style="font-size:12px"><div class=clamp title="${esc(x.descr||'')}">${esc(x.vn||x.descr||'')}</div></td><td style="font-size:12px">${esc(x.grp||'')}</td><td style="font-size:12px">${esc(x.kd1||'')}</td><td>${esc(x.level||'')}</td><td>${esc(x.active||'')}</td><td class=n>${x.used?num(x.used):''}</td><td class=nw><button class="btn sm" data-cme="${esc(x.code)}">Sửa</button> <button class="btn sm ghost" data-cmd="${esc(x.code)}">${ic('x')}</button></td></tr>`),'Không có khoản mục')+
    (U.length?`<div class="card" style="margin-top:12px;background:#FFFAEB"><div class="card-h"><h3>Khoản mục đang hạch toán nhưng chưa có trong danh mục (${uq?num(U.length)+' / '+num(U0.length)+' khớp tìm':num(U.length)})</h3></div>${tbl0(['Mã','Tên trong dữ liệu','#Số dòng','PS gần nhất',''],U.map(u=>`<tr><td class=nw>${esc(u.code)}</td><td>${esc(u.name)}</td><td class=n>${num(u.n)}</td><td class=nw>${vn(u.l)}</td><td><button class="btn sm" data-cmn="${esc(u.code)}" data-cmnn="${esc(u.name)}">Thêm vào danh mục</button></td></tr>`))}</div>`:'');
  const form=(x,isNew)=>{CUR=-1;$('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Danh mục khoản mục chi phí</div><h2 style="font-size:20px">${isNew?'Thêm khoản mục':'Sửa khoản mục '+esc(x.code)}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
    <div class="pb"><div class="card"><div class="filters" style="grid-template-columns:repeat(2,1fr)">${F.map(([k,l])=>`<label style="display:grid;gap:4px${k==='descr'?';grid-column:1/-1':''}">${l}<input id="cf2_${k}" value="${esc(x[k]||'')}" list="${k==='grp'?'cfGrpL':''}"></label>`).join('')}<datalist id="cfGrpL">${r.groups.filter(g=>g.g).map(g=>`<option value="${esc(g.g)}">`).join('')}</datalist></div><div class="row"><div style="flex:1"></div><button class="btn primary" id="cfSave2">Lưu</button></div></div></div>`;
    $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
    $('#cfSave2').onclick=async()=>{try{await aq('dmCostUpsert',Object.fromEntries(F.map(([k])=>[k,$('#cf2_'+k).value])),isNew?null:x.code);closeDetail();vDM()}catch(e){alert(e.message)}}};
  if(DMF.tab!=='cost'||!$('#dmAdd'))return;$('#dmAdd').onclick=()=>form({active:'Yes',level:'No'},true);
  if(DMF._qf){const q=$('#dmQ');q.focus();q.setSelectionRange(q.value.length,q.value.length);DMF._qf=false}
  let T=0;$('#dmQ').oninput=e=>{clearTimeout(T);T=setTimeout(()=>{DMF.q=e.target.value;ls.set('dmPick',DMF);DMF._qf=document.activeElement===e.target;dmCost()},300)};$('#dmG').onchange=e=>{DMF.grp=e.target.value;dmCost()};
  $('#dmIn').onclick=async e=>{const ed=e.target.closest('[data-cme]'),dl=e.target.closest('[data-cmd]'),nw=e.target.closest('[data-cmn]');
    if(ed)form(r.rows.find(x=>x.code===ed.dataset.cme),false);if(nw)form({code:nw.dataset.cmn,name:nw.dataset.cmnn,active:'Yes',level:'No'},true);
    if(dl&&await ask(`Xoá khoản mục ${dl.dataset.cmd}?`)){await aq('dmCostRemove',[dl.dataset.cmd]);dmCost()}};
}

/* ---------- Báo cáo quản trị chi phí theo chiều: vị trí / biển số xe / phòng ban × nhóm chi phí × tháng (điều chỉnh giá trị chiều tại bút toán gốc) ---------- */
const DIMU={
  location:{page:'locBody',title:'Chi phí theo vị trí',what:'mã vị trí',field:'location',hint:'Thuê trạm, văn phòng, nhà nghỉ, điện trạm, xăng dầu máy phát theo mã vị trí (Location) · ô <span style="background:#FEE4E2;padding:0 4px">đỏ</span> = tháng thiếu chi phí · ô <span style="background:#FFF1EB;padding:0 4px">cam</span> = cao bất thường (&gt; 1,8 lần bình quân)'},
  plate:{page:'vehBody',title:'Chi phí theo xe (biển số)',what:'biển số xe',field:'plate',hint:'Xăng dầu, sửa chữa, dầu – nước làm mát, thuê xe, khấu hao theo biển số (License Plate) · ô <span style="background:#FEE4E2;padding:0 4px">đỏ</span> = vượt định mức / xe / tháng · ô <span style="background:#FFF1EB;padding:0 4px">cam</span> = cao bất thường so với bình quân của xe · cột "So với đội xe" = tổng kỳ / trung vị các xe cùng nhóm'},
  dept:{page:'dptBody',title:'Chi phí theo phòng ban',what:'phòng ban',field:'dept',hint:'Mọi chi phí (TK 6xx/8xx) theo <b>phòng ban ngân sách – cột Department Sub</b> (không dùng cột Department) và nhóm chi phí (Expense Group) · cột "Phòng ban danh mục" theo ánh xạ ở Danh mục phòng ban · nhấn đúp để xem bút toán và chuyển đúng phòng ban ngân sách'},
};
const DIMF={};for(const d in DIMU)DIMF[d]=Object.assign({from:'',to:'',g:[],key:'',q:'',only:false},ls.get('dimPick_'+d,{}));
const DIMR={};
async function vDim(d){const U=DIMU[d],F=DIMF[d],yms=(await aq('months')).map(m=>m.ym).sort();if(!F.to)F.to=yms.at(-1)||'';if(!F.from)F.from=yms.filter(m=>m.slice(0,4)===F.to.slice(0,4))[0]||F.to;
  $('#'+U.page).innerHTML='<div class="card"><span class="spin"></span> Đang tổng hợp…</div>';DIMR[d]=await aq('locMatrix',d,F.from,F.to,F.g);ls.set('dimPick_'+d,F);dimDraw(d)}
function dimDraw(d){const U=DIMU[d],F=DIMF[d],r=DIMR[d],H=$('#'+U.page),q=F.q.trim().toLowerCase(),M=r.months,isV=d==='plate',isL=d==='location',isD=d==='dept',byG=!isD;
  const flag=o=>isL?o.gaps.length:isV?(o.over.length||o.high.length||(o.ratio||0)>=1.5):(o.high.length||(o.ratio||0)>=2);
  const keysAll=uniq(r.rows.map(o=>o.label));if(F.key&&!keysAll.includes(F.key))F.key='';
  // vị trí / xe: sắp theo khoản mục (nhóm chi phí) → mã; phòng ban: theo phòng ban → nhóm
  const R=r.rows.filter(o=>(!F.key||o.label===F.key)&&(!q||(o.label+' '+o.cat+' '+o.gn+' '+(o.tcs||[]).map(x=>x.tc).join(' ')).toLowerCase().includes(q))&&(!F.only||flag(o)))
    .sort(byG?(a,b)=>a.gn.localeCompare(b.gn)||String(a.label).localeCompare(String(b.label)):(a,b)=>String(a.label).localeCompare(String(b.label))||a.gn.localeCompare(b.gn));
  const tot=R.reduce((s,o)=>s+o.tot,0),none=r.rows.filter(o=>!o.k).reduce((s,o)=>s+o.tot,0),nFlag=r.rows.filter(flag).length,keys=new Set(r.rows.map(o=>o.k).filter(Boolean)).size;
  const What=U.what[0].toUpperCase()+U.what.slice(1),nc=M.length+(isD?7:5);
  const sumRow=(L,label,attr)=>{const v=m=>L.reduce((s,o)=>s+(o.v[m]||0),0),t=L.reduce((s,o)=>s+o.tot,0);return `<tr ${attr} style="font-weight:700;background:#FFF6F2"><td colspan=${isD?(byG?3:4):2}>${label}</td>${M.map(m=>`<td class="n dbl" data-dm="${m}">${Math.abs(v(m))>0.004?fmt2(v(m)):''}</td>`).join('')}<td class="n dbl" data-dm="" title="Nhấn đúp: toàn bộ bút toán chi tiết">${fmt2(t)}</td><td></td><td></td></tr>`};
  const row=o=>{const lab=`<td class="dbl" data-dm=""><b>${esc(o.label)}</b></td>`,grp=`<td style="font-size:12px">${esc(o.gn)}</td>`;
    return `<tr data-dri="${r.rows.indexOf(o)}">${byG?grp+lab:lab+(isD?`<td style="font-size:12px">${o.cat?esc(o.cat):'<span class=neg>chưa ánh xạ</span>'}</td>`:'')+grp}${isD?tcCell(o):''}${M.map(m=>{const v=o.v[m],gap=isL&&o.gaps.includes(m),ov=o.over.includes(m),hi=o.high.includes(m);return `<td class="n dbl" data-dm="${m}" style="${gap||ov?'background:#FEE4E2':hi?'background:#FFF1EB':''}" title="${gap?'Thiếu chi phí tháng này':ov?'Vượt định mức '+fmt2(o.lim):hi?'Cao bất thường so với bình quân':''}">${Math.abs(v)>0.004?fmt2(v):gap?'<span class=neg>thiếu</span>':''}</td>`}).join('')}<td class="n dbl" data-dm="" title="Nhấn đúp: toàn bộ bút toán chi tiết"><b>${fmt2(o.tot)}</b></td><td class=n>${fmt2(o.avg)}</td>${isL?`<td class="n ${o.gaps.length?'neg':''}">${o.gaps.length||''}</td>`:`<td class="n ${(o.ratio||0)>=1.5?'neg':''}">${o.ratio!=null?'× '+o.ratio.toFixed(2):''}</td>`}</tr>`};
  const det=isD&&F.mode==='det',rowDet=o=>{const i=r.rows.indexOf(o),L=o.tcRows||[];if(!L.length)return row(o);return L.map((x,j)=>`<tr data-dri="${i}" data-dtc="${j}"${j===0?' style="border-top:2px solid var(--gray-200,#EAECF0)"':''}><td class="dbl" data-dm="">${j===0?`<b>${esc(o.label)}</b>`:'<span class=mut>〃</span>'}</td><td style="font-size:12px">${j===0?(o.cat?esc(o.cat):'<span class=neg>chưa ánh xạ</span>'):''}</td><td style="font-size:12px">${j===0?esc(o.gn):''}</td><td style="font-size:12px">${esc(x.tc||'(trống)')}</td>${M.map(m=>`<td class="n dbl" data-dm="${m}">${Math.abs(x.v[m])>0.004?fmt2(x.v[m]):''}</td>`).join('')}<td class="n dbl" data-dm=""><b>${fmt2(x.tot)}</b></td><td></td><td></td></tr>`).join('')+(L.length>1?`<tr data-dri="${i}" style="font-weight:600;background:#F9FAFB"><td colspan=4 class=mut style="font-size:12px">Cộng ${esc(o.label)} · ${esc(o.gn)}</td>${M.map(m=>`<td class="n dbl" data-dm="${m}">${Math.abs(o.v[m])>0.004?fmt2(o.v[m]):''}</td>`).join('')}<td class="n dbl" data-dm="">${fmt2(o.tot)}</td><td class=n>${fmt2(o.avg)}</td><td></td></tr>`:'')};
  let body='';const shown=R.slice(0,3000);
  if(byG){const gs=uniq(shown.map(o=>o.g));for(const g of r.groups.map(x=>x.k).filter(k=>gs.includes(k))){const L=shown.filter(o=>o.g===g);body+=L.map(row).join('')+sumRow(L,'Cộng '+esc(L[0].gn),`data-dsub="${esc(g)}"`)}}
  else body=shown.map(det?rowDet:row).join('');
  body=(body||`<tr><td colspan=${nc} class=mut style="text-align:center;padding:20px">Không có dữ liệu</td></tr>`)+(R.length>3000?`<tr><td colspan=${nc} class=mut style="text-align:center">… còn ${num(R.length-3000)} dòng – lọc thêm</td></tr>`:'')+(R.length?sumRow(R,'TỔNG CỘNG','data-dtot="1"'):'');
  H.innerHTML=`<div class="card"><div class="subbar"><span class="crumb">${U.title}</span><span class="hint">${U.hint}</span></div>
    <div class="filterrow"><label>Từ tháng <input type="month" id="dF_${d}" value="${F.from}"></label><label>Đến tháng <input type="month" id="dT_${d}" value="${F.to}"></label>
      <label>Khoản mục / nhóm chi phí <select id="dmG_${d}" class="srch" data-auto="1" style="max-width:320px"><option value="">Tất cả (${r.groups.length})</option>${r.groups.map(g=>`<option value="${esc(g.k)}" ${F.g.length===1&&F.g[0]===g.k?'selected':''}>${esc(g.n)}</option>`).join('')}</select></label>
      <label>${What} <select id="dK_${d}" class="srch" data-auto="1" style="max-width:280px"><option value="">Tất cả (${num(keysAll.length)})</option>${keysAll.map(k=>`<option value="${esc(k)}" ${F.key===k?'selected':''}>${esc(k)}</option>`).join('')}</select></label>
      <input id="dQ_${d}" placeholder="Tìm…" value="${esc(F.q)}" style="width:160px"><label><input type="checkbox" id="dO_${d}" ${F.only?'checked':''}>${isL?'Chỉ dòng có tháng thiếu':isV?'Chỉ xe vượt định mức / bất thường':'Chỉ dòng bất thường'}</label>
      ${isD?`<label>Hiển thị <select id="dMode_${d}"><option value="">Tổng hợp</option><option value="det" ${F.mode==='det'?'selected':''}>Chi tiết theo type of cost</option></select></label>`:''}<button class="btn sm primary" id="dGo_${d}">Xem</button><button class="btn sm" id="dX_${d}">${ic('download')}Xuất Excel</button></div>
    ${isV?`<div class="filterrow" style="margin-top:6px"><b style="font-size:13px">Định mức / xe / tháng:</b>${r.groups.map(g=>`<label style="font-size:12px">${esc(g.n)} <input type="number" data-vn="${esc(g.k)}" value="${r.norms[g.k]||''}" placeholder="không" style="width:90px"></label>`).join('')}<button class="btn sm" id="vnSave">Lưu định mức</button></div>`:''}</div>
    <div class="kpis">${kpi('','coins','Tổng chi phí (đang lọc)',fmt2(tot))}${kpi('blue','users','Số '+U.what,num(keys))}${kpi(nFlag?'red':'green','alert',isL?'Dòng có tháng thiếu':isV?'Dòng xe vượt định mức / bất thường':'Dòng bất thường',num(nFlag))}${kpi(none?'red':'green','alert','Chi phí không có '+U.what,fmt2(none),'nhấn đúp để gán')}</div>
    <div class="card"><div class="card-h"><h3>${byG?'Khoản mục chi phí × '+U.what:U.title+' × nhóm chi phí'} × tháng</h3><span class="dblhint">🖱 nhấn đúp ô tháng: bút toán của tháng · nhấn đúp ô <b>Tổng</b> (dòng, dòng cộng khoản mục, tổng cộng): toàn bộ bút toán chi tiết để điều chỉnh ${U.what}</span></div>
    <div class="tbl" style="max-height:calc(100vh - 380px)"><table><thead><tr>${byG?`<th>Khoản mục chi phí</th><th>${What}</th>`:`<th>${What}</th>${isD?'<th>Phòng ban danh mục</th>':''}<th>Nhóm chi phí</th>`}${isD?'<th title="Type of cost trong kỳ xem – dùng để xác định chi phí thuộc phòng ban nào">Type of cost</th>':''}${M.map(m=>`<th class=n>${ymLbl(m)}</th>`).join('')}<th class=n>Tổng</th><th class=n>Bình quân / tháng</th>${isL?'<th class=n>Số tháng thiếu</th>':`<th class=n>So với ${isV?'đội xe':'các phòng'}</th>`}</tr></thead><tbody>${body}</tbody></table></div></div>`;
  const rd=()=>{F.from=$('#dF_'+d).value;F.to=$('#dT_'+d).value;const v=$('#dmG_'+d).value;F.g=v?[v]:[];F.key=$('#dK_'+d).value;F.q=$('#dQ_'+d).value;F.only=$('#dO_'+d).checked};
  $('#dGo_'+d).onclick=()=>{rd();vDim(d)};if($('#dMode_'+d))$('#dMode_'+d).onchange=e=>{F.mode=e.target.value;ls.set('dimPick_'+d,F);dimDraw(d)};$('#dmG_'+d).onchange=()=>{rd();vDim(d)};$('#dK_'+d).onchange=()=>{F.key=$('#dK_'+d).value;ls.set('dimPick_'+d,F);dimDraw(d)};
  $('#dQ_'+d).oninput=deb(()=>{F.q=$('#dQ_'+d).value;dimDraw(d);const e=$('#dQ_'+d);e.focus();e.setSelectionRange(e.value.length,e.value.length)});$('#dO_'+d).onchange=()=>{F.only=$('#dO_'+d).checked;dimDraw(d)};
  if(isV)$('#vnSave').onclick=async()=>{const o={};H.querySelectorAll('[data-vn]').forEach(x=>{if(+x.value>0)o[x.dataset.vn]=+x.value});await aq('locSetNorms',o);vDim(d)};
  H.querySelector('tbody').ondblclick=e=>{const td=e.target.closest('[data-dm]'),tr=e.target.closest('tr');if(!td||!tr)return;const m=td.dataset.dm,fr=m||F.from,to=m||F.to;
    if(tr.dataset.dri!=null){const o=r.rows[+tr.dataset.dri];if(tr.dataset.dtc!=null){const x=o.tcRows[+tr.dataset.dtc];return dimDetail(d,{...o,tc:x.tc,gn:o.gn+' · '+(x.tc||'(trống)')},fr,to)}return dimDetail(d,o,fr,to)}
    const key=F.key?(r.rows.find(o=>o.label===F.key)||{}).k:null;
    if(tr.dataset.dsub!=null){const g=tr.dataset.dsub,gn=(r.groups.find(x=>x.k===g)||{}).n||g;return dimDetail(d,{k:key??null,label:F.key||('Tất cả '+U.what),g,gn,cat:''},fr,to)}
    if(tr.dataset.dtot)return dimDetail(d,{k:key??null,label:F.key||('Tất cả '+U.what),g:F.g.length===1?F.g[0]:'',gn:F.g.length===1?((r.groups.find(x=>x.k===F.g[0])||{}).n||F.g[0]):'Mọi khoản mục',cat:''},fr,to)};
  $('#dX_'+d).onclick=async()=>{try{const f=await api.xlsxSheets(`AccSoft_ChiPhi${isL?'ViTri':isV?'Xe':'PhongBan'}_${F.from}_${F.to}.xlsx`,[[isL?'Chi phi theo vi tri':isV?'Chi phi theo xe':'Chi phi theo phong ban',R.map(o=>Object.assign(byG?{'Khoản mục chi phí':o.gn,[What]:o.label}:{[What]:o.label,...(isD?{'Phòng ban danh mục':o.cat}:{}),'Nhóm chi phí':o.gn},...M.map(m=>({[ymLbl(m)]:o.v[m]})),{'Tổng':o.tot,'Bình quân / tháng':o.avg},isL?{'Số tháng thiếu':o.gaps.length,'Tháng thiếu':o.gaps.map(ymLbl).join(', ')}:{'So với trung vị':o.ratio},isV?{'Định mức / tháng':o.lim||null,'Tháng vượt định mức':o.over.map(ymLbl).join(', ')}:{}))]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
}
async function dimDetail(d,o,from,to){const U=DIMU[d];CUR=-1;const Dw=$('#drawer');Dw.classList.add('full');
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">${esc(o.gn)} · ${from===to?ymLbl(from):ymLbl(from)+' – '+ymLbl(to)}</div><h2 style="font-size:20px">${esc(U.what[0].toUpperCase()+U.what.slice(1))}: ${esc(o.label)}${o.cat?' <span class=mut style="font-size:14px">('+esc(o.cat)+')</span>':''}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div><div class="pb"><div class="card"><span class="spin"></span> Đang tải bút toán…</div></div>`;
  Dw.classList.remove('hide');let chg=false;const close=()=>{closeDetail();if(chg)vDim(d)};$('#dClose').onclick=close;
  let [rows,vals]=await Promise.all([aq('locDetail',d,o.k,o.g,from,to),aq('locList',d)]);if(o.tc!=null)rows=rows.filter(x=>(x.t||'')===o.tc);const sel=new Set(),F={q:'',m:''},pb=$('#dPane .pb');
  pb.innerHTML=`<div class="card">${fltBar('dmDF',F,[{t:'q',k:'q',p:'Tìm chứng từ, diễn giải, đối tượng, người nhập…'},{k:'m',p:'Mọi tháng',o:uniq(rows.map(x=>x.ym)).map(m=>[m,ymLbl(m)])}])}
    <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center;background:#FFF6F2;padding:8px 10px;border-radius:8px;margin-top:8px"><b id="dmSum"></b><div style="flex:1"></div><span id="dmSel" class="mut">Chưa chọn dòng</span>
      <select id="dmTo" style="max-width:360px"><option value="">— Chọn ${U.what} đúng (${num(vals.length)}) —</option><option value="__EMPTY__">(Xoá trống)</option>${vals.map(v=>`<option value="${esc(v.v)}">${esc(v.v)}${v.cat?' → '+esc(v.cat):''} · ${num(v.n)} dòng</option>`).join('')}</select>
      <input id="dmNew" class="hide" placeholder="Nhập ${U.what} mới" style="width:200px"><label style="display:flex;gap:4px;align-items:center;font-size:13px"><input type="checkbox" id="dmMan">Nhập thủ công</label><input id="dmNote" placeholder="Ghi chú" style="width:150px">
      <button class="btn sm primary" id="dmApply" disabled>Đổi ${U.what}</button><button class="btn sm ghost" id="dmUndo" disabled>Trả về giá trị gốc</button></div><div id="dmTb" style="margin-top:8px"></div></div>`;
  let cur=[],LIM=400;
  const draw=(more)=>{if(!more)LIM=400;const q=F.q.toLowerCase();cur=rows.filter(x=>(!F.m||x.ym===F.m)&&(!q||[x.doc,x.ds,x.bp,x.bpCr,x.u].some(v=>String(v||'').toLowerCase().includes(q))));
    $('#dmSum').textContent=`${num(cur.length)} / ${num(rows.length)} bút toán · chi phí ${fmt2(cur.reduce((s,x)=>s+x.v,0))}`;
    $('#dmTb').innerHTML=`<div class="tbl" style="max-height:calc(100vh - 300px)"><table><thead><tr><th><input type="checkbox" id="dmAll"></th><th>Ngày</th><th>Chứng từ</th><th>TK Nợ</th><th>TK Có</th><th>Khoản mục</th><th>Đối tượng</th><th class=n>Chi phí</th><th>${esc(U.what[0].toUpperCase()+U.what.slice(1))}${d==='dept'?' (Department Sub)':''}</th>${d==='dept'?'<th>Department (hạch toán)</th>':''}<th>Diễn giải</th><th>Người nhập</th></tr></thead><tbody>${cur.slice(0,LIM).map((x,i)=>`<tr class=dbl data-eid="${x.id}"><td><input type="checkbox" data-dmi="${i}" ${sel.has(x.id)?'checked':''}></td><td class=nw>${vn(x.d)}</td><td class=nw>${esc(x.doc)}</td><td><div class="clamp s">${esc(x.drName||x.dr)}</div></td><td><div class="clamp s">${esc(x.crName||x.cr)}</div></td><td style="font-size:12px"><div class="clamp s" title="${esc(x.t)}">${esc(x.t)}</div></td><td><div class="clamp s" title="${esc(x.bpCr||x.bp||'')}">${esc(x.bpCr||x.bp||'')}</div></td><td class=n>${fmt2(x.v)}</td><td style="font-size:12px">${x.newVal!=null?`<div class=mut style="text-decoration:line-through">${esc(x.orig||'(trống)')}</div><span class="badge b-H">${esc(x.newVal||'(trống)')}</span>`:esc(x.orig||'')}</td>${d==='dept'?`<td style="font-size:12px" class="${x.deptAcc!==(x.newVal??x.orig)?'neg':''}">${esc(x.deptAcc||'')}</td>`:''}<td><div class=clamp title="${esc(x.ds)}">${esc(x.ds)}</div></td><td class=nw>${esc(short(x.u))}</td></tr>`).join('')||'<tr><td colspan=11 class=mut style="text-align:center;padding:20px">Không có bút toán</td></tr>'}${cur.length>LIM?`<tr><td colspan=12 style="text-align:center;padding:10px"><button class="btn sm" id="dmMore">Hiện thêm ${num(Math.min(1000,cur.length-LIM))} dòng (đang hiện ${num(LIM)} / ${num(cur.length)})</button> <span class=mut>· tích "chọn tất cả" vẫn chọn đủ ${num(cur.length)} dòng đang lọc</span></td></tr>`:''}</tbody></table></div>`;if($('#dmMore'))$('#dmMore').onclick=()=>{LIM+=1000;draw(true)};
    $('#dmAll').onchange=e=>{cur.forEach(x=>e.target.checked?sel.add(x.id):sel.delete(x.id));draw()};$('#dmAll').checked=cur.length>0&&cur.every(x=>sel.has(x.id));upd()};
  const tgt=()=>sel.size?rows.filter(x=>sel.has(x.id)):cur;
  const upd=()=>{$('#dmSel').textContent=sel.size?`Đã chọn ${num(sel.size)} dòng`:`Chưa chọn dòng → áp dụng cho cả ${num(cur.length)} dòng đang lọc`;$('#dmApply').disabled=!tgt().length;$('#dmUndo').disabled=!tgt().some(x=>x.newVal!=null)};
  bindFlt($('#dmDF'),F,draw);draw();
  $('#dmTb').onchange=e=>{const i=e.target.dataset.dmi;if(i==null)return;e.stopPropagation();const x=cur[+i];e.target.checked?sel.add(x.id):sel.delete(x.id);upd()};
  $('#dmTb').ondblclick=e=>{if(e.target.type==='checkbox')return;const tr=e.target.closest('tr[data-eid]');if(tr)showDetail(null,+tr.dataset.eid)};
  ['#dmTo','#dmNew','#dmNote'].forEach(s=>$(s).addEventListener('change',e=>e.stopPropagation()));
  $('#dmMan').onchange=e=>{e.stopPropagation();$('#dmNew').classList.toggle('hide',!e.target.checked);$('#dmTo').classList.toggle('hide',e.target.checked)};
  const picked=()=>tgt().map(x=>({id:x.id,doc:x.doc,d:x.d,dr:x.dr,cr:x.cr,a:x.a,bp:x.bp,bpCr:x.bpCr,[U.field]:x.orig}));
  const again=()=>{chg=true;dimDetail(d,o,from,to).then(()=>{const b=$('#dClose');if(b)b.onclick=()=>{closeDetail();vDim(d)}})};
  $('#dmApply').onclick=async()=>{const man=$('#dmMan').checked,sv=$('#dmTo').value,v=man?$('#dmNew').value.trim():sv==='__EMPTY__'?'':sv;if(!man&&!sv)return alert(`Chọn ${U.what} đúng, hoặc tích "Nhập thủ công"`);
    const p=picked();if(!await ask(`Đổi ${U.what} của ${p.length} bút toán thành "${v||'(trống)'}"?\nDữ liệu gốc không bị sửa – xem / bỏ ở Kiểm soát → Điều chỉnh dữ liệu.`))return;try{await aq('faSet',p,U.field,v,$('#dmNote').value.trim());again()}catch(e){alert(e.message)}};
  $('#dmUndo').onclick=async()=>{const p=tgt().filter(x=>x.newVal!=null);if(!p.length)return alert('Các dòng này chưa được điều chỉnh');if(!await ask(`Trả về giá trị gốc cho ${p.length} bút toán?`))return;await aq('faRemove',p.map(x=>({id:x.id,field:U.field})));again()};
}
const vLoc=()=>vDim('location'),vVeh=()=>vDim('plate'),vDpt=()=>vDim('dept');
const VIEWS={lgr:()=>vLG(),ap331:()=>vAP(),inv88:()=>vInv88(),r88:()=>vR88(),landl:()=>vLL(),adv:()=>vAdv(),staff:()=>vStaff(),fcst:()=>vFC(),vehc:vVeh,deptc:vDpt,locc:vLoc,dmc:vDM,fadj:vFA,overview:vOverview,errors:()=>vErrors(),aging:()=>vAging(true),inv:()=>vInv(true),pl:vPL,cost:()=>vCost(true),deep:vDeep,fin:vFin,cat:vCat,report:vReport,data:vData};
(async()=>{
  META=await aq('meta');RULE=Object.fromEntries(META.rules.map(r=>[r.k,r]));
  const info=await api.info();$('#ver').textContent='v'+info.version;
  await refreshSide();go('overview');
})();

/* ---------- Chuột phải trên mọi bảng: sao chép ô / dòng / cột / toàn bộ bảng (dạng Tab – dán thẳng vào Excel) ---------- */
(()=>{
  const menu=document.createElement('div');menu.id='ctxMenu';menu.className='hide';document.body.appendChild(menu);
  const clean=t=>{t=String(t??'').replace(/\s+/g,' ').trim();const m=/^\(?-?[\d.,]+\)?$/.test(t)&&/\d/.test(t)?t:null;if(!m)return t;const neg=/^\(.*\)$/.test(t)||t.startsWith('-');const v=t.replace(/[(),\s-]/g,'');return (neg?'-':'')+v};
  const cellTxt=c=>c.querySelector('input[type=checkbox]')?'':clean(c.innerText);
  const rowTxt=tr=>[...tr.cells].map(cellTxt).join('\t');
  // tiêu đề nhiều tầng (rowspan / colspan) → một dòng tiêu đề, mỗi cột ghép nhãn các tầng (vd "Số dư đầu kỳ Nợ")
  const hgrid=tb=>{const h=tb.tHead;if(!h||!h.rows.length)return [];const G=[];[...h.rows].forEach((r,ri)=>{G[ri]??=[];let ci=0;for(const c of r.cells){while(G[ri][ci]!==undefined)ci++;const t=c.querySelector('input')?'':c.innerText.replace(/\s+/g,' ').trim();
      for(let dr=0;dr<(c.rowSpan||1);dr++)for(let dc=0;dc<(c.colSpan||1);dc++){(G[ri+dr]??=[])[ci+dc]=dr?null:t}ci+=c.colSpan||1}});
    const n=Math.max(...G.map(r=>r.length));return Array.from({length:n},(_,i)=>[...new Set(G.map(r=>r[i]).filter(Boolean))].join(' '))};
  const head=tb=>{const g=hgrid(tb);return g.length?[g.join('\t')]:[]};
  const bodyRows=tb=>[...tb.tBodies].flatMap(b=>[...b.rows]).filter(r=>!(r.cells.length===1&&r.cells[0].colSpan>1));
  const colIdx=td=>{let i=0;for(const c of td.parentElement.cells){if(c===td)return i;i+=c.colSpan||1}return i};
  const colTxt=(tb,i)=>bodyRows(tb).map(r=>{let k=0;for(const c of r.cells){if(k===i)return cellTxt(c);k+=c.colSpan||1}return ''});
  const copy=async(t,msg)=>{try{await navigator.clipboard.writeText(t)}catch{const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove()}
    const n=document.createElement('div');n.className='ctxToast';n.textContent='✓ '+msg;document.body.appendChild(n);setTimeout(()=>n.remove(),1400)};
  let ctx=null;
  document.addEventListener('contextmenu',e=>{const td=e.target.closest('td,th'),tb=td&&td.closest('table');if(!tb){menu.classList.add('hide');return}
    e.preventDefault();const tr=td.parentElement,sel=String(getSelection()||'').trim(),nRows=bodyRows(tb).length,hName=hgrid(tb)[colIdx(td)]||'';
    ctx={td,tr,tb,sel};
    const isTh=td.tagName==='TH'&&td.closest('thead'),hid=typeof COLP!=='undefined'?COLP.hidden(tb):[];
    menu.innerHTML=(isTh?`<button data-cx="hide">Ẩn cột này</button>${hid.map((h,i)=>`<button data-cx="un" data-cxi="${i}">Hiện lại cột <span>${esc(h.slice(0,28))}</span></button>`).join('')}<button data-cx="showall">Hiện tất cả cột & đặt lại độ rộng</button><hr>`:'')+(sel?`<button data-cx="sel">Sao chép vùng đang bôi đen</button>`:'')+`<button data-cx="cell">Sao chép ô <span>${esc(clean(td.innerText).slice(0,30))}</span></button><button data-cx="row">Sao chép dòng</button><button data-cx="rowh">Sao chép dòng kèm tiêu đề</button>
      <button data-cx="col">Sao chép cột${hName?` "${esc(hName.slice(0,24))}"`:''} <span>${num(nRows)} dòng</span></button><hr><button data-cx="all">Sao chép toàn bộ bảng <span>${num(nRows)} dòng + tiêu đề</span></button><button data-cx="allv">Sao chép bảng (không tiêu đề)</button>`;
    menu.classList.remove('hide');const W=innerWidth,H=innerHeight,r=menu.getBoundingClientRect();
    menu.style.left=Math.min(e.clientX,W-r.width-8)+'px';menu.style.top=Math.min(e.clientY,H-r.height-8)+'px'});
  menu.addEventListener('click',e=>{const b=e.target.closest('[data-cx]');if(!b||!ctx)return;const {td,tr,tb,sel}=ctx,k=b.dataset.cx;menu.classList.add('hide');
    if(k==='hide')return COLP.hide(tb,td);if(k==='showall')return COLP.showAll(tb);if(k==='un')return COLP.unhide(tb,COLP.hidden(tb)[+b.dataset.cxi]);
    if(k==='sel')return copy(sel,'Đã sao chép vùng chọn');
    if(k==='cell')return copy(cellTxt(td),'Đã sao chép ô');
    if(k==='row')return copy(rowTxt(tr),'Đã sao chép dòng');
    if(k==='rowh')return copy([...head(tb),rowTxt(tr)].join('\n'),'Đã sao chép dòng kèm tiêu đề');
    if(k==='col')return copy(colTxt(tb,colIdx(td)).join('\n'),'Đã sao chép cột');
    const rows=bodyRows(tb).map(rowTxt);copy((k==='all'?[...head(tb),...rows]:rows).join('\n'),`Đã sao chép ${num(rows.length)} dòng – dán vào Excel`)});
  document.addEventListener('click',e=>{if(!e.target.closest('#ctxMenu'))menu.classList.add('hide')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')menu.classList.add('hide')});
  addEventListener('blur',()=>menu.classList.add('hide'));document.addEventListener('scroll',()=>menu.classList.add('hide'),true);
})();

/* ---------- Nhấn tiêu đề cột để sắp xếp (mọi bảng) – nhấn lần nữa để đảo chiều, lần ba trả về thứ tự gốc ---------- */
(()=>{
  const num_=t=>{t=String(t??'').replace(/\s+/g,' ').trim();if(!t)return null;if(/^\d{2}\/\d{2}\/\d{4}$/.test(t)){const [d,m,y]=t.split('/');return +(y+m+d)}
    if(/^\d{2}\/\d{4}$/.test(t)){const [m,y]=t.split('/');return +(y+m)}const s=t.replace(/[%\s]/g,'');if(!/^\(?[-−]?[\d.,]+\)?$/.test(s)||!/\d/.test(s))return null;const neg=/^\(.*\)$/.test(s)||/^[-−]/.test(s);const v=+s.replace(/[(),−-]/g,'');return isNaN(v)?null:neg?-v:v};
  // dòng cộng / tổng / nhóm: giữ nguyên ở cuối bảng
  const pinned=tr=>(tr.cells.length===1&&tr.cells[0].colSpan>1)||/font-weight:\s*700|brand-25/.test(tr.getAttribute('style')||'');
  const colOf=(tb,th)=>{const h=tb.tHead,G=[];let pos=-1;[...h.rows].forEach((r,ri)=>{G[ri]??=[];let ci=0;for(const c of r.cells){while(G[ri][ci]!==undefined)ci++;if(c===th)pos=(c.colSpan||1)>1?-1:ci;for(let dr=0;dr<(c.rowSpan||1);dr++)for(let dc=0;dc<(c.colSpan||1);dc++)(G[ri+dr]??=[])[ci+dc]=1;ci+=c.colSpan||1}});return pos};
  const cellAt=(tr,i)=>{let k=0;for(const c of tr.cells){if(k===i||(k<i&&i<k+(c.colSpan||1)))return c;k+=c.colSpan||1}return null};
  document.addEventListener('click',e=>{const th=e.target.closest('thead th');if(!th||e.target.closest('input,select,button'))return;const tb=th.closest('table');if(!tb||tb.dataset.nosort!=null||!tb.tBodies[0])return;
    const i=colOf(tb,th);if(i<0)return;const body=tb.tBodies[0],rows=[...body.rows];if(rows.length<2)return;
    // bảng có cấu trúc (dòng cộng / nhóm nằm giữa bảng, vd báo cáo tài chính) → không sắp xếp
    const pin=rows.map(pinned),firstPin=pin.indexOf(true);if(firstPin>=0&&pin.slice(firstPin).some(p=>!p))return;
    if(/^Chỉ tiêu/.test((tb.tHead.rows[0].cells[0]?.innerText||'').trim()))return;
    rows.forEach((r,k)=>{if(r.dataset.o==null)r.dataset.o=k});
    const st=tb.dataset.sc==String(i)?(tb.dataset.sd==='asc'?'desc':tb.dataset.sd==='desc'?'':'asc'):'asc';tb.dataset.sc=st?i:'';tb.dataset.sd=st;
    tb.tHead.querySelectorAll('th[data-sorted]').forEach(x=>x.removeAttribute('data-sorted'));if(st)th.dataset.sorted=st;
    const data=rows.filter((r,k)=>!pin[k]),tail=rows.filter((r,k)=>pin[k]);
    const val=r=>{const c=cellAt(r,i);const t=c?(c.querySelector('input[type=checkbox]')?(c.querySelector('input').checked?'1':'0'):c.innerText):'';return [num_(t),t.trim().toLowerCase()]};
    const key=new Map(data.map(r=>[r,val(r)])),isNum=[...key.values()].filter(v=>v[1]).every(v=>v[0]!=null);
    data.sort((a,b)=>{if(!st)return a.dataset.o-b.dataset.o;const [na,ta]=key.get(a),[nb,tb_]=key.get(b);let d;
      if(isNum){if(na==null&&nb!=null)return 1;if(nb==null&&na!=null)return -1;d=(na??0)-(nb??0)}else{if(!ta&&tb_)return 1;if(ta&&!tb_)return -1;d=ta.localeCompare(tb_,'vi',{numeric:true})}return st==='asc'?d:-d});
    const f=document.createDocumentFragment();data.concat(tail).forEach(r=>f.appendChild(r));body.appendChild(f)});
})();

/* ---------- Mọi bảng: kéo mép tiêu đề để đổi độ rộng cột; chuột phải tiêu đề để ẩn / hiện cột (nhớ theo từng loại bảng) ---------- */
const COLP=(()=>{
  const LS='accsoft.colPrefs',load=()=>{try{return JSON.parse(localStorage.getItem(LS)||'{}')}catch{return {}}},save=o=>{try{localStorage.setItem(LS,JSON.stringify(o))}catch{}};
  // lưới tiêu đề: vị trí cột của từng th (tính rowspan/colspan); khoá bảng = chuỗi tên cột lá
  const grid=tb=>{const h=tb.tHead;if(!h)return {cols:[],pos:new Map()};const G=[],pos=new Map();[...h.rows].forEach((r,ri)=>{G[ri]??=[];let ci=0;for(const c of r.cells){while(G[ri][ci]!==undefined)ci++;pos.set(c,{c:ci,span:c.colSpan||1});const nm=(c.dataset.cn??=c.textContent.replace(/\s+/g,' ').trim());for(let dr=0;dr<(c.rowSpan||1);dr++)for(let dc=0;dc<(c.colSpan||1);dc++)(G[ri+dr]??=[])[ci+dc]=dr?null:nm;ci+=c.colSpan||1}});
    const n=Math.max(0,...G.map(r=>r.length));return {cols:Array.from({length:n},(_,i)=>[...new Set(G.map(r=>r[i]).filter(Boolean))].join(' ')),pos}};
  const keyOf=tb=>{const g=grid(tb).cols;return g.length?g.join('|').slice(0,300):''};
  const cellsAt=(tb,i)=>{const out=[];for(const sec of [tb.tHead,...tb.tBodies]){if(!sec)continue;const G=[];[...sec.rows].forEach((r,ri)=>{G[ri]??=[];let ci=0;for(const c of r.cells){while(G[ri][ci]!==undefined)ci++;if(ci<=i&&i<ci+(c.colSpan||1)&&(c.colSpan||1)===1)out.push(c);for(let dr=0;dr<(c.rowSpan||1);dr++)for(let dc=0;dc<(c.colSpan||1);dc++)(G[ri+dr]??=[])[ci+dc]=1;ci+=c.colSpan||1}})}return out};
  const setW=(tb,i,w)=>{for(const c of cellsAt(tb,i)){c.style.width=c.style.minWidth=c.style.maxWidth=w+'px';c.style.overflow='hidden';c.querySelectorAll('.clamp').forEach(x=>{x.style.maxWidth=x.style.minWidth=Math.max(20,w-20)+'px'})}};
  const setH=(tb,i,hide)=>{for(const c of cellsAt(tb,i))c.style.display=hide?'none':''};
  const apply=tb=>{const k=keyOf(tb);if(!k||tb.dataset.colk===k)return;tb.dataset.colk=k;const P=load()[k];if(!P)return;
    const cols=grid(tb).cols;(P.h||[]).forEach(n=>{const i=cols.indexOf(n);if(i>=0)setH(tb,i,true)});Object.entries(P.w||{}).forEach(([n,w])=>{const i=cols.indexOf(n);if(i>=0)setW(tb,i,w)});
    if((P.h||[]).length){const th=tb.tHead.rows[0].cells[0];if(th&&!th.querySelector('.colhid'))th.insertAdjacentHTML('beforeend',` <span class="colhid" title="Có cột đang ẩn – chuột phải tiêu đề để hiện lại">⋯${P.h.length} ẩn</span>`)}};
  const upd=(tb,f)=>{const k=keyOf(tb),o=load();o[k]=o[k]||{h:[],w:{}};f(o[k]);save(o)};
  // kéo đổi độ rộng
  let drag=null,suppress=0;
  document.addEventListener('mousedown',e=>{const th=e.target.closest('thead th');if(!th||e.button!==0)return;const r=th.getBoundingClientRect();if(r.right-e.clientX>7)return;
    const tb=th.closest('table'),p=grid(tb).pos.get(th);if(!p||p.span!==1)return;e.preventDefault();drag={tb,i:p.c,x:e.clientX,w:r.width,name:grid(tb).cols[p.c]};document.body.style.cursor='col-resize'});
  document.addEventListener('mousemove',e=>{const th=e.target.closest&&e.target.closest('thead th');if(th&&!drag){const r=th.getBoundingClientRect();th.style.cursor=r.right-e.clientX<=7?'col-resize':''}
    if(!drag)return;const w=Math.max(40,Math.round(drag.w+e.clientX-drag.x));setW(drag.tb,drag.i,w);drag.cur=w});
  document.addEventListener('mouseup',()=>{if(!drag)return;if(drag.cur){const d=drag;upd(d.tb,P=>{P.w[d.name]=d.cur});suppress=Date.now()}drag=null;document.body.style.cursor=''});
  document.addEventListener('click',e=>{if(Date.now()-suppress<300&&e.target.closest('thead th')){e.stopImmediatePropagation();e.preventDefault()}},true);
  // tự áp dụng khi bảng mới xuất hiện
  let T=0;new MutationObserver(()=>{clearTimeout(T);T=setTimeout(()=>document.querySelectorAll('table').forEach(apply),60)}).observe(document.body,{childList:true,subtree:true});
  return {hide:(tb,th)=>{const g=grid(tb),p=g.pos.get(th);if(!p)return;const names=g.cols.slice(p.c,p.c+p.span);for(let i=p.c;i<p.c+p.span;i++)setH(tb,i,true);upd(tb,P=>{P.h=[...new Set([...(P.h||[]),...names])]})},
    showAll:tb=>{const k=keyOf(tb),o=load();delete o[k];save(o);tb.dataset.colk='';for(const c of tb.querySelectorAll('th,td')){c.style.display='';c.style.width=c.style.minWidth=c.style.maxWidth='';c.querySelectorAll('.clamp').forEach(x=>{x.style.maxWidth=x.style.minWidth=''})}tb.querySelectorAll('.colhid').forEach(x=>x.remove())},
    hidden:tb=>((load()[keyOf(tb)]||{}).h||[]),unhide:(tb,name)=>{upd(tb,P=>{P.h=(P.h||[]).filter(x=>x!==name)});const i=grid(tb).cols.indexOf(name);if(i>=0)setH(tb,i,false)}};
})();

// Tìm nhanh trong danh sách chọn dài (mã vị trí, biển số, hợp đồng, phòng ban…): gõ vài ký tự → chỉ còn các mục chứa ký tự đó; Enter để chọn
(function(){const MIN=25,norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
  const add=sel=>{if(sel.dataset.srch||sel.multiple||(sel.options.length<MIN&&!sel.classList.contains('srch'))||!sel.parentNode)return;sel.dataset.srch=1;
    const inp=document.createElement('input');inp.type='search';inp.placeholder=sel.dataset.auto?'🔍 Gõ để lọc…':'🔍 Gõ để tìm… (Enter chọn)';inp.className='selsrch';inp.style.cssText='width:150px;margin-right:4px';
    if(sel.classList.contains('hide'))inp.classList.add('hide');new MutationObserver(()=>inp.classList.toggle('hide',sel.classList.contains('hide'))).observe(sel,{attributes:true,attributeFilter:['class']});
    sel.parentNode.insertBefore(inp,sel);
    const filt=()=>{const q=norm(inp.value.trim());let first=null,n=0;for(const o of sel.options){const keep=!o.value||!q||norm(o.textContent+' '+o.value).includes(q);o.hidden=!keep;if(keep&&o.value&&o.value!=='__EMPTY__'){n++;if(!first)first=o}}
      inp.title=q?n+' mục khớp'+(first?' · Enter chọn: '+first.textContent:''):'';inp.style.outline=q&&first?'2px solid #FDB022':'';if(sel.dataset.v0!=null)sel.value=sel.dataset.v0;return first};
    sel.dataset.v0=sel.value;
    let ST=0,AT=0;inp.addEventListener('input',e=>{e.stopPropagation();clearTimeout(ST);ST=setTimeout(filt,120);
      // ô lọc của trang (data-auto): ngừng gõ ~0,8 giây là tự áp dụng, không cần Enter
      if(sel.dataset.auto){clearTimeout(AT);AT=setTimeout(()=>{const f=filt();const v=inp.value.trim()?(f?f.value:null):'';if(v!=null&&v!==sel.dataset.v0){sel.value=v;sel.dataset.v0=v;sel.dispatchEvent(new Event('change',{bubbles:true}))}},800)}});inp.addEventListener('change',e=>e.stopPropagation());
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const f=filt();if(f){sel.value=f.value;sel.dataset.v0=f.value;inp.style.outline='';sel.dispatchEvent(new Event('change',{bubbles:true}))}}else if(e.key==='Escape'){inp.value='';filt()}});
    sel.addEventListener('change',()=>{sel.dataset.v0=sel.value})};
  const scan=r=>{if(r.querySelectorAll)r.querySelectorAll('select:not([data-srch])').forEach(add)};
  new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1){if(n.tagName==='SELECT')add(n);else if(n.tagName==='OPTION'||n.tagName==='OPTGROUP'){const sl=n.closest('select');if(sl)add(sl)}else scan(n)}}).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>scan(document));})();

/* ===== v4.33: hộp thoại trong ứng dụng, chế độ tối, thu gọn menu, nút ẩn / hiện ===== */
// Hộp thoại riêng thay alert / confirm của Windows (đẹp hơn, không làm mất con trỏ gõ)
function uiModal(msg,{ok='Đồng ý',cancel=null,kind='info'}={}){return new Promise(res=>{const prev=document.activeElement;
  const w=document.createElement('div');w.className='mdl-wrap';const ico=kind==='warn'?'⚠️':kind==='err'?'⛔':'ℹ️';
  w.innerHTML=`<div class="mdl ${kind}" role="dialog" aria-modal="true"><div class="mdl-ic">${ico}</div><div class="mdl-msg"></div><div class="mdl-act">${cancel?`<button class="btn" data-r="0">${cancel}</button>`:''}<button class="btn primary" data-r="1">${ok}</button></div></div>`;
  w.querySelector('.mdl-msg').textContent=String(msg??'');document.body.appendChild(w);
  const done=v=>{document.removeEventListener('keydown',key,true);w.classList.add('out');setTimeout(()=>w.remove(),150);try{if(prev&&prev.isConnected&&prev!==document.body)prev.focus()}catch{}res(v)};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done(!cancel)}else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();done(true)}};
  document.addEventListener('keydown',key,true);w.onclick=e=>{const b=e.target.closest('[data-r]');if(b)done(b.dataset.r==='1');else if(e.target===w&&cancel)done(false)};
  setTimeout(()=>w.querySelector('.btn.primary').focus(),30)})}
async function ask(msg){return uiModal(msg,{ok:'Đồng ý',cancel:'Huỷ',kind:'warn'})}
window.alert=msg=>{const s=String(msg??'');uiModal(s,{kind:/lỗi|error|không|chưa/i.test(s)&&!/^Đã/.test(s)?'err':'info'})};

// Chế độ sáng / tối + thu gọn menu + chế độ tập trung (ẩn menu và thanh trên) – ghi nhớ
(function(){const S=k=>ls.get('ui_'+k,false),put=(k,v)=>ls.set('ui_'+k,v),R=document.documentElement;
  const apply=()=>{R.dataset.theme=S('dark')?'dark':'light';document.body.classList.toggle('mini',!!S('mini'));document.body.classList.toggle('focusm',!!S('focus'));
    const t=$('#uiDark');if(t)t.title=S('dark')?'Chuyển sang giao diện sáng':'Chuyển sang giao diện tối';if(t)t.innerHTML=S('dark')?'☀️':'🌙';
    if(window.Chart){try{Chart.defaults.color=S('dark')?'#C9CDD4':'#535862';Chart.defaults.borderColor=S('dark')?'rgba(255,255,255,.08)':'rgba(0,0,0,.06)'}catch{}}};
  const init=()=>{const tb=document.querySelector('.topbar .sp');if(tb&&!$('#uiDark')){const g=document.createElement('div');g.className='uitools';
      g.innerHTML=`<button class="btn ghost sm" id="uiFocus" title="Chế độ tập trung: ẩn menu và thanh trên để xem bảng rộng hơn (phím F11 của ứng dụng: Ctrl+Shift+F)">⛶</button><button class="btn ghost sm" id="uiDark"></button>`;tb.after(g)}
    const br=document.querySelector('aside .brand');if(br&&!$('#uiMini')){const b=document.createElement('button');b.id='uiMini';b.className='uimini';b.title='Thu gọn / mở rộng menu';b.innerHTML='‹';br.appendChild(b)}
    document.querySelectorAll('nav button[data-p]').forEach(b=>{if(!b.title)b.title=b.textContent.trim()});
    if(!$('#uiExit')){const x=document.createElement('button');x.id='uiExit';x.className='btn sm';x.textContent='⤢ Thoát chế độ tập trung';document.body.appendChild(x)}
    $('#uiDark').onclick=()=>{put('dark',!S('dark'));apply()};$('#uiMini').onclick=()=>{put('mini',!S('mini'));apply()};
    $('#uiFocus').onclick=$('#uiExit').onclick=()=>{put('focus',!S('focus'));apply()};
    document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&(e.key==='F'||e.key==='f')){e.preventDefault();put('focus',!S('focus'));apply()}});
    apply()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();})();

// Nút ẩn / hiện cho các khối phụ (thẻ số liệu, banner, mô tả, thanh lọc trong cửa sổ chi tiết) – ghi nhớ theo trang
(function(){const key=el=>{const sec=el.closest('section,#drawer');return 'hide_'+(sec?sec.id:'x')+'_'+el.dataset.hk};
  const H=ls.get('uiHide',{}),save=()=>ls.set('uiHide',H);
  const mk=(el,label)=>{if(el.dataset.hk)return;const sib=[...el.parentNode.children].filter(x=>x.className===el.className);el.dataset.hk=label+sib.indexOf(el);
    const b=document.createElement('button');b.className='hidetg';b.type='button';const k=key(el);
    const set=h=>{el.classList.toggle('uihid',h);b.innerHTML=h?`▸ Hiện ${label}`:`▾ Ẩn ${label}`;b.classList.toggle('on',h)};
    b.onclick=()=>{H[k]=!H[k];save();set(H[k])};el.parentNode.insertBefore(b,el);set(!!H[k])};
  const scan=r=>{if(!r.querySelectorAll)return;
    r.querySelectorAll('.kpis').forEach(el=>mk(el,'thẻ số liệu'));r.querySelectorAll('.hero').forEach(el=>mk(el,'banner'));
    r.querySelectorAll('.subbar + .hint, .card > .hint').forEach(el=>{if(el.textContent.length>80)mk(el,'mô tả')})};
  let T=0;new MutationObserver(()=>{clearTimeout(T);T=setTimeout(()=>scan(document.body),80)}).observe(document.body,{childList:true,subtree:true});scan(document.body)})();

/* ===== v4.34: Dự báo báo cáo tài chính (B02 + B01) – nhiều mô hình ===== */
const FCF=Object.assign({inv:[],divPct:0,costFloor:true,fixed:true,fixedBase:'dec',fixedG:0,fixedKeys:[],h:3,model:'ens',fromYear:'',skipPartial:false,costByRatio:false,adjRev:0,adjCost:0,show:'pl'},ls.get('fcPick',{}));
async function vFC(refresh){const H=$('#fcBody');H.innerHTML='<div class="card"><span class="spin"></span> Đang tổng hợp lịch sử B01 / B02 theo từng năm và chạy các mô hình dự báo…</div>';
  try{const r=await aq('fcCompute',{h:FCF.h,model:FCF.model,fromYear:FCF.fromYear,skipPartial:FCF.skipPartial,costByRatio:FCF.costByRatio,bsMode:FCF.bsMode,capexMaint:FCF.capexMaint,inv:FCF.inv,divPct:+FCF.divPct||0,costFloor:FCF.costFloor,fixed:FCF.fixed,fixedBase:FCF.fixedBase,fixedG:+FCF.fixedG||0,fixedKeys:FCF.fixedKeys,adj:{rev:+FCF.adjRev||0,cost:+FCF.adjCost||0},refresh:!!refresh});ls.set('fcPick',FCF);fcDraw(r)}
  catch(e){H.innerHTML=`<div class="card neg">Lỗi dự báo: ${esc(e.message)}</div>`}}
function fcDraw(r){const H=$('#fcBody');if(!r.hist.length){H.innerHTML='<div class="card mut">Chưa có dữ liệu để dự báo.</div>';return}
  const Y=r.hist.map(x=>x.y),FY=r.fc.map(x=>x.y),pct=v=>v==null?'–':(v*100).toFixed(1)+'%',acc=v=>v==null?'–':Math.max(0,100-v*100).toFixed(0)+'%';
  const PL=[['rev','Doanh thu bán hàng & CCDV'],['ded','Giảm trừ doanh thu'],['net','Doanh thu thuần',1],['cogs','Giá vốn hàng bán'],['gp','Lợi nhuận gộp',1],['finInc','Doanh thu tài chính'],['finExp','Chi phí tài chính'],['sell','Chi phí bán hàng'],['admin','Chi phí quản lý DN'],['op','Lợi nhuận thuần HĐKD',1],['other','Lợi nhuận khác'],['pbt','Lợi nhuận trước thuế',1],['tax','Thuế TNDN'],['pat','Lợi nhuận sau thuế',1]];
  const last=r.hist.at(-1),g=(a,b)=>Math.abs(a)>1e-9?(b-a)/Math.abs(a):null;
  const hdr=`<th>Chỉ tiêu</th>${r.hist.map(x=>`<th class=n>${x.y}${x.partial?`<div class=mut style="font-size:10px;text-transform:none">${x.months} tháng → quy năm</div>`:''}</th>`).join('')}${FY.map(y=>`<th class=n style="background:#FFF1EB;color:var(--brand-700)">${y} <span style="font-size:10px">dự báo</span></th>`).join('')}<th class=n>Tăng trưởng bq dự báo</th><th class=n>Độ chính xác kiểm định</th>`;
  const rowFx=k=>{if(!r.fixed||r.fixed.empty||!['cogs','sell','admin'].includes(k))return '';const vh=r.hist.map(x=>r.fixed.hist[x.y]?r.fixed.hist[x.y][k]:0),vf=r.fixed.fc.map(x=>x[k]);if(vh.every(v=>!v)&&vf.every(v=>!v))return '';
    return `<tr class=mut style="font-size:12px"><td style="padding-left:28px;white-space:nowrap">↳ trong đó cố định định kỳ</td>${vh.map(v=>`<td class=n>${fmt2(v)}</td>`).join('')}${vf.map(v=>`<td class=n style="background:#FFF8F4">${fmt2(v)}</td>`).join('')}<td class=n></td><td class=n>tháng gốc × 12</td></tr>`};
  const subR=(lab,vf,note)=>`<tr class=mut style="font-size:12px"><td style="padding-left:28px;white-space:nowrap">${lab}</td>${r.hist.map(()=>'<td class=n></td>').join('')}${vf.map(v=>`<td class=n style="background:#FFF8F4">${fmt2(v)}</td>`).join('')}<td class=n></td><td class=n>${note||''}</td></tr>`;
  const rowInv=k=>!r.inv?'':k==='cogs'?subR('↳ trong đó khấu hao + vận hành đầu tư mới',r.inv.map(t=>t.dep+t.opex),'kế hoạch đầu tư'):k==='finExp'&&r.inv.some(t=>t.int)?subR('↳ trong đó lãi vay đầu tư',r.inv.map(t=>t.int),'kế hoạch đầu tư'):k==='rev'&&r.inv.some(t=>t.rev)?subR('↳ trong đó doanh thu từ đầu tư mới',r.inv.map(t=>t.rev),'kế hoạch đầu tư'):'';
  const margin=(lab,k)=>`<tr class=mut style="font-size:12px;font-style:italic"><td style="padding-left:28px;white-space:nowrap">${lab}</td>${r.hist.map(x=>`<td class=n>${x.P.net?(x.P[k]/x.P.net*100).toFixed(1)+'%':''}</td>`).join('')}${r.fc.map(x=>`<td class=n style="background:#FFF8F4">${x.P.net?(x.P[k]/x.P.net*100).toFixed(1)+'%':''}</td>`).join('')}<td></td><td></td></tr>`;
  const rowPL=([k,n,b])=>rowPL0([k,n,b])+rowFx(k)+rowInv(k)+(k==='gp'?margin('Biên lợi nhuận gộp / doanh thu thuần','gp'):k==='pat'?margin('Biên LNST / doanh thu thuần','pat')+(r.divPct?subR(`Chia lợi nhuận (${r.divPct}% LNST)`,r.fc.map(x=>x.P.div||0),'giảm vốn chủ & tiền'):''):'');
  const rowPL0=([k,n,b])=>{const vh=r.hist.map(x=>x.P[k]||0),vf=r.fc.map(x=>x.P[k]||0),cg=vf.length&&Math.abs(vh.at(-1))>1e-9&&vf.at(-1)/vh.at(-1)>0?Math.pow(vf.at(-1)/vh.at(-1),1/vf.length)-1:null;
    return `<tr${b?' style="font-weight:700;background:#F9FAFB"':''}><td style="min-width:230px;white-space:nowrap">${n}</td>${vh.map(v=>`<td class=n>${fmt2(v)}</td>`).join('')}${vf.map(v=>`<td class="n ${v<0?'neg':''}" style="background:#FFF8F4">${fmt2(v)}</td>`).join('')}<td class=n>${pct(cg)}</td><td class=n>${b?'<span class=mut>tính theo công thức</span>':acc(r.mape[k])}</td></tr>`};
  const BSrows=r.bsLines.map(l=>{const vh=r.hist.map(x=>x.B[l.code]||0),vf=r.fc.map(x=>x.B[l.code]||0),tot=l.lvl===0;
    return `<tr${tot?' style="font-weight:700;background:#F9FAFB"':''}><td style="padding-left:${12+l.lvl*14}px;min-width:260px;white-space:nowrap">${esc(l.name)}</td>${vh.map(v=>`<td class=n>${fmt2(v)}</td>`).join('')}${vf.map(v=>`<td class="n" style="background:#FFF8F4">${fmt2(v)}</td>`).join('')}<td class=n></td><td class=n>${l.code==='110'?(vf.some(v=>v<0)?'<span class=neg title="Tiền âm = thiếu tiền, cần vay / góp thêm vốn">khoản cân đối – thiếu tiền</span>':'<span class=mut>khoản cân đối</span>'):/^4/.test(l.code)&&l.lvl===1?'<span class=mut>+ LNST dự báo</span>':tot?'':(()=>{const w=(r.bsHow||{})[l.code]||'';return w==='roll'?'<span class=mut>đầu kỳ + đầu tư − khấu hao</span>':w==='hold'?'<span class=mut>giữ số dư cuối kỳ</span>':w.startsWith('ratio:')?`<span class=mut>${(+w.slice(6)*100).toFixed(1)}% doanh thu thuần</span>`:acc(r.bsMape[l.code])})()}</td></tr>`}).join('');
  const cmp=r.compare.rev,mk=Object.keys(r.models).filter(m=>cmp[m]);
  H.innerHTML=`<div class="card"><div class="subbar"><span class="crumb">Dự báo báo cáo tài chính</span><span class="hint">Dựa trên B02 / B01 thực tế từng năm trong phần mềm · năm dở dang được quy đổi cả năm · tổng lợi nhuận tính lại theo đúng công thức B02 · B01 cân đối bằng khoản Tiền</span></div>
    <div class="filterrow"><label>Số năm dự báo <select id="fcH">${[1,2,3,4,5,7,10].map(v=>`<option ${+FCF.h===v?'selected':''}>${v}</option>`).join('')}</select></label>
      <label>Mô hình <select id="fcM" style="max-width:420px">${Object.entries(r.models).map(([k,v])=>`<option value="${k}" ${FCF.model===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label>
      <label>Dùng dữ liệu từ năm <select id="fcFrom"><option value="">Tất cả (${Y[0]}…)</option>${Y.map(y=>`<option ${+FCF.fromYear===y?'selected':''}>${y}</option>`).join('')}</select></label>
      <label><input type="checkbox" id="fcSP" ${FCF.skipPartial?'checked':''}>Bỏ năm dở dang</label>
      <label title="Giá vốn, chi phí bán hàng, quản lý = tỷ lệ % doanh thu bình quân 3 năm gần nhất"><input type="checkbox" id="fcCR" ${FCF.costByRatio?'checked':''}>Chi phí theo % doanh thu</label>
      <label title="Cách dự báo bảng cân đối kế toán">Cân đối kế toán <select id="fcBM"><option value="ratio" ${FCF.bsMode!=='model'?'selected':''}>Theo tỷ lệ doanh thu + giữ khoản đầu tư (khuyên dùng)</option><option value="model" ${FCF.bsMode==='model'?'selected':''}>Theo mô hình chuỗi thời gian từng khoản</option></select></label></div>
    <div class="filterrow" style="margin-top:6px"><b style="font-size:13px">Kịch bản:</b><label>Điều chỉnh tăng trưởng doanh thu <input type="number" id="fcAR" value="${FCF.adjRev}" step="1" style="width:80px"> %/năm</label><label>Điều chỉnh chi phí <input type="number" id="fcAC" value="${FCF.adjCost}" step="1" style="width:80px"> %/năm</label>
      ${[['Thận trọng',-5,3],['Cơ sở',0,0],['Lạc quan',5,-2]].map(([n,a,c])=>`<button class="btn sm ghost" data-fcs="${a},${c}">${n}</button>`).join('')}
      <button class="btn sm primary" id="fcGo">Dự báo</button><button class="btn sm" id="fcRe" title="Đọc lại dữ liệu kế toán (sau khi nạp / điều chỉnh)">${ic('refresh')}Tính lại từ dữ liệu</button><button class="btn sm" id="fcX">${ic('download')}Xuất Excel</button></div>
    <div class="filterrow" style="margin-top:6px"><b style="font-size:13px" title="Thuê trạm, điện, xăng dầu, thuê văn phòng… là chi phí định kỳ lớn: dự báo = chi phí của tháng gốc × 12 × (1 + % tăng thêm), không lấy bình quân / xu hướng">Chi phí cố định định kỳ:</b>
      <label><input type="checkbox" id="fcFx" ${FCF.fixed?'checked':''}>Tính riêng</label>
      <label>Tháng gốc <select id="fcFxB"><option value="dec" ${FCF.fixedBase==='dec'?'selected':''}>Tháng 12 gần nhất</option><option value="last" ${FCF.fixedBase==='last'?'selected':''}>Tháng gần nhất có dữ liệu</option><option value="avg3" ${FCF.fixedBase==='avg3'?'selected':''}>Bình quân 3 tháng gần nhất</option></select></label>
      <label>Tăng thêm <input type="number" id="fcFxG" value="${FCF.fixedG||0}" step="0.5" style="width:70px"> %/năm</label>
      <button class="btn sm ghost" id="fcFxK">Chọn nhóm chi phí (${r.fixed?r.fixed.groups.filter(g=>g.on).length:0})</button>
      ${r.fixed&&r.fixed.base?`<span class="hint">Gốc ${r.fixed.baseMonths.map(m=>m.slice(5)+'/'+m.slice(0,4)).join(', ')}: giá vốn ${fmt2(r.fixed.base.cogs)} · bán hàng ${fmt2(r.fixed.base.sell)} · quản lý ${fmt2(r.fixed.base.admin)} / tháng</span>`:r.fixed&&r.fixed.empty?'<span class="hint neg">Không tìm thấy chi phí thuộc các nhóm đã chọn</span>':''}</div>
    <div id="fcFxP" class="hide" style="margin-top:8px;padding:10px 12px;border:1px dashed var(--gray-300);border-radius:10px;display:flex;flex-wrap:wrap;gap:6px 18px">${r.fixed?r.fixed.groups.map(g=>`<label style="font-size:13px"><input type="checkbox" data-fxk="${esc(g.key)}" ${g.on?'checked':''}> ${esc(g.n)} <span class=mut>(${g.d==='plate'?'xe':'vị trí'})</span></label>`).join(''):''}<button class="btn sm primary" id="fcFxS">Áp dụng</button></div>
    <div class="filterrow" style="margin-top:6px"><b style="font-size:13px">Kế hoạch & giả định:</b>
      <button class="btn sm ${FCF.inv.length?'light':'ghost'}" id="fcInvT">🏗 Kế hoạch đầu tư (${FCF.inv.length})</button>
      <label title="Đầu tư duy trì TSCĐ hiện có mỗi năm (để trống = bình quân thực tế 3 năm gần nhất trên sổ, Nợ 211/213/241)">Đầu tư duy trì / năm <input type="number" id="fcMt" value="${FCF.capexMaint??''}" placeholder="${r.cap&&r.cap[0]?Math.round(r.cap[0].maint):'tự động'}" style="width:130px"></label>
      <label title="Phần trăm LNST dương được chia / nộp về công ty mẹ hằng năm – giảm vốn chủ và tiền">Chia lợi nhuận <input type="number" id="fcDiv" value="${FCF.divPct||0}" min="0" max="100" style="width:70px"> % LNST</label>
      <label title="Không để mô hình xu hướng tự cắt giảm chi phí khi doanh thu vẫn tăng (tránh lợi nhuận tăng ảo)"><input type="checkbox" id="fcCF" ${FCF.costFloor!==false?'checked':''}>Chi phí không tự giảm khi doanh thu tăng</label>
      ${Object.keys(r.costGuard||{}).length?`<span class="hint">đã chặn giảm: ${Object.keys(r.costGuard).map(k=>({cogs:'giá vốn',sell:'bán hàng',admin:'quản lý'})[k]).join(', ')}</span>`:''}</div>
    <div id="fcInvP" class="${FCF.showInv?'':'hide'}" style="margin-top:8px;padding:10px 12px;border:1px dashed var(--brand-200);border-radius:10px;background:var(--brand-25)">
      <div class="hint" style="margin-bottom:6px">Mỗi dòng là một khoản đầu tư: <b>khấu hao đều</b> theo số năm sử dụng (cả năm đầu tư) vào giá vốn, <b>chi phí vận hành</b> = % vốn đầu tư mỗi năm, phần <b>vay</b> trả đều theo số năm khấu hao với lãi suất / năm (vào chi phí tài chính), <b>doanh thu tăng thêm</b> mỗi năm (để 0 nếu không tăng). TSCĐ = lũy kế đầu tư − khấu hao; nợ vay vào nợ phải trả; phần còn lại trả bằng tiền.</div>
      <table><thead><tr><th>Năm</th><th>Nội dung</th><th class=n>Vốn đầu tư</th><th class=n>Số năm khấu hao</th><th class=n>% vay</th><th class=n>Lãi suất %/năm</th><th class=n>Chi phí vận hành %/năm</th><th class=n>Doanh thu tăng thêm / năm</th><th></th></tr></thead><tbody id="fcInvB">
      ${FCF.inv.map((v,i)=>`<tr data-ivi="${i}"><td><select data-iv="y">${FY.map(y=>`<option ${+v.y===y?'selected':''}>${y}</option>`).join('')}</select></td><td><input data-iv="name" value="${esc(v.name||'')}" placeholder="vd Mở rộng trạm 4G" style="width:200px"></td><td><input data-iv="amt" type="number" value="${v.amt||''}" style="width:130px"></td><td><input data-iv="life" type="number" value="${v.life||10}" style="width:70px"></td><td><input data-iv="loan" type="number" value="${v.loan||0}" style="width:70px"></td><td><input data-iv="rate" type="number" value="${v.rate||0}" step="0.1" style="width:70px"></td><td><input data-iv="opex" type="number" value="${v.opex||0}" step="0.1" style="width:70px"></td><td><input data-iv="rev" type="number" value="${v.rev||0}" style="width:120px"></td><td><button class="btn sm ghost" data-ivd="${i}">✕</button></td></tr>`).join('')}</tbody></table>
      <div class="row" style="gap:8px;margin-top:8px"><button class="btn sm" id="fcInvA">+ Thêm khoản đầu tư</button><button class="btn sm primary" id="fcInvS">Áp dụng kế hoạch</button>${r.inv?`<span class="hint">Tổng: đầu tư ${fmt2(r.inv.reduce((a,t)=>a+t.capex,0))} · khấu hao năm ${FY.at(-1)} ${fmt2(r.inv.at(-1).dep)} · lãi vay năm ${FY[0]} ${fmt2(r.inv[0].int)}</span>`:''}</div></div></div>
    <div class="kpis">${(()=>{const f=r.fc.at(-1).P,b=last.P;return kpi('','coins',`Doanh thu thuần ${FY.at(-1)}`,fmt2(f.net),`${pct(g(b.net,f.net))} so với ${last.y}`)+kpi(f.pbt>=0?'green':'red','trend',`LN trước thuế ${FY.at(-1)}`,fmt2(f.pbt),`${last.y}: ${fmt2(b.pbt)}`)+kpi(f.pat>=0?'green':'red','trend',`LN sau thuế ${FY.at(-1)}`,fmt2(f.pat),'')+kpi('blue','chart','Tổng tài sản '+FY.at(-1),fmt2(r.fc.at(-1).B['270']),`${last.y}: ${fmt2(last.B['270'])}`)})()}</div>
    <div class="card"><div class="card-h"><h3>Biểu đồ: thực tế và dự báo</h3><div class="sp"></div><select id="fcCh">${PL.map(([k,n])=>`<option value="${k}" ${(FCF.ch||'net')===k?'selected':''}>${n}</option>`).join('')}</select></div><div style="height:300px"><canvas id="fcChart"></canvas></div></div>
    <div class="card"><div class="card-h"><div class="subtabs" id="fcTab">${[['pl','Kết quả kinh doanh (B02)'],['mon',`Theo tháng năm ${FY[0]}`],['bs','Cân đối kế toán (B01)'],['cf','Lưu chuyển tiền tệ (B03)'],['ig','Giao dịch nội bộ'],['cmp','So sánh mô hình']].map(([k,v])=>`<button data-fct="${k}" class="${FCF.show===k?'on':''}">${v}</button>`).join('')}</div></div>
    <div class="tbl" style="max-height:calc(100vh - 300px)">${FCF.show==='ig'?'<div id="fcIG" style="padding:14px"><span class="spin"></span> Đang tổng hợp giao dịch nội bộ theo năm và dự báo…</div>':FCF.show==='mon'?'<div id="fcMon" style="padding:14px"><span class="spin"></span> Đang dự báo theo tháng…</div>':FCF.show==='bs'?`<table><thead><tr>${hdr}</tr></thead><tbody>${BSrows}</tbody></table>`:FCF.show==='cf'?fcCFYear(r):FCF.show==='cmp'?
      `<table><thead><tr><th>Mô hình (Doanh thu bán hàng)</th>${FY.map(y=>`<th class=n>${y}</th>`).join('')}<th class=n>Sai số kiểm định (MAPE)</th><th class=n>Trọng số trong "Tự động"</th></tr></thead><tbody>${mk.map(m=>`<tr${m===r.model?' style="font-weight:700;background:#FFF1EB"':''}><td>${esc(r.models[m])}</td>${cmp[m].f.map(v=>`<td class=n>${fmt2(v)}</td>`).join('')}<td class=n>${pct(cmp[m].mape)}</td><td class=n>${m==='ens'?'':pct(cmp.ens&&cmp.ens.w?cmp.ens.w[m]:null)}</td></tr>`).join('')}</tbody></table>
       <div class="hint" style="padding:10px 12px">Kiểm định lại: mỗi mô hình dự báo năm t+1 chỉ bằng dữ liệu đến năm t, so với số thực tế của 3 năm gần nhất. MAPE càng nhỏ càng chính xác; "Tự động" lấy bình quân gia quyền theo 1 / MAPE.</div>`
      :`<table><thead><tr>${hdr}</tr></thead><tbody>${PL.map(rowPL).join('')}</tbody></table>`}</div></div>
    ${r.hist.length<4?`<div class="note" style="border-color:var(--err-200);background:var(--err-50)">⚠️ Chỉ đang dùng <b>${r.hist.length} năm</b> dữ liệu (${r.hist.map(x=>x.y).join(', ')}) – quá ít để dò xu hướng, nên các dòng đang <b>giữ mức năm gần nhất</b> và chỉ thay đổi theo % kịch bản, chi phí cố định, kế hoạch đầu tư (mô hình đã chọn tạm không dùng). Nên chọn "Dùng dữ liệu từ năm" sớm hơn (≥ 4–5 năm).</div>`:''}
    <div class="note">⚠️ Dự báo thống kê từ số liệu quá khứ, không thay thế kế hoạch kinh doanh. Năm có sự kiện bất thường (nạp thiếu tháng, điều chỉnh lớn) nên loại bằng "Dùng dữ liệu từ năm" hoặc "Bỏ năm dở dang".</div>`;
  const ch=FCF.ch||'net',vh=r.hist.map(x=>x.P[ch]||0),vf=r.fc.map(x=>x.P[ch]||0),dark=document.documentElement.dataset.theme==='dark';
  const ds=[{label:'Thực tế',data:[...vh,...FY.map(()=>null)],borderColor:'#001A79',backgroundColor:'rgba(0,26,121,.08)',tension:.25,fill:false,pointRadius:4},{label:'Dự báo – '+r.models[r.model].split(' –')[0],data:[...vh.slice(0,-1).map(()=>null),vh.at(-1),...vf],borderColor:'#FA4700',borderDash:[6,4],tension:.25,pointRadius:4}];
  if(ch==='rev'||ch==='net')for(const [m,c] of [['linear','#17B26A'],['holt','#2970FF'],['cagr','#EAAA08']])if(r.compare.rev[m]&&m!==r.model)ds.push({label:r.models[m].split(' (')[0].split(' –')[0],data:[...vh.slice(0,-1).map(()=>null),vh.at(-1),...r.compare.rev[m].f.map((v,i)=>ch==='net'?v-(r.fc[i].P.ded||0):v)],borderColor:c,borderWidth:1.2,pointRadius:0,borderDash:[2,3]});
  fcChartSafe('fcChart',{type:'line',data:{labels:[...Y,...FY],datasets:ds},options:{maintainAspectRatio:false,animation:false,spanGaps:true,plugins:{legend:{position:'bottom'}},scales:{y:{ticks:{callback:v=>fmt(v)}}}}});
  const rd=()=>{FCF.capexMaint=$('#fcMt').value===''?null:+$('#fcMt').value;FCF.divPct=+$('#fcDiv').value||0;FCF.costFloor=$('#fcCF').checked;FCF.bsMode=$('#fcBM').value;FCF.fixed=$('#fcFx').checked;FCF.fixedBase=$('#fcFxB').value;FCF.fixedG=+$('#fcFxG').value||0;FCF.h=+$('#fcH').value;FCF.model=$('#fcM').value;FCF.fromYear=$('#fcFrom').value;FCF.skipPartial=$('#fcSP').checked;FCF.costByRatio=$('#fcCR').checked;FCF.adjRev=+$('#fcAR').value||0;FCF.adjCost=+$('#fcAC').value||0};
  ['#fcH','#fcM','#fcFrom','#fcSP','#fcCR','#fcFx','#fcFxB','#fcBM'].forEach(s=>$(s).onchange=()=>{rd();vFC()});$('#fcFxG').onchange=()=>{rd();vFC()};
  $('#fcFxK').onclick=()=>$('#fcFxP').classList.toggle('hide');
  $('#fcInvT').onclick=()=>{FCF.showInv=!FCF.showInv;ls.set('fcPick',FCF);$('#fcInvP').classList.toggle('hide',!FCF.showInv)};
  const invRead=()=>{FCF.inv=[...H.querySelectorAll('#fcInvB tr[data-ivi]')].map(tr=>Object.fromEntries([...tr.querySelectorAll('[data-iv]')].map(e=>[e.dataset.iv,e.dataset.iv==='name'?e.value:+e.value||0])))};
  $('#fcInvA').onclick=()=>{invRead();FCF.inv.push({y:FY[0],name:'',amt:0,life:10,loan:0,rate:0,opex:0,rev:0});FCF.showInv=true;ls.set('fcPick',FCF);fcDraw(r)};
  $('#fcInvB').onclick=e=>{const d=e.target.closest('[data-ivd]');if(!d)return;invRead();FCF.inv.splice(+d.dataset.ivd,1);rd();vFC()};
  $('#fcInvB').addEventListener('change',e=>e.stopPropagation());
  $('#fcInvS').onclick=()=>{invRead();FCF.inv=FCF.inv.filter(v=>v.amt);rd();vFC()};
  ['#fcDiv','#fcCF','#fcMt'].forEach(x=>$(x).onchange=()=>{rd();vFC()});$('#fcFxS').onclick=()=>{FCF.fixedKeys=[...H.querySelectorAll('[data-fxk]:checked')].map(c=>c.dataset.fxk);if(!FCF.fixedKeys.length)FCF.fixed=false;rd();vFC()};$('#fcGo').onclick=()=>{rd();vFC()};$('#fcRe').onclick=()=>{rd();vFC(true)};
  H.querySelectorAll('[data-fcs]').forEach(b=>b.onclick=()=>{const [a,c]=b.dataset.fcs.split(',');$('#fcAR').value=a;$('#fcAC').value=c;rd();vFC()});
  $('#fcCh').onchange=e=>{FCF.ch=e.target.value;ls.set('fcPick',FCF);fcDraw(r)};$('#fcTab').onclick=e=>{const b=e.target.closest('[data-fct]');if(b){FCF.show=b.dataset.fct;ls.set('fcPick',FCF);fcDraw(r)}};
  if(FCF.show==='mon')fcMon(PL);
  if(FCF.show==='ig')fcIG();
  $('#fcX').onclick=async()=>{const cols=(get)=>Object.assign({},...r.hist.map(x=>({[String(x.y)+(x.partial?' (quy năm)':'')]:get(x)})),...r.fc.map(x=>({[x.y+' dự báo']:get(x)})));
    try{const f=await api.xlsxSheets(`AccSoft_DuBao_${FY[0]}_${FY.at(-1)}.xlsx`,[['Du bao KQKD',PL.map(([k,n])=>Object.assign({'Chỉ tiêu':n},cols(x=>x.P[k]||0)))],['Du bao CDKT',r.bsLines.map(l=>Object.assign({'Chỉ tiêu':l.name},cols(x=>x.B[l.code]||0)))],
      ['So sanh mo hinh',mk.map(m=>Object.assign({'Mô hình':r.models[m]},...FY.map((y,i)=>({[y]:cmp[m].f[i]})),{'MAPE kiểm định':cmp[m].mape}))]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
}

// Dự báo theo tháng cho năm dự báo đầu tiên: tỷ trọng mùa vụ × dự báo năm (khớp tổng năm) / Holt-Winters / bình quân 2 cách
async function fcMon(PL){const W=$('#fcMon');if(!W)return;const mm=FCF.mm||'season',ms=FCF.ms||'pl';
  let r;try{r=await aq('fcMonthly',{h:FCF.h,model:FCF.model,fromYear:FCF.fromYear,skipPartial:FCF.skipPartial,costByRatio:FCF.costByRatio,bsMode:FCF.bsMode,capexMaint:FCF.capexMaint,inv:FCF.inv,divPct:+FCF.divPct||0,costFloor:FCF.costFloor,fixed:FCF.fixed,fixedBase:FCF.fixedBase,fixedG:+FCF.fixedG||0,fixedKeys:FCF.fixedKeys,adj:{rev:+FCF.adjRev||0,cost:+FCF.adjCost||0},mmethod:mm})}catch(e){W.innerHTML=`<span class=neg>${esc(e.message)}</span>`;return}
  if(!$('#fcMon'))return;const M=r.months,ML=M.map(m=>m.slice(5)+'/'+m.slice(0,4)),sumP=k=>r.rows.reduce((s,x)=>s+(x.P[k]||0),0);
  W.outerHTML=`<div id="fcMonW"><div class="filterrow" style="padding:10px 12px"><label>Cách chia theo tháng <select id="fcMM"><option value="season" ${mm==='season'?'selected':''}>Dự báo năm × tỷ trọng mùa vụ (khớp tổng năm)</option><option value="hw" ${mm==='hw'?'selected':''} ${r.hasHW?'':'disabled'}>Holt-Winters theo chuỗi tháng${r.hasHW?'':' (cần ≥ 24 tháng)'}</option><option value="avg" ${mm==='avg'?'selected':''} ${r.hasHW?'':'disabled'}>Bình quân 2 cách</option></select></label>
      <span class="hint">Tỷ trọng mùa vụ lấy từ ${r.fullYears.slice(-3).join(', ')||'— (chưa có năm đủ 12 tháng → chia đều)'} · thuế TNDN theo thuế suất của dự báo năm</span><button class="btn sm" id="fcMX">${ic('download')}Xuất Excel theo tháng</button></div>
    <div class="subtabs" id="fcMS" style="margin:0 12px 8px">${[['pl','Kết quả kinh doanh'],['bs','Cân đối kế toán'],['cf','Lưu chuyển tiền tệ']].map(([k,v])=>`<button data-fms="${k}" class="${ms===k?'on':''}">${v}</button>`).join('')}</div>
    ${ms!=='pl'?fcMonBS(r,ms):`<div style="height:260px;padding:0 12px"><canvas id="fcMonCh"></canvas></div>
    <table><thead><tr><th>Chỉ tiêu</th>${ML.map(m=>`<th class=n style="background:#FFF1EB;color:var(--brand-700)">${m}</th>`).join('')}<th class=n>Cộng ${r.year}</th><th class=n>Dự báo năm</th></tr></thead><tbody>
    ${PL.map(([k,n,b])=>`<tr${b?' style="font-weight:700;background:#F9FAFB"':''}><td style="min-width:220px;white-space:nowrap">${n}</td>${r.rows.map(x=>`<td class="n ${x.P[k]<0?'neg':''}">${fmt2(x.P[k])}</td>`).join('')}<td class=n><b>${fmt2(sumP(k))}</b></td><td class="n mut">${fmt2(r.annual[k])}</td></tr>`).join('')}
    ${['rev','cogs'].map(k=>`<tr><td class=mut style="font-size:12px">Tỷ trọng mùa vụ – ${k==='rev'?'doanh thu':'giá vốn'}</td>${r.share[k].map(v=>`<td class="n mut" style="font-size:12px">${(v*100).toFixed(1)}%</td>`).join('')}<td></td><td></td></tr>`).join('')}</tbody></table>`}</div>`;
  $('#fcMS').onclick=e=>{const b=e.target.closest('[data-fms]');if(!b)return;FCF.ms=b.dataset.fms;ls.set('fcPick',FCF);$('#fcMonW').outerHTML='<div id="fcMon" style="padding:14px"><span class="spin"></span></div>';fcMon(PL)};
  if(ms==='pl'){const ch=FCF.ch||'net',hl=r.hist.map(x=>x.ym.slice(5)+'/'+x.ym.slice(0,4));
  fcChartSafe('fcMonCh',{type:'bar',data:{labels:[...hl,...ML],datasets:[{label:'Thực tế 24 tháng gần nhất',data:[...r.hist.map(x=>x.P[ch]||0),...M.map(()=>null)],backgroundColor:'rgba(0,26,121,.55)'},{label:'Dự báo '+r.year,data:[...r.hist.map(()=>null),...r.rows.map(x=>x.P[ch]||0)],backgroundColor:'rgba(250,71,0,.75)'}]},options:{maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{x:{stacked:true},y:{ticks:{callback:v=>fmt(v)}}}}});}
  $('#fcMM').onchange=e=>{FCF.mm=e.target.value;ls.set('fcPick',FCF);const w=$('#fcMonW');w.outerHTML='<div id="fcMon" style="padding:14px"><span class="spin"></span> Đang dự báo theo tháng…</div>';fcMon(PL)};
  $('#fcMX').onclick=async()=>{try{const f=await api.xlsxSheets(`AccSoft_DuBaoThang_${r.year}.xlsx`,[['KQKD theo thang',PL.map(([k,n])=>Object.assign({'Chỉ tiêu':n},...r.rows.map((x,i)=>({[ML[i]]:x.P[k]||0})),{['Cộng '+r.year]:sumP(k)}))],['CDKT theo thang',fcBSRows(r).map(o=>Object.assign({'Chỉ tiêu':o.n},...r.bsM.map((x,i)=>({[x.ym.slice(5)+'/'+x.ym.slice(0,4)+(x.est?' (ước)':'')]:o.v[i]}))))],['LCTT theo thang',fcCFRows(r).map(o=>Object.assign({'Chỉ tiêu':o.n},...r.cfM.map((x,i)=>({[x.ym.slice(5)+'/'+x.ym.slice(0,4)+(x.est?' (ước)':'')]:o.v[i]})),{['Cộng']:o.sum?o.v.reduce((a,b)=>a+b,0):null}))]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
}

// B01 / LCTT theo tháng (từ số dư thực tế gần nhất tới cuối năm dự báo)
const fcBSRows=r=>r.bsLines.map(l=>({n:l.name,lvl:l.lvl,b:l.lvl===0,v:r.bsM.map(x=>x.B[l.code]||0)}));
function fcCFRows(r,yearly){const nm=c=>(r.bsLines.find(l=>l.code===c)||{}).name||c,G=yearly?r.cfGroupsY:r.cfGroups,C=yearly?r.cfY:r.cfM,row=(n,f,o={})=>({n,v:C.map(f),sum:o.sum!==false,b:!!o.b,ind:o.ind||0}),cl=c=>nm(c).replace(/^[IVX]+\.\s*/,''),P=yearly?'năm':'tháng';
  return [row('Lợi nhuận sau thuế',x=>x.pat,{ind:1}),row('Khấu hao TSCĐ (chi phí không chi tiền – cộng lại)',x=>x.dep,{ind:1}),...G.opA.map(c=>row('(Tăng) / giảm '+cl(c),x=>x.det[c]||0,{ind:1})),...G.liab.map(c=>row('Tăng / (giảm) '+cl(c)+' (không gồm vay đầu tư)',x=>x.det[c]||0,{ind:1})),
    row('I. Lưu chuyển tiền thuần từ hoạt động kinh doanh',x=>x.cfo,{b:1}),row('Tiền chi mua sắm TSCĐ (duy trì + kế hoạch đầu tư)',x=>-x.capex,{ind:1}),...G.invA.map(c=>row('(Tăng) / giảm '+cl(c),x=>x.det[c]||0,{ind:1})),row('II. Lưu chuyển tiền thuần từ hoạt động đầu tư',x=>x.cfi,{b:1}),
    row('Tiền vay / (trả nợ) vay đầu tư',x=>x.dLoan,{ind:1}),row('Chia lợi nhuận / nộp công ty mẹ',x=>x.div?-x.div:0,{ind:1}),row('III. Lưu chuyển tiền thuần từ hoạt động tài chính',x=>x.cff,{b:1}),row('Lưu chuyển tiền thuần trong '+P,x=>x.net,{b:1}),row('Tiền đầu '+P,x=>x.open,{sum:false}),row('Tiền cuối '+P,x=>x.close,{sum:false,b:1})]}
function fcMonBS(r,ms){const H=r.bsM.map(x=>`<th class=n style="background:${x.est?'#F5F5F5':'#FFF1EB'};color:var(--brand-700)">${x.ym.slice(5)}/${x.ym.slice(0,4)}${x.est?'<div class=mut style="font-size:10px;text-transform:none">ước còn lại năm nay</div>':''}</th>`).join('');
  const R=ms==='bs'?fcBSRows(r):fcCFRows(r);
  return `<div class="hint" style="padding:0 12px 8px">${ms==='bs'?`Đi từ số dư thực tế ${r.lastYm.slice(5)}/${r.lastYm.slice(0,4)} tới số dư dự báo cuối năm ${r.year} (phân bổ đều từng tháng); vốn chủ cộng dồn LNST dự báo từng tháng; Tiền là khoản cân đối → Tổng tài sản = Tổng nguồn vốn.`:'Phương pháp gián tiếp: HĐKD = LNST + khấu hao (chi phí không chi tiền) ± vốn lưu động; HĐĐT = chi mua sắm TSCĐ (đầu tư duy trì theo bình quân thực tế + kế hoạch đầu tư) ± đầu tư tài chính; HĐTC = vay / trả nợ vay đầu tư − chia lợi nhuận. Tiền đầu tháng + lưu chuyển thuần = Tiền cuối tháng.'}</div>
    <table><thead><tr><th>Chỉ tiêu</th><th class=n>Thực tế ${r.lastYm.slice(5)}/${r.lastYm.slice(0,4)}</th>${H}${ms==='cf'?'<th class=n>Cộng</th>':''}</tr></thead><tbody>${R.map(o=>`<tr${o.b?' style="font-weight:700;background:#F9FAFB"':''}><td style="min-width:260px;white-space:nowrap;padding-left:${12+((o.lvl??0)+(o.ind||0))*14}px">${esc(o.n)}</td><td class="n mut">${ms==='bs'?fmt2(r.startB[(r.bsLines.find(l=>l.name===o.n)||{}).code]||0):''}</td>${o.v.map(v=>`<td class="n ${v<0?'neg':''}">${fmt2(v)}</td>`).join('')}${ms==='cf'?`<td class=n><b>${o.sum?fmt2(o.v.reduce((a,b)=>a+b,0)):''}</b></td>`:''}</tr>`).join('')}</tbody></table>`}

// Dự báo giao dịch nội bộ theo công ty / nhóm (mua theo nhóm TK, bán theo doanh thu) – dùng mô hình & số năm đang chọn
async function fcIG(){const W=$('#fcIG');if(!W)return;const IGP=(typeof IG!=='undefined'&&IG.par)||'TFU,VTC,STL,VTG',G1=IGP.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean),gOf=k=>G1.includes(String(k).toUpperCase())?1:2;
  const F=Object.assign({co:'',tt:false,ex:true,met:'buyTot',adjB:0,adjS:0,split:true},ls.get('fcIG',{}));
  let r,cos;try{[r,cos]=await Promise.all([aq('fcInternal',{h:FCF.h,model:FCF.model,fromYear:FCF.fromYear,skipPartial:FCF.skipPartial,company:F.co,tt:F.tt,ex:F.ex,adj:{buy:+F.adjB||0,sales:+F.adjS||0}}),aq('grpCompanies',F.tt)])}catch(e){W.innerHTML=`<span class=neg>${esc(e.message)}</span>`;return}
  if(!$('#fcIG'))return;const Y=r.years,FY=r.fy,C=r.cols,cn=k=>(C.find(c=>c[0]===k)||[k,k])[1],M=F.met,pct=v=>v==null?'–':(v*100).toFixed(1)+'%';
  const val=(o,y)=>o.hist[y]?o.hist[y][M]:0,vf=(o,i)=>o.fc[i][M],row=(o,lab,b)=>{const a=Y.map(y=>val(o,y)),f=FY.map((_,i)=>vf(o,i)),g=a.at(-1)&&f.at(-1)/a.at(-1)>0?Math.pow(f.at(-1)/a.at(-1),1/f.length)-1:null;
    return `<tr${b?' style="font-weight:700;background:#F9FAFB"':''}><td style="min-width:260px">${lab}</td>${a.map(v=>`<td class=n>${fmt2(v)}</td>`).join('')}${f.map(v=>`<td class="n ${v<0?'neg':''}" style="background:#FFF8F4"><b>${fmt2(v)}</b></td>`).join('')}<td class=n>${pct(g)}</td></tr>`};
  const sumO=L=>({hist:Object.fromEntries(Y.map(y=>[y,{[M]:L.reduce((s,o)=>s+val(o,y),0)}])),fc:FY.map((_,i)=>({[M]:L.reduce((s,o)=>s+vf(o,i),0)}))});
  const body=F.split&&!F.co?[1,2].flatMap(g=>{const L=r.rows.filter(o=>gOf(o.key)===g);return L.length?[`<tr style="font-weight:700;background:#FFF1EB"><td colspan=${Y.length+FY.length+2}>${g===1?`Nhóm 1 – Công ty mẹ & công ty con (${G1.join(', ')})`:'Nhóm 2 – Cùng tập đoàn'}</td></tr>`,...L.map(o=>row(o,esc(o.company))),row(sumO(L),'Cộng nhóm '+g,1)]:[]}):r.rows.map(o=>row(o,esc(o.company)));
  W.outerHTML=`<div id="fcIGW"><div class="filterrow" style="padding:10px 12px">
      <label>Chỉ tiêu <select id="igM">${C.map(([k,v])=>`<option value="${k}" ${M===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label>
      <label>Công ty / nhóm <select id="igC" class="srch"><option value="">Tất cả đơn vị nội bộ</option><option value="G:1:${esc(G1.join(','))}" ${F.co.startsWith('G:1:')?'selected':''}>Nhóm 1 – mẹ & con</option><option value="G:2:${esc(G1.join(','))}" ${F.co.startsWith('G:2:')?'selected':''}>Nhóm 2 – cùng tập đoàn</option>${cos.map(c=>`<option value="${esc(c.key)}" ${F.co===c.key?'selected':''}>${esc(c.key)} – ${esc(c.name)}</option>`).join('')}</select></label>
      <label><input type="checkbox" id="igEx" ${F.ex?'checked':''}>Bỏ bút toán trích trước (335, 1317)</label><label><input type="checkbox" id="igTT" ${F.tt?'checked':''}>Gồm bên liên quan (TT)</label><label><input type="checkbox" id="igSp" ${F.split?'checked':''}>Tách nhóm 1 / 2</label></div>
    <div class="filterrow" style="padding:0 12px 10px"><b style="font-size:13px">Kịch bản nội bộ:</b><label>Điều chỉnh mua nội bộ <input type="number" id="igAB" value="${F.adjB}" style="width:80px"> %/năm</label><label>Điều chỉnh bán nội bộ <input type="number" id="igAS" value="${F.adjS}" style="width:80px"> %/năm</label><button class="btn sm primary" id="igGo">Dự báo</button><button class="btn sm" id="igX">${ic('download')}Xuất Excel</button>
      <span class="hint">Mô hình: ${esc(r.models[r.model].split(' –')[0])} · sai số kiểm định bình quân ${pct(r.mape)} · năm dở dang quy đổi cả năm${Object.entries(r.partial).filter(([,v])=>v).map(([y,v])=>` (${y}: ${v} tháng)`).join('')}</span></div>
    ${r.few?`<div class="note" style="margin:0 12px 8px;border-color:var(--warn-500)">⚠️ Chỉ có ${Y.length} năm dữ liệu (${Y.join(', ')}) – quá ít để dò xu hướng, nên dự báo nội bộ đang <b>giữ mức năm gần nhất</b> (chỉnh bằng % kịch bản). Chọn "Dùng dữ liệu từ năm" sớm hơn (≥ 4 năm) để dùng mô hình.</div>`:''}<div style="height:240px;padding:0 12px"><canvas id="igCh"></canvas></div>
    <table><thead><tr><th>Đơn vị nội bộ – ${esc(cn(M))}</th>${Y.map(y=>`<th class=n>${y}${r.partial[y]?`<div class=mut style="font-size:10px;text-transform:none">${r.partial[y]} th → quy năm</div>`:''}</th>`).join('')}${FY.map(y=>`<th class=n style="background:#FFF1EB;color:var(--brand-700)">${y} dự báo</th>`).join('')}<th class=n>Tăng trưởng bq</th></tr></thead>
    <tbody>${body.join('')||`<tr><td colspan=20 class=mut style="text-align:center;padding:20px">Không có giao dịch nội bộ</td></tr>`}${row({hist:Object.fromEntries(Y.map(y=>[y,r.totHist[y]])),fc:r.totFc},'TỔNG CỘNG',1)}</tbody></table>
    <div class="card" style="margin:12px;padding:12px 16px"><b>Tổng hợp dự báo ${FY[0]} theo nhóm chỉ tiêu</b><table style="margin-top:8px"><thead><tr><th>Chỉ tiêu</th><th class=n>${Y.at(-1)} (thực tế${r.partial[Y.at(-1)]?' quy năm':''})</th>${FY.map(y=>`<th class=n>${y}</th>`).join('')}</tr></thead><tbody>${C.map(([k,v])=>`<tr${['buyTot','salesNet'].includes(k)?' style="font-weight:700"':''}><td>${esc(v)}</td><td class=n>${fmt2(r.totHist[Y.at(-1)][k])}</td>${r.totFc.map(t=>`<td class=n>${fmt2(t[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  fcChartSafe('igCh',{type:'bar',data:{labels:[...Y,...FY],datasets:[{label:'Tổng mua nội bộ',data:[...Y.map(y=>r.totHist[y].buyTot),...r.totFc.map(t=>t.buyTot)],backgroundColor:[...Y.map(()=>'rgba(0,26,121,.6)'),...FY.map(()=>'rgba(0,26,121,.25)')]},{label:'Bán nội bộ thuần',data:[...Y.map(y=>r.totHist[y].salesNet),...r.totFc.map(t=>t.salesNet)],backgroundColor:[...Y.map(()=>'rgba(250,71,0,.75)'),...FY.map(()=>'rgba(250,71,0,.3)')]}]},options:{maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{ticks:{callback:v=>fmt(v)}}}}});
  const rd=()=>{F.met=$('#igM').value;F.co=$('#igC').value;F.ex=$('#igEx').checked;F.tt=$('#igTT').checked;F.split=$('#igSp').checked;F.adjB=+$('#igAB').value||0;F.adjS=+$('#igAS').value||0;ls.set('fcIG',F)};
  const again=()=>{rd();$('#fcIGW').outerHTML='<div id="fcIG" style="padding:14px"><span class="spin"></span> Đang dự báo…</div>';fcIG()};
  ['#igM','#igC','#igEx','#igTT','#igSp'].forEach(s=>$(s).onchange=again);$('#igGo').onclick=again;
  $('#igX').onclick=async()=>{const yc=(o)=>Object.assign({},...Y.map(y=>({[y+(r.partial[y]?' (quy năm)':'')]:o.hist[y]?o.hist[y][M]:0})),...FY.map((y,i)=>({[y+' dự báo']:o.fc[i][M]})));
    try{const f=await api.xlsxSheets(`AccSoft_DuBaoNoiBo_${FY[0]}_${FY.at(-1)}.xlsx`,[['Du bao noi bo',r.rows.map(o=>Object.assign({'Mã':o.key,'Đơn vị':o.company,'Nhóm':gOf(o.key)},...C.flatMap(([k,v])=>FY.map((y,i)=>({[v+' – '+y]:o.fc[i][k]})))))],
      ['Chi tieu '+cn(M).slice(0,20).replace(/[\\/*?:\[\]]/g,''),r.rows.map(o=>Object.assign({'Mã':o.key,'Đơn vị':o.company},yc(o)))],['Tong hop',C.map(([k,v])=>Object.assign({'Chỉ tiêu':v},...Y.map(y=>({[y]:r.totHist[y][k]})),...FY.map((y,i)=>({[y+' dự báo']:r.totFc[i][k]}))))]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
}

// Vẽ biểu đồ dự báo an toàn: chờ khung hiển thị xong (tránh biểu đồ trắng khi vẽ lúc trang đang chuyển), vẽ lại khi đổi kích thước, báo lỗi nếu không vẽ được
function fcChartSafe(id,cfg){const draw=()=>{const c=$('#'+id);if(!c)return;try{chart(id,cfg);setTimeout(()=>{try{charts[id]&&charts[id].resize()}catch{}},250)}catch(e){c.parentNode.innerHTML=`<div class="neg" style="padding:20px">Không vẽ được biểu đồ: ${esc(e.message)}</div>`}};
  requestAnimationFrame(()=>requestAnimationFrame(draw))}

function fcCFYear(r){if(!r.cfY)return '<div class=mut style="padding:14px">Không có dữ liệu</div>';const R=fcCFRows(r,true),c=r.cap&&r.cap[0];
  return `<div class="hint" style="padding:10px 12px">Gián tiếp từ B01 dự báo. Khấu hao TSCĐ hiện có ${fmt2(c?c.depE:0)}/năm và đầu tư duy trì ${fmt2(c?c.maint:0)}/năm = bình quân 3 năm gần nhất trên sổ (Có 214; Nợ 211/213/241). Năm ${r.fc[0].y} tính từ số dư thực tế ${r.hist.at(-1).y}${r.hist.at(-1).partial?' (tháng '+r.hist.at(-1).months+')':''}, gồm cả LNST các tháng còn lại năm nay.</div>
  <table><thead><tr><th>Chỉ tiêu</th>${r.cfY.map(x=>`<th class=n style="background:#FFF1EB;color:var(--brand-700)">${x.y} dự báo</th>`).join('')}<th class=n>Cộng</th></tr></thead><tbody>${R.map(o=>`<tr${o.b?' style="font-weight:700;background:#F9FAFB"':''}><td style="min-width:300px;white-space:nowrap;padding-left:${12+(o.ind||0)*14}px">${esc(o.n)}</td>${o.v.map(v=>`<td class="n ${v<0?'neg':''}">${fmt2(v)}</td>`).join('')}<td class=n><b>${o.sum?fmt2(o.v.reduce((a,b)=>a+b,0)):''}</b></td></tr>`).join('')}</tbody></table>`}


/* ===== v4.41: Danh mục nhân viên ===== */
const STF=Object.assign({q:'',dept:'',unit:'',status:'active',contract:'',nationality:''},ls.get('stPick',{}));const STSEL=new Set();
async function vStaff(){const H=$('#stBody');ls.set('stPick',STF);if(STF.tab==='bp')return vStaffBp();
  const r=await aq('staffList',{q:STF.q,dept:STF.dept,unit:STF.unit,status:STF.status,contract:STF.contract,nationality:STF.nationality}),F=r.fields,fn=Object.fromEntries(F);
  const sel=(k,lab,all)=>`<label>${lab} <select data-stf="${k}" ${['dept','unit'].includes(k)?'class="srch" data-auto="1"':''} style="max-width:240px"><option value="">${all}</option>${r.facets[k].map(x=>`<option value="${esc(x.v)}" ${STF[k]===x.v?'selected':''}>${esc(k==='status'?(x.v==='inactive'?'Đã nghỉ / ngừng':x.v==='active'?'Đang làm việc':x.v||'(trống)'):x.v||'(trống)')} · ${x.n}</option>`).join('')}</select></label>`;
  const COLS=['code','name','position','dept','unit','contract','block','direct','nationality','gender','dob','start_date','end_date','phone','email1','erp_user','status'];
  const vd=d=>d&&/^\d{4}-\d{2}-\d{2}/.test(d)?vn(d):esc(d||'');
  H.innerHTML=`<div class="card"><div class="subbar"><span class="crumb">Danh mục nhân viên</span>${stTabs()}<span class="hint">${num(r.total)} nhân viên trong hệ thống · user ERP (người nhập chứng từ) dùng để gửi email lỗi nhập liệu và báo cáo quản trị theo nhân viên</span></div>
    <div class="filterrow"><input id="stQ" type="search" placeholder="🔍 Tìm mã, tên, chức danh, phòng ban, email, SĐT, user ERP…" value="${esc(STF.q)}" style="width:360px">${sel('dept','Phòng ban','Tất cả')}${sel('unit','Đơn vị','Tất cả')}${sel('status','Trạng thái','Tất cả')}${sel('contract','Loại HĐ','Tất cả')}${sel('nationality','Quốc tịch','Tất cả')}</div>
    <div class="filterrow" style="margin-top:6px"><button class="btn sm primary" id="stAdd">+ Thêm nhân viên</button><button class="btn sm" id="stImp">${ic('upload')}Nạp file (thêm / cập nhật)</button><button class="btn sm ghost" id="stImpR">Nạp thay toàn bộ</button><button class="btn sm" id="stX">${ic('download')}Xuất Excel</button>
      <span style="flex:1"></span><span id="stSel" class="mut"></span><button class="btn sm light" id="stMail" disabled>✉ Gửi email</button><button class="btn sm danger" id="stDel" disabled>Xoá</button></div></div>
    <div class="kpis">${kpi('','users','Nhân viên đang lọc',num(r.rows.length),`${num(r.rows.filter(x=>x.status!=='inactive').length)} đang làm việc`)}${kpi('blue','users','Người Việt / người Timor',`${num(r.rows.filter(x=>x.nationality==='VN').length)} / ${num(r.rows.filter(x=>x.nationality==='TM').length)}`,'')}${kpi(r.rows.some(x=>!x.email1&&!x.email2)?'red':'green','mail','Chưa có email',num(r.rows.filter(x=>!x.email1&&!x.email2).length),'cần bổ sung để gửi thư')}${kpi('','alert','HĐ hết hạn trong 60 ngày',num(r.rows.filter(x=>x.end_date&&x.end_date>=new Date().toISOString().slice(0,10)&&x.end_date<=new Date(Date.now()+60*864e5).toISOString().slice(0,10)).length),'theo ngày hết HĐLĐ / về nước')}</div>
    <div class="card"><div class="card-h"><h3>Danh sách nhân viên</h3><span class="dblhint">🖱 nhấn đúp một dòng để xem / sửa thông tin</span></div>
    <div class="tbl" style="max-height:calc(100vh - 360px)"><table><thead><tr><th><input type="checkbox" id="stAll"></th>${COLS.map(c=>`<th>${esc(fn[c])}</th>`).join('')}</tr></thead><tbody>
    ${r.rows.slice(0,2000).map((x,i)=>`<tr class=dbl data-sti="${i}"${x.status==='inactive'?' style="opacity:.55"':''}><td><input type="checkbox" data-stc="${esc(x.code)}" ${STSEL.has(x.code)?'checked':''}></td>${COLS.map(c=>`<td class="${['code','dob','start_date','end_date','phone'].includes(c)?'nw':''}" style="font-size:12.5px">${c==='name'?`<b>${esc(x.name)}</b>`:c==='status'?(x.status==='inactive'?'<span class="badge b-L">đã nghỉ</span>':'<span class="badge s-fixed">đang làm</span>'):c==='email1'?(x.email1?`<a href="mailto:${esc(x.email1)}">${esc(x.email1)}</a>`:'<span class=neg>—</span>'):['dob','start_date','end_date'].includes(c)?vd(x[c]):esc(x[c]||'')}</td>`).join('')}</tr>`).join('')||`<tr><td colspan=${COLS.length+1} class=mut style="text-align:center;padding:24px">Chưa có nhân viên – bấm <b>Nạp file</b> để nạp danh sách CBCNV</td></tr>`}</tbody></table></div></div>`;
  const upd=()=>{$('#stSel').textContent=STSEL.size?`Đã chọn ${num(STSEL.size)} người`:'';$('#stMail').disabled=$('#stDel').disabled=!STSEL.size};upd();
  $('#stQ').oninput=deb(()=>{STF.q=$('#stQ').value;vStaff().then(()=>{const e=$('#stQ');e.focus();e.setSelectionRange(e.value.length,e.value.length)})},300);
  H.querySelectorAll('[data-stf]').forEach(e=>e.onchange=()=>{STF[e.dataset.stf]=e.value;vStaff()});
  const T=H.querySelector('tbody');T.onchange=e=>{const c=e.target.dataset.stc;if(c==null)return;e.target.checked?STSEL.add(c):STSEL.delete(c);upd()};
  $('#stAll').onchange=e=>{r.rows.forEach(x=>e.target.checked?STSEL.add(x.code):STSEL.delete(x.code));T.querySelectorAll('[data-stc]').forEach(c=>c.checked=e.target.checked);upd()};
  T.ondblclick=e=>{if(e.target.type==='checkbox')return;const tr=e.target.closest('[data-sti]');if(tr)stForm(r.rows[+tr.dataset.sti],r)};
  $('#stAdd').onclick=()=>stForm(null,r);
  const imp=async mode=>{if(mode==='replace'&&!await ask('Xoá toàn bộ danh sách nhân viên hiện có rồi nạp lại từ file?'))return;try{const x=await api.staffImport(mode);if(x){alert(`Đã nạp ${num(x.n)} nhân viên từ ${x.file} (thêm mới ${num(x.added)}, cập nhật ${num(x.upd)}) · danh mục có ${num(x.total)} người`);vStaff()}}catch(e){alert(e.message)}};
  $('#stImp').onclick=()=>imp('merge');$('#stImpR').onclick=()=>imp('replace');
  $('#stDel').onclick=async()=>{if(!await ask(`Xoá ${STSEL.size} nhân viên khỏi danh mục?\n(Nếu nhân viên chỉ nghỉ việc, nên sửa Trạng thái = "Đã nghỉ" để giữ lịch sử.)`))return;await aq('staffRemove',[...STSEL]);STSEL.clear();vStaff()};
  $('#stX').onclick=async()=>{try{const f=await api.xlsxSheets(`AccSoft_DanhMucNhanVien_${new Date().toISOString().slice(0,10)}.xlsx`,[['Nhan vien',r.rows.map(x=>Object.fromEntries(F.map(([k,v])=>[v,k==='status'?(x.status==='inactive'?'Đã nghỉ':'Đang làm việc'):x[k]||''])))]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
  $('#stMail').onclick=()=>stMail(r.rows.filter(x=>STSEL.has(x.code)));
}
function stForm(x,r){const isNew=!x;x=x||{status:'active',nationality:'TM',contract:'HĐLĐ'};CUR=-1;const F=r.fields,dl=k=>`<datalist id="stL_${k}">${(r.facets[k]||[]).filter(o=>o.v).map(o=>`<option value="${esc(o.v)}">`).join('')}</datalist>`;
  const inp=([k,l])=>k==='status'?`<label style="display:grid;gap:4px">${l}<select id="sf_${k}"><option value="active" ${x.status!=='inactive'?'selected':''}>Đang làm việc</option><option value="inactive" ${x.status==='inactive'?'selected':''}>Đã nghỉ / ngừng</option></select></label>`
    :`<label style="display:grid;gap:4px${k==='note'?';grid-column:1/-1':''}">${l}<input id="sf_${k}" ${['dob','start_date','end_date'].includes(k)?'type="date"':k.startsWith('email')?'type="email"':''} value="${esc(x[k]||'')}" ${r.facets[k]?`list="stL_${k}"`:''} ${k==='erp_user'?'placeholder="tự lấy theo phần trước @ của email"':''}></label>`;
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Danh mục nhân viên</div><h2 style="font-size:20px">${isNew?'Thêm nhân viên':esc(x.name)+' <span class=mut style="font-size:14px">'+esc(x.code)+'</span>'}</h2></div><div style="flex:1"></div>${!isNew&&x.email1?`<button class="btn sm light" id="sfMail">✉ Gửi email</button>`:''}${!isNew?`<button class="btn sm danger" id="sfDel">Xoá</button>`:''}<button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
    <div class="pb"><div class="card"><div class="filters" style="grid-template-columns:repeat(3,1fr)">${F.map(inp).join('')}</div>${Object.keys(r.facets).map(dl).join('')}<div class="row" style="margin-top:12px"><div style="flex:1"></div><button class="btn primary" id="sfSave">Lưu</button></div></div>
    ${isNew?'':'<div class="card" id="sfBp"><span class="spin"></span></div>'}</div>`;
  if(!isNew)aq('staffBpOf',x.code).then(L=>{const W=$('#sfBp');if(!W)return;W.innerHTML=`<div class="card-h"><h3>Đối tượng công nợ đã ghép (${L.length})</h3><span class="hint">ghép / bỏ ghép ở tab "Ghép đối tượng công nợ"</span></div>${L.length?tbl0(['Đối tượng công nợ trong sổ','#Số bút toán','Cách ghép'],L.map(b=>`<tr><td>${esc(b.bp)}</td><td class=n>${num(b.n)}</td><td>${b.auto?'tự động theo tên':'thủ công'}</td></tr>`)):'<div class=mut>Chưa ghép đối tượng công nợ nào.</div>'}`}).catch(()=>{});
  $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
  $('#sfSave').onclick=async()=>{try{await aq('staffUpsert',Object.fromEntries(F.map(([k])=>[k,$('#sf_'+k).value])),isNew?null:x.code);closeDetail();vStaff()}catch(e){alert(e.message)}};
  if($('#sfDel'))$('#sfDel').onclick=async()=>{if(!await ask(`Xoá nhân viên ${x.name} (${x.code})?`))return;await aq('staffRemove',[x.code]);closeDetail();vStaff()};
  if($('#sfMail'))$('#sfMail').onclick=()=>stMail([x]);
}
function stMail(list){const to=list.filter(x=>x.email1||x.email2),miss=list.length-to.length;CUR=-1;
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Gửi email cho nhân viên</div><h2 style="font-size:20px">${num(to.length)} người nhận${miss?` <span class="neg" style="font-size:13px">(${miss} người chưa có email – bỏ qua)</span>`:''}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
    <div class="pb"><div class="card"><div class="hint" style="margin-bottom:8px">Gửi qua SMTP đã cấu hình ở <b>Báo cáo & Thông báo</b>. Có thể dùng {name} {code} {position} {dept} {unit} – được thay theo từng người.</div>
      <label style="display:grid;gap:4px">Tiêu đề<input id="smS" value="Thông báo từ phòng Tài chính – {name}"></label>
      <label style="display:grid;gap:4px;margin-top:10px">Nội dung<textarea id="smB" style="min-height:220px">Kính gửi anh/chị {name} ({position} – {dept}),\n\n\n\nTrân trọng,\nPhòng Tài chính</textarea></label>
      <div class="mut" style="font-size:12px;margin-top:8px;max-height:90px;overflow:auto">${to.map(x=>esc(x.name)+' &lt;'+esc(x.email1||x.email2)+'&gt;').join(' · ')}</div>
      <div class="row" style="margin-top:12px"><div style="flex:1"></div><button class="btn primary" id="smGo" ${to.length?'':'disabled'}>✉ Gửi ${num(to.length)} email</button></div></div></div>`;
  $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
  $('#smGo').onclick=async()=>{const S=$('#smS').value,B=$('#smB').value;if(!await ask(`Gửi email tới ${to.length} nhân viên?`))return;$('#smGo').disabled=true;$('#smGo').textContent='Đang gửi…';
    try{const res=await api.staffMail(to.map(x=>({to:x.email1||x.email2,name:x.name,code:x.code,position:x.position,dept:x.dept,unit:x.unit})),S,B);const ok=res.filter(x=>x.ok).length,bad=res.filter(x=>!x.ok);
      alert(`Đã gửi ${ok}/${res.length} email`+(bad.length?`\nLỗi:\n`+bad.slice(0,8).map(b=>b.to+': '+b.error).join('\n'):''));if(ok)closeDetail()}catch(e){alert(e.message)}finally{const b=$('#smGo');if(b){b.disabled=false;b.textContent=`✉ Gửi ${num(to.length)} email`}}};
}

const stTabs=()=>`<div class="subtabs" id="stTabs" style="margin-left:10px">${[['list','Nhân viên'],['bp','Ghép đối tượng công nợ']].map(([k,v])=>`<button data-stt="${k}" class="${(STF.tab||'list')===k?'on':''}">${v}</button>`).join('')}</div>`;
document.addEventListener('click',e=>{const b=e.target.closest('#stTabs [data-stt]');if(b){STF.tab=b.dataset.stt;vStaff()}});
// Ghép đối tượng công nợ (VTL_HOEMP…_Tên) ↔ nhân viên: tự động theo họ tên, sửa / bỏ ghép thủ công; một nhân viên có thể có nhiều mã đối tượng
const STB={q:'',only:'',sel:new Set()};
async function vStaffBp(){const H=$('#stBody');H.innerHTML='<div class="card"><span class="spin"></span> Đang dò đối tượng công nợ là nhân viên trong sổ…</div>';
  const r=await aq('staffPartners',{q:STB.q,only:STB.only}),opt=c=>`<option value="">— chưa ghép —</option>`+r.staff.map(x=>`<option value="${esc(x.code)}" ${x.code===c?'selected':''}>${esc(x.name)} · ${esc(x.code)}${x.dept?' · '+esc(x.dept):''}${x.status==='inactive'?' (đã nghỉ)':''}</option>`).join('');
  H.innerHTML=`<div class="card"><div class="subbar"><span class="crumb">Danh mục nhân viên</span>${stTabs()}<span class="hint">Đối tượng công nợ dạng mã nhân viên (…EMP…) trong sổ hạch toán · ${num(r.total)} đối tượng · đã ghép ${num(r.matched)} · gợi ý ${num(r.sugg)}</span></div>
    <div class="filterrow"><input id="sbQ" type="search" placeholder="🔍 Tìm đối tượng / tên nhân viên…" value="${esc(STB.q)}" style="width:320px"><label>Hiện <select id="sbO"><option value="">Tất cả</option><option value="unmatched" ${STB.only==='unmatched'?'selected':''}>Chưa ghép</option><option value="matched" ${STB.only==='matched'?'selected':''}>Đã ghép</option></select></label>
      <button class="btn sm primary" id="sbAuto">⚡ Tự ghép theo họ tên (${num(r.sugg)})</button><span style="flex:1"></span><span id="sbSel" class="mut"></span><select id="sbTo" class="srch" style="max-width:320px">${opt('')}</select><button class="btn sm" id="sbSet" disabled>Ghép các dòng đã chọn</button></div></div>
    <div class="kpis">${kpi('','users','Đối tượng là nhân viên',num(r.total),'')}${kpi('green','check','Đã ghép',num(r.matched),r.total?(r.matched/r.total*100).toFixed(0)+'%':'')}${kpi(r.total-r.matched?'red':'green','alert','Chưa ghép',num(r.total-r.matched),r.sugg?num(r.sugg)+' có gợi ý':'')}</div>
    <div class="card"><div class="tbl" style="max-height:calc(100vh - 380px)"><table><thead><tr><th><input type="checkbox" id="sbAll"></th><th>Đối tượng công nợ trong sổ</th><th>Tên trên đối tượng</th><th class=n>#Bút toán</th><th>PS gần nhất</th><th>Nhân viên trong danh mục</th><th>Gợi ý</th></tr></thead><tbody>
    ${r.rows.map((x,i)=>`<tr${x.code?'':' style="background:#FFFAEB"'}><td><input type="checkbox" data-sbc="${i}" ${STB.sel.has(x.bp)?'checked':''}></td><td style="font-size:12px">${esc(x.bp)}</td><td><b>${esc(x.name)}</b></td><td class=n>${num(x.n)}</td><td class=nw>${vn(x.last)}</td>
      <td><select data-sbm="${i}" style="max-width:340px">${opt(x.code)}</select>${x.code?`<div class=mut style="font-size:11px">${x.auto?'tự động':'thủ công'}</div>`:''}</td><td style="font-size:12px">${x.sug&&!x.code?`<button class="btn sm ghost" data-sbg="${i}">← ${esc(x.sugName)} <span class=mut>(${x.sugHow==='exact'?'trùng tên':'trùng các từ'})</span></button>`:''}</td></tr>`).join('')||'<tr><td colspan=7 class=mut style="text-align:center;padding:20px">Không có đối tượng</td></tr>'}</tbody></table></div></div>`;
  const T=H.querySelector('tbody'),upd=()=>{$('#sbSel').textContent=STB.sel.size?`Đã chọn ${STB.sel.size}`:'';$('#sbSet').disabled=!STB.sel.size};upd();
  $('#sbQ').oninput=deb(()=>{STB.q=$('#sbQ').value;vStaffBp().then(()=>{const e=$('#sbQ');e.focus();e.setSelectionRange(e.value.length,e.value.length)})},350);$('#sbO').onchange=e=>{STB.only=e.target.value;vStaffBp()};
  T.onchange=async e=>{const c=e.target.dataset.sbc,m=e.target.dataset.sbm;if(c!=null){const b=r.rows[+c].bp;e.target.checked?STB.sel.add(b):STB.sel.delete(b);return upd()}if(m!=null){await aq('staffSetMap',[r.rows[+m].bp],e.target.value);e.target.closest('tr').style.background=e.target.value?'':'#FFFAEB'}};
  T.onclick=async e=>{const g=e.target.closest('[data-sbg]');if(!g)return;const x=r.rows[+g.dataset.sbg];await aq('staffSetMap',[x.bp],x.sug);vStaffBp()};
  $('#sbAll').onchange=e=>{r.rows.forEach(x=>e.target.checked?STB.sel.add(x.bp):STB.sel.delete(x.bp));T.querySelectorAll('[data-sbc]').forEach(c=>c.checked=e.target.checked);upd()};
  $('#sbSet').onclick=async()=>{const to=$('#sbTo').value;if(!to&&!await ask('Bỏ ghép các dòng đã chọn?'))return;await aq('staffSetMap',[...STB.sel],to);STB.sel.clear();vStaffBp()};
  $('#sbAuto').onclick=async()=>{const x=await aq('staffAutoMatch');alert(`Đã tự ghép ${num(x.n)} đối tượng theo họ tên · còn ${num(x.left)} chưa ghép (ghép tay bằng ô chọn)`);vStaffBp()};
}


/* ===== v4.43: Công nợ tạm ứng theo nhân viên & đối chiếu ===== */
const ADF=Object.assign({asOf:'',from:'',acc:'141',dept:'',only:'open',q:'',over:30,bkm:12,mode:'bp',group:'bp'},ls.get('advPick',{}));const ADSEL=new Set();
const RCN={sent:['Đã gửi đối chiếu','b-M'],confirmed:['Đã xác nhận','s-fixed'],disputed:['Có chênh lệch','b-H']};
async function vAdv(){const H=$('#advBody');if(String(ADF.acc).startsWith('1412'))ADF.acc='141';if(!ADF.asOf){const ym=(await aq('months')).map(m=>m.ym).sort().at(-1)||new Date().toISOString().slice(0,7);const [y,m]=ym.split('-').map(Number);ADF.asOf=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)}if(!ADF.from)ADF.from=ADF.asOf.slice(0,4)+'-01-01';ls.set('advPick',ADF);
  H.innerHTML='<div class="card"><span class="spin"></span> Đang tổng hợp công nợ tạm ứng theo nhân viên…</div>';
  let r;try{r=await aq('advReport',{asOf:ADF.asOf,from:ADF.from,acc:ADF.acc,dept:ADF.dept,only:ADF.only,q:ADF.q,overDays:ADF.over,backupMonths:ADF.bkm,mode:ADF.mode,group:ADF.group})}catch(e){H.innerHTML=`<div class="card neg">${esc(e.message)}</div>`;return}
  const T=r.tot,rc=x=>x.recon&&RCN[x.recon.status]?`<span class="badge ${RCN[x.recon.status][1]}" title="${esc((x.recon.note||'')+(x.recon.at?' · '+x.recon.at:''))}">${RCN[x.recon.status][0]}</span>`:'<span class=mut>chưa</span>';
  H.innerHTML=`<div class="card"><div class="subbar"><span class="crumb">Công nợ tạm ứng theo nhân viên</span><span class="hint">Tạm ứng (Nợ ${r.acc}) − hoàn ứng / quyết toán (Có ${r.acc}) · <b>không gồm 1412 tạm ứng vật tư</b> (đã ở Tuổi hàng tồn kho) · ${r.group==='staff'?'gộp các mã đối tượng của cùng nhân viên theo <b>Danh mục nhân viên → Ghép đối tượng công nợ</b>':'<b>mỗi mã đối tượng một dòng</b> (tên giống nhau nhưng mã khác là 2 đối tượng)'} · khoản còn treo tính FIFO ${r.mode==='ar'?'<b>theo đối tượng + đề nghị tạm ứng</b>':'<b>theo đối tượng</b>'}</span></div>
    <div class="filterrow"><label>Từ ngày <input type="date" id="adF" value="${ADF.from}"></label><label>Đến ngày (đối chiếu) <input type="date" id="adT" value="${ADF.asOf}"></label>
      <label title="Mặc định mỗi mã đối tượng công nợ là một dòng – tên giống nhau nhưng mã khác là 2 đối tượng">Hiển thị <select id="adG"><option value="bp" ${ADF.group!=='staff'?'selected':''}>Theo mã đối tượng</option><option value="staff" ${ADF.group==='staff'?'selected':''}>Gộp theo nhân viên (danh mục)</option></select></label><label title="Cách cân trừ hoàn ứng với tạm ứng để tính khoản còn treo & tuổi nợ">Phương pháp FIFO <select id="adM"><option value="bp" ${ADF.mode!=='ar'?'selected':''}>1. Chỉ theo đối tượng</option><option value="ar" ${ADF.mode==='ar'?'selected':''}>2. Theo đối tượng + Đề nghị tạm ứng</option></select></label><label>Tài khoản <select id="adA">${[['141','141 (trừ 1412 tạm ứng vật tư)'],['1411','1411 – tạm ứng tiền']].map(([v,l])=>`<option value="${v}" ${ADF.acc===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <label>Phòng ban <select id="adD" class="srch" data-auto="1"><option value="">Tất cả</option>${r.depts.map(d=>`<option ${ADF.dept===d?'selected':''}>${esc(d)}</option>`).join('')}</select></label>
      <label>Hiện <select id="adO">${[['','Tất cả có phát sinh'],['open','Còn số dư'],['over','Có khoản quá hạn'],['notconf','Còn số dư, chưa xác nhận'],['unmapped','Chưa ghép nhân viên']].map(([v,l])=>`<option value="${v}" ${ADF.only===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <label>Quá hạn sau <input type="number" id="adV" value="${ADF.over}" style="width:64px"> ngày</label><label title="Khoản đánh dấu Backup money chỉ quá hạn khi vượt số tháng này">Backup money <input type="number" id="adBk" value="${ADF.bkm}" style="width:56px"> tháng</label><input id="adQ" type="search" placeholder="🔍 Tìm nhân viên, mã, phòng ban…" value="${esc(ADF.q)}" style="width:240px"><button class="btn sm primary" id="adGo">Xem</button></div>
    <div class="filterrow" style="margin-top:6px"><button class="btn sm" id="adX">${ic('download')}Xuất báo cáo Excel</button><span style="flex:1"></span><span id="adSel" class="mut"></span>
      <button class="btn sm" id="adBB" disabled>📄 Biên bản đối chiếu</button><button class="btn sm light" id="adMail" disabled>✉ Gửi đối chiếu qua email</button><button class="btn sm ghost" id="adOk" disabled>✓ Đã xác nhận</button><button class="btn sm ghost" id="adDis" disabled>⚠ Có chênh lệch</button></div></div>
    <div class="kpis">${kpi('','wallet',`Số dư tạm ứng tại ${vn(r.asOf)}`,fmt2(T.close),`${num(r.rows.filter(x=>Math.abs(x.close)>0.004).length)} nhân viên / đối tượng còn số dư`)}${kpi('blue','trend','Tạm ứng / hoàn ứng trong kỳ',fmt2(T.dr)+' / '+fmt2(T.cr),'')}${kpi(T.overAmt>0?'red':'green','alert',`Quá hạn > ${r.over} ngày`,fmt2(T.overAmt),`> 90 ngày: ${fmt2(T.b[3])}`)}${kpi(r.nUnmapped?'red':'green','users','Đối tượng chưa ghép nhân viên',num(r.nUnmapped),'ghép ở Danh mục nhân viên')}</div>
    <div class="card"><div class="card-h"><h3>Theo nhân viên</h3><span class="dblhint">🖱 nhấn đúp vào <b>số liệu</b> để xem đúng phần đó (tạm ứng, hoàn ứng, từng nhóm tuổi, backup, đối chiếu…); nhấn đúp tên để xem tất cả</span></div>
    <div class="tbl" style="max-height:calc(100vh - 380px)"><table><thead><tr><th><input type="checkbox" id="adAll"></th><th>Mã NV</th><th>Nhân viên / đối tượng</th><th>Phòng ban</th><th class=n>Đầu kỳ</th><th class=n>Tạm ứng</th><th class=n>Hoàn ứng</th><th class=n>Cuối kỳ</th><th class=n>≤ 30 ngày</th><th class=n>31–60</th><th class=n>61–90</th><th class=n>> 90</th><th class=n title="Tạm ứng duy trì (backup money) còn treo – không tính quá hạn trong thời hạn backup">Backup money</th><th class=n>Khoản treo</th><th class=n>Cũ nhất (ngày)</th><th>Đối chiếu ${ymLbl(APF.to.slice(0,7))}</th></tr></thead><tbody>
    ${r.rows.slice(0,3000).map((x,i)=>`<tr class=dbl data-adi="${i}"${x.mapped?'':' style="background:#FFFAEB"'}><td><input type="checkbox" data-adc="${esc(x.key)}" ${ADSEL.has(x.key)?'checked':''}></td><td class=nw>${esc(x.code)}</td><td><b>${esc(x.name)}</b>${r.group==='bp'&&x.mapped?`<div class=mut style="font-size:11px">${esc(x.partners[0]||'')}</div>`:''}${x.mapped?'':'<div class=mut style="font-size:11px">chưa ghép nhân viên</div>'}${x.partners.length>1?`<div class=mut style="font-size:11px">${x.partners.length} mã đối tượng</div>`:''}</td><td style="font-size:12px">${esc(x.dept)}</td>
      <td class=n data-adm="open">${fmt2(x.open)}</td><td class=n data-adm="dr">${fmt2(x.dr)}</td><td class=n data-adm="cr">${fmt2(x.cr)}</td><td class="n ${x.close<0?'neg':''}" data-adm="close"><b>${fmt2(x.close)}</b></td>${x.b.map((v,j)=>`<td class="n ${j>=2&&v>0.004?'neg':''}" data-adm="b${j}">${Math.abs(v)>0.004?fmt2(v):''}</td>`).join('')}<td data-adm="bk" class="n ${x.bkOver>0.004?'neg':''}" title="${x.bkOver>0.004?'quá hạn backup: '+fmt2(x.bkOver):''}">${x.bkAmt>0.004?fmt2(x.bkAmt):''}</td><td class=n data-adm="items" title="${x.nAr!=null?x.nAr+' đề nghị còn treo':''}">${x.nOpen||''}${x.nAr?`<div class=mut style="font-size:11px">${x.nAr} đề nghị</div>`:''}</td><td class="n ${x.oldest>r.over?'neg':''}" data-adm="items">${x.oldest||''}</td><td data-adm="recon">${rc(x)}</td></tr>`).join('')||'<tr><td colspan=16 class=mut style="text-align:center;padding:24px">Không có công nợ tạm ứng</td></tr>'}
    <tr style="font-weight:700;background:#F9FAFB"><td></td><td></td><td>TỔNG CỘNG</td><td></td><td class=n>${fmt2(T.open)}</td><td class=n>${fmt2(T.dr)}</td><td class=n>${fmt2(T.cr)}</td><td class=n>${fmt2(T.close)}</td>${T.b.map(v=>`<td class=n>${fmt2(v)}</td>`).join('')}<td class=n>${fmt2(T.bkAmt)}</td><td></td><td></td><td></td></tr></tbody></table></div></div>
    ${Math.abs(T.close-T.b.reduce((a,b)=>a+b,0)-T.bkAmt)>1?`<div class="note">ℹ️ Tổng khoản còn treo (FIFO) ${fmt2(T.b.reduce((a,b)=>a+b,0))} khác số dư ${fmt2(T.close)} vì có nhân viên hoàn ứng nhiều hơn tạm ứng (số dư âm – công ty còn nợ nhân viên) – xem dòng số dư âm.</div>`:''}`;
  const upd=()=>{$('#adSel').textContent=ADSEL.size?`Đã chọn ${num(ADSEL.size)}`:'';['#adBB','#adMail','#adOk','#adDis'].forEach(s=>$(s).disabled=!ADSEL.size)};upd();
  const rd=()=>{ADF.group=$('#adG').value;ADF.mode=$('#adM').value;ADF.from=$('#adF').value;ADF.asOf=$('#adT').value;ADF.acc=$('#adA').value;ADF.dept=$('#adD').value;ADF.only=$('#adO').value;ADF.over=+$('#adV').value||30;ADF.bkm=+$('#adBk').value||12;ADF.q=$('#adQ').value};
  $('#adGo').onclick=()=>{rd();vAdv()};['#adG','#adM','#adA','#adD','#adO','#adT','#adF','#adBk','#adV'].forEach(s=>$(s).onchange=()=>{rd();vAdv()});$('#adQ').onkeydown=e=>{if(e.key==='Enter'){rd();vAdv()}};
  const B=H.querySelector('tbody');B.onchange=e=>{const k=e.target.dataset.adc;if(k==null)return;e.target.checked?ADSEL.add(k):ADSEL.delete(k);upd()};
  $('#adAll').onchange=e=>{r.rows.forEach(x=>e.target.checked?ADSEL.add(x.key):ADSEL.delete(x.key));B.querySelectorAll('[data-adc]').forEach(c=>c.checked=e.target.checked);upd()};
  B.ondblclick=e=>{if(e.target.type==='checkbox')return;const tr=e.target.closest('[data-adi]');if(!tr)return;const c=e.target.closest('[data-adm]');advDetail(r.rows[+tr.dataset.adi],c?c.dataset.adm:'all')};
  const o=()=>({mode:ADF.mode,asOf:ADF.asOf,from:ADF.from,acc:ADF.acc,company:'VIETTEL TIMOR UNI, LDA (Telemor)'});
  $('#adBB').onclick=async()=>{if(ADSEL.size>60)return alert('Tối đa 60 nhân viên mỗi file');try{const f=await api.advReconBook([...ADSEL],o());if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
  $('#adMail').onclick=()=>advMail([...ADSEL],r);
  const mark=async st=>{let note='';if(st==='disputed'){note=await askText('Ghi chú chênh lệch (số dư theo nhân viên, lý do…)');if(note==null)return}await aq('advSetRecon',[...ADSEL],ADF.asOf,st,{note});ADSEL.clear();vAdv()};
  $('#adOk').onclick=()=>mark('confirmed');$('#adDis').onclick=()=>mark('disputed');
  $('#adX').onclick=async()=>{try{const f=await api.xlsxSheets(`AccSoft_CongNoTamUng_${ADF.asOf}.xlsx`,[['Tam ung theo nhan vien',r.rows.map(x=>({'Mã NV':x.code,'Nhân viên / đối tượng':x.name,'Phòng ban':x.dept,'Đơn vị':x.unit,'Mã đối tượng công nợ':x.partners.join('; '),'Đầu kỳ':x.open,'Tạm ứng':x.dr,'Hoàn ứng':x.cr,'Cuối kỳ':x.close,'≤ 30 ngày':x.b[0],'31–60':x.b[1],'61–90':x.b[2],'> 90':x.b[3],'Backup money':x.bkAmt,'Backup quá hạn':x.bkOver,'Khoản còn treo':x.nOpen,'Cũ nhất (ngày)':x.oldest,'Đối chiếu':x.recon&&RCN[x.recon.status]?RCN[x.recon.status][0]:'','Ghi chú đối chiếu':x.recon?x.recon.note:'','Email':x.email}))]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
}
async function advDetail(x,focus='all'){CUR=-1;const Dw=$('#drawer');Dw.classList.add('full');$('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Công nợ tạm ứng · ${vn(ADF.from)} → ${vn(ADF.asOf)}</div><h2 style="font-size:20px">${esc(x.name)} <span class=mut style="font-size:14px">${esc(x.code)} ${esc(x.dept)}</span></h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div><div class="pb"><div class="card"><span class="spin"></span></div></div>`;
  Dw.classList.remove('hide');$('#dClose').onclick=()=>{closeDetail()};
  const d=await aq('advDetail',x.key,{asOf:ADF.asOf,from:ADF.from,acc:ADF.acc,mode:ADF.mode}),rc=d.recon||{};
  $('#dPane .pb').innerHTML=`<div class="kpis">${kpi('','wallet','Số dư đầu kỳ',fmt2(d.open),'')}${kpi('blue','trend','Tạm ứng / hoàn ứng',fmt2(d.dr)+' / '+fmt2(d.cr),'')}${kpi(d.close>0?'red':'green','wallet','Số dư cuối kỳ',fmt2(d.close),d.close<0?'công ty còn phải trả nhân viên':'nhân viên còn phải hoàn / quyết toán')}${kpi(d.items.some(t=>t.age>ADF.over)?'red':'green','alert','Khoản còn treo',num(d.items.length),d.items.length?'cũ nhất '+Math.max(...d.items.map(t=>t.age))+' ngày':'')}</div>
    <div class="card"><div class="card-h"><h3>Đối chiếu tại ${vn(ADF.asOf)}</h3><span class="hint">${esc(d.partners.join(' · '))}</span></div><div class="filterrow">
      <label>Trạng thái <select id="arS"><option value="">Chưa đối chiếu</option>${Object.entries(RCN).map(([k,v])=>`<option value="${k}" ${rc.status===k?'selected':''}>${v[0]}</option>`).join('')}</select></label>
      <label>Số dư nhân viên xác nhận <input type="number" id="arC" value="${rc.confirmed??''}" placeholder="${Math.round(d.close*100)/100}" style="width:150px"></label><label style="flex:1">Ghi chú <input id="arN" value="${esc(rc.note||'')}" style="width:100%"></label>
      <button class="btn sm primary" id="arSave">Lưu đối chiếu</button><button class="btn sm" id="arBB">📄 Biên bản</button>${d.staff&&(d.staff.email1||d.staff.email2)?'<button class="btn sm light" id="arMail">✉ Gửi email đối chiếu</button>':'<span class="mut">chưa có email</span>'}</div>
      ${rc.sent_to?`<div class="hint">Đã gửi tới ${esc(rc.sent_to)} · ${esc(rc.updated_at||'')}</div>`:''}${rc.confirmed!=null&&rc.confirmed!==''&&Math.abs(+rc.confirmed-d.close)>0.004?`<div class="note" style="border-color:var(--err-200)">Chênh lệch: sổ ${fmt2(d.close)} − nhân viên ${fmt2(+rc.confirmed)} = <b>${fmt2(d.close-+rc.confirmed)}</b></div>`:''}</div>
    <div class="card"><div class="card-h"><h3>Khoản tạm ứng còn treo (FIFO)</h3></div>${tbl0(['Ngày','Chứng từ','Đề nghị tạm ứng','Nội dung','#Số tiền tạm ứng','#Còn lại','#Số ngày'],d.items.map(t=>`<tr data-agb="b${t.age<=30?0:t.age<=60?1:t.age<=90?2:3}"><td class=nw>${vn(t.d)}</td><td class=nw>${esc(t.doc)}</td><td class=nw>${esc(t.ar||'')}</td><td><div class=clamp title="${esc(t.ds)}">${esc(t.ds)}</div></td><td class=n>${fmt2(t.amt)}</td><td class=n><b>${fmt2(t.left)}</b></td><td class="n ${t.age>ADF.over?'neg':''}">${t.age}</td></tr>`),'Không có khoản còn treo')}</div>
    <div class="card"><div class="card-h"><h3>💼 Backup money – tạm ứng duy trì (${ADF.bkm} tháng)</h3><span class="hint">Tích các khoản tạm ứng là backup money: không tính quá hạn ${ADF.over} ngày, hoàn ứng trừ vào khoản thường trước · quá hạn khi > ${ADF.bkm} tháng</span><div class="sp"></div><label style="font-size:13px">Hiện <select id="bkAll2"><option value="sel">Chỉ khoản đã chọn backup</option><option value="round">Số tiền chẵn, đề nghị chưa clear – để chọn thêm</option><option value="all">Mọi khoản tạm ứng</option></select></label><label style="font-size:13px" title="Ẩn khoản thuộc đề nghị tạm ứng đã hoàn ứng / quyết toán từ mức này trở lên">Ẩn đề nghị đã clear ≥ <input type="number" id="bkClr" value="${ADF.bkClr??60}" style="width:56px"> %</label><button class="btn sm primary" id="bkSave">Lưu backup money</button></div>
      ${d.bkItems.length?`<div class="hint" style="margin-bottom:6px">Đang treo theo backup: <b>${fmt2(d.bkItems.reduce((a,t)=>a+t.left,0))}</b> (${d.bkItems.length} khoản${d.bkItems.some(t=>t.age>ADF.bkm*30.4)?', <span class=neg>có khoản quá '+ADF.bkm+' tháng</span>':''})</div>`:''}
      <div id="bkList"></div></div>
    <div class="card"><div class="card-h"><h3>Theo đề nghị tạm ứng (${num(d.ars.length)})</h3><span class="hint">mỗi đề nghị cân trừ riêng tạm ứng – hoàn ứng; đề nghị hoàn ứng vượt (đỏ) thường do chọn sai đề nghị → sửa ở sổ chi tiết bên dưới</span></div>
      ${tbl0(['Đề nghị tạm ứng','Ngày đầu','#Tạm ứng','#Hoàn ứng','#Chênh lệch (TƯ − HƯ)','#Còn treo','#Tuổi (ngày)','#Số dòng'],d.ars.map(a=>`<tr${a.over?' style="background:#FEE4E2"':a.left>0.004?'':' class=mut'}><td class=nw><b>${esc(a.ar)}</b>${a.over?' <span class=neg style="font-size:11px">hoàn ứng vượt</span>':''}</td><td class=nw>${vn(a.first)}</td><td class=n>${fmt2(a.dr)}</td><td class=n>${fmt2(a.cr)}</td><td class="n ${a.bal<0?'neg':''}">${fmt2(a.bal)}</td><td class=n><b>${a.left>0.004?fmt2(a.left):''}</b></td><td class="n ${a.age>ADF.over?'neg':''}">${a.left>0.004?a.age:''}</td><td class=n>${a.n}</td></tr>`),'Không có đề nghị tạm ứng')}</div>
    <div class="card"><div class="card-h"><h3>Sổ chi tiết tạm ứng (${num(d.book.length)} dòng)</h3><div class="sp"></div><span id="arSel" class="mut"></span><input id="arTo" list="arL" placeholder="Đề nghị tạm ứng đúng" style="width:220px"><datalist id="arL"></datalist><label style="font-size:12px;display:inline-flex;gap:4px;align-items:center" title="Mặc định chỉ gợi ý đề nghị còn số dư (chênh lệch tạm ứng – hoàn ứng ≠ 0)"><input type="checkbox" id="arAllL">Hiện tất cả đề nghị</label><button class="btn sm primary" id="arSet" disabled>Đổi đề nghị tạm ứng</button><button class="btn sm ghost" id="arUndo" disabled>Trả về gốc</button></div>
      ${tbl0(['<input type="checkbox" id="arAll">','Ngày','Chứng từ','TK','TK đối ứng','Đề nghị TƯ','Nội dung','#Tạm ứng','#Hoàn ứng','#Số dư'],[`<tr style="font-weight:600"><td></td><td colspan=8>Số dư đầu kỳ</td><td class=n>${fmt2(d.open)}</td></tr>`,...d.book.slice(-2000).map(t=>`<tr class=dbl data-side="${t.dr?'dr':'cr'}" data-eid="${t.id}"><td><input type="checkbox" data-arc="${t.id}"></td><td class=nw>${vn(t.d)}</td><td class=nw>${esc(t.doc)}</td><td>${esc(t.acc)}</td><td>${esc(t.oacc)}</td><td class=nw>${t.ar!==t.ar0?`<div class=mut style="text-decoration:line-through;font-size:11px">${esc(t.ar0||'(trống)')}</div><span class="badge b-H">${esc(t.ar||'(trống)')}</span>`:esc(t.ar||'')}</td><td><div class=clamp title="${esc(t.ds)}">${esc(t.ds)}</div></td><td class=n>${t.dr?fmt2(t.dr):''}</td><td class=n>${t.cr?fmt2(t.cr):''}</td><td class=n>${fmt2(t.bal)}</td></tr>`)],'Không có phát sinh')}</div>`;
  // Chỉ hiện phần ứng với ô vừa nhấn đúp; thanh chọn để chuyển phần khác
  { const P=$('#dPane .pb'),cards=[...P.children].filter(c=>c.classList.contains('card')),sec=c=>{const h=(c.querySelector('h3')||{}).textContent||'';return /^Đối chiếu/.test(h)?'recon':/còn treo/.test(h)?'items':/Backup/.test(h)?'bk':/đề nghị/.test(h)?'ars':/Sổ chi tiết/.test(h)?'book':'x'};
    cards.forEach(c=>c.dataset.sec=sec(c));
    const MAP={all:null,open:['book'],dr:['book'],cr:['book'],close:['items','bk','book'],b0:['items'],b1:['items'],b2:['items'],b3:['items'],items:['items','ars'],bk:['bk'],recon:['recon']},LAB={open:'Số dư đầu kỳ (sổ chi tiết)',dr:'Các khoản tạm ứng trong kỳ',cr:'Các khoản hoàn ứng / quyết toán trong kỳ',close:'Số dư cuối kỳ',b0:'Khoản treo ≤ 30 ngày',b1:'Khoản treo 31–60 ngày',b2:'Khoản treo 61–90 ngày',b3:'Khoản treo > 90 ngày',items:'Khoản còn treo',bk:'Backup money',recon:'Đối chiếu'};
    const bar=document.createElement('div');bar.className='subtabs';bar.style.cssText='margin:0 0 4px';const T=[['all','Tất cả'],['items','Khoản còn treo'],['bk','Backup money'],['ars','Theo đề nghị'],['book','Sổ chi tiết'],['recon','Đối chiếu']];
    const show=f=>{const want=MAP[f]||(f==='ars'?['ars']:f==='book'?['book']:null);cards.forEach(c=>c.style.display=!want||want.includes(c.dataset.sec)?'':'none');
      P.querySelectorAll('tr[data-agb]').forEach(tr=>tr.style.display=/^b\d$/.test(f)&&tr.dataset.agb!==f?'none':'');
      P.querySelectorAll('tr[data-side]').forEach(tr=>tr.style.display=(f==='dr'&&tr.dataset.side!=='dr')||(f==='cr'&&tr.dataset.side!=='cr')?'none':'');
      if(f==='bk'&&$('#bkAll2')){}
      bar.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.f===f||(!T.some(t=>t[0]===f)&&b.dataset.f===(MAP[f]||['all'])[0])));
      const lab=$('#advFocus');if(lab)lab.textContent=LAB[f]?'Đang xem: '+LAB[f]:''};
    bar.innerHTML=T.map(([k,v])=>`<button data-f="${k}">${v}</button>`).join('')+'<span id="advFocus" class="mut" style="margin-left:10px;font-size:12px"></span>';bar.onclick=e=>{const b=e.target.closest('[data-f]');if(b)show(b.dataset.f)};
    P.insertBefore(bar,cards[0]);show(focus); }
  const arFill=()=>{const all=$('#arAllL').checked,bal=new Map(d.ars.map(a=>[a.ar,a.bal])),L=(all?d.arList:d.ars.filter(a=>Math.abs(a.bal)>0.004&&a.ar!=='(không có đề nghị)').map(a=>a.ar));
    $('#arL').innerHTML=L.map(a=>{const b=bal.get(a)||0;return `<option value="${esc(a)}" label="${Math.abs(b)>0.004?(b>0?'còn '+fmt2(b):'hoàn vượt '+fmt2(-b)):'đã hết số dư'}">`}).join('');$('#arTo').placeholder=`Đề nghị tạm ứng đúng (${L.length})`};
  arFill();$('#arAllL').onchange=arFill;
  const ARS=new Set(),arUpd=()=>{$('#arSel').textContent=ARS.size?`Đã chọn ${ARS.size} dòng`:'';$('#arSet').disabled=$('#arUndo').disabled=!ARS.size};
  $('#dPane .pb').addEventListener('change',e=>{if(e.target.id==='arAll'){$('#dPane').querySelectorAll('[data-arc]').forEach(c=>{c.checked=e.target.checked;e.target.checked?ARS.add(+c.dataset.arc):ARS.delete(+c.dataset.arc)});return arUpd()}const id=e.target.dataset.arc;if(id==null)return;e.target.checked?ARS.add(+id):ARS.delete(+id);arUpd()});
  $('#arSet').onclick=async()=>{const v=$('#arTo').value.trim();if(!v)return alert('Nhập / chọn đề nghị tạm ứng đúng');if(!await ask(`Đổi đề nghị tạm ứng của ${ARS.size} dòng thành "${v}"?\nDữ liệu gốc không bị sửa – xem / bỏ ở Điều chỉnh dữ liệu.`))return;await aq('advSetAr',[...ARS],v);advDetail(x)};
  $('#arUndo').onclick=async()=>{await aq('advSetAr',[...ARS],'');advDetail(x)};
  if(!d.advances.some(t=>t.backup))$('#bkAll2').value='round';
  const bkDraw=()=>{const v=$('#bkAll2').value,all=v==='all',lim=(+$('#bkClr').value||60)/100,L=d.advances.filter(t=>v==='sel'?t.backup:all?(t.backup||t.clr<lim):(t.backup||(t.round&&t.clr<lim))).slice().reverse();$('#bkList').innerHTML=tbl0(['Backup','Ngày','Chứng từ','Đề nghị tạm ứng','Nội dung','#Số tiền tạm ứng','#Đề nghị: tạm ứng','#Đã clear','#% clear'],L.slice(0,1500).map(t=>`<tr${t.backup?' style="background:#FFF1EB"':''}><td><input type="checkbox" data-bk="${t.id}" ${t.backup?'checked':''}></td><td class=nw>${vn(t.d)}</td><td class=nw>${esc(t.doc)}</td><td class=nw>${esc(t.ar||'')}</td><td><div class=clamp title="${esc(t.ds)}">${esc(t.ds)}</div></td><td class=n><b>${fmt2(t.amt)}</b></td><td class=n>${fmt2(t.arDr)}</td><td class=n>${fmt2(t.arCr)}</td><td class="n ${t.clr>=0.6?'neg':''}">${(t.clr*100).toFixed(0)}%</td></tr>`),$('#bkAll2').value==='sel'?'Chưa chọn khoản backup nào – chọn "Khoản số tiền chẵn" để đánh dấu':all?'Không có khoản tạm ứng':'Không có khoản tạm ứng số tiền chẵn – chọn "Mọi khoản tạm ứng"')};
  bkDraw();$('#bkAll2').onchange=bkDraw;$('#bkClr').onchange=()=>{ADF.bkClr=+$('#bkClr').value||60;ls.set('advPick',ADF);bkDraw()};
  $('#bkList').addEventListener('change',e=>{const id=e.target.dataset.bk;if(id==null)return;const t=d.advances.find(a=>String(a.id)===id);if(t)t.backup=e.target.checked;e.target.closest('tr').style.background=e.target.checked?'#FFF1EB':''});
  $('#bkSave').onclick=async()=>{const on=d.advances.filter(t=>t.backup).map(t=>t.id),off=d.advances.filter(t=>!t.backup).map(t=>t.id);await aq('advSetBackup',off,x.key,false);if(on.length)await aq('advSetBackup',on,x.key,true);closeDetail();vAdv()};
  $('#arSave').onclick=async()=>{const st=$('#arS').value,c=$('#arC').value;if(!st)await aq('advClearRecon',[x.key],ADF.asOf);else await aq('advSetRecon',[x.key],ADF.asOf,st,{confirmed:c===''?null:+c,note:$('#arN').value});closeDetail();vAdv()};
  $('#arBB').onclick=async()=>{try{const f=await api.advReconBook([x.key],{mode:ADF.mode,asOf:ADF.asOf,from:ADF.from,acc:ADF.acc,company:'VIETTEL TIMOR UNI, LDA (Telemor)'});if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
  if($('#arMail'))$('#arMail').onclick=()=>advMail([x.key],{rows:[x]});
  $('#dPane .pb').ondblclick=e=>{if(e.target.type==='checkbox')return;const tr=e.target.closest('tr[data-eid]');if(tr)showDetail(null,+tr.dataset.eid)};
}
function advMail(keys,r){const L=keys.map(k=>(r.rows||[]).find(x=>x.key===k)).filter(Boolean),to=L.filter(x=>x.email),miss=L.length-to.length;CUR=-1;
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Gửi đối chiếu công nợ tạm ứng tại ${vn(ADF.asOf)}</div><h2 style="font-size:20px">${num(to.length)} nhân viên${miss?` <span class="neg" style="font-size:13px">(${miss} chưa có email / chưa ghép – bỏ qua)</span>`:''}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
    <div class="pb"><div class="card"><div class="hint" style="margin-bottom:8px">Mỗi người nhận một thư riêng: bảng số dư, danh sách khoản còn treo và <b>file Excel biên bản đối chiếu</b> đính kèm. Biến: {name} {balance} {asOf}. Sau khi gửi, trạng thái chuyển "Đã gửi đối chiếu".</div>
      <label style="display:grid;gap:4px">Tiêu đề<input id="amS" value="[Telemor] Đối chiếu công nợ tạm ứng đến ngày {asOf} – {name}"></label>
      <label style="display:grid;gap:4px;margin-top:10px">Nội dung<textarea id="amB" style="min-height:160px">Kính gửi anh/chị {name},\n\nPhòng Tài chính gửi anh/chị số dư tạm ứng đến ngày {asOf} là {balance}. Đề nghị anh/chị kiểm tra, hoàn ứng / quyết toán các khoản còn treo và phản hồi xác nhận số dư.\n\nTrân trọng,\nPhòng Tài chính</textarea></label>
      <div class="mut" style="font-size:12px;margin-top:8px;max-height:90px;overflow:auto">${to.map(x=>esc(x.name)+' &lt;'+esc(x.email)+'&gt; · '+fmt2(x.close)).join(' · ')}</div>
      <div class="row" style="margin-top:12px"><div style="flex:1"></div><button class="btn primary" id="amGo" ${to.length?'':'disabled'}>✉ Gửi ${num(to.length)} email</button></div></div></div>`;
  $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
  $('#amGo').onclick=async()=>{if(!await ask(`Gửi đối chiếu tạm ứng tới ${to.length} nhân viên?`))return;const b=$('#amGo');b.disabled=true;b.textContent='Đang gửi…';
    try{const x=await api.advReconMail(to.map(t=>t.key),{mode:ADF.mode,asOf:ADF.asOf,from:ADF.from,acc:ADF.acc,company:'VIETTEL TIMOR UNI, LDA (Telemor)',subject:$('#amS').value,body:$('#amB').value});const ok=x.res.filter(t=>t.ok).length,bad=x.res.filter(t=>!t.ok);
      alert(`Đã gửi ${ok}/${x.res.length} email`+(bad.length?'\nLỗi:\n'+bad.slice(0,8).map(t=>t.to+': '+t.error).join('\n'):''));closeDetail();vAdv()}catch(e){alert(e.message);b.disabled=false;b.textContent='✉ Gửi lại'}};
}

// Hộp nhập chữ trong ứng dụng (Electron không hỗ trợ prompt())
function askText(msg,def=''){return new Promise(res=>{const w=document.createElement('div');w.className='mdl-wrap';w.innerHTML=`<div class="mdl"><div class="mdl-ic">✎</div><div class="mdl-msg"></div><input id="mdlIn" style="grid-column:1/-1;width:100%" value="${esc(def)}"><div class="mdl-act"><button class="btn" data-r="0">Huỷ</button><button class="btn primary" data-r="1">Đồng ý</button></div></div>`;
  w.querySelector('.mdl-msg').textContent=msg;document.body.appendChild(w);const i=w.querySelector('#mdlIn');setTimeout(()=>i.focus(),30);
  const done=v=>{w.remove();res(v)};w.onclick=e=>{const b=e.target.closest('[data-r]');if(b)done(b.dataset.r==='1'?i.value:null)};i.onkeydown=e=>{if(e.key==='Enter')done(i.value);if(e.key==='Escape')done(null)}})}


/* ===== v4.44: Danh mục chủ nhà trạm ===== */
const LLF=Object.assign({q:'',only:'',days:60},ls.get('llPick',{}));
async function vLL(){const H=$('#llBody');ls.set('llPick',LLF);H.innerHTML='<div class="card"><span class="spin"></span> Đang dò chủ nhà trạm từ sổ (Nợ 24211 / Có 331)…</div>';
  const r=await aq('llScan',{q:LLF.q,only:LLF.only,days:LLF.days}),R=r.rows,dl=x=>x.daysLeft==null?'':x.daysLeft<0?`<span class=neg>hết hạn ${-x.daysLeft} ngày</span>`:x.daysLeft<=LLF.days?`<span class=neg>còn ${x.daysLeft} ngày</span>`:`còn ${x.daysLeft} ngày`;
  H.innerHTML=`<div class="card"><div class="subbar"><span class="crumb">Danh mục chủ nhà trạm</span><span class="hint">Tự lấy từ sổ: chủ nhà = đối tượng Có 331 khi Nợ 24211; đã trả = Nợ 331 / Có 11x; mã nhà trạm rút từ tên đối tượng / hợp đồng / diễn giải (vd AN0002); kỳ thuê & giá thuê đọc từ diễn giải. Số tài khoản, ngân hàng, SĐT… nhập tay hoặc nạp file.</span></div>
    <div class="filterrow"><input id="llQ" type="search" placeholder="🔍 Tìm tên, mã trạm, hợp đồng, số tài khoản, SĐT…" value="${esc(LLF.q)}" style="width:340px"><label>Hiện <select id="llO">${[['','Tất cả'],['nobank','Chưa có số tài khoản'],['nosite','Chưa có mã nhà trạm'],['bal','Còn công nợ 331'],['exp','Kỳ thuê sắp / đã hết hạn']].map(([v,l])=>`<option value="${v}" ${LLF.only===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <label>Sắp hết hạn trong <input type="number" id="llD" value="${LLF.days}" style="width:64px"> ngày</label><span style="flex:1"></span><button class="btn sm" id="llImp">${ic('upload')}Nạp số tài khoản từ file</button><button class="btn sm" id="llX">${ic('download')}Xuất Excel</button></div></div>
    <div class="kpis">${kpi('','home','Chủ nhà trạm',num(r.total),'')}${kpi(R.some(x=>!x.bank_acc)?'red':'green','alert','Chưa có số tài khoản',num(R.filter(x=>!x.bank_acc).length),'nhấn đúp để nhập')}${kpi('blue','coins','Còn phải trả (331)',fmt2(R.reduce((a,x)=>a+x.bal,0)),'')}${kpi(R.some(x=>x.daysLeft!=null&&x.daysLeft<=LLF.days)?'red':'green','alert',`Kỳ thuê hết hạn ≤ ${LLF.days} ngày`,num(R.filter(x=>x.daysLeft!=null&&x.daysLeft<=LLF.days).length),'cần gia hạn / thanh toán kỳ mới')}</div>
    <div class="card"><div class="card-h"><h3>Danh sách (${num(R.length)})</h3><span class="dblhint">🖱 nhấn đúp: sửa thông tin (số tài khoản…) và xem sổ công nợ 331</span></div>
    <div class="tbl" style="max-height:calc(100vh - 380px)"><table><thead><tr><th>Mã nhà trạm</th><th>Chủ nhà</th><th>Mã NCC</th><th>Hợp đồng thuê</th><th>Số tài khoản</th><th>Ngân hàng</th><th>SĐT</th><th>Kỳ thuê gần nhất</th><th>Hết hạn</th><th class=n>Giá thuê / tháng</th><th class=n>Đã ghi nhận (24211)</th><th class=n>Đã trả (112)</th><th class=n>Còn phải trả</th><th>Trả gần nhất</th></tr></thead><tbody>
    ${R.map((x,i)=>`<tr class=dbl data-lli="${i}"><td class=nw><b>${esc(x.site)||'<span class=neg>—</span>'}</b></td><td><b>${esc(x.name)}</b>${x.note?`<div class=mut style="font-size:11px">${esc(x.note)}</div>`:''}</td><td class=nw style="font-size:12px">${esc(x.vcode)}</td><td style="font-size:12px"><div class="clamp s" title="${esc(x.contracts.join('\n'))}">${esc(x.contract)}${x.contracts.length>1?` <span class=mut>(+${x.contracts.length-1})</span>`:''}</div></td>
      <td class=nw>${x.bank_acc?esc(x.bank_acc):'<span class=neg>chưa có</span>'}</td><td style="font-size:12px">${esc(x.bank_name)}</td><td class=nw>${esc(x.phone)}</td><td class=nw style="font-size:12px">${x.periodFrom?vn(x.periodFrom)+' – '+vn(x.periodTo):''}</td><td class=nw style="font-size:12px">${x.end?vn(x.end)+'<br>':''}${dl(x)}</td><td class=n>${x.rent!=null?fmt2(x.rent):''}</td><td class=n>${fmt2(x.rec)}</td><td class=n>${fmt2(x.paid)}</td><td class="n ${x.bal>0.004?'neg':''}">${fmt2(x.bal)}</td><td class=nw>${vn(x.lastPay)}</td></tr>`).join('')||'<tr><td colspan=14 class=mut style="text-align:center;padding:24px">Không có chủ nhà trạm</td></tr>'}</tbody></table></div></div>`;
  $('#llQ').oninput=deb(()=>{LLF.q=$('#llQ').value;vLL().then(()=>{const e=$('#llQ');e.focus();e.setSelectionRange(e.value.length,e.value.length)})},350);
  $('#llO').onchange=e=>{LLF.only=e.target.value;vLL()};$('#llD').onchange=e=>{LLF.days=+e.target.value||60;vLL()};
  H.querySelector('tbody').ondblclick=e=>{const tr=e.target.closest('[data-lli]');if(tr)llForm(R[+tr.dataset.lli],r)};
  $('#llImp').onclick=async()=>{try{const x=await api.llImport();if(x){alert(`Đã cập nhật ${num(x.n)} chủ nhà từ ${x.file}`+(x.miss?`\nKhông khớp ${x.miss} dòng: ${x.missList.join(', ')}`:''));vLL()}}catch(e){alert(e.message)}};
  $('#llX').onclick=async()=>{try{const f=await api.xlsxSheets(`AccSoft_ChuNhaTram_${new Date().toISOString().slice(0,10)}.xlsx`,[['Chu nha tram',R.map(x=>({'Mã nhà trạm':x.site,'Chủ nhà':x.name,'Mã NCC':x.vcode,'Đối tượng công nợ':x.bp,'Hợp đồng thuê':x.contracts.join('; '),'Số tài khoản':x.bank_acc,'Ngân hàng':x.bank_name,'Chủ tài khoản':x.acc_holder,'SĐT':x.phone,'Địa chỉ / vị trí':x.address,'Kỳ thuê từ':x.periodFrom,'Kỳ thuê đến':x.periodTo,'Hết hạn':x.end,'Còn (ngày)':x.daysLeft,'Giá thuê / tháng':x.rent,'Đã ghi nhận 24211':x.rec,'Đã trả':x.paid,'Còn phải trả 331':x.bal,'Trả gần nhất':x.lastPay,'Ghi chú':x.note}))]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
}
async function llForm(x,r){CUR=-1;const Dw=$('#drawer');Dw.classList.add('full');
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Chủ nhà trạm · ${esc(x.bp)}</div><h2 style="font-size:20px">${esc(x.name)} <span class=mut style="font-size:14px">${esc(x.site)}</span></h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
    <div class="pb"><div class="card"><div class="card-h"><h3>Thông tin theo dõi</h3><span class="hint">để trống = dùng giá trị tự rút từ sổ</span></div><div class="filters" style="grid-template-columns:repeat(3,1fr)">${r.fields.map(([k,l])=>`<label style="display:grid;gap:4px${k==='note'?';grid-column:1/-1':''}">${l}<input id="lf_${k}" ${k==='contract_end'?'type="date"':k==='rent_month'?'type="number" step="0.01"':''} value="${esc(k==='site'?x.site:k==='contract_end'?(x.end||''):k==='rent_month'?(x.rent??''):x[k]||'')}"></label>`).join('')}</div>
      <div class="hint" style="margin-top:6px">Hợp đồng trong sổ: ${esc(x.contracts.join(' · ')||'—')} · mã trạm tự nhận: ${esc(x.sitesAuto.join(', ')||'—')}</div>
      <div class="row" style="margin-top:12px"><button class="btn sm ghost" id="lfClr">Xoá thông tin đã nhập</button><div style="flex:1"></div><button class="btn primary" id="lfSave">Lưu</button></div></div>
    <div class="card" id="lfBook"><span class="spin"></span></div></div>`;
  Dw.classList.remove('hide');$('#dClose').onclick=closeDetail;
  $('#lfSave').onclick=async()=>{await aq('llSave',x.bp,Object.fromEntries(r.fields.map(([k])=>[k,$('#lf_'+k).value])));closeDetail();vLL()};
  $('#lfClr').onclick=async()=>{if(!await ask('Xoá các thông tin đã nhập tay của chủ nhà này?'))return;await aq('llClear',x.bp);closeDetail();vLL()};
  const L=await aq('llDetail',x.bp);let b=0;const W=$('#lfBook');if(!W)return;
  W.innerHTML=`<div class="card-h"><h3>Sổ công nợ 331 (${num(L.length)} dòng)</h3></div>${tbl0(['Ngày','Chứng từ','TK Nợ','TK Có','Hợp đồng','Diễn giải','#Phải trả (Có 331)','#Đã trả / giảm (Nợ 331)','#Số dư'],L.map(t=>{b+=t.sgn;return `<tr class=dbl data-eid="${t.id}"><td class=nw>${vn(t.d)}</td><td class=nw>${esc(t.doc)}</td><td>${esc(t.dr)}</td><td>${esc(t.cr)}</td><td style="font-size:12px">${esc(t.contract||'')}</td><td><div class=clamp title="${esc(t.ds)}">${esc(t.ds)}</div></td><td class=n>${t.sgn>0?fmt2(t.a):''}</td><td class=n>${t.sgn<0?fmt2(t.a):''}</td><td class=n>${fmt2(b)}</td></tr>`}),'Không có phát sinh')}`;
  W.ondblclick=e=>{const tr=e.target.closest('tr[data-eid]');if(tr)showDetail(null,+tr.dataset.eid)};
}

/* ===== v4.47: Ô tìm nhanh tự động cho mọi bảng chi tiết (cửa sổ chi tiết và bảng chưa có ô tìm riêng) ===== */
(function(){const MIN=6,nz=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
  const hasOwn=box=>{const c=box.closest('.card')||box.parentNode;return c&&[...c.querySelectorAll('input[type=search],input[placeholder]')].some(i=>!i.classList.contains('selsrch')&&!i.classList.contains('tsrch')&&/tìm|search|🔍/i.test(i.placeholder||'')&&!box.contains(i))};
  const apply=(tb,q)=>{const Q=nz(q).split(/\s+/).filter(Boolean);let n=0,all=0;for(const tr of tb.rows){if(tr.cells.length<2)continue;all++;if(!tr._tsx)tr._tsx=nz(tr.textContent);const ok=!Q.length||Q.every(w=>tr._tsx.includes(w));tr.style.display=ok?'':'none';if(ok)n++}return [n,all]};
  const attach=box=>{if(box.dataset.ts)return;const t=box.querySelector('table'),tb=t&&t.tBodies[0];if(!tb)return;const inDrawer=!!box.closest('#dPane');if(tb.rows.length<(inDrawer?2:MIN))return;if(!inDrawer&&hasOwn(box))return;
    box.dataset.ts=1;const w=document.createElement('div');w.className='tsrchw';w.innerHTML=`<input type="search" class="tsrch" placeholder="🔍 Tìm trong bảng (chứng từ, nội dung, số tiền, đề nghị…)"><span class="mut tsn"></span>`;box.parentNode.insertBefore(w,box);
    const i=w.querySelector('input'),n=w.querySelector('.tsn'),run=()=>{const [a,b]=apply(tb,i.value);n.textContent=i.value.trim()?`${a} / ${b} dòng`:''};
    i.addEventListener('input',deb(run,180));i.addEventListener('change',e=>e.stopPropagation());i.addEventListener('keydown',e=>{if(e.key==='Escape'){i.value='';run()}});
    new MutationObserver(()=>{if(i.value.trim())run()}).observe(tb,{childList:true})};
  let T=0;const scan=()=>document.querySelectorAll('.tbl').forEach(attach);
  new MutationObserver(()=>{clearTimeout(T);T=setTimeout(scan,120)}).observe(document.body,{childList:true,subtree:true});})();


/* ===== v4.48: Công nợ 138811 / 138812 theo đối tượng ===== */
const R8F=Object.assign({asOf:'',from:'',acc:'',only:'open',q:'',over:30},ls.get('r88Pick',{}));
async function vR88(){const H=$('#r88Body');if(!R8F.asOf){const ym=(await aq('months')).map(m=>m.ym).sort().at(-1)||new Date().toISOString().slice(0,7);const [y,m]=ym.split('-').map(Number);R8F.asOf=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)}if(!R8F.from)R8F.from=R8F.asOf.slice(0,4)+'-01-01';ls.set('r88Pick',R8F);
  H.innerHTML='<div class="card"><span class="spin"></span> Đang tổng hợp công nợ phải thu…</div>';
  const r=await aq('r88Report',{asOf:R8F.asOf,from:R8F.from,acc:R8F.acc,only:R8F.only,q:R8F.q,overDays:R8F.over}),T=r.tot;
  H.innerHTML=`<div class="card"><div class="subbar"><span class="crumb">Công nợ phải thu ${esc(r.acc)} theo đối tượng</span><span class="hint">FIFO theo đối tượng: Nợ ${r.acc} = doanh thu / ghi nợ (thường nhập ngày cuối tháng), Có = nộp / thu tiền (theo ngày thực tế). Số còn nợ = các khoản ghi Nợ gần nhất cộng đủ số dư, nên thu tiền trước ngày ghi doanh thu cuối tháng vẫn cân trừ đúng. Bút toán đánh dấu <b>ghi sai đối tượng</b> không tính tuổi nợ (hoặc chuyển sang đối tượng đúng).</span></div>
    <div class="filterrow"><label>Từ ngày <input type="date" id="r8F" value="${R8F.from}"></label><label>Đến ngày <input type="date" id="r8T" value="${R8F.asOf}"></label>
      <label>Tài khoản <select id="r8A"><option value="">138811 + 138812</option><option value="138811" ${R8F.acc==='138811'?'selected':''}>138811</option><option value="138812" ${R8F.acc==='138812'?'selected':''}>138812</option><option value="1388" ${R8F.acc==='1388'?'selected':''}>1388 (tất cả TK con)</option><option value="131" ${R8F.acc==='131'?'selected':''}>131 – Phải thu khách hàng</option></select></label>
      <label>Hiện <select id="r8O">${[['','Tất cả có phát sinh'],['open','Còn số dư'],['over','Có khoản quá hạn'],['neg','Số dư âm (thu thừa / ghi sai)'],['wrong','Có bút toán ghi sai'],['exempt','🛡 Có khoản đặc biệt (chắc chắn thu)'],['expired','⚠ Khoản đặc biệt đã quá ngày dự kiến thu']].map(([v,l])=>`<option value="${v}" ${R8F.only===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <label>Quá hạn sau <input type="number" id="r8V" value="${R8F.over}" style="width:64px"> ngày</label><input id="r8Q" type="search" placeholder="🔍 Tìm đối tượng…" value="${esc(R8F.q)}" style="width:240px"><button class="btn sm primary" id="r8Go">Xem</button><button class="btn sm" id="r8X">${ic('download')}Xuất Excel</button><button class="btn sm ghost" id="r8W">Danh sách bút toán ghi sai (${num(r.nWrong)})</button></div></div>
    <div class="kpis">${kpi('','wallet',`Số dư theo sổ tại ${vn(r.asOf)}`,fmt2(T.close),'')}${kpi(Math.abs(T.wrong)>0.004?'red':'green','alert','Bút toán ghi sai (loại khỏi tuổi nợ)',fmt2(T.wrong),'')}${kpi('blue','coins','Số dư tính tuổi nợ',fmt2(T.adj),'')}${kpi(T.overAmt>0?'red':'green','alert',`Quá hạn > ${r.over} ngày`,fmt2(T.overAmt),`🛡 miễn quá hạn (chắc chắn thu): ${fmt2(T.exAmt||0)}${T.expAmt>0.004?` · ⚠ quá ngày cam kết: ${fmt2(T.expAmt)}`:''}`)}</div>
    <div class="card"><div class="card-h"><h3>Theo đối tượng</h3><span class="dblhint">🖱 nhấn đúp số liệu: chi tiết phần đó · nhấn đúp tên: tất cả – đánh dấu bút toán ghi sai trong sổ chi tiết</span></div>
    <div class="tbl" style="max-height:calc(100vh - 380px)"><table><thead><tr><th>Đối tượng</th><th class=n>Đầu kỳ</th><th class=n>Phát sinh Nợ</th><th class=n>Phát sinh Có</th><th class=n>Cuối kỳ (sổ)</th><th class=n>Ghi sai</th><th class=n>Tính tuổi nợ</th><th class=n>≤ 30 ngày</th><th class=n>31–60</th><th class=n>61–90</th><th class=n>> 90</th><th class=n>Cũ nhất (ngày)</th></tr></thead><tbody>
    ${r.rows.slice(0,3000).map((x,i)=>`<tr class=dbl data-r8i="${i}"><td><b>${esc(x.bp)}</b>${x.exBp?`<span class="badge s-fixed" title="${esc(x.exBp.note||'')}${x.exBp.exp?' · dự kiến thu '+vn(x.exBp.exp):''}" style="margin-left:6px">🛡 đặc biệt</span>`:''}${x.exAmt>0.004||x.expAmt>0.004?`<div style="font-size:11px">${x.exAmt>0.004?`<span style="color:#079455">🛡 miễn quá hạn ${fmt2(x.exAmt)}</span> `:''}${x.expAmt>0.004?`<span class=neg>⚠ quá ngày dự kiến thu ${fmt2(x.expAmt)}</span>`:''}</div>`:''}${x.nWrong||x.moved?`<div class=mut style="font-size:11px">${x.nWrong?x.nWrong+' bút toán ghi sai':''}${x.moved?' · '+x.moved+' chuyển đến/đi':''}</div>`:''}</td><td class=n data-r8m="book">${fmt2(x.open)}</td><td class=n data-r8m="dr">${fmt2(x.dr)}</td><td class=n data-r8m="cr">${fmt2(x.cr)}</td><td class=n data-r8m="book"><b>${fmt2(x.close)}</b></td><td class="n ${Math.abs(x.wrong)>0.004?'neg':''}" data-r8m="wrong">${Math.abs(x.wrong)>0.004?fmt2(x.wrong):''}</td><td class="n ${x.adj<0?'neg':''}" data-r8m="items"><b>${fmt2(x.adj)}</b></td>${x.b.map((v,j)=>`<td class="n ${j>=2&&v>0.004?'neg':''}" data-r8m="b${j}">${Math.abs(v)>0.004?fmt2(v):''}</td>`).join('')}<td class="n ${x.oldest>r.over?'neg':''}" data-r8m="items">${x.oldest||''}</td></tr>`).join('')||'<tr><td colspan=12 class=mut style="text-align:center;padding:24px">Không có công nợ</td></tr>'}
    <tr style="font-weight:700;background:#F9FAFB"><td>TỔNG CỘNG</td><td class=n>${fmt2(T.open)}</td><td class=n>${fmt2(T.dr)}</td><td class=n>${fmt2(T.cr)}</td><td class=n>${fmt2(T.close)}</td><td class=n>${fmt2(T.wrong)}</td><td class=n>${fmt2(T.adj)}</td>${T.b.map(v=>`<td class=n>${fmt2(v)}</td>`).join('')}<td></td></tr></tbody></table></div></div>${(r.dups||[]).length?`<div class="card"><div class="card-h"><h3>⚠ Nghi trùng tên khác mã (${num(r.dups.length)} nhóm)</h3><span class="hint">cùng tên (bỏ mã, dấu, Lda / Unip / S.A…) hoặc gần giống nhưng khác mã đối tượng – kiểm tra nhân viên chọn sai đối tượng, chuyển bút toán về mã đúng trong sổ chi tiết · nhấn đúp để xem</span></div>
      <div class="tbl" style="max-height:420px"><table id="r8Dup"><thead><tr><th>Nhóm</th><th>Mã đối tượng</th><th>Tên</th><th class=n>Số dư sổ</th></tr></thead><tbody>${r.dups.map((g,k)=>g.items.map((it,j)=>`<tr class=dbl data-r8d="${esc(it.bp)}"${j===0?' style="border-top:2px solid #F4B79A"':''}><td>${j===0?`<b>#${k+1}</b> <span class=mut>(${g.items.length} mã · tổng ${fmt2(g.bal)})</span>`:''}</td><td class=nw>${esc(it.bp.slice(0,it.bp.length-it.name.length).replace(/_$/,''))}</td><td>${esc(it.name)}</td><td class="n ${it.bal<-0.004?'neg':''}">${fmt2(it.bal)}</td></tr>`).join('')).join('')}</tbody></table></div></div>`:''}`;
  const rd=()=>{R8F.from=$('#r8F').value;R8F.asOf=$('#r8T').value;R8F.acc=$('#r8A').value;R8F.only=$('#r8O').value;R8F.over=+$('#r8V').value||30;R8F.q=$('#r8Q').value};
  $('#r8Go').onclick=()=>{rd();vR88()};['#r8F','#r8T','#r8A','#r8O','#r8V'].forEach(x=>$(x).onchange=()=>{rd();vR88()});$('#r8Q').onkeydown=e=>{if(e.key==='Enter'){rd();vR88()}};
  H.querySelector('tbody').ondblclick=e=>{const tr=e.target.closest('[data-r8i]');if(!tr)return;const c=e.target.closest('[data-r8m]');r88Detail(r.rows[+tr.dataset.r8i],c?c.dataset.r8m:'all')};
  $('#r8W').onclick=()=>r88Wrong();
  const dt=$('#r8Dup');if(dt)dt.ondblclick=e=>{const tr=e.target.closest('[data-r8d]');if(tr)r88Detail(r.rows.find(x=>x.bp===tr.dataset.r8d)||{bp:tr.dataset.r8d},'all')};
  $('#r8X').onclick=async()=>{try{const f=await api.xlsxSheets(`AccSoft_CongNo1388_${R8F.asOf}.xlsx`,[['Cong no 1388',r.rows.map(x=>({'Đối tượng':x.bp,'Đầu kỳ':x.open,'Phát sinh Nợ':x.dr,'Phát sinh Có':x.cr,'Cuối kỳ (sổ)':x.close,'Ghi sai (loại)':x.wrong,'Số dư tính tuổi nợ':x.adj,'≤ 30 ngày':x.b[0],'31–60':x.b[1],'61–90':x.b[2],'> 90':x.b[3],'Cũ nhất (ngày)':x.oldest}))]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
}
async function r88Detail(x,focus='all'){CUR=-1;const Dw=$('#drawer');Dw.classList.add('full');$('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Công nợ ${esc(R8F.acc||'138811 / 138812')} · ${vn(R8F.from)} → ${vn(R8F.asOf)}</div><h2 style="font-size:20px">${esc(x.bp)}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div><div class="pb"><div class="card"><span class="spin"></span></div></div>`;
  Dw.classList.remove('hide');$('#dClose').onclick=closeDetail;
  const d=await aq('r88Detail',x.bp,{asOf:R8F.asOf,from:R8F.from,acc:R8F.acc,overDays:R8F.over}),P=$('#dPane .pb'),XB=d.exBp;
  P.innerHTML=`<div class="kpis">${kpi('','wallet','Đầu kỳ',fmt2(d.open),'')}${kpi('blue','trend','Phát sinh Nợ / Có',fmt2(d.dr)+' / '+fmt2(d.cr),'')}${kpi('','wallet','Cuối kỳ',fmt2(d.close),'')}${kpi(d.adj<0?'red':'blue','coins','Số dư tính tuổi nợ',fmt2(d.adj),'sau khi loại / chuyển bút toán ghi sai')}</div>
    <div class="subtabs" id="r8Tab">${[['all','Tất cả'],['items','Khoản còn nợ'],['wrong','Bút toán ghi sai'],['book','Sổ chi tiết']].map(([k,v])=>`<button data-f="${k}">${v}</button>`).join('')}</div>
    <div class="card" data-sec="items"><div class="card-h"><h3>Khoản còn nợ (FIFO)</h3></div>
     <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center;background:#ECFDF3;padding:8px 10px;border-radius:8px;margin-bottom:8px"><b>🛡 Khoản đặc biệt – chắc chắn thu được (không tính quá hạn)</b>
      ${XB?`<span class="badge s-fixed">Cả đối tượng: ${esc(XB.note||'đặc biệt')}${XB.exp?' · dự kiến thu '+vn(XB.exp):''}</span>`:''}<div style="flex:1"></div>
      <input id="exN" placeholder="Lý do (vd: cơ quan nhà nước, đã có cam kết thanh toán…)" value="${esc(XB?XB.note:'')}" style="width:300px"><label>Dự kiến thu đến <input type="date" id="exD" value="${XB?XB.exp:''}"></label>
      <button class="btn sm" id="exBp">${XB?'Cập nhật':'Áp dụng'} cho cả đối tượng</button>${XB?'<button class="btn sm ghost" id="exBpOff">Bỏ (cả đối tượng)</button>':''}<button class="btn sm primary" id="exIt">Áp dụng cho khoản đã tick</button><button class="btn sm ghost" id="exItOff">Bỏ khoản đã tick</button></div>
     ${tbl0(['<input type="checkbox" id="exAll">','Ngày','Chứng từ','TK','Nội dung','#Số tiền ghi Nợ','#Còn nợ','#Số ngày','Đặc biệt'],d.items.map(t=>`<tr data-agb="b${t.age<=30?0:t.age<=60?1:t.age<=90?2:3}"${t.ex?(t.ex.live?' style="background:#ECFDF3"':' style="background:#FEF3F2"'):''}><td><input type="checkbox" data-exi="${t.id}"></td><td class=nw>${vn(t.d)}</td><td class=nw>${esc(t.doc)}</td><td>${esc(t.acc)}</td><td><div class=clamp title="${esc(t.ds)}">${esc(t.ds)}</div></td><td class=n>${fmt2(t.amt)}</td><td class=n><b>${fmt2(t.left)}</b></td><td class="n ${t.age>R8F.over&&!(t.ex&&t.ex.live)?'neg':''}">${t.age}</td><td style="font-size:11px">${t.ex?`${t.ex.live?'🛡':'<span class=neg>⚠ quá ngày dự kiến</span>'} ${t.ex.kind==='bp'?'(đối tượng) ':''}${esc(t.ex.note)}${t.ex.exp?' · thu đến '+vn(t.ex.exp):''}`:''}</td></tr>`),'Không có khoản còn nợ')}</div>
    <div class="card" data-sec="book"><div class="card-h"><h3>Sổ chi tiết (${num(d.book.length)} dòng)</h3><div class="sp"></div><span id="w8Sel" class="mut"></span><input id="w8N" placeholder="Ghi chú (vd: ghi nhầm đối tượng)" style="width:220px"><input id="w8To" list="w8L" placeholder="Đối tượng đúng (để trống = chỉ loại)" style="width:260px"><datalist id="w8L">${d.partners.filter(p=>p!==d.bp).map(p=>`<option value="${esc(p)}">`).join('')}</datalist><button class="btn sm primary" id="w8Set" disabled>Đánh dấu ghi sai</button><button class="btn sm ghost" id="w8Off" disabled>Bỏ đánh dấu</button></div>
      ${tbl0(['<input type="checkbox" id="w8All">','Ngày','Chứng từ','TK','TK đối ứng','Nội dung','#Nợ (doanh thu)','#Có (thu tiền)','#Số dư','Ghi sai'],[`<tr style="font-weight:600"><td></td><td colspan=7>Số dư đầu kỳ</td><td class=n>${fmt2(d.open)}</td><td></td></tr>`,...d.book.slice(-3000).map(t=>`<tr class=dbl data-side="${t.side}" data-wr="${t.wrong?1:0}" data-eid="${t.id}"${t.wrong?' style="background:#FEE4E2"':''}><td><input type="checkbox" data-w8="${t.id}|${t.side}"></td><td class=nw>${vn(t.d)}</td><td class=nw>${esc(t.doc)}</td><td>${esc(t.acc)}</td><td>${esc(t.oacc)}</td><td><div class=clamp title="${esc(t.ds)}">${esc(t.ds)}</div></td><td class=n>${t.dr?fmt2(t.dr):''}</td><td class=n>${t.cr?fmt2(t.cr):''}</td><td class=n>${fmt2(t.bal)}</td><td style="font-size:12px">${t.wrong?`<span class="badge b-H">${t.to?(t.p0===d.bp?'chuyển → '+esc(t.to):'từ '+esc(t.p0)):'loại khỏi tuổi nợ'}</span>${t.note?`<div class=mut>${esc(t.note)}</div>`:''}`:''}</td></tr>`)],'Không có phát sinh')}</div>`;
  const exK=()=>[...P.querySelectorAll('[data-exi]:checked')].map(c=>({kind:'e',id:+c.dataset.exi,bp:x.bp})),exGo=async(keys,on)=>{if(!keys.length)return alert('Tick chọn khoản còn nợ trong bảng');const n=$('#exN').value.trim(),dt=$('#exD').value;if(on&&!n)return alert('Nhập lý do khoản đặc biệt');await aq('r88SetExempt',keys,on,n,dt);r88Detail(x,'items');vR88()};
  $('#exAll').onchange=e=>P.querySelectorAll('[data-exi]').forEach(c=>c.checked=e.target.checked);
  $('#exIt').onclick=()=>exGo(exK(),true);$('#exItOff').onclick=()=>exGo(exK(),false);$('#exBp').onclick=()=>exGo([{kind:'bp',bp:x.bp}],true);if($('#exBpOff'))$('#exBpOff').onclick=()=>exGo([{kind:'bp',bp:x.bp}],false);
  const cards=[...P.querySelectorAll('.card[data-sec]')],MAP={all:null,items:['items'],b0:['items'],b1:['items'],b2:['items'],b3:['items'],book:['book'],dr:['book'],cr:['book'],wrong:['book']};
  const show=f=>{const w=MAP[f];cards.forEach(c=>c.style.display=!w||w.includes(c.dataset.sec)?'':'none');P.querySelectorAll('tr[data-agb]').forEach(tr=>tr.style.display=/^b\d$/.test(f)&&tr.dataset.agb!==f?'none':'');
    P.querySelectorAll('tr[data-side]').forEach(tr=>tr.style.display=(f==='dr'&&tr.dataset.side!=='dr')||(f==='cr'&&tr.dataset.side!=='cr')||(f==='wrong'&&tr.dataset.wr!=='1')?'none':'');
    $('#r8Tab').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.f===f||(['b0','b1','b2','b3'].includes(f)&&b.dataset.f==='items')||(['dr','cr'].includes(f)&&b.dataset.f==='book')))};
  $('#r8Tab').onclick=e=>{const b=e.target.closest('[data-f]');if(b)show(b.dataset.f)};show(focus);
  const S=new Set(),up=()=>{$('#w8Sel').textContent=S.size?`Đã chọn ${S.size}`:'';$('#w8Set').disabled=$('#w8Off').disabled=!S.size};
  P.addEventListener('change',e=>{if(e.target.id==='w8All'){P.querySelectorAll('[data-w8]').forEach(c=>{if(c.closest('tr').style.display==='none')return;c.checked=e.target.checked;e.target.checked?S.add(c.dataset.w8):S.delete(c.dataset.w8)});return up()}const k=e.target.dataset.w8;if(k==null)return;e.target.checked?S.add(k):S.delete(k);up()});
  const keys=()=>[...S].map(k=>{const [id,side]=k.split('|');return {id:+id,side}});
  $('#w8Set').onclick=async()=>{const to=$('#w8To').value.trim();if(!await ask(`Đánh dấu ${S.size} bút toán là ghi sai đối tượng${to?` và chuyển sang "${to}"`:' (không tính tuổi nợ)'}?`))return;await aq('r88SetWrong',keys(),true,$('#w8N').value.trim(),to);r88Detail(x,'book');vR88()};
  $('#w8Off').onclick=async()=>{await aq('r88SetWrong',keys(),false);r88Detail(x,'book');vR88()};
  P.ondblclick=e=>{if(e.target.type==='checkbox')return;const tr=e.target.closest('tr[data-eid]');if(tr)showDetail(null,+tr.dataset.eid)};
}
async function r88Wrong(){CUR=-1;const L=await aq('r88Wrong');$('#dPane').innerHTML=`<div class="ph"><div><h2 style="font-size:20px">Bút toán ghi sai đối tượng – 138811 / 138812 (${num(L.length)})</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
  <div class="pb"><div class="card">${tbl0(['<input type="checkbox" id="wlAll">','Ngày','Chứng từ','TK','Phía','Đối tượng trên sổ','Xử lý','Ghi chú','#Số tiền','Cập nhật'],L.map(w=>`<tr><td><input type="checkbox" data-wl="${w.id}|${w.side}"></td><td class=nw>${vn(w.d)}</td><td class=nw>${esc(w.doc)}</td><td>${esc(w.acc)}</td><td>${w.side==='dr'?'Nợ':'Có'}</td><td style="font-size:12px">${esc(w.bp)}</td><td style="font-size:12px">${w.to_bp?'chuyển → '+esc(w.to_bp):'loại khỏi tuổi nợ'}</td><td style="font-size:12px">${esc(w.note||'')}</td><td class=n>${fmt2(w.a)}</td><td class=nw style="font-size:12px">${esc(w.updated_at||'')}</td></tr>`),'Chưa có bút toán ghi sai')}
  <div class="row" style="margin-top:10px"><div style="flex:1"></div><button class="btn sm danger" id="wlDel">Bỏ đánh dấu các dòng đã chọn</button></div></div></div>`;
  $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;
  $('#wlAll').onchange=e=>$('#dPane').querySelectorAll('[data-wl]').forEach(c=>c.checked=e.target.checked);
  $('#wlDel').onclick=async()=>{const k=[...$('#dPane').querySelectorAll('[data-wl]:checked')].map(c=>{const [id,side]=c.dataset.wl.split('|');return {id:+id,side}});if(!k.length)return;await aq('r88SetWrong',k,false);r88Wrong();vR88()};
}


/* ===== v4.49: Đối chiếu hóa đơn ↔ ERP 138812 ===== */
const IVF=Object.assign({tab:'cmp',from:'',to:'',basis:'issuecyc',only:'diff',q:'',cq:'',conly:''},ls.get('inv88Pick',{}));if(IVF.basis==='pay')IVF.basis='issuecyc';
const IST={ok:['Khớp','s-fixed'],diff:['Chênh lệch','b-H'],inv_only:['Có hóa đơn, ERP chưa ghi','b-H'],erp_only:['ERP có, không có hóa đơn','b-M'],unmapped:['Account chưa map ERP','b-L']};
async function vInv88(){const H=$('#invBody');ls.set('inv88Pick',IVF);if(!IVF.to){const ym=(await aq('months')).map(m=>m.ym).sort().at(-1)||'';IVF.to=ym;IVF.from=ym?ym.slice(0,4)+'-01':''}
  const tabs=`<div class="subtabs" id="ivTabs" style="margin-left:10px">${[['cmp','Đối chiếu theo tháng'],['map','Map khách hàng ↔ ERP']].map(([k,v])=>`<button data-ivt="${k}" class="${IVF.tab===k?'on':''}">${v}</button>`).join('')}</div>`;
  const head=x=>`<div class="card"><div class="subbar"><span class="crumb">Đối chiếu hóa đơn – 138812</span>${tabs}<span class="hint">${x}</span></div>`;
  H.innerHTML='<div class="card"><span class="spin"></span> Đang tải…</div>';
  if(IVF.tab==='map'){const r=await aq('invCustomers',{q:IVF.cq,only:IVF.conly,src:IVF.csrc||''}),P=r.partners,d1=IVF.cl1||'',d2=IVF.cl2||'',RW=r.rows.map((c,i)=>(c._i=i,c)).filter(c=>(!d1||(c.last||'').slice(0,10)>=d1)&&(!d2&&true||(c.last||'').slice(0,10)<=d2)&&(!d1&&!d2||c.last)),opt=c=>`<option value="">— chưa map —</option>`+P.map(p=>`<option value="${esc(p.code)}" ${p.code===c?'selected':''}>${esc(p.code)} – ${esc(p.name)} · ${num(p.n)}</option>`).join('');
    H.innerHTML=head(`${num(r.total)} account · đã map ${num(r.mapped)} · gợi ý theo tên khách hàng ↔ tên đối tượng ERP 138812`)+`
      <div class="filterrow"><input id="icQ" type="search" placeholder="🔍 Tìm account, khách hàng, mã ERP…" value="${esc(IVF.cq)}" style="width:320px" title="Gõ xong nhấn Enter hoặc bấm Tìm"><button class="btn sm primary" id="icFind">🔍 Tìm</button><label>Nguồn <select id="icS"><option value="">Tất cả</option><option value="bccs" ${IVF.csrc==='bccs'?'selected':''}>BCCS (theo tên khách hàng)</option><option value="cuoc" ${IVF.csrc==='cuoc'?'selected':''}>Cước / Payment (theo account)</option></select></label><label>Hiện <select id="icO"><option value="">Tất cả</option><option value="unmapped" ${IVF.conly==='unmapped'?'selected':''}>Chưa map</option><option value="mapped" ${IVF.conly==='mapped'?'selected':''}>Đã map</option></select></label>
        <label>Thu gần nhất từ <input type="date" id="icD1" value="${d1}"></label><label>đến <input type="date" id="icD2" value="${d2}"></label><span class="mut" style="font-size:11px">→ Enter / 🔍 Tìm</span>
        <button class="btn sm primary" id="icSug">⚡ Nhận tất cả gợi ý (${num(RW.filter(c=>!c.erp_code&&c.sug).length)})</button></div>
      <div class="filterrow"><b>Map đồng loạt</b> <span class="mut" id="icN">${num(RW.length)} dòng đang lọc · chưa tick dòng nào → áp cho tất cả dòng đang lọc</span><select id="icBulk" style="max-width:380px">${opt('')}</select><button class="btn sm primary" id="icApply">✔ Map các dòng</button><button class="btn sm primary" id="icSaveAll" disabled>💾 Lưu tất cả thay đổi (0)</button><button class="btn sm ghost" id="icClear">Bỏ map các dòng</button><span style="flex:1"></span><button class="btn sm" id="ivImp">${ic('upload')}Nạp file (danh mục + hóa đơn)</button></div></div>
      <div class="card"><div class="tbl" style="max-height:calc(100vh - 300px)"><table><thead><tr><th style="width:28px"><input type="checkbox" id="icAll" title="Chọn tất cả dòng đang lọc"></th><th>Account</th><th>Khách hàng</th><th class=n>Phí tháng HĐ</th><th class=n>#Hóa đơn</th><th class=n>Tổng tiền HĐ</th><th>Thu gần nhất</th><th>Mã đối tượng ERP</th><th>Gợi ý</th></tr></thead><tbody>
      ${RW.slice(0,3000).map(c=>{const i=c._i;return `<tr data-ica="${i}" class=dbl${c.erp_code?'':' style="background:#FFFAEB"'}><td><input type="checkbox" data-ick="${i}"></td><td class=nw style="font-size:12px">${c.srcK==='bccs'?`<span class="badge b-M">BCCS</span> ${esc(c.acc.replace(/^(bccs|erp):/,''))}`:esc(c.acc)}</td><td><b>${esc(c.name||'')}</b></td><td class=n>${c.fee?fmt2(c.fee):''}</td><td class=n>${num(c.n||0)}</td><td class=n>${fmt2(c.amt||0)}</td><td class=nw>${vn(c.last)}</td><td class=nw><select data-icm="${i}" style="max-width:340px">${opt(c.erp_code)}</select> <button class="btn sm" data-icsave="${i}" disabled title="Lưu map dòng này">💾 Lưu</button> <span class="icok" style="font-size:11px;color:#079455">${c.erp_code?'✓ đã lưu':''}</span></td><td style="font-size:12px">${c.sug&&!c.erp_code?`<button class="btn sm ghost" data-ics="${i}">← ${esc(c.sug)} ${esc(c.sugName)}</button>`:''}</td></tr>`}).join('')}</tbody></table></div></div>`;
    const B=H.querySelector('tbody');const saveRow=async i=>{const tr=B.querySelector(`[data-icm="${i}"]`).closest('tr'),sel=tr.querySelector('[data-icm]'),p=P.find(x=>x.code===sel.value);await aq('invSetMap',[r.rows[+i].acc],sel.value,p?p.name:'');r.rows[+i].erp_code=sel.value;const b=tr.querySelector('[data-icsave]');b.disabled=true;b.classList.remove('primary');tr.querySelector('.icok').textContent=sel.value?'✓ đã lưu':'✓ đã bỏ map';tr.style.background=sel.value?'':'#FFFAEB';pendN()};
    const pendN=()=>{const n=B.querySelectorAll('[data-icsave]:not([disabled])').length;const b=$('#icSaveAll');if(b){b.disabled=!n;b.textContent=`💾 Lưu tất cả thay đổi (${n})`}};
    B.onchange=e=>{const i=e.target.dataset.icm;if(i==null)return;const tr=e.target.closest('tr'),b=tr.querySelector('[data-icsave]'),ch=(e.target.value||'')!==(r.rows[+i].erp_code||'');b.disabled=!ch;b.classList.toggle('primary',ch);tr.querySelector('.icok').textContent=ch?'● chưa lưu':(r.rows[+i].erp_code?'✓ đã lưu':'');tr.querySelector('.icok').style.color=ch?'#DC6803':'#079455';pendN()};
    B.addEventListener('dblclick',e=>{if(e.target.closest('select,input,button'))return;const tr=e.target.closest('[data-ica]');if(tr)invCustTx(r.rows[+tr.dataset.ica])});
    B.addEventListener('click',e=>{const b=e.target.closest('[data-icsave]');if(b&&!b.disabled)saveRow(b.dataset.icsave)});
    $('#icSaveAll').onclick=async()=>{for(const b of [...B.querySelectorAll('[data-icsave]:not([disabled])')])await saveRow(b.dataset.icsave)};
    B.onclick=async e=>{const b=e.target.closest('[data-ics]');if(!b)return;const c=r.rows[+b.dataset.ics];await aq('invSetMap',[c.acc],c.sug,c.sugName);vInv88()};
    const picked=()=>[...B.querySelectorAll('[data-ick]:checked')].map(x=>r.rows[+x.dataset.ick]),cntN=()=>{const n=picked().length;$('#icN').textContent=n?`đã tick ${num(n)} dòng`:`${num(RW.length)} dòng đang lọc · chưa tick dòng nào → áp cho tất cả dòng đang hiện (kể cả lọc bằng ô tìm trong bảng)`};
    $('#icAll').onchange=e=>{B.querySelectorAll('[data-ick]').forEach(x=>x.checked=e.target.checked&&x.closest('tr').style.display!=='none');cntN()};B.addEventListener('change',e=>{if(e.target.dataset.ick!=null)cntN()});
    const vis=()=>[...B.querySelectorAll('[data-ick]')].filter(x=>x.closest('tr').style.display!=='none').map(x=>r.rows[+x.dataset.ick]);const bulk=async code=>{let L=picked();if(!L.length)L=vis();if(!L.length)return;const p=P.find(x=>x.code===code);if(!await ask(code?`Map ${num(L.length)} account → ${code} – ${p?p.name:''}?`:`Bỏ map ${num(L.length)} account?`))return;await aq('invSetMap',L.map(c=>c.acc),code,p?p.name:'');vInv88()};
    $('#icApply').onclick=()=>{const v=$('#icBulk').value;if(!v)return alert('Chọn mã đối tượng ERP ở ô Map đồng loạt trước');bulk(v)};$('#icClear').onclick=()=>bulk('');
    ['#icD1','#icD2'].forEach(x=>$(x).onkeydown=e=>{if(e.key==='Enter')icGo()});
    $('#icSug').onclick=async()=>{const L=RW.filter(c=>!c.erp_code&&c.sug);if(!L.length||!await ask(`Map ${L.length} account theo gợi ý tên? (kiểm tra lại các dòng sau khi map)`))return;for(const c of L)await aq('invSetMap',[c.acc],c.sug,c.sugName);vInv88()};
    const icGo=()=>{IVF.cq=$('#icQ').value;IVF.cl1=$('#icD1').value;IVF.cl2=$('#icD2').value;vInv88()};$('#icQ').onkeydown=e=>{if(e.key==='Enter')icGo()};$('#icQ').onsearch=()=>{if(!$('#icQ').value&&IVF.cq)icGo()};$('#icFind').onclick=icGo;$('#icO').onchange=e=>{IVF.conly=e.target.value;vInv88()};$('#icS').onchange=e=>{IVF.csrc=e.target.value;vInv88()};
    $('#ivImp').onclick=invImp;return}
  try{IVRULES=await aq('invRules')}catch{IVRULES=[]}const r=await aq('invCompare',{from:IVF.from,to:IVF.to,basis:IVF.basis,notax:IVF.notax,src:IVF.src||'all',extra11:IVF.x11??'BC19'}),M=r.months,q=IVF.q.toLowerCase();IVM=[M[0]||IVF.from,M[M.length-1]||IVF.to];
  let R=r.rows.filter(x=>(!q||(x.key+' '+x.name+' '+x.accs.join(' ')).toLowerCase().includes(q))&&(!IVF.only||(IVF.only==='diff'?x.status!=='ok':x.status===IVF.only)));
  const cnt=k=>r.rows.filter(x=>x.status===k).length,lbl=IVF.basis==='pay'?['Thu cước theo ngày nộp','Có 138812 (thu tiền)']:IVF.basis==='bill'?['Thu cước theo kỳ cước','Nợ 138812 (doanh thu)']:[(IVF.src==='bccs'?'Doanh thu BCCS':IVF.src==='cuoc'?'Cước phát sinh':'Cước phát sinh + BCCS')+(IVF.basis==='issue'?' (ngày lập)':' (tháng trên hóa đơn)'),'Nợ 138812'+((IVF.x11??'BC19')?' + Nợ 138811 '+(IVF.x11??'BC19'):'')];
  H.innerHTML=head(`${num(r.issues-r.bccs)} hóa đơn cước · ${num(r.bccs)} giao dịch BCCS · ${num(r.lines)} dòng thu cước đã nạp · so ${lbl[0]} với ERP ${lbl[1]} theo tháng × đối tượng (account → mã ERP theo tab Map)`)+`
    <div class="filterrow"><label>Từ tháng <input type="month" id="ivF" value="${IVF.from}"></label><label>Đến tháng <input type="month" id="ivT" value="${IVF.to}"></label><button class="btn sm primary" id="ivGo" title="Chọn xong tháng rồi bấm Xem (hoặc Enter)">Xem</button>
      <label>So sánh <select id="ivB">${[['issuecyc','Doanh thu theo THÁNG TRÊN HÓA ĐƠN ↔ Nợ 138812 (khuyên dùng)'],['issue','Doanh thu theo ngày lập hóa đơn ↔ Nợ 138812'],['bill','Thu cước theo kỳ cước ↔ Nợ 138812']].map(([v,l])=>`<option value="${v}" ${IVF.basis===v?'selected':''}>${l}</option>`).join('')}</select></label><label title="So sánh số tiền chưa thuế thay vì tổng tiền"><input type="checkbox" id="ivNT" ${IVF.notax?'checked':''}>Chưa thuế</label>${IVF.basis.startsWith('issue')?`<label>Nguồn doanh thu <select id="ivS"><option value="all" ${(IVF.src||'all')==='all'?'selected':''}>Cước phát sinh + BCCS</option><option value="cuoc" ${IVF.src==='cuoc'?'selected':''}>Chỉ cước phát sinh</option><option value="bccs" ${IVF.src==='bccs'?'selected':''}>Chỉ doanh thu bán hàng BCCS</option></select></label><label title="Đối tượng ghi Nợ 138811 cũng tính vào doanh thu ERP (vd BC19)">+ Nợ 138811 đối tượng <input id="ivX11" value="${esc(IVF.x11??'BC19')}" style="width:80px"></label>`:''}
      <label>Hiện <select id="ivO">${[['diff','Chỉ dòng lệch'],['','Tất cả'],['inv_only','Có hóa đơn, ERP chưa ghi'],['erp_only','ERP có, không có hóa đơn'],['unmapped','Account chưa map']].map(([v,l])=>`<option value="${v}" ${IVF.only===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <input id="ivQ" type="search" placeholder="🔍 Tìm đối tượng / account…" value="${esc(IVF.q)}" style="width:240px"><button class="btn sm" id="ivColl" title="Hóa đơn Payment do đơn vị thu hộ gạch nợ (Collection code / Payment staff, vd MOSANMM_VTL) → tính cho đối tượng ERP thu hộ (vd Telemor Fintech)">🏦 Thu hộ${IVRULES.length?` (${IVRULES.map(x=>esc(x.pat)).join(', ')})`:''}</button><button class="btn sm" id="ivImp" title="Nạp bổ sung bất kỳ lúc nào (tháng mới / tương lai): danh mục, cước phát sinh, phát hành hóa đơn, doanh thu BCCS, thu cước – dòng đã có tự bỏ qua">${ic('upload')}Nạp file (bổ sung)</button><button class="btn sm" id="ivX">${ic('download')}Xuất Excel</button></div></div>
    <div class="kpis">${kpi('','file',lbl[0],fmt2(r.inv),'')}${kpi('blue','coins','ERP '+lbl[1],fmt2(r.erp),'')}${kpi(Math.abs(r.inv-r.erp)>0.5?'red':'green','alert','Chênh lệch (HĐ − ERP)',fmt2(r.inv-r.erp),`${cnt('diff')+cnt('inv_only')+cnt('erp_only')} đối tượng lệch · ${cnt('unmapped')} account chưa map`)}${kpi(r.sus.length?'red':'green','users','Nghi ghi nhầm đối tượng',num(r.sus.length),'cặp thiếu – thừa bằng nhau cùng tháng')}</div>
    ${r.sus.length?`<div class="card"><div class="card-h"><h3>⚠ Nghi ghi nhầm đối tượng trên ERP (${r.sus.length})</h3><span class="hint">cùng tháng: đối tượng A thiếu đúng bằng số đối tượng B thừa → kiểm tra & chuyển bút toán ở mô-đun Công nợ 138811 / 138812</span></div>${tbl0(['Tháng','Thiếu trên ERP (hóa đơn > ERP)','Thừa trên ERP (ERP > hóa đơn)','#Số tiền'],r.sus.map(x=>`<tr><td class=nw>${ymLbl(x.ym)}</td><td><b>${esc(x.shortName||x.short)}</b><div class=mut style="font-size:11px">${esc(x.short)}</div></td><td><b>${esc(x.overName||x.over)}</b><div class=mut style="font-size:11px">${esc(x.over)}</div></td><td class=n>${fmt2(x.amt)}</td></tr>`))}</div>`:''}
    <div class="card"><div class="card-h"><h3>Theo đối tượng × tháng (${num(R.length)})</h3><span class="dblhint">mỗi ô: hóa đơn / ERP ghi nhận / 💰 nộp tiền (Có 138812, không tính chênh lệch) · đỏ = lệch · 🖱 nhấn đúp ô tháng hoặc tổng để xem hóa đơn và bút toán ERP</span></div>
    <div class="tbl" style="max-height:calc(100vh - 360px)"><table id="ivMain"><thead><tr><th>Đối tượng ERP</th><th>Account</th><th>Trạng thái</th>${M.map(m=>`<th class=n>${ymLbl(m)}</th>`).join('')}<th class=n>HĐ BCCS</th><th class=n>HĐ Payment (cước)</th><th class=n>Tổng HĐ</th><th class=n>Tổng ERP</th><th class=n>Chênh lệch</th><th class=n title="ERP Có 138812 (+ Có 138811 đối tượng BC19) – không tính vào chênh lệch">Nộp tiền</th></tr></thead><tbody>
    ${R.slice(0,2000).map((x,i)=>`<tr data-ivi="${r.rows.indexOf(x)}"><td><b>${esc(x.name)}</b><div class=mut style="font-size:11px">${esc(x.code||'(chưa map)')}</div></td><td style="font-size:11px"><div class="clamp s" title="${esc(x.accs.join('\n'))}">${esc(x.accs.join(', '))}</div></td><td><span class="badge ${IST[x.status][1]}">${IST[x.status][0]}</span></td>
      ${M.map(m=>{const c=x.m[m];if(!c)return '<td></td>';const d=c.inv-c.erp;return `<td class="n dbl" data-ivm="${m}" style="font-size:12px${Math.abs(d)>0.5?';background:#FEE4E2':''}">${fmt2(c.inv)}<div class=mut>${fmt2(c.erp)}</div>${c.pay?`<div style="color:#079455;font-size:11px" title="Nộp tiền (ERP Có 138812)">💰 ${fmt2(c.pay)}</div>`:''}</td>`}).join('')}<td class=n>${x.bccs?fmt2(x.bccs):'<span class=mut>—</span>'}</td><td class=n>${x.cuoc?fmt2(x.cuoc):'<span class=mut>—</span>'}</td><td class="n dbl" data-ivm=""><b>${fmt2(x.inv)}</b></td><td class="n dbl" data-ivm="" data-ive="1">${fmt2(x.erp)}</td><td class="n ${Math.abs(x.diff)>0.5?'neg':''}"><b>${fmt2(x.diff)}</b></td><td class=n style="color:#079455">${x.pay?fmt2(x.pay):'<span class=mut>—</span>'}</td></tr>`).join('')||`<tr><td colspan=${M.length+9} class=mut style="text-align:center;padding:24px">${(IVF.basis.startsWith('issue')?r.issues:r.lines)?'Không có dòng phù hợp':(IVF.basis.startsWith('issue')?'Chưa nạp báo cáo phát hành hóa đơn – bấm <b>Nạp file</b>':'Chưa nạp file thu cước – bấm <b>Nạp file</b>')}</td></tr>`}
    <tr style="font-weight:700;background:#F9FAFB"><td>TỔNG CỘNG</td><td></td><td></td>${M.map(m=>`<td class=n style="font-size:12px">${fmt2(r.tm[m].inv)}<div class=mut>${fmt2(r.tm[m].erp)}</div><div style="color:#079455;font-size:11px">💰 ${fmt2(r.tm[m].pay||0)}</div></td>`).join('')}<td class=n>${fmt2(r.totBccs||0)}</td><td class=n>${fmt2(r.totCuoc||0)}</td><td class=n>${fmt2(r.inv)}</td><td class=n>${fmt2(r.erp)}</td><td class=n>${fmt2(r.inv-r.erp)}</td><td class=n style="color:#079455">${fmt2(r.pay||0)}</td></tr></tbody></table></div></div>`;
  const rd=()=>{if($('#ivS'))IVF.src=$('#ivS').value;if($('#ivX11'))IVF.x11=$('#ivX11').value.trim();IVF.notax=$('#ivNT').checked;IVF.from=$('#ivF').value;IVF.to=$('#ivT').value;IVF.basis=$('#ivB').value;IVF.only=$('#ivO').value;IVF.q=$('#ivQ').value};
  ['#ivB','#ivO','#ivNT','#ivS','#ivX11'].filter(x=>$(x)).forEach(x=>$(x).onchange=()=>{rd();vInv88()});['#ivF','#ivT','#ivX11'].filter(x=>$(x)).forEach(x=>$(x).onkeydown=e=>{if(e.key==='Enter'){rd();vInv88()}});$('#ivColl').onclick=invCollDlg;$('#ivGo').onclick=()=>{rd();vInv88()};$('#ivQ').onkeydown=e=>{if(e.key==='Enter'){rd();vInv88()}};$('#ivImp').onclick=invImp;
  $('#ivMain tbody').ondblclick=e=>{const td=e.target.closest('[data-ivm]'),tr=e.target.closest('[data-ivi]');if(td&&tr)invCell(r.rows[+tr.dataset.ivi],td.dataset.ivm,!!td.dataset.ive)};
  $('#ivX').onclick=async()=>{try{const f=await api.xlsxSheets(`AccSoft_DoiChieuHoaDon_138812_${IVF.from}_${IVF.to}.xlsx`,[['Doi chieu',R.map(x=>Object.assign({'Mã ERP':x.code,'Đối tượng':x.name,'Account':x.accs.join('; '),'Trạng thái':IST[x.status][0]},...M.flatMap(m=>[{['HĐ '+m]:x.m[m]?x.m[m].inv:0},{['ERP '+m]:x.m[m]?x.m[m].erp:0},{['Nộp tiền '+m]:x.m[m]?x.m[m].pay||0:0}]),{'HĐ BCCS':x.bccs,'HĐ Payment (cước)':x.cuoc,'Tổng HĐ':x.inv,'Tổng ERP':x.erp,'Chênh lệch':x.diff,'Nộp tiền':x.pay||0}))],['Nghi ghi nham',r.sus.map(x=>({'Tháng':x.ym,'Thiếu trên ERP':x.shortName+' ('+x.short+')','Thừa trên ERP':x.overName+' ('+x.over+')','Số tiền':x.amt}))]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}};
}
document.addEventListener('click',e=>{const b=e.target.closest('#ivTabs [data-ivt]');if(b){IVF.tab=b.dataset.ivt;vInv88()}});
let IVRULES=[];
async function invCollDlg(){const [R,P]=await Promise.all([aq('invRules'),aq('invPartners')]),L=R.length?R:[{pat:'MOSANMM_VTL',code:(P.find(p=>/FINTECH/i.test(p.name+' '+p.code))||{}).code||'',name:''}];
  const opt=c=>'<option value="">— chọn đối tượng ERP thu hộ —</option>'+P.map(p=>`<option value="${esc(p.code)}" ${p.code===c?'selected':''}>${esc(p.code)} – ${esc(p.name)}</option>`).join('');
  const row=r=>`<div class="filterrow icr"><label>Mã gạch nợ chứa <input class="icp" value="${esc(r.pat)}" style="width:160px"></label><label>→ đối tượng ERP <select class="icc srch" style="max-width:420px">${opt(r.code)}</select></label><button class="btn sm ghost icdel">✕</button></div>`;
  const w=document.createElement('div');w.className='mdl-wrap';w.style.cssText='position:fixed;inset:0;background:rgba(16,24,40,.45);z-index:950;display:flex;align-items:flex-start;justify-content:center;padding-top:10vh';
  w.innerHTML=`<div class="card" style="width:min(900px,94vw)"><div class="card-h"><h3>🏦 Đơn vị thu hộ – điều chỉnh hóa đơn Payment</h3></div><div class="note">Hóa đơn Payment có <b>Collection code / Payment staff</b> chứa mã dưới đây (vd <b>MOSANMM_VTL</b> – Mosan) được tính cho <b>đối tượng ERP thu hộ</b> (vd Telemor Fintech) thay vì khách hàng, khi đối chiếu với 138812.</div><div id="icrL">${L.map(row).join('')}</div>
   <div class="filterrow"><button class="btn sm" id="icrAdd">+ Thêm quy tắc</button><span style="flex:1"></span><button class="btn sm ghost" id="icrX">Huỷ</button><button class="btn sm primary" id="icrS">💾 Lưu</button></div></div>`;
  document.body.appendChild(w);const close=()=>w.remove();$('#icrX').onclick=close;
  w.addEventListener('click',e=>{if(e.target.classList.contains('icdel'))e.target.closest('.icr').remove()});$('#icrAdd').onclick=()=>$('#icrL').insertAdjacentHTML('beforeend',row({pat:'',code:''}));
  $('#icrS').onclick=async()=>{const V=[...w.querySelectorAll('.icr')].map(x=>{const c=x.querySelector('.icc').value;return {pat:x.querySelector('.icp').value.trim(),code:c,name:(P.find(p=>p.code===c)||{}).name||''}}).filter(x=>x.pat);
    if(V.some(x=>!x.code))return alert('Chọn đối tượng ERP cho mỗi quy tắc');IVRULES=await aq('invSetRules',V);close();vInv88()}}
async function invImp(){try{const x=await api.invImport('merge');if(x&&x.blocked){CUR=-1;$('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Nạp file ${esc(x.file)} – ĐÃ DỪNG, không nạp dòng nào</div><h2 style="font-size:20px" class=neg>⚠ ${num(x.nDup)} hóa đơn đã có trong dữ liệu (nạp trước đó)</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div>
      <div class="pb"><div class="note" style="border-color:var(--err-200);background:var(--err-50)">${x.fixB?`<b>Đã sửa dấu âm cho ${num(x.fixB)} hóa đơn BCCS</b> đã nạp trước đó (trước đây bị ghi dương). `:''}Để tránh nhân đôi doanh thu, phần mềm <b>không nạp các dòng mới của file này</b>. Loại: ${esc(x.kinds.join(', '))} · tháng trên hóa đơn: ${esc(x.months.slice(0,24).join(', '))}${x.months.length>24?'…':''}.<br>Hãy xoá các hóa đơn đã nạp khỏi file (chỉ giữ hóa đơn mới / tháng mới) rồi nạp lại.</div>
      <div class="card"><div class="card-h"><h3>Hóa đơn trùng (${num(Math.min(x.nDup,x.sample.length))} / ${num(x.nDup)} dòng đầu)</h3></div>${tbl0(['Sheet','Loại','Số hóa đơn','Khách hàng / account','Tháng trên HĐ','#Số tiền'],x.sample.map(d=>`<tr><td>${esc(d.sheet)}</td><td>${esc(d.kind)}</td><td class=nw>${esc(d.invoice)}</td><td style="font-size:12px">${esc(d.acc)}</td><td class=nw>${esc(d.ym)}</td><td class=n>${fmt2(d.amt)}</td></tr>`))}</div></div>`;
    $('#drawer').classList.remove('hide');$('#dClose').onclick=closeDetail;return}if(x){alert(`Đã nạp ${x.file}:\n• Danh mục: ${num(x.nC)} account (sheet ${x.sheetC||'—'})\n• Phát hành hóa đơn: mới ${num(x.nI)} dòng (sheet ${x.sheetI||'—'}, trùng ${num(x.dupI)})\n• Thu cước: mới ${num(x.nL)} dòng (sheet ${x.sheetL||'—'}, trùng ${num(x.dup)})\n• Doanh thu bán hàng BCCS: mới ${num(x.nB||0)} giao dịch (sheet ${x.sheetB||'—'}, trùng ${num(x.dupB||0)})${x.fixB?`, sửa dấu âm ${num(x.fixB)}`:''}\nTổng: ${num(x.cust)} account · ${num(x.issues)} hóa đơn phát hành · ${num(x.lines)} dòng thu cước.`);vInv88()}}catch(e){alert(e.message)}}
let IVM=['',''];async function invCell(x,ym,erpFirst){const rng=ym?ymLbl(ym):IVM[0]?(IVM[0]===IVM[1]?ymLbl(IVM[0]):`${ymLbl(IVM[0])} – ${ymLbl(IVM[1])}`):'cả kỳ';CUR=-1;$('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Đối chiếu hóa đơn – 138812 · ${rng}</div><h2 style="font-size:20px">${esc(x.name)} <span class=mut style="font-size:14px">${esc(x.code||'')}</span></h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div><div class="pb"><div class="card"><span class="spin"></span></div></div>`;
  const Dw=$('#drawer');Dw.classList.add('full');Dw.classList.remove('hide');$('#dClose').onclick=closeDetail;
  const d=await aq('invCell',x.key,ym,{from:IVM[0],to:IVM[1],basis:IVF.basis,src:IVF.src||'all',extra11:IVF.x11??'BC19'}),si=d.inv.reduce((a,t)=>a+t.total,0),se=d.erp.reduce((a,t)=>a+t.a,0);
  $('#dPane .pb').innerHTML=`<div class="kpis">${kpi('','file','Hóa đơn',fmt2(si),num(d.inv.length)+' dòng')}${kpi('blue','coins','ERP 138812',fmt2(se),num(d.erp.length)+' bút toán')}${kpi(Math.abs(si-se)>0.5?'red':'green','alert','Chênh lệch',fmt2(si-se),'')}</div>
    ${invMatchCard(d)}
    <div class="card"><div class="card-h"><h3>Hóa đơn (${num(d.inv.length)})</h3><span class="hint">account: ${esc(d.accs.join(', '))}</span></div>${tbl0([d.issue?'Ngày phát hành':'Ngày nộp','Kỳ cước','Account','Khách hàng','Số hóa đơn','Hợp đồng','Dịch vụ',d.issue?'Thuế':'Nhân viên thu','#Chưa thuế','#Tổng tiền',''],d.inv.map(t=>`<tr><td class=nw>${vn(d.issue?t.issue_date:t.pay_date)}</td><td class=nw>${esc(t.ym_bill)}</td><td style="font-size:12px">${esc(t.acc)}</td><td>${esc(t.cust)}${t.collector?`<div style="font-size:11px;color:#6941C6">🏦 thu hộ · ${esc(t.collection||'')}</div>`:''}${t.kind==='bccs'?`<div class=mut style="font-size:11px">BCCS · ${esc(t.shop||'')} · ${esc(t.staff||'')}</div>`:''}</td><td class=nw>${esc(String(t.invoice||'').split('#')[0])}</td><td class=nw style="font-size:12px">${esc(t.contract)}</td><td>${esc(t.service)}</td><td style="font-size:12px">${d.issue?fmt2(t.amt_tax):esc(t.staff)}</td><td class=n>${fmt2(t.amt_notax)}</td><td class=n><b class="${t.total<0?'neg':''}">${fmt2(t.total)}</b>${t.neg_adj?'<div class=mut style="font-size:10px">đã điều chỉnh âm</div>':''}</td><td>${t.kind==='bccs'?`<button class="btn sm ghost" data-bneg="${t.rid}" data-on="${t.total<0?0:1}" title="Chỉ áp dụng hóa đơn BCCS">${t.total<0?'↺ Bỏ âm':'− Điều chỉnh âm'}</button>`:''}</td></tr>`),'Không có hóa đơn')}</div>
    <div class="card"><div class="card-h"><h3>Bút toán ERP 138812 (${num(d.erp.length)})</h3></div>${tbl0(['Ngày','Chứng từ','TK Nợ','TK Có','Đối tượng','Diễn giải','#Số tiền'],d.erp.map(t=>`<tr class=dbl data-eid="${t.id}"><td class=nw>${vn(t.d)}</td><td class=nw>${esc(t.doc)}</td><td>${esc(t.dr)}</td><td>${esc(t.cr)}</td><td style="font-size:12px">${esc(t.p)}</td><td><div class=clamp title="${esc(t.ds)}">${esc(t.ds)}</div></td><td class=n><b>${fmt2(t.a)}</b></td></tr>`),'Không có bút toán ERP')}</div>${d.pay&&d.pay.length?`<div class="card"><div class="card-h"><h3 style="color:#079455">💰 Nộp tiền – ERP Có 138812 / 138811 (BC19) (${num(d.pay.length)} · ${fmt2(d.pay.reduce((a,t)=>a+t.a,0))})</h3><span class=hint>không tính vào chênh lệch</span></div>${tbl0(['Ngày','Chứng từ','TK Nợ','TK Có','Đối tượng','Diễn giải','#Số tiền'],d.pay.map(t=>`<tr class=dbl data-eid="${t.id}"><td class=nw>${vn(t.d)}</td><td class=nw>${esc(t.doc)}</td><td>${esc(t.dr)}</td><td>${esc(t.cr)}</td><td style="font-size:12px">${esc(t.p)}</td><td><div class=clamp title="${esc(t.ds)}">${esc(t.ds)}</div></td><td class=n><b>${fmt2(t.a)}</b></td></tr>`))}</div>`:''}`;
  if(erpFirst){const cs=$('#dPane .pb').querySelectorAll(':scope>.card');if(cs.length>1)cs[0].before(cs[cs.length-1])}
  footSum($('#dPane .pb'));
  $('#dPane .pb').addEventListener('click',e=>{const b=e.target.closest('[data-mf]');if(!b)return;const f=b.dataset.mf;b.parentNode.querySelectorAll('[data-mf]').forEach(x=>x.classList.toggle('primary',x===b));$('#ivMatch').querySelectorAll('tbody tr').forEach(r=>r.style.display=!f||r.dataset.st===f?'':'none')});
  $('#dPane .pb').onclick=async e=>{const b=e.target.closest('[data-bneg]');if(!b)return;const on=b.dataset.on==='1';if(!await ask(on?'Điều chỉnh hóa đơn BCCS này thành số tiền ÂM (hóa đơn điều chỉnh giảm)?':'Bỏ điều chỉnh âm – trả hóa đơn BCCS về số dương?'))return;await aq('invBccsNeg',[+b.dataset.bneg],on);invCell(x,ym,erpFirst);vInv88()};
  $('#dPane .pb').ondblclick=e=>{const tr=e.target.closest('tr[data-eid]');if(tr)showDetail(null,+tr.dataset.eid)};
}

/* v4.55.2: dòng tổng cộng cho bảng chi tiết – tự cộng các cột số theo các dòng đang hiện (cập nhật khi lọc bằng ô tìm) */
function footSum(root){if(!root)return;const P=t=>{const v=+String(t||'').replace(/[^0-9.\-]/g,'');return Number.isFinite(v)?v:0};
  root.querySelectorAll('table').forEach(t=>{const tb=t.tBodies[0],hr=t.tHead&&t.tHead.rows[0];if(!tb||!hr||tb.rows.length<1)return;const cols=[...hr.cells].map((c,i)=>c.classList.contains('n')&&/tiền|thuế|số tiền|amount/i.test(c.textContent)?i:-1).filter(i=>i>=0);if(!cols.length)return;
    let tf=t.tFoot;if(!tf){tf=t.createTFoot();}const run=()=>{const S=cols.map(()=>0);let n=0;for(const r of tb.rows){if(r.style.display==='none'||r.dataset.nosum||r.cells.length<hr.cells.length)continue;n++;cols.forEach((c,k)=>S[k]+=P(r.cells[c]&&r.cells[c].textContent.split('\n')[0]))}
      tf.innerHTML=`<tr style="font-weight:700;background:var(--gray-50,#F9FAFB);position:sticky;bottom:0">${[...hr.cells].map((c,i)=>{const k=cols.indexOf(i);return i===0?`<td>TỔNG CỘNG (${num(n)} dòng)</td>`:k>=0?`<td class=n>${fmt2(S[k])}</td>`:'<td></td>'}).join('')}</tr>`};
    run();new MutationObserver(run).observe(tb,{attributes:true,subtree:true,attributeFilter:['style'],childList:true})})}

/* v4.56.0: ghép từng hóa đơn ↔ bút toán ERP (số hóa đơn trong diễn giải → account + số tiền → số tiền duy nhất) */
function invMatchCard(d){const M=d.match||[];if(!M.length)return '';const st=m=>!m.e?'inv':!m.inv.length?'erp':Math.abs(m.d)<=0.005?'ok':'diff',L={ok:['Khớp','s-fixed'],diff:['Lệch tiền','b-H'],inv:['Chỉ có hóa đơn','b-M'],erp:['Chỉ có ERP','b-L']},C={ok:0,diff:0,inv:0,erp:0};M.forEach(m=>C[st(m)]++);
  const ord={diff:0,inv:1,erp:2,ok:3},R=[...M].sort((a,b)=>ord[st(a)]-ord[st(b)]);
  return `<div class="card"><div class="card-h"><h3>🔗 Ghép hóa đơn ↔ bút toán ERP</h3><span class=hint>ghép theo số hóa đơn trong diễn giải ERP → account + số tiền → số tiền (duy nhất)</span></div>
  <div class="filterrow"><button class="btn sm primary" data-mf="">Tất cả (${num(M.length)})</button>${Object.keys(L).map(k=>`<button class="btn sm" data-mf="${k}">${L[k][0]} (${num(C[k])})</button>`).join('')}</div>
  <div class="tbl" style="max-height:420px"><table id="ivMatch"><thead><tr><th>Trạng thái</th><th>Cách ghép</th><th>Số hóa đơn</th><th>Account</th><th class=n>Tiền hóa đơn</th><th>Ngày ERP</th><th>Chứng từ ERP</th><th>Diễn giải ERP</th><th class=n>Tiền ERP</th><th class=n>Chênh lệch</th></tr></thead><tbody>
  ${R.map(m=>{const k=st(m),ia=m.inv.reduce((a,t)=>a+t.total,0);return `<tr data-st="${k}"${m.e?` class=dbl data-eid="${m.e.id}"`:''}><td><span class="badge ${L[k][1]}">${L[k][0]}</span></td><td style="font-size:12px">${esc(m.how)}</td><td class=nw style="font-size:12px">${m.inv.map(t=>esc(String(t.invoice||'').split('#')[0])+(t.kind==='bccs'?' <span class=mut>BCCS</span>':'')).join('<br>')}</td><td style="font-size:12px">${m.inv.map(t=>esc(t.acc)).join('<br>')}</td><td class=n>${m.inv.length?fmt2(ia):''}</td><td class=nw>${m.e?vn(m.e.d):''}</td><td class=nw>${m.e?esc(m.e.doc):''}</td><td><div class=clamp title="${m.e?esc(m.e.ds):''}">${m.e?esc(m.e.ds):''}</div></td><td class=n>${m.e?fmt2(m.e.a):''}</td><td class="n ${Math.abs(m.d)>0.005?'neg':''}">${fmt2(m.d)}</td></tr>`}).join('')}</tbody></table></div></div>`}

/* v4.57.0: Tra cứu bút toán ERP – popup (Ctrl+K) tìm theo số chứng từ, nội dung, số tiền, đối tượng, hợp đồng, vị trí, biển số, người nhập… */
const EFS=Object.assign({q:'',doc:'',desc:'',bp:'',contract:'',loc:'',plate:'',user:'',acc:'',inv:'',adv:'',amtMin:'',amtMax:'',from:'',to:''},(()=>{try{return JSON.parse(localStorage.getItem('efs')||'{}')}catch{return {}}})());
function entryFind(){let w=$('#efWrap');if(!w){w=document.createElement('div');w.id='efWrap';w.className='mdl-wrap';w.style.cssText='position:fixed;inset:0;background:rgba(16,24,40,.45);z-index:900;display:flex;align-items:flex-start;justify-content:center;padding:4vh 2vw';document.body.appendChild(w)}
  const F=[['doc','Số chứng từ'],['desc','Nội dung / diễn giải'],['bp','Đối tượng công nợ'],['contract','Hợp đồng'],['loc','Mã vị trí / trạm'],['plate','Biển số xe'],['user','Nhân viên nhập'],['acc','Tài khoản'],['inv','Số hóa đơn'],['adv','Đề nghị tạm ứng']];
  w.innerHTML=`<div class="card" style="width:min(1400px,96vw);max-height:92vh;display:flex;flex-direction:column;margin:0">
   <div class="card-h"><h3>🔎 Tra cứu bút toán ERP</h3><span class=hint>gõ rồi nhấn Enter · nhấn đúp dòng để xem chi tiết chứng từ · Esc để đóng</span><span style="flex:1"></span><button class="btn sm ghost" id="efClr">Xoá điều kiện</button><button class="btn sm ghost" id="efX">✕ Đóng</button></div>
   <div class="filterrow"><input id="ef_q" type="search" placeholder="🔍 Tìm nhanh mọi trường (chứng từ, nội dung, số tiền, đối tượng, hợp đồng, vị trí, biển số, người nhập…)" style="flex:1;min-width:380px" value="${esc(EFS.q)}"><button class="btn sm primary" id="efGo">Tìm</button></div>
   <div class="filterrow" style="flex-wrap:wrap">${F.map(([k,l])=>`<label>${l} <input id="ef_${k}" value="${esc(EFS[k])}" style="width:150px"></label>`).join('')}
     <label>Số tiền từ <input id="ef_amtMin" type="number" value="${esc(EFS.amtMin)}" style="width:110px"></label><label>đến <input id="ef_amtMax" type="number" value="${esc(EFS.amtMax)}" style="width:110px"></label>
     <label>Ngày từ <input id="ef_from" type="date" value="${esc(EFS.from)}"></label><label>đến <input id="ef_to" type="date" value="${esc(EFS.to)}"></label></div>
   <div id="efRes" style="overflow:auto;flex:1;min-height:200px"><div class="mut" style="padding:24px;text-align:center">Nhập điều kiện rồi nhấn Enter / Tìm</div></div></div>`;
  w.classList.remove('hide');w.style.display='flex';
  const close=()=>{w.style.display='none'};$('#efX').onclick=close;w.onclick=e=>{if(e.target===w)close()};
  const read=()=>{for(const k in EFS){const el=$('#ef_'+k);if(el)EFS[k]=el.value.trim()}try{localStorage.setItem('efs',JSON.stringify(EFS))}catch{}};
  const go=async()=>{read();const R=$('#efRes');R.innerHTML='<div class="card"><span class="spin"></span></div>';try{const r=await aq('entrySearch',{...EFS});
    if(!r.rows.length){R.innerHTML='<div class="mut" style="padding:24px;text-align:center">Không tìm thấy bút toán phù hợp</div>';return}
    R.innerHTML=`<div class=mut style="margin:4px 0 6px">${num(r.n)} bút toán${r.n>r.rows.length?` · hiện ${num(r.rows.length)} dòng mới nhất – thêm điều kiện để thu hẹp`:''}</div><div class="tbl" style="max-height:none"><table id="efT"><thead><tr><th>Ngày</th><th>Chứng từ</th><th>TK Nợ</th><th>TK Có</th><th class=n>Số tiền</th><th>Đối tượng</th><th>Diễn giải</th><th>Hợp đồng</th><th>Vị trí</th><th>Biển số</th><th>Phòng ban</th><th>Người nhập</th></tr></thead><tbody>${r.rows.map(x=>`<tr class=dbl data-efid="${x.id}"><td class=nw>${vn(x.d)}</td><td class=nw><b>${esc(x.doc)}</b></td><td>${esc(x.dr)}</td><td>${esc(x.cr)}</td><td class=n><b>${fmt2(x.a)}</b></td><td style="font-size:12px">${x.pd?`<div><span class=mut>Nợ:</span> ${esc(x.pd)}</div>`:''}${x.pc?`<div><span class=mut>Có:</span> ${esc(x.pc)}</div>`:''}</td><td><div class=clamp title="${esc(x.ds)}">${esc(x.ds)}</div></td><td style="font-size:12px">${esc(x.contract||'')}</td><td style="font-size:12px">${esc(x.loc||'')}</td><td class=nw>${esc(x.plate||'')}</td><td style="font-size:12px">${esc(x.dept||'')}</td><td style="font-size:12px">${esc(x.u||'')}</td></tr>`).join('')}</tbody></table></div>`;
    footSum(R);R.ondblclick=e=>{const tr=e.target.closest('[data-efid]');if(tr){close();showDetail(null,+tr.dataset.efid).then(()=>{const c=$('#dClose');if(c)c.addEventListener('click',()=>{w.style.display='flex'},{once:true})})}}}catch(e){R.innerHTML=`<div class=neg style="padding:16px">${esc(e.message)}</div>`}};
  w.querySelectorAll('input').forEach(i=>i.addEventListener('keydown',e=>{if(e.key==='Enter')go();if(e.key==='Escape')close()}));$('#efGo').onclick=go;
  $('#efClr').onclick=()=>{for(const k in EFS)EFS[k]='';entryFind()};
  setTimeout(()=>$('#ef_q').focus(),30);if(Object.values(EFS).some(Boolean))go()}
document.addEventListener('click',e=>{if(e.target.closest('#btnFind'))entryFind()});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();entryFind()}});

/* v4.57.1: nhấn đúp dòng ở tab Map → giao dịch BCCS / Payment gần nhất của account để nhận diện khách hàng */
async function invCustTx(c){CUR=-1;const Dw=$('#drawer');$('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Giao dịch gần nhất · ${esc(c.acc)}</div><h2 style="font-size:20px">${esc(c.name||c.acc)}</h2></div><div style="flex:1"></div><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div><div class="pb"><div class="card"><span class="spin"></span></div></div>`;
  Dw.classList.add('full');Dw.classList.remove('hide');$('#dClose').onclick=closeDetail;
  const d=await aq('invCustTx',c.acc,100),B=d.issue.filter(t=>t.kind==='bccs'),I=d.issue.filter(t=>t.kind!=='bccs');
  const sec=(t,rows,H,f)=>rows.length?`<div class="card"><div class="card-h"><h3>${t} (${num(rows.length)} gần nhất)</h3></div>${tbl0(H,rows.map(f))}</div>`:'';
  $('#dPane .pb').innerHTML=`<div class="note">Mã ERP hiện tại: <b>${esc(c.erp_code||'chưa map')}</b>${c.erp_code&&c.erpName?' – '+esc(c.erpName):''} · ${num(d.nIssue)} hóa đơn phát hành / BCCS · ${num(d.nPay)} dòng Payment</div>
   ${sec('🧾 Hóa đơn BCCS',B,['Ngày lập','Tháng HĐ','Số hóa đơn','Khách hàng','Shop','Nhân viên','Loại giao dịch','Hợp đồng / ISDN','#Chưa thuế','#Thuế','#Tổng tiền'],t=>`<tr><td class=nw>${vn(t.issue_date)}</td><td class=nw>${esc(t.ym)}</td><td class=nw>${esc(String(t.invoice||'').split('#')[0])}</td><td>${esc(t.cust)}</td><td style="font-size:12px">${esc(t.shop||'')}</td><td style="font-size:12px">${esc(t.staff||'')}</td><td style="font-size:12px">${esc(t.txtype||t.service||'')}</td><td style="font-size:12px">${esc(t.contract||'')}</td><td class=n>${fmt2(t.amt_notax)}</td><td class=n>${fmt2(t.amt_tax)}</td><td class=n><b>${fmt2(t.total)}</b></td></tr>`)}
   ${sec('🧾 Hóa đơn phát hành',I,['Ngày phát hành','Tháng HĐ','Số hóa đơn','Khách hàng','Hợp đồng','Dịch vụ','#Tổng tiền'],t=>`<tr><td class=nw>${vn(t.issue_date)}</td><td class=nw>${esc(t.ym)}</td><td class=nw>${esc(t.invoice)}</td><td>${esc(t.cust)}</td><td style="font-size:12px">${esc(t.contract||'')}</td><td>${esc(t.service||'')}</td><td class=n><b>${fmt2(t.total)}</b></td></tr>`)}
   ${sec('💳 Payment (thu cước theo hóa đơn)',d.pay,['Ngày nộp','Kỳ cước','Số hóa đơn','Khách hàng','Hợp đồng','Dịch vụ','Nhân viên thu','#Chưa thuế','#Tổng tiền'],t=>`<tr><td class=nw>${vn(t.pay_date)}</td><td class=nw>${esc(t.ym_bill)}</td><td class=nw>${esc(t.invoice)}</td><td>${esc(t.cust)}</td><td style="font-size:12px">${esc(t.contract||'')}</td><td>${esc(t.service||'')}</td><td style="font-size:12px">${esc(t.staff||'')}</td><td class=n>${fmt2(t.amt_notax)}</td><td class=n><b>${fmt2(t.total)}</b></td></tr>`)}
   ${!B.length&&!I.length&&!d.pay.length?'<div class="card mut">Chưa có giao dịch nào cho account này</div>':''}`;
  footSum($('#dPane .pb'))}

/* v4.58.1: cột Type of cost trong chi phí theo phòng ban */
function tcCell(o){const L=o.tcs||[];if(!L.length)return '<td></td>';const all=L.map(x=>`${x.tc||'(trống)'}: ${fmt2(x.a)}`).join('\n');
  return `<td style="font-size:11px;max-width:300px" title="${esc(all)}">${L.slice(0,3).map(x=>`<div class=nw style="overflow:hidden;text-overflow:ellipsis">${esc(x.tc||'(trống)')} <span class=mut>${fmt2(x.a)}</span></div>`).join('')}${L.length>3?`<div class=mut>+${L.length-3} loại khác…</div>`:''}</td>`}

/* ===== v4.60.0: Đối chiếu công nợ 331 theo hợp đồng ===== */
const APF=Object.assign({from:'',to:'',acc:'331',q:'',only:'open',st:''},ls.get('apPick',{}));
async function vAP(){const H=$('#apBody');if(!APF.to){const t=new Date();APF.to=new Date(t.getFullYear(),t.getMonth(),0).toISOString().slice(0,10)}if(!APF.from)APF.from=APF.to.slice(0,4)+'-01-01';
  H.innerHTML='<div class="card"><span class="spin"></span> Đang tổng hợp công nợ 331…</div>';
  const r=await aq('apReport',{from:APF.from,to:APF.to,acc:APF.acc,q:APF.q,only:APF.only,st:APF.st});ls.set('apPick',APF);APR=r;
  const sign=v=>`<span class="${v<-0.004?'neg':''}">${fmt2(v)}</span>`;
  H.innerHTML=`<div class="card"><div class="subbar"><span class="crumb">Đối chiếu công nợ 331 theo hợp đồng</span><span class="hint">Số dư = Có 331 − Nợ 331 theo hợp đồng (đã điều chỉnh) · dương = còn phải trả · âm = ứng trước cho nhà cung cấp (cho ứng trước theo hợp đồng) · nhấn đúp đối tượng để xem giao dịch & sửa hợp đồng</span></div>
   <div class="filterrow"><label>Từ ngày <input type="date" id="apF" value="${APF.from}"></label><label>Đến ngày <input type="date" id="apT" value="${APF.to}"></label><label>Tài khoản <input id="apA" value="${esc(APF.acc)}" style="width:80px"></label>
    <label>Hiện <select id="apO">${[['open','Còn số dư'],['','Tất cả có phát sinh / số dư'],['adv','Có ứng trước (dư Nợ)'],['mixed','Vừa phải trả vừa ứng trước'],['noc','Có số dư không có hợp đồng'],['zero','Tổng số dư = 0 nhưng còn dư theo hợp đồng (nghi chọn sai HĐ)'],['nonzero','Tổng số dư khác 0']].map(([v,l])=>`<option value="${v}" ${APF.only===v?'selected':''}>${l}</option>`).join('')}</select></label>
    <label>Trạng thái tháng ${ymLbl(APF.to.slice(0,7))} <select id="apSt">${[['','Tất cả'],['hideok','Ẩn đã khớp (chưa khớp + chưa đối chiếu)'],['ok','✅ Đã khớp'],['diff','❌ Chưa khớp'],['none','Chưa đối chiếu']].map(([v,l])=>`<option value="${v}" ${APF.st===v?'selected':''}>${l}</option>`).join('')}</select></label>
    <input id="apQ" type="search" placeholder="🔍 Tìm đối tượng / hợp đồng… (Enter)" value="${esc(APF.q)}" style="width:260px"><button class="btn sm primary" id="apGo">Xem</button>
    <span style="flex:1"></span><span class="mut" id="apSelN">Chưa chọn</span><button class="btn sm" id="apSOk" title="Đánh dấu các đối tượng đã tick là đã khớp">✅ Đã khớp</button><button class="btn sm" id="apSDiff" title="Đánh dấu các đối tượng đã tick là chưa khớp">❌ Chưa khớp</button><button class="btn sm" id="apW">📄 Word đối chiếu</button><button class="btn sm" id="apX">${ic('download')}Excel đối chiếu</button><button class="btn sm primary" id="apWX">Xuất Word + Excel</button></div></div>
   <div class="kpis">${kpi('','users','Đối tượng',num(r.rows.length),`tháng ${ymLbl(r.ym)}: ✅ ${num(r.rows.filter(x=>x.st&&x.st.status==='ok').length)} · ❌ ${num(r.rows.filter(x=>x.st&&x.st.status==='diff').length)} · chưa ${num(r.rows.filter(x=>!(x.st&&x.st.status)).length)}`)}${kpi('','coins','Còn phải trả (dư Có)',fmt2(r.tot.pay))}${kpi(r.tot.adv>0.004?'blue':'green','coins','Ứng trước NCC (dư Nợ)',fmt2(r.tot.adv))}${kpi('','alert','Số dư thuần cuối kỳ',fmt2(r.tot.close),'Có − Nợ')}</div>
   <div class="card"><div class="card-h"><h3>Đối tượng × hợp đồng (${num(r.rows.length)})</h3><span class="dblhint">🖱 nhấn đúp dòng đối tượng: giao dịch theo hợp đồng còn số dư, sửa mã hợp đồng · tick để xuất biên bản (không tick = xuất đối tượng đang chọn trong cửa sổ chi tiết)</span></div>
   <div class="tbl" style="max-height:calc(100vh - 380px)"><table id="apT1"><thead><tr><th style="width:28px"><input type="checkbox" id="apAll"></th><th>Đối tượng / Hợp đồng</th><th class=n>Số HĐ còn dư</th><th class=n>Đầu kỳ</th><th class=n>Phát sinh Có (phải trả)</th><th class=n>Phát sinh Nợ (trả / ứng)</th><th class=n>Cuối kỳ</th><th class=n>Phải trả</th><th class=n>Ứng trước</th><th>Đối chiếu ${ymLbl(APF.to.slice(0,7))}</th></tr></thead><tbody>
   ${r.rows.slice(0,2000).map((x,i)=>`<tr data-api="${i}" class=dbl style="background:#F9FAFB;font-weight:600"><td><input type="checkbox" data-apk="${i}"></td><td>▸ ${esc(x.bp)}${x.info&&x.info.name?` <span class=mut style="font-weight:400">(${esc(x.info.name)})</span>`:''}</td><td class=n>${num(x.nOpenC)}</td><td class=n data-apm="open" title="Nhấn đúp: giao dịch tạo số dư đầu kỳ">${sign(x.open)}</td><td class=n data-apm="cr" title="Nhấn đúp: phát sinh Có trong kỳ">${fmt2(x.cr)}</td><td class=n data-apm="dr" title="Nhấn đúp: phát sinh Nợ trong kỳ">${fmt2(x.dr)}</td><td class=n data-apm="per" title="Nhấn đúp: phát sinh Nợ + Có trong kỳ"><b>${sign(x.close)}</b></td><td class=n>${x.pay?fmt2(x.pay):''}</td><td class=n style="color:#1570EF">${x.adv?fmt2(x.adv):''}</td><td>${apStBadge(x.st,x.prev)}</td></tr>`+
     x.contracts.filter(c=>APF.only!=='open'||Math.abs(c.close)>0.004).slice(0,40).map(c=>`<tr data-api="${i}" data-apc="${esc(c.c||'')}" class=dbl title="Nhấn đúp: chỉ giao dịch của hợp đồng này"><td></td><td style="padding-left:22px;font-size:12px">${c.c?esc(c.c):'<span class=neg>(không có hợp đồng)</span>'}</td><td class=n style="font-size:11px">${c.close<-0.004?'<span style="color:#1570EF">ứng trước</span>':c.close>0.004?'phải trả':'<span class=mut>hết dư</span>'}</td><td class=n data-apm="open" title="Nhấn đúp: giao dịch tạo số dư đầu kỳ">${sign(c.open)}</td><td class=n data-apm="cr" title="Nhấn đúp: phát sinh Có trong kỳ">${fmt2(c.cr)}</td><td class=n data-apm="dr" title="Nhấn đúp: phát sinh Nợ trong kỳ">${fmt2(c.dr)}</td><td class=n data-apm="per" title="Nhấn đúp: phát sinh Nợ + Có trong kỳ">${sign(c.close)}</td><td class=n>${c.close>0.004?fmt2(c.close):''}</td><td class=n style="color:#1570EF">${c.close<-0.004?fmt2(-c.close):''}</td><td></td></tr>`).join('')).join('')}
   </tbody><tfoot><tr style="font-weight:700;background:#FFF6F2"><td></td><td>TỔNG CỘNG</td><td></td><td class=n>${fmt2(r.tot.open)}</td><td class=n>${fmt2(r.tot.cr)}</td><td class=n>${fmt2(r.tot.dr)}</td><td class=n>${fmt2(r.tot.close)}</td><td class=n>${fmt2(r.tot.pay)}</td><td class=n>${fmt2(r.tot.adv)}</td><td></td></tr></tfoot></table></div></div>`;
  const rd=()=>{APF.from=$('#apF').value;APF.to=$('#apT').value;APF.acc=$('#apA').value.trim()||'331';APF.only=$('#apO').value;APF.q=$('#apQ').value.trim();APF.st=$('#apSt').value};
  $('#apGo').onclick=()=>{rd();vAP()};$('#apO').onchange=()=>{rd();vAP()};$('#apSt').onchange=()=>{rd();vAP()};['#apQ','#apF','#apT','#apA'].forEach(x=>$(x).onkeydown=e=>{if(e.key==='Enter'){rd();vAP()}});
  const B=$('#apT1 tbody'),picked=()=>[...B.querySelectorAll('[data-apk]:checked')].map(x=>r.rows[+x.dataset.apk].bp),cnt=()=>{const n=picked().length;$('#apSelN').textContent=n?`Đã chọn ${num(n)} đối tượng`:'Chưa chọn'};
  $('#apAll').onchange=e=>{B.querySelectorAll('[data-apk]').forEach(x=>{if(x.closest('tr').style.display!=='none')x.checked=e.target.checked});cnt()};B.addEventListener('change',cnt);
  B.ondblclick=e=>{if(e.target.closest('input'))return;const tr=e.target.closest('[data-api]');if(tr){const m=(e.target.closest('[data-apm]')||{dataset:{}}).dataset.apm||'';apDetail(r.rows[+tr.dataset.api].bp,false,tr.dataset.apc,m)}};
  const ex=async kinds=>{const L=picked();if(!L.length)return alert('Tick chọn đối tượng cần xuất biên bản (hoặc mở chi tiết một đối tượng rồi bấm xuất trong cửa sổ đó)');await apExp(L,kinds)};
  const bst=async st=>{const L=picked();if(!L.length)return alert('Tick chọn đối tượng cần đánh dấu');const note=st==='diff'?await askText('Ghi chú lý do chưa khớp (có thể bỏ trống)',''):'';if(note===null)return;await aq('apSetStatus',L,st,note||'',APF.to);vAP()};
  $('#apSOk').onclick=()=>bst('ok');$('#apSDiff').onclick=()=>bst('diff');
  $('#apW').onclick=()=>ex(['docx']);$('#apX').onclick=()=>ex(['xlsx']);$('#apWX').onclick=()=>ex(['docx','xlsx'])}
let APR=null;
async function apExp(L,kinds){try{const x=await api.apExport(L,{from:APF.from,to:APF.to,acc:APF.acc},kinds);if(x&&x.files&&x.files.length)alert(`Đã xuất ${x.files.length} file:\n`+x.files.slice(0,10).join('\n')+(x.files.length>10?'\n…':''))}catch(e){alert(e.message)}}
async function apDetail(bp,keep,onlyC,mode=''){CUR=-1;const Dw=$('#drawer');Dw.classList.add('full');Dw.classList.remove('hide');
  $('#dPane').innerHTML=`<div class="ph"><div><div class="mut" style="font-size:12px">Công nợ ${esc(APF.acc)} · ${vn(APF.from)} – ${vn(APF.to)}</div><h2 style="font-size:20px">${esc(bp)}</h2></div><div style="flex:1"></div><button class="btn sm" id="apdW">📄 Word</button><button class="btn sm" id="apdX">${ic('download')}Excel</button><button class="btn sm primary" id="apdWX">Word + Excel</button><button class="btn sm ghost" id="dClose">${ic('x')}Đóng</button></div><div class="pb"><div class="card"><span class="spin"></span></div></div>`;
  let chg=false;$('#dClose').onclick=()=>{closeDetail();if(chg)vAP()};$('#apdW').onclick=()=>apExp([bp],['docx']);$('#apdX').onclick=()=>apExp([bp],['xlsx']);$('#apdWX').onclick=()=>apExp([bp],['docx','xlsx']);
  const d=await aq('apDetail',bp,{from:APF.from,to:APF.to,acc:APF.acc,all:!!keep||onlyC!=null}),sel=new Set(),inf=d.info||{},CF=onlyC==null?null:String(onlyC),inC=x=>CF==null||(x.c||'')===CF,inM=x=>!mode?true:mode==='open'?!x.inP:mode==='per'?x.inP:x.inP&&x.side===mode,LN=d.lines.map((x,i)=>({x,i})).filter(o=>inC(o.x)&&inM(o.x));const SG=apSuggest(d.lines,d.allC),MT=apMatch(d.lines),nOpenL=LN.filter(({i})=>(MT.get(i)||{}).left>0.004),sOpen=nOpenL.reduce((q,{i})=>q+MT.get(i).left,0);
  const pb=$('#dPane .pb');
  pb.innerHTML=`<div class="card"><div class="card-h"><h3>Thông tin trên biên bản</h3><span class=hint>tên đối tác in trên Word / Excel</span></div><div class="filterrow"><label>Tên đối tác <input id="apiN" value="${esc(inf.name||'')}" placeholder="${esc(String(bp).replace(/^[A-Za-z]+_[A-Za-z]*\d+_?/,''))}" style="width:340px"></label><label>Người liên hệ <input id="apiC" value="${esc(inf.contact||'')}" style="width:160px"></label><label>Email <input id="apiE" value="${esc(inf.email||'')}" style="width:200px"></label><label>Điện thoại <input id="apiT" value="${esc(inf.tel||'')}" style="width:120px"></label><button class="btn sm" id="apiS">💾 Lưu</button></div>
   <div class="filterrow"><b>Trạng thái đối chiếu tháng ${ymLbl(APF.to.slice(0,7))}:</b> ${apStBadge(d.st)} <select id="apiSt"><option value="">Chưa đối chiếu</option><option value="ok" ${(d.st||{}).status==='ok'?'selected':''}>✅ Đã khớp</option><option value="diff" ${(d.st||{}).status==='diff'?'selected':''}>❌ Chưa khớp</option></select><input id="apiStN" placeholder="Ghi chú (lý do chưa khớp, số đối tác xác nhận…)" value="${esc((d.st||{}).note||'')}" style="width:420px"><button class="btn sm primary" id="apiStS">💾 Lưu trạng thái</button></div>${(d.hist||[]).length?`<div class="mut" style="font-size:12px">Lịch sử: ${d.hist.map(h=>`${ymLbl(h.ym)} ${h.status==='ok'?'✅':'❌'}${h.note?' ('+esc(h.note)+')':''}`).join(' · ')}</div>`:''}</div>
   <div class="card"><div class="card-h"><h3>Hợp đồng ${keep?'(tất cả)':'còn số dư'} (${num(d.contracts.length)})</h3>${d.hidden&&!keep?`<span class=hint>ẩn ${num(d.hidden)} hợp đồng đã hết số dư · <a href="#" id="apShowAll">hiện tất cả</a></span>`:keep?'<span class=hint><a href="#" id="apShowOpen">chỉ hợp đồng còn số dư</a></span>':''}</div>
   ${tbl0(['Hợp đồng','Loại','#Đầu kỳ','#Phát sinh Có','#Phát sinh Nợ','#Cuối kỳ','#Số GD trong kỳ'],d.contracts.filter(c=>CF==null||Math.abs(c.close)>0.004||(c.c||'')===CF||keep).map(c=>`<tr class=dbl data-apcc="${esc(c.c||'')}" title="Nhấn đúp: chỉ giao dịch của hợp đồng này"${CF!=null&&(c.c||'')===CF?' style="background:#FFF1EB;font-weight:600"':''}><td>${c.c?esc(c.c):'<span class=neg>(không có hợp đồng)</span>'}</td><td>${c.close<-0.004?'<span style="color:#1570EF">Ứng trước</span>':c.close>0.004?'Phải trả':'Hết dư'}</td><td class=n data-apm="open" title="Nhấn đúp: giao dịch tạo số dư đầu kỳ">${fmt2(c.open)}</td><td class=n data-apm="cr" title="Nhấn đúp: phát sinh Có trong kỳ">${fmt2(c.cr)}</td><td class=n data-apm="dr" title="Nhấn đúp: phát sinh Nợ trong kỳ">${fmt2(c.dr)}</td><td class="n ${c.close<-0.004?'neg':''}" data-apm="per" title="Nhấn đúp: phát sinh Nợ + Có trong kỳ"><b>${fmt2(c.close)}</b></td><td class=n>${num(c.n)}</td></tr>`))}</div>
   <div class="card"><div class="card-h"><label style="margin-left:auto;font-size:13px"><input type=checkbox id="apOpenOnly" ${APOPEN?'checked':''}> Chỉ khoản còn treo (${num(nOpenL.length)} · ${fmt2(sOpen)})</label><h3 style="order:-1">Giao dịch ${mode?`<span class="badge b-M">${({open:'Đầu kỳ (trước '+vn(APF.from)+')',cr:'Phát sinh Có trong kỳ',dr:'Phát sinh Nợ trong kỳ',per:'Phát sinh trong kỳ'})[mode]}</span> `:''}${CF!=null?`– hợp đồng <span style="color:#FA4700">${esc(CF||'(không có hợp đồng)')}</span> `:''}(${num(LN.length)})</h3>${CF!=null||mode?'<button class="btn sm ghost" id="apdAllC">↺ Xem tất cả</button>':''}<span class=hint>gồm cả giao dịch trước kỳ (tạo số dư đầu kỳ) – dòng xám · tick dòng rồi chọn hợp đồng đúng → Lưu</span></div>
    <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center;background:#FFF6F2;padding:8px 10px;border-radius:8px"><span id="apdSel" class="mut">Chưa chọn dòng</span><div style="flex:1"></div>
     <select id="apdTo" class="srch" style="max-width:380px"><option value="">— Chọn hợp đồng đúng (${num(d.allC.length)}) —</option><option value="__ORIG__">↺ Trả về hợp đồng gốc</option>${d.allC.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
     <input id="apdNew" placeholder="hoặc nhập mã hợp đồng mới" style="width:220px"><button class="btn sm primary" id="apdSave">💾 Lưu hợp đồng cho dòng đã chọn</button>
     <span style="flex-basis:100%"></span><span class="mut" style="font-size:12px">⚠ ${num([...SG.keys()].filter(i=>LN.some(o=>o.i===i)).length)} dòng có diễn giải nhắc hợp đồng khác với hợp đồng đang chọn</span><label style="font-size:12px"><input type="checkbox" id="apSgOnly" ${APSGO?'checked':''}> Chỉ hiện dòng lệch diễn giải</label><button class="btn sm" id="apdSgTick" title="Tick tất cả dòng có gợi ý (đang hiện)">☑ Tick dòng lệch diễn giải</button><button class="btn sm primary" id="apdSgApply" title="Mỗi dòng đã tick có gợi ý → chuyển về hợp đồng ghi trong diễn giải">✔ Sửa theo diễn giải (dòng đã tick)</button></div>
    <div class="tbl" style="max-height:55vh;margin-top:8px"><table id="apdT"><thead><tr><th style="width:28px"><input type="checkbox" id="apdAll"></th><th>Ngày</th><th>Chứng từ</th><th>TK Nợ</th><th>TK Có</th><th>Hợp đồng</th><th>Diễn giải</th><th class=n>Phát sinh Có</th><th class=n>Phát sinh Nợ</th><th class=n title="Số còn treo của khoản phát sinh sau khi trừ các khoản thanh toán / cấn trừ">Còn treo</th><th>Khớp với</th><th>Người nhập</th></tr></thead><tbody>
    ${LN.filter(({i})=>(!APOPEN||(MT.get(i)||{}).left>0.004)&&(!APSGO||SG.has(i))).map(({x,i})=>`<tr data-api="${i}"${(MT.get(i)||{}).left>0.004?' style="background:#FFFAEB"':x.inP?'':' style="color:#98A2B3"'}><td><input type="checkbox" data-apl="${i}"></td><td class=nw>${vn(x.d)}</td><td class=nw>${esc(x.doc)}</td><td>${esc(x.dr)}</td><td>${esc(x.cr)}</td><td style="font-size:12px">${esc(x.c||'')}${x.adj?`<div class=mut style="font-size:10px">gốc: ${esc(x.c0||'(trống)')}</div>`:''}${SG.has(i)?`<div style="font-size:11px;color:#B42318;font-weight:600" title="Diễn giải nhắc tới hợp đồng này">⚠ theo diễn giải: ${esc(SG.get(i))} <button class="btn sm" data-sg1="${i}" style="padding:0 6px;font-size:11px" title="Chuyển dòng này về hợp đồng theo diễn giải">↪ chuyển</button></div>`:''}</td><td><div class=clamp title="${esc(x.ds)}">${esc(x.ds)}</div></td><td class=n>${x.side==='cr'?fmt2(x.a):''}</td><td class=n>${x.side==='dr'?fmt2(x.a):''}</td>${(()=>{const m=MT.get(i);if(!m)return '<td></td><td></td>';return `<td class="n" style="${m.left>0.004?'background:#FEF0C7;font-weight:700;color:#B54708':''}">${m.left>0.004?fmt2(m.left):m.open?'<span class=mut>0</span>':''}</td><td style="font-size:11px">${esc(m.how||'')}</td>`})()}<td style="font-size:12px">${esc(x.u||'')}</td></tr>`).join('')}</tbody></table></div></div>`;
  footSum(pb);
  $('#apOpenOnly').onchange=e=>{APOPEN=e.target.checked;apDetail(bp,keep,onlyC,mode)};
  pb.querySelectorAll('[data-apcc]').forEach(tr=>tr.ondblclick=e=>apDetail(bp,keep,tr.dataset.apcc,(e.target.closest('[data-apm]')||{dataset:{}}).dataset.apm||''));const ac=$('#apdAllC');if(ac)ac.onclick=()=>apDetail(bp,keep);
  const T=$('#apdT tbody'),cnt=()=>{$('#apdSel').textContent=sel.size?`Đã chọn ${num(sel.size)} dòng`:'Chưa chọn dòng'};
  T.addEventListener('change',e=>{const i=e.target.dataset.apl;if(i==null)return;const id=d.lines[+i].id;e.target.checked?sel.add(id):sel.delete(id);cnt()});
  $('#apdAll').onchange=e=>{T.querySelectorAll('[data-apl]').forEach(x=>{if(x.closest('tr').style.display==='none')return;x.checked=e.target.checked;const id=d.lines[+x.dataset.apl].id;x.checked?sel.add(id):sel.delete(id)});cnt()};
  T.ondblclick=e=>{if(e.target.closest('input'))return;const tr=e.target.closest('[data-api]');if(tr)showDetail(null,d.lines[+tr.dataset.api].id)};
  $('#apSgOnly').onchange=e=>{APSGO=e.target.checked;apDetail(bp,keep,onlyC,mode)};
  T.addEventListener('click',async e=>{const b=e.target.closest('[data-sg1]');if(!b)return;e.stopPropagation();const i=+b.dataset.sg1;await aq('apSetContract',[d.lines[i].id],SG.get(i));chg=true;b.closest('tr').style.opacity='.45';b.outerHTML='<span style="color:#079455">✓ đã chuyển</span>'});
  $('#apdSgTick').onclick=()=>{T.querySelectorAll('[data-apl]').forEach(x=>{const i=+x.dataset.apl;if(SG.has(i)&&x.closest('tr').style.display!=='none'){x.checked=true;sel.add(d.lines[i].id)}});cnt()};
  $('#apdSgApply').onclick=async()=>{const G=new Map();d.lines.forEach((x,i)=>{if(sel.has(x.id)&&SG.has(i)){const c=SG.get(i);(G.get(c)||G.set(c,[]).get(c)).push(x.id)}});const n=[...G.values()].reduce((q,a)=>q+a.length,0);
    if(!n)return alert('Chưa tick dòng nào có gợi ý theo diễn giải (bấm “☑ Tick dòng lệch diễn giải”)');if(!await ask(`Sửa ${n} dòng về hợp đồng ghi trong diễn giải?\n`+[...G].map(([c,a])=>`• ${c}: ${a.length} dòng`).join('\n')))return;
    for(const [c,ids] of G)await aq('apSetContract',[...new Set(ids)],c);chg=true;apDetail(bp,keep,onlyC,mode)};
  $('#apdSave').onclick=async()=>{if(!sel.size)return alert('Tick chọn dòng cần sửa hợp đồng');const nv=$('#apdNew').value.trim(),v=nv||$('#apdTo').value;if(!v)return alert('Chọn hoặc nhập hợp đồng đúng');
    if(!await ask(v==='__ORIG__'?`Trả ${sel.size} dòng về hợp đồng gốc?`:`Chuyển ${sel.size} dòng sang hợp đồng "${v}"?`))return;await aq('apSetContract',[...sel],v==='__ORIG__'?'':v);chg=true;apDetail(bp,keep,onlyC,mode)};
  $('#apiStS').onclick=async()=>{await aq('apSetStatus',[bp],$('#apiSt').value,$('#apiStN').value,APF.to);chg=true;$('#apiStS').textContent='✓ Đã lưu'};
  $('#apiS').onclick=async()=>{await aq('apSetPartner',bp,{name:$('#apiN').value,contact:$('#apiC').value,email:$('#apiE').value,tel:$('#apiT').value});chg=true;$('#apiS').textContent='✓ Đã lưu'};
  const sa=$('#apShowAll');if(sa)sa.onclick=e=>{e.preventDefault();apDetail(bp,true)};const so=$('#apShowOpen');if(so)so.onclick=e=>{e.preventDefault();apDetail(bp,false)}}

function apStBadge(i,prev){const pv=prev&&!i?`<div class=mut style="font-size:10px">${ymLbl(prev.ym)}: ${prev.status==='ok'?'✅ đã khớp':'❌ chưa khớp'}</div>`:'';if(!i||!i.status)return '<span class=mut style="font-size:12px">chưa đối chiếu</span>'+pv;const ok=i.status==='ok';return `<span class="badge ${ok?'s-fixed':'b-H'}" title="${esc((i.note||'')+(i.at?' · cập nhật '+i.at:''))}">${ok?'✅ Đã khớp':'❌ Chưa khớp'}</span>${i.note?`<div class=mut style="font-size:11px;max-width:220px;white-space:normal">${esc(i.note)}</div>`:''}`}

/* v4.63.0: xác định khoản còn treo theo hợp đồng: (1) thanh toán khớp đúng số tiền, (2) diễn giải tham chiếu (số hoá đơn / chứng từ / mã chung), (3) FIFO */
let APOPEN=false,APSGO=false;
function apMatch(lines){const R=new Map(),G=new Map();lines.forEach((x,i)=>{const k=x.c||'';(G.get(k)||G.set(k,[]).get(k)).push(i)});
  const tok=t=>new Set((String(t||'').toUpperCase().match(/[A-Z0-9][A-Z0-9\/\-_.]{4,}/g)||[]).filter(w=>/\d/.test(w)&&w.replace(/\D/g,'').length>=3));
  for(const [c,I] of G){const bal=I.reduce((q,i)=>q+(lines[i].side==='cr'?lines[i].a:-lines[i].a),0),incSide=bal>=0?'cr':'dr';
    const inc=I.filter(i=>lines[i].side===incSide).map(i=>({i,left:lines[i].a})),dec=I.filter(i=>lines[i].side!==incSide).map(i=>({i,left:lines[i].a,how:[]})),cT=tok(c);
    inc.sort((a,b)=>lines[a.i].d.localeCompare(lines[b.i].d)||a.i-b.i);dec.sort((a,b)=>lines[a.i].d.localeCompare(lines[b.i].d)||a.i-b.i);
    const take=(u,v,how)=>{const q=Math.min(u.left,v.left);if(q<=0.004)return;u.left-=q;v.left-=q;(u.how=u.how||[]).push(how+' '+lines[v.i].doc);v.how.push(how+' '+lines[u.i].doc)};
    // 1) khớp đúng số tiền (ưu tiên khoản phát sinh gần nhất trước ngày thanh toán)
    for(const v of dec){const cand=inc.filter(u=>Math.abs(u.left-v.left)<0.005&&Math.abs(u.left-lines[u.i].a)<0.005);if(!cand.length)continue;const before=cand.filter(u=>lines[u.i].d<=lines[v.i].d);take((before.length?before[before.length-1]:cand[0]),v,'= số tiền')}
    // 2) theo diễn giải: chứng từ / số hóa đơn / mã tham chiếu chung (bỏ mã hợp đồng)
    const T=new Map(inc.map(u=>{const x=lines[u.i],t=tok(x.ds);for(const w of cT)t.delete(w);if(x.inv)t.add(String(x.inv).toUpperCase());return [u,t]}));
    for(const v of dec){if(v.left<=0.004)continue;const x=lines[v.i],D=String(x.ds||'').toUpperCase(),tv=tok(x.ds);for(const w of cT)tv.delete(w);
      for(const u of inc){if(u.left<=0.004||v.left<=0.004)break;const y=lines[u.i],hit=(y.doc&&D.includes(String(y.doc).toUpperCase()))||(y.inv&&D.includes(String(y.inv).toUpperCase()))||[...T.get(u)].some(w=>tv.has(w));if(hit)take(u,v,'diễn giải')}}
    // 3) FIFO
    for(const v of dec)for(const u of inc){if(v.left<=0.004)break;if(u.left>0.004)take(u,v,'FIFO')}
    for(const u of inc)R.set(u.i,{open:true,left:u.left,how:[...new Set((u.how||[]).map(h=>h.split(' ')[0]==='='?'= số tiền':h.startsWith('diễn')?'diễn giải':'FIFO'))].join(', ')+(u.how&&u.how.length?' · '+u.how.slice(0,2).map(h=>h.split(' ').pop()).join(', ')+(u.how.length>2?'…':''):'')});
    for(const v of dec)R.set(v.i,{open:false,left:0,how:v.how.length?'trừ: '+v.how.slice(0,2).map(h=>h.split(' ').pop()).join(', ')+(v.how.length>2?'…':''):(v.left>0.004?'chưa trừ '+fmt2(v.left):'')})}
  return R}

/* v4.64.0: gợi ý hợp đồng theo diễn giải – diễn giải có số hợp đồng (trong danh sách hợp đồng của đối tượng) khác với hợp đồng đang chọn */
function apSuggest(lines,allC){const nz=t=>String(t||'').toUpperCase().replace(/^NO[.:\s]*/,'').replace(/[\s.]+/g,''),core=c=>{const t=String(c||'').trim(),h=t.length>>1;return t.length%2===1&&t[h]==='_'&&t.slice(0,h).trim()===t.slice(h+1).trim()?t.slice(0,h):t.split('_')[0]};
  const C=[...new Set(allC||[])].map(c=>({c,k:nz(core(c))})).filter(o=>o.k.length>=6&&/\d/.test(o.k)).sort((a,b)=>b.k.length-a.k.length),R=new Map();
  lines.forEach((x,i)=>{const D=nz(x.ds),cur=nz(core(x.c));if(!D)return;const hit=C.find(o=>D.includes(o.k));if(hit&&hit.k!==cur&&!(cur&&cur.includes(hit.k)))R.set(i,hit.c)});return R}

/* ===== v4.67.0: Phân tích sổ chi tiết (ledger) theo tài khoản × đối tượng ===== */
const LGF=Object.assign({from:'',to:'',acc:'',bp:'',st:'',how:'',re:false,grp:true,sort:'date'},ls.get('lgPick',{}));let LGP={acc:null,list:[]},LGR=null;
const LGST={ok:['Khớp','s-fixed'],check:['Cần phân tích','b-M'],open:['Chưa khớp','b-H']};
async function vLG(){const H=$('#lgBody');if(!LGF.to){const t=new Date();LGF.to=t.toISOString().slice(0,10)}if(!LGF.from)LGF.from=LGF.to.slice(0,4)+'-01-01';
  if(LGF.acc&&LGP.acc!==LGF.acc){LGP={acc:LGF.acc,list:await aq('lgPartners',LGF.acc)}}
  const RUNS=await aq('lgRuns'),RB=new Map(RUNS.filter(x=>x.acc===LGF.acc).map(x=>[x.bp,x]));
  const P=LGP.list;H.innerHTML=`<div class="card"><div class="subbar"><span class="crumb">Phân tích sổ chi tiết (ledger)</span><span class="hint">Mỗi dòng = một vế trên tài khoản đã chọn (Nợ +, Có −). Tự khớp theo thứ tự: cùng chứng từ = 0 → cặp đúng số tiền → tổng chứng từ ↔ chứng từ ngược chiều → nhóm tham chiếu / cùng diễn giải = 0 → còn lại bù trừ FIFO (“cần phân tích”) hoặc còn treo (“chưa khớp”). Kết quả và ghi chú tự lưu – lần sau chỉ phân tích dòng mới / chưa khớp.</span></div>
   <div class="filterrow"><label>Từ ngày <input type="date" id="lgF" value="${LGF.from}"></label><label>Đến ngày <input type="date" id="lgT" value="${LGF.to}"></label>
    <label>Tài khoản <input id="lgA" value="${esc(LGF.acc)}" placeholder="vd 33888, 1388, 331…" style="width:140px"></label>
    <label>Đối tượng <select id="lgP" class="srch" style="max-width:420px"><option value="">— chọn đối tượng (${num(P.length)}) —</option><option value="*" ${LGF.bp==='*'?'selected':''}>(Tất cả đối tượng)</option>${P.map(p=>`<option value="${esc(p.bp)}" ${p.bp===LGF.bp?'selected':''}>${RB.has(p.bp)?'✓ ':''}${esc(p.bp||'(không có đối tượng)')} · ${num(p.n)} dòng · dư ${fmt2(p.bal)}${RB.has(p.bp)?' · đã phân tích '+RB.get(p.bp).at.slice(0,10):''}</option>`).join('')}</select></label>
    <label title="Phân tích lại cả các dòng đã khớp tự động (giữ dòng sửa tay)"><input type="checkbox" id="lgRe"> Phân tích lại từ đầu</label><button class="btn sm primary" id="lgGo">Phân tích</button></div></div>
   ${RUNS.length?`<details class="card" id="lgRunsBox"${LGR?'':' open'}><summary style="cursor:pointer;font-weight:600">📚 Đã phân tích (${num(RUNS.length)} tài khoản × đối tượng) – bấm một dòng để mở lại kết quả đã lưu</summary>
    <div class="tbl" style="max-height:300px;margin-top:8px"><table id="lgRunT"><thead><tr><th>Tài khoản</th><th>Đối tượng</th><th>Lần cuối</th><th>Kỳ</th><th class=n>Số dòng</th><th class=n>Khớp</th><th class=n>Cần phân tích</th><th class=n>Chưa khớp</th><th class=n>Còn treo</th><th class=n>Số dư</th><th>Tiến độ</th></tr></thead><tbody>
    ${RUNS.map((x,i)=>{const pc=x.n?Math.round(x.n_ok/x.n*100):0;return `<tr class=dbl data-lgrun="${i}" title="Mở lại kết quả"><td><b>${esc(x.acc)}</b></td><td style="font-size:12px">${esc(x.bp==='*'?'(Tất cả đối tượng)':x.bp)}</td><td class=nw>${esc(x.at)}</td><td class=nw style="font-size:12px">${vn(x.from_d)} – ${vn(x.to_d)}</td><td class=n>${num(x.n)}</td><td class=n>${num(x.n_ok)}</td><td class=n>${num(x.n_check)}</td><td class="n ${x.n_open?'neg':''}">${num(x.n_open)}</td><td class=n>${fmt2(x.open_amt)}</td><td class=n>${fmt2(x.close)}</td><td><div style="background:#F2F4F7;border-radius:4px;width:90px;height:8px"><div style="background:${pc===100?'#17B26A':'#FA4700'};width:${pc}%;height:8px;border-radius:4px"></div></div><span class=mut style="font-size:10px">${pc}% khớp</span></td></tr>`}).join('')}</tbody></table></div></details>`:''}
   <div id="lgRes"></div>`;
  const rt=$('#lgRunT');if(rt)rt.onclick=e=>{const tr=e.target.closest('[data-lgrun]');if(!tr)return;const x=RUNS[+tr.dataset.lgrun];Object.assign(LGF,{acc:x.acc,bp:x.bp,from:x.from_d,to:x.to_d});ls.set('lgPick',LGF);LGR=null;vLG().then(()=>lgRun(false))};
  const rd=()=>{LGF.from=$('#lgF').value;LGF.to=$('#lgT').value;LGF.acc=$('#lgA').value.trim();LGF.bp=$('#lgP').value;ls.set('lgPick',LGF)};
  $('#lgA').onkeydown=e=>{if(e.key==='Enter'){rd();LGF.bp='';vLG()}};$('#lgA').onchange=()=>{rd();LGF.bp='';vLG()};
  $('#lgGo').onclick=()=>{rd();if(!LGF.acc)return alert('Nhập tài khoản cần phân tích');if(!LGF.bp)return alert('Chọn đối tượng cần phân tích');lgRun($('#lgRe').checked)};
  if(LGF.acc&&LGF.bp&&LGR&&LGR.acc===LGF.acc&&LGR.bp===LGF.bp)lgDraw()}
async function lgRun(re){$('#lgRes').innerHTML='<div class="card"><span class="spin"></span> Đang phân tích…</div>';try{LGR=await aq('lgReport',{acc:LGF.acc,bp:LGF.bp,from:LGF.from,to:LGF.to,reanalyze:!!re});lgDraw()}catch(e){$('#lgRes').innerHTML=`<div class="card neg">${esc(e.message)}</div>`}}
function lgDraw(){const r=LGR,F=LGF,HW=[...new Set(r.rows.map(x=>x.how).filter(Boolean))].sort(),R=r.rows.filter(x=>(!x.outP||F.st==='ok')&&(!F.st||x.status===F.st||(F.st==='notok'&&x.status!=='ok')||(F.st==='manual'&&x.manual)||(F.st==='note'&&x.note))&&(!F.how||x.how===F.how)),lim=20000,all=F.bp==='*',CN=k=>r.rows.filter(x=>!x.outP).filter(x=>k==='manual'?x.manual:k==='note'?!!x.note:k==='notok'?x.status!=='ok':!k||x.status===k).length;
  $('#lgRes').innerHTML=`<div class="kpis">${kpi('','wallet','Đầu kỳ',fmt2(r.open),`${vn(r.from)}`)}${kpi('blue','trend','Phát sinh Nợ / Có',fmt2(r.dr)+' / '+fmt2(r.cr))}${kpi('','wallet','Cuối kỳ (Nợ − Có)',fmt2(r.close))}${kpi(r.n.open?'red':'green','alert','Chưa khớp',num(r.n.open)+' dòng',`còn treo ${fmt2(r.sum.open)} · cần phân tích ${num(r.n.check)} · khớp ${num(r.n.ok)}`)}</div>
   <div class="card"><div class="card-h"><h3>Sổ chi tiết ${esc(r.acc)} · ${esc(all?'tất cả đối tượng':r.bp)} (${num(R.length)} dòng)</h3><span class="hint">đã phân tích mới ${num(r.analyzed)} / ${num(r.total)} dòng (còn lại dùng kết quả đã lưu)</span>${(()=>{const ok=r.rows.filter(x=>x.status==='ok'&&!x.outP),d=ok.reduce((q,x)=>q+x.v,0),out=ok.filter(x=>x.gout).reduce((q,x)=>q+x.v,0),mb=ok.filter(x=>!x.gout&&Math.abs(x.gbal||0)>0.005).reduce((q,x)=>q+x.v,0);return `<span class="hint" style="margin-left:8px">Khớp trong kỳ: Nợ − Có = <b class="${Math.abs(d)>0.005?'neg':''}">${fmt2(d)}</b>${Math.abs(d)>0.005?` (đối ứng ngoài kỳ ${fmt2(out)} – bộ lọc ✅ Khớp hiện kèm các dòng đối ứng trước kỳ (chữ xám) nên tổng cân · nhóm khớp tay chưa cân ${fmt2(mb)})`:' ✅'}${r.reset?` · đã phân tích lại ${num(r.reset)} nhóm khớp cũ bị lệch`:''}</span>`})()}</div>
    <div class="filterrow"><div class="row" style="gap:6px;flex-wrap:wrap">${[['','Tất cả'],['notok','Chưa xong'],['open','❌ Chưa khớp'],['check','⚠ Cần phân tích'],['ok','✅ Khớp'],['manual','✎ Sửa tay'],['note','📝 Có ghi chú']].map(([v,l])=>`<button class="btn sm ${F.st===v?'primary':''}" data-lgst="${v}">${l} (${num(CN(v))})</button>`).join('')}</div>
     <label><input type="checkbox" id="lgGrp" ${F.grp?'checked':''}> Gom theo chứng từ</label><label>Sắp xếp <select id="lgSort"><option value="date">Theo ngày</option><option value="amt" ${F.sort==='amt'?'selected':''}>Theo |số tiền| (âm / dương cùng giá trị cạnh nhau)</option><option value="grp" ${F.sort==='grp'?'selected':''}>Theo nhóm khớp (các dòng khớp với nhau nằm cạnh nhau, tô màu)</option></select></label><label>Cách khớp <select id="lgH"><option value="">Tất cả</option>${HW.map(h=>`<option value="${esc(h)}" ${F.how===h?'selected':''}>${esc(h)} (${num(r.rows.filter(x=>x.how===h).length)})</option>`).join('')}</select></label>
     <span class="mut" id="lgSel">Chưa chọn</span><select id="lgSet"><option value="">— đổi tình trạng —</option><option value="ok">Khớp</option><option value="check">Cần phân tích</option><option value="open">Chưa khớp</option><option value="auto">↺ Trả về tự động</option></select><input id="lgN" placeholder="Ghi chú cho dòng đã chọn" style="width:260px"><button class="btn sm primary" id="lgApply">Lưu cho dòng đã chọn</button>
     <span style="flex:1"></span><button class="btn sm" id="lgX">${ic('download')}Xuất Excel</button></div>
    <div class="tbl" style="max-height:calc(100vh - 380px)"><table id="lgTbl"${F.grp?' data-nosort':''}><thead><tr><th style="width:26px"><input type="checkbox" id="lgAll"></th><th>Số chứng từ</th><th>Ngày</th><th>Diễn giải</th>${all?'<th>Đối tượng</th>':''}<th>TK Nợ</th><th>TK Có</th><th class=n>Số tiền Nợ</th><th class=n>Số tiền Có</th><th class=n>Nợ / Có</th><th>Tình trạng</th><th>Cách khớp / nhóm</th><th>Ghi chú</th></tr></thead><tbody>
    ${lgBody(R,lim,all)}</tbody></table></div></div>`;
  footSum($('#lgRes'));const T=$('#lgTbl tbody'),sel=new Set(),cnt=()=>{const d=[...sel].reduce((q,i)=>q+r.rows[i].v,0);$('#lgSel').innerHTML=sel.size?`Đã chọn ${num(sel.size)} dòng · Nợ − Có = <b class="${Math.abs(d)>0.005?'neg':''}">${fmt2(d)}</b>${Math.abs(d)<=0.005?' ✅ cân':''}`:'Chưa chọn'};
  $('#lgRes').querySelectorAll('[data-lgst]').forEach(b=>b.onclick=()=>{F.st=b.dataset.lgst;if(F.st==='ok'&&F.sort!=='amt')F.sort='grp';ls.set('lgPick',F);lgDraw()});$('#lgH').onchange=e=>{F.how=e.target.value;lgDraw()};$('#lgGrp').onchange=e=>{F.grp=e.target.checked;ls.set('lgPick',F);lgDraw()};$('#lgSort').onchange=e=>{F.sort=e.target.value;ls.set('lgPick',F);lgDraw()};
  T.addEventListener('change',async e=>{const k=e.target.dataset.lgk;if(k!=null){e.target.checked?sel.add(+k):sel.delete(+k);cnt();return}const n=e.target.dataset.lgn;if(n!=null){const x=r.rows[+n];await aq('lgSetLine',[{id:x.id,side:x.side}],'',e.target.value);x.note=e.target.value;e.target.style.background='#ECFDF3'}});
  $('#lgAll').onchange=e=>{T.querySelectorAll('[data-lgk]').forEach(c=>{if(c.closest('tr').style.display==='none')return;c.checked=e.target.checked;e.target.checked?sel.add(+c.dataset.lgk):sel.delete(+c.dataset.lgk)});cnt()};
  T.addEventListener('click',e=>{const a=e.target.closest('[data-lgg]');if(!a)return;e.preventDefault();const q=document.querySelector('#lgRes .tsrch');if(q){q.value=a.dataset.lgg;q.dispatchEvent(new Event('input'))}});
  T.addEventListener('click',e=>{const g=e.target.closest('[data-lgdoc]');if(!g||e.target.closest('input,a'))return;const op=g.classList.toggle('open');g.querySelector('.lgArr').textContent=op?'▾':'▸';T.querySelectorAll(`tr[data-lgpar="${CSS.escape(g.dataset.lgdoc)}"]`).forEach(c=>c.style.display=op?'':'none')});
  T.addEventListener('change',e=>{const d=e.target.dataset.lgdc;if(d==null)return;T.querySelectorAll(`tr[data-lgpar="${CSS.escape(d)}"] [data-lgk]`).forEach(c=>{c.checked=e.target.checked;e.target.checked?sel.add(+c.dataset.lgk):sel.delete(+c.dataset.lgk)});cnt()});
  // đổi tình trạng ngay bằng ô xổ xuống (dòng hoặc cả chứng từ) – lưu tức thì, không vẽ lại bảng
  T.addEventListener('change',async e=>{const el=e.target,v=el.value;let L=null;
    if(el.dataset.lgs!=null)L=[r.rows[+el.dataset.lgs]];else if(el.dataset.lgsd!=null)L=[...T.querySelectorAll(`tr[data-lgpar="${CSS.escape(el.dataset.lgsd)}"]`)].map(tr=>r.rows[+tr.dataset.lg]);if(!L)return;
    e.stopPropagation();if(v==='ok'){const d=L.reduce((q,x)=>q+x.v,0);if(Math.abs(d)>0.005&&!await ask(`Các dòng đánh dấu khớp chưa cân: Nợ − Có = ${fmt2(d)}.\nNên tick cả các dòng đối ứng rồi dùng “Lưu cho dòng đã chọn” để nhóm khớp cân bằng 0.\nVẫn đánh dấu khớp?`)){el.value=L[0].status;lgStColor(el);return}}
    await aq('lgSetLine',L.map(x=>({id:x.id,side:x.side})),v,null);
    const dL=L.reduce((q,x)=>q+x.v,0);for(const x of L){if(v==='auto'){x.manual=false}else{x.status=v;x.manual=true;x.gbal=v==='ok'?dL:0;x.gout=false;x.how='Người dùng đánh dấu'}const tr=T.querySelector(`tr[data-lg="${r.rows.indexOf(x)}"]`);if(tr){const s2=tr.querySelector('[data-lgs]');if(s2&&v!=='auto'){s2.value=v;lgStColor(s2)}tr.style.background=v==='open'?'#FEF3F2':v==='check'?'#FFFAEB':''}}
    lgStColor(el);if(v==='auto')lgRun(false);else{const sc=$('#lgTbl').parentNode.scrollTop,ws=window.scrollY,op=[...T.querySelectorAll('tr.lgGrpRow.open')].map(t=>t.dataset.lgdoc);lgDraw();const T2=$('#lgTbl tbody');op.forEach(d=>{const g=T2.querySelector(`tr[data-lgdoc="${CSS.escape(d)}"]`);if(g)g.click()});$('#lgTbl').parentNode.scrollTop=sc;window.scrollTo(0,ws);return;r.n={ok:r.rows.filter(x=>x.status==='ok').length,open:r.rows.filter(x=>x.status==='open').length,check:r.rows.filter(x=>x.status==='check').length};$('#lgRes').querySelectorAll('[data-lgst]').forEach(b=>{const k=b.dataset.lgst,c=r.rows.filter(x=>k==='manual'?x.manual:k==='note'?!!x.note:k==='notok'?x.status!=='ok':!k||x.status===k).length;b.textContent=b.textContent.replace(/\(\d[\d,]*\)\s*$/,'('+num(c)+')')})}});
  T.ondblclick=e=>{if(e.target.closest('input,a,select'))return;const g=e.target.closest('[data-lgdoc]');if(g){const c=T.querySelector(`tr[data-lgpar="${CSS.escape(g.dataset.lgdoc)}"]`);if(c)showDetail(null,r.rows[+c.dataset.lg].id);return}const tr=e.target.closest('[data-lg]');if(tr)showDetail(null,r.rows[+tr.dataset.lg].id)};
  $('#lgApply').onclick=async()=>{if(!sel.size)return alert('Tick chọn dòng');const st=$('#lgSet').value,n=$('#lgN').value;if(!st&&!n)return alert('Chọn tình trạng hoặc nhập ghi chú');if(st==='ok'){const d=[...sel].reduce((q,i)=>q+r.rows[i].v,0);if(Math.abs(d)>0.005&&!await ask(`Các dòng chọn chưa cân: Nợ − Có = ${fmt2(d)} (khớp phải bằng 0).\nVẫn đánh dấu khớp?`))return}await aq('lgSetLine',[...sel].map(i=>({id:r.rows[i].id,side:r.rows[i].side})),st,n||null);lgRun(false)};
  $('#lgX').onclick=async()=>{try{const f=await api.xlsxSheets(`AccSoft_Ledger_${r.acc}_${String(all?'TatCa':r.bp).replace(/[^\w]+/g,'_').slice(0,40)}_${r.from}_${r.to}.xlsx`,[['Ledger',[{'Số chứng từ':'','Ngày':'','Diễn giải':'SỐ DƯ ĐẦU KỲ',...(all?{'Đối tượng':''}:{}),'TK Nợ':'','TK Có':'','Số tiền Nợ':null,'Số tiền Có':null,'Nợ / Có':r.open,'Tình trạng':'','Nhóm khớp':'','Cách khớp':'','Ghi chú':''}].concat(R.map(x=>({'Số chứng từ':x.doc,'Ngày':x.d,'Diễn giải':x.ds,...(all?{'Đối tượng':x.bp}:{}),'TK Nợ':x.dr,'TK Có':x.cr,'Số tiền Nợ':x.side==='dr'?x.a:null,'Số tiền Có':x.side==='cr'?x.a:null,'Nợ / Có':x.v,'Tình trạng':LGST[x.status][0],'Nhóm khớp':x.grp,'Cách khớp':x.how,'Ghi chú':x.note})))]]);if(f)alert('Đã xuất: '+f)}catch(e){alert(e.message)}}}

/* v4.69: menu nhóm thu gọn / mở; tự mở nhóm chứa trang đang xem; gợi ý dài bấm để xem đủ */
(function(){const K='navClosed',get=()=>{try{return JSON.parse(localStorage.getItem(K)||'[]')}catch{return []}},put=a=>{try{localStorage.setItem(K,JSON.stringify(a))}catch{}};
  const apply=()=>{const C=new Set(get());document.querySelectorAll('#nav .sec[data-g]').forEach(h=>{const g=document.querySelector(`#nav .grp[data-g="${h.dataset.g}"]`),on=g&&g.querySelector('button.on');const c=C.has(h.dataset.g)&&!on;h.classList.toggle('closed',c);if(g)g.classList.toggle('closed',c)})};
  document.addEventListener('click',e=>{const h=e.target.closest('#nav .sec[data-g]');if(h){const C=new Set(get());C.has(h.dataset.g)?C.delete(h.dataset.g):C.add(h.dataset.g);put([...C]);apply();return}
    const t=e.target.closest('.subbar .hint,.card-h .hint,.card-h .dblhint');if(t&&!e.target.closest('a,button,input,select'))t.classList.toggle('open')});
  document.addEventListener('DOMContentLoaded',apply);setTimeout(apply,500);new MutationObserver(apply).observe(document.getElementById('nav')||document.body,{attributes:true,subtree:true,attributeFilter:['class']})})();

/* v4.70: gom theo chứng từ (dòng tổng xổ xuống chi tiết) + sắp xếp theo |số tiền| để khoản âm / dương bằng nhau nằm cạnh nhau */
function lgBody(R,lim,all){const r=LGR,F=LGF,row=(x,child,par)=>{const i=r.rows.indexOf(x);return `<tr data-lg="${r.rows.indexOf(x)}" class="dbl${child?' lgChild':''}${x.outP?' lgOut':''}"${child?` data-lgpar="${esc(par)}" data-nosum="1" style="display:none;${x.status==='open'?'background:#FEF3F2':x.status==='check'?'background:#FFFAEB':''}"`:''}${x.status==='open'?' style="background:#FEF3F2"':x.status==='check'?' style="background:#FFFAEB"':''}><td><input type="checkbox" data-lgk="${r.rows.indexOf(x)}"></td><td class=nw style="${child?'padding-left:22px;color:#667085':''}">${esc(x.doc)}</td><td class=nw>${vn(x.d)}</td><td><div class=clamp title="${esc(x.ds)}">${esc(x.ds)}</div></td>${all?`<td style="font-size:11px">${esc(x.bp)}</td>`:''}<td>${esc(x.dr)}</td><td>${esc(x.cr)}</td><td class=n>${x.side==='dr'?fmt2(x.a):''}</td><td class=n>${x.side==='cr'?fmt2(x.a):''}</td><td class="n ${x.v<0?'neg':''}"><b>${fmt2(x.v)}</b></td><td class=nw>${lgStSel(x.status,`data-lgs="${r.rows.indexOf(x)}"`)}${x.manual?' <span class=mut title="sửa tay">✎</span>':''}</td><td style="font-size:11px">${x.grp?`<a href="#" data-lgg="${esc(x.grp)}">${esc(x.grp)}</a> · `:''}${esc(x.how)}${x.status==='ok'&&Math.abs(x.gbal||0)>0.005?` <span class=neg title="Nhóm khớp này chưa cân Nợ = Có">⚠ nhóm lệch ${fmt2(x.gbal)}</span>`:''}${x.outP?' <span style="color:#667085">· dòng trước kỳ (đối ứng của nhóm khớp)</span>':x.gout?' <span style="color:#B54708" title="Dòng đối ứng nằm ngoài kỳ – xem ở bộ lọc Khớp">↔ đối ứng ngoài kỳ</span>':''}${x.status==='open'&&Math.abs((x.left||0)-x.v)>0.004?` · còn ${fmt2(x.left)}`:''}</td><td><input class="lgNote" data-lgn="${r.rows.indexOf(x)}" value="${esc(x.note)}" style="width:180px;font-size:12px"></td></tr>`};
  const key=v=>[-Math.round(Math.abs(v)*100),v<0?0:1];
  if(F.sort==='grp'){const GI=new Map();for(const x of R){const g=x.grp||('~'+x.id+x.side);const o=GI.get(g)||GI.set(g,{d:x.d,xs:[]}).get(g);o.xs.push(x);if(x.d<o.d)o.d=x.d}
    const PAL=['#FA4700','#1570EF','#17B26A','#9E77ED','#F79009','#06AED4','#EE46BC','#669F2A'],BG=['#FFF6F2','#EFF4FF','#ECFDF3','#F4F3FF','#FFFAEB','#ECFDFF','#FDF2FA','#F3FEE7'];let k=0,out='',n=0;
    for(const [g,o] of [...GI].sort((a,b)=>(a[0].startsWith('~'))-(b[0].startsWith('~'))||a[1].d.localeCompare(b[1].d)||a[0].localeCompare(b[0]))){if(n>lim)break;const real=!g.startsWith('~');
      if(real&&o.xs.length>1){const c=k%PAL.length;k++;const net=o.xs.reduce((q,x)=>q+x.v,0);out+=`<tr data-nosum="1" style="background:${BG[c]}"><td colspan=${all?14:13} style="border-left:4px solid ${PAL[c]};font-size:12px;padding:4px 10px"><b style="color:${PAL[c]}">Nhóm ${esc(g)}</b> · ${o.xs.length} dòng · ${esc(o.xs[0].how||'')} · Nợ − Có = <b class="${Math.abs(net)>0.005?'neg':''}">${fmt2(net)}</b>${Math.abs(net)<=0.005?' ✅':''}</td></tr>`;
        out+=o.xs.sort((a,b)=>a.d.localeCompare(b.d)||a.id-b.id).map(x=>row(x,false).replace('<tr ',`<tr data-gc="${PAL[c]}" style="box-shadow:inset 4px 0 0 ${PAL[c]};background:${BG[c]}" `)).join('')}
      else out+=o.xs.map(x=>row(x,false)).join('');n+=o.xs.length}
    return out}
  if(!F.grp){let L=R.slice();if(F.sort==='amt')L.sort((a,b)=>{const A=key(a.v),B=key(b.v);return A[0]-B[0]||A[1]-B[1]||a.d.localeCompare(b.d)});return L.slice(0,lim).map(x=>row(x,false)).join('')+(R.length>lim?`<tr><td colspan=13 class=mut style="text-align:center">… còn ${num(R.length-lim)} dòng – lọc theo tình trạng để xem</td></tr>`:'')}
  const G=new Map();for(const x of R){const k=x.doc||('#'+x.id);(G.get(k)||G.set(k,[]).get(k)).push(x)}
  let U=[...G].map(([doc,xs])=>{const dr=xs.filter(x=>x.side==='dr').reduce((q,x)=>q+x.a,0),cr=xs.filter(x=>x.side==='cr').reduce((q,x)=>q+x.a,0),last=xs.reduce((a,x)=>x.d>a.d||(x.d===a.d&&x.id>a.id)?x:a,xs[0]),st=xs.some(x=>x.status==='open')?'open':xs.some(x=>x.status==='check')?'check':'ok';
    return {doc,xs,dr,cr,net:dr-cr,d:xs[0].d,last,st,acD:[...new Set(xs.map(x=>x.dr))],acC:[...new Set(xs.map(x=>x.cr))],note:[...new Set(xs.map(x=>x.note).filter(Boolean))].join('; ')}});
  if(F.sort==='amt')U.sort((a,b)=>{const A=key(Math.abs(a.net)>0.004?a.net:a.dr),B=key(Math.abs(b.net)>0.004?b.net:b.dr);return (Math.abs(a.net)<=0.004)-(Math.abs(b.net)<=0.004)||A[0]-B[0]||A[1]-B[1]||a.d.localeCompare(b.d)});
  let n=0,out='';for(const u of U){if(n>lim)break;
    if(u.xs.length===1){out+=row(u.xs[0],false);n++;continue}
    const hw=[...new Set(u.xs.map(x=>x.how))];
    out+=`<tr class="dbl lgGrpRow" data-lgdoc="${esc(u.doc)}" style="font-weight:600;background:${u.st==='open'?'#FEF3F2':u.st==='check'?'#FFFAEB':'#F9FAFB'};cursor:pointer"><td><input type="checkbox" data-lgdc="${esc(u.doc)}"></td><td class=nw><span class="lgArr">▸</span> ${esc(u.doc)} <span class="badge b-L" style="font-size:10px">${u.xs.length} dòng</span></td><td class=nw>${vn(u.d)}${u.last.d!==u.d?' – '+vn(u.last.d):''}</td><td><div class=clamp title="${esc(u.last.ds)}">${esc(u.last.ds)}</div></td>${all?`<td style="font-size:11px">${esc([...new Set(u.xs.map(x=>x.bp))].join(', '))}</td>`:''}<td style="font-size:12px">${esc(u.acD.join(', '))}</td><td style="font-size:12px">${esc(u.acC.join(', '))}</td><td class=n>${u.dr?fmt2(u.dr):''}</td><td class=n>${u.cr?fmt2(u.cr):''}</td><td class="n ${u.net<0?'neg':''}"><b>${fmt2(u.net)}</b></td><td class=nw>${lgStSel(u.st,`data-lgsd="${esc(u.doc)}"`)}</td><td style="font-size:11px">${esc(hw.slice(0,2).join(' · '))}${hw.length>2?'…':''}</td><td style="font-size:12px">${esc(u.note)}</td></tr>`;
    out+=u.xs.map(x=>row(x,true,u.doc)).join('');n+=u.xs.length}
  return out+(n>lim?`<tr><td colspan=13 class=mut style="text-align:center">… còn thêm dòng – lọc theo tình trạng để xem</td></tr>`:'')}

/* v4.71: ô chọn tình trạng ngay trên dòng */
function lgStSel(st,attr){return `<select class="lgStSel" ${attr} style="font-size:12px;padding:2px 22px 2px 8px;height:28px;border-radius:14px;font-weight:600;${lgStCss(st)}" onclick="event.stopPropagation()"><option value="ok" ${st==='ok'?'selected':''}>✅ Khớp</option><option value="check" ${st==='check'?'selected':''}>⚠ Cần phân tích</option><option value="open" ${st==='open'?'selected':''}>❌ Chưa khớp</option><option value="auto">↺ Tự động</option></select>`}
function lgStCss(st){return st==='ok'?'background:#ECFDF3;color:#067647;border-color:#ABEFC6':st==='check'?'background:#FFFAEB;color:#B54708;border-color:#FEDF89':'background:#FEF3F2;color:#B42318;border-color:#FECDCA'}
function lgStColor(el){el.style.cssText=el.style.cssText.replace(/background:[^;]*;color:[^;]*;border-color:[^;]*/,'')+';'+lgStCss(el.value)}
