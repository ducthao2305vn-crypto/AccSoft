'use strict';
// Quy tắc kiểm tra lỗi nhập liệu – dùng chung cho tiến trình nạp dữ liệu và giao diện
const fmt=v=>v==null||isNaN(v)?'':Math.round(v).toLocaleString('en-US');
const fmt2=v=>(+v).toLocaleString('en-US',{maximumFractionDigits:2});
const num=v=>{if(v==null||v==='')return null;const n=typeof v==='number'?v:parseFloat(String(v).replace(/,/g,''));return isNaN(n)?null:n};
const code=s=>String(s??'').split('_')[0].trim();
const ym=d=>d?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'):'';
// Ngưỡng cảnh báo – người dùng chỉnh trong Cài đặt (lưu trong bảng settings, khoá 'thresholds')
const CFG_DEFAULT={dueBefore:30,cashRound:10000,bigExpense:10000,roundExpense:5000,monthEndLarge:50000,dueLong:365,manualJe:10000,outlierFactor:10,
  advDays:30,accrualDays:90,variancePct:50,varianceMin:1000,recurringShare:75};
const CFG={...CFG_DEFAULT};
function setConfig(c){Object.assign(CFG,CFG_DEFAULT,c||{});for(const k in CFG)CFG[k]=+CFG[k]||CFG_DEFAULT[k];return CFG}
const isOB=r=>r.table==='OPENING_BALANCE'; // dòng số dư đầu kỳ: không rà soát
const isRev=a=>/^(511|512|515|711)/.test(a), isExp=a=>/^(6|8)/.test(a)&&!/^911/.test(a);
const isAuto=r=>/Depreciation|Distribution|CIP/i.test(r.table||''); // bút toán hệ thống tự sinh
const isInv=a=>/^15[1-8]/.test(a)&&!/^154/.test(a); // hàng tồn kho (trừ 154 SXKD dở dang)
const isCash=a=>/^(111|112)/.test(a), isPartner=a=>/^(131|136|1388|141|244|331|336|3388|344)/.test(a);
// dòng tiền: mã ERP "0102_…" → chỉ tiêu B03 (01xx → 0x, 02xx → 2x, 03xx → 3x; 04xx = chuyển tiền nội bộ) – cùng logic báo cáo B03 (engine/fin.js)
const CASH3=a=>/^11[123]/.test(a||''), isCashLine=r=>(CASH3(r.dr)||CASH3(r.cr))&&!(CASH3(r.dr)&&CASH3(r.cr))&&!isOB(r);
const cfCode=cf=>{const m=/^0([1-4])(\d{2})/.exec(String(cf||''));if(!m)return null;if(m[1]==='4')return 'TR';const n=String(+m[2]);return m[1]==='1'?'0'+n:m[1]+n};
const CF_IN=[['31',/^411/],['33',/^34[13]/],['24',/^128|^1288/],['26',/^22[128]/],['22',/^711|^211|^213|^217/],['27',/^515/],['01',/^511|^131|^3331|^3387|^512/],['06',/./]];
const CF_OUT=[['21',/^21[1-7]|^241/],['23',/^128/],['25',/^22[128]/],['32',/^411|^419/],['34',/^341|^343/],['36',/^421/],['03',/^334/],['04',/^635|^3351/],['05',/^3334|^821/],['02',/^331|^15[1-8]|^611|^62[1-7]|^632|^64[12]|^133|^242|^335/],['07',/./]];
const cfCls=(a,T)=>T.find(([,rx])=>rx.test(a||''))[0];
const CF_REC=new Set(['01','06','22','24','26','27','31','33']),CF_PAY=new Set(['02','03','04','05','07','21','23','25','32','34','35','36']);
const CF_ERP={'01':'0101','02':'0102','03':'0103','04':'0104','05':'0105','06':'0106','07':'0107','21':'0201','22':'0202','23':'0203','24':'0204','25':'0205','26':'0206','27':'0207','31':'0301','32':'0302','33':'0303','34':'0304','36':'0306'};
const MONTHS={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
function periodsInText(t){ // trả về danh sách {y,m} được nhắc tới trong diễn giải
  const out=[];t=String(t);
  for(const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g))out.push({y:+m[3],m:+m[2]});
  for(const m of t.matchAll(/\b(?:T|th[aá]ng\s*)?(\d{1,2})[\/.-](20\d{2})\b/gi))if(+m[1]>=1&&+m[1]<=12)out.push({y:+m[2],m:+m[1]});
  for(const m of t.matchAll(/\b([A-Za-z]{3,9})[,.]?\s+(20\d{2})\b/g)){const k=MONTHS[m[1].toLowerCase()];if(k)out.push({y:+m[2],m:k})}
  return out;
}
const RULES=[
 {k:'ACC_INVALID',s:'H',n:'Tài khoản không hợp lệ',d:'Tài khoản Nợ/Có rỗng hoặc mã "000".',
  f:r=>(!r.dr||!r.cr||r.dr==='000'||r.cr==='000')&&`Nợ ${r.dr||'∅'} / Có ${r.cr||'∅'}`},
 {k:'SAME_ACC',s:'L',n:'Nợ và Có cùng tài khoản',d:'Nợ và Có cùng một tài khoản chi tiết. Chấp nhận khi chuyển giữa các tài khoản ngân hàng cùng mã TK; ngoài ra thường do chọn nhầm TK.',
  f:r=>r.dr&&r.dr===r.cr&&r.drName===r.crName&&`TK ${r.drName}`},
 {k:'AMT_ZERO',s:'M',n:'Số tiền bằng 0',d:'Dòng hạch toán số tiền 0.',f:r=>r.amt===0&&'Số tiền = 0'},
 {k:'AMT_NEG',s:'L',n:'Số tiền âm',d:'Ghi âm thay vì đảo Nợ/Có. Chấp nhận được khi điều chỉnh, nhưng cần kiểm tra lý do và phê duyệt.',
  f:r=>r.amt<0&&`Số tiền ${fmt2(r.amt)}`},
 {k:'REV_REVERSED',s:'H',n:'Doanh thu ghi sai chiều',d:'Tài khoản doanh thu nằm bên Nợ (ngoài kết chuyển/giảm trừ) – có thể nhầm chiều hoặc giảm doanh thu không chứng từ.',
  f:r=>isRev(r.dr)&&!/^(911|521|3331)/.test(r.cr)&&r.amt>0&&`Nợ ${r.drName} / Có ${r.crName}`},
 {k:'REV_NO_TYPE',s:'M',n:'Doanh thu thiếu loại doanh thu',d:'Dòng ghi Có TK doanh thu nhưng không chọn "Type of revenue" – báo cáo quản trị theo dịch vụ sẽ sai.',
  f:r=>isRev(r.cr)&&!r.trev&&'Thiếu Type of revenue'},
 {k:'REV_NO_BP',s:'M',n:'Doanh thu thiếu khách hàng',d:'Doanh thu không gắn đối tượng – không đối chiếu được công nợ.',
  f:r=>isRev(r.cr)&&!r.bp&&!r.bpCr&&'Thiếu Business Partner'},
 {k:'EXP_REVERSED',s:'M',n:'Chi phí ghi Có (giảm chi phí)',d:'TK chi phí nằm bên Có không phải kết chuyển/phân bổ – cần chứng từ giảm chi phí.',
  f:r=>isExp(r.cr)&&!/^(911|154|6|241)/.test(r.dr)&&r.amt>0&&`Nợ ${r.drName} / Có ${r.crName}`},
 {k:'EXP_NO_TYPE',s:'M',n:'Chi phí thiếu khoản mục',d:'Dòng ghi Nợ TK chi phí nhưng không chọn "Type of cost".',f:r=>isExp(r.dr)&&!r.tcost&&'Thiếu Type of cost'},
 {k:'DESC_EMPTY',s:'M',n:'Diễn giải trống/quá ngắn',d:'Diễn giải < 10 ký tự hoặc chỉ là số chứng từ – không đủ thông tin để kiểm tra bản chất nghiệp vụ.',
  f:r=>{const t=String(r.desc).trim();return (t.length<10||/^[A-Z0-9\/_.-]+$/i.test(t))&&`"${t}"`}},
 {k:'DESC_MATH',s:'H',n:'Diễn giải tính toán sai',d:'Diễn giải dạng "đơn giá * số lượng = tổng" nhưng phép tính không khớp.',
  f:r=>{const m=String(r.desc).match(/\$?\s*([\d,.]+)\s*(?:\/\s*\w+\s*)?[*x×]\s*([\d,.]+)\s*(?:months?|tháng|m)?\s*=\s*\$?\s*([\d,.]+)/i);
   if(!m)return false;const a=num(m[1]),b=num(m[2]),c=num(m[3]);return a&&b&&c&&Math.abs(a*b-c)>0.01*c&&`${a} × ${b} = ${fmt2(a*b)} ≠ ${fmt2(c)}`}},
 {k:'QTY_PRICE',s:'M',n:'Số lượng × đơn giá ≠ thành tiền',d:'Chênh lệch > 1% giữa Quantity × Unit Price và số tiền hạch toán.',
  f:r=>r.qty&&r.price&&Math.abs(Math.abs(r.qty*r.price)-Math.abs(r.amt))>Math.max(1,0.01*Math.abs(r.amt))&&`${fmt2(r.qty)} × ${fmt2(r.price)} = ${fmt2(r.qty*r.price)} ≠ ${fmt2(r.amt)}`},
 {k:'PREPAID_EXPENSED',s:'H',n:'Chi phí nhiều kỳ ghi thẳng chi phí',d:'Diễn giải cho thấy chi phí cho nhiều tháng tương lai nhưng ghi Nợ thẳng TK chi phí, không qua 242 – sai nguyên tắc phù hợp.',
  f:r=>{if(!isExp(r.dr)||/^24/.test(r.cr)||!r.date)return false;const p=periodsInText(r.desc);if(!p.length)return false;
   const last=Math.max(...p.map(x=>x.y*12+x.m)),cur=r.date.getFullYear()*12+r.date.getMonth()+1;return last-cur>=2&&`Kỳ đến ${(last-1)%12+1}/${Math.floor((last-1)/12)}`}},
 {k:'CUTOFF',s:'M',n:'Sai kỳ (cut-off)',d:'Diễn giải nêu kỳ phát sinh cách kỳ hạch toán từ 2 tháng trở lên (chi phí/doanh thu kỳ trước ghi kỳ này). Loại trừ phân bổ 242/khấu hao.',
  f:r=>{if(!(isExp(r.dr)||isRev(r.cr))||/^(24|214)/.test(r.cr)||!r.date)return false;const p=periodsInText(r.desc);if(!p.length)return false;
   const first=Math.max(...p.map(x=>x.y*12+x.m)),cur=r.date.getFullYear()*12+r.date.getMonth()+1;return cur-first>=2&&`Diễn giải kỳ ${(first-1)%12+1}/${Math.floor((first-1)/12)}, hạch toán ${ym(r.date)}`}},
 {k:'PARTNER_MISSING',s:'H',n:'Công nợ thiếu đối tượng',d:'Dòng ghi TK phải thu / phải trả (131, 136, 1388, 141, 244, 331, 336, 3388, 344) nhưng không có đối tượng (Business Partner) ở đúng vế – không theo dõi, đối chiếu được công nợ.',
  f:r=>isPartner(r.dr)&&!String(r.bp||'').trim()?`Nợ ${r.dr} thiếu Business Partner`:isPartner(r.cr)&&!String(r.bpCr||'').trim()&&!String(r.bp||'').trim()?`Có ${r.cr} thiếu Bpartner credit`:false},
 {k:'DUE_BEFORE_DOC',s:'L',n:'Hạn thanh toán trước ngày hạch toán',d:'Due Date sớm hơn Account Date quá 30 ngày – hạch toán chậm hoặc nhập sai hạn.',
  f:r=>r.due&&r.date&&(r.date-r.due)/864e5>CFG.dueBefore&&`Hạn ${r.due.toLocaleDateString('vi')} – HT ${r.date.toLocaleDateString('vi')}`},
 {k:'WEEKEND',s:'L',n:'Hạch toán ngày nghỉ',d:'Ngày hạch toán là Chủ nhật (trừ cuối tháng).',
  f:r=>r.date&&r.date.getDay()===0&&new Date(r.date.getFullYear(),r.date.getMonth()+1,0).getDate()!==r.date.getDate()&&'Chủ nhật'},
 {k:'CASH_ROUND',s:'L',n:'Chi tiền mặt số tròn lớn',d:'Chi/thu tiền mặt-ngân hàng số tròn ≥ 10.000 – rủi ro tạm ứng/thanh toán không chứng từ.',
  f:r=>(isCash(r.cr)||isCash(r.dr))&&Math.abs(r.amt)>=CFG.cashRound&&r.amt%1000===0&&`${fmt(r.amt)}`},
 // ---- Dòng tiền (Cashflow activities) trên bút toán thu / chi tiền ----
 {k:'CF_MISSING',s:'L',n:'Thu / chi tiền thiếu loại dòng tiền',d:'Bút toán Nợ hoặc Có TK tiền (111, 112, 113) – không phải chuyển tiền nội bộ giữa các TK tiền – nhưng không chọn Cashflow activities. Báo cáo lưu chuyển tiền tệ phải tự đoán theo TK đối ứng.',
  f:r=>isCashLine(r)&&!r._cfAdj&&!String(r.cf||'').trim()&&`${CASH3(r.dr)?'Thu':'Chi'} tiền, đối ứng ${CASH3(r.dr)?r.cr:r.dr} – thiếu Cashflow`},
 {k:'CF_WRONG',s:'M',n:'Chọn sai loại dòng tiền',d:'Loại dòng tiền (Cashflow activities) không khớp bản chất bút toán: mã THU nhưng bút toán CHI tiền (hoặc ngược lại), mã chuyển tiền nội bộ (04xx) cho khoản thu/chi với bên ngoài, hoặc TK đối ứng xác định rõ loại dòng tiền (334 → 0103 trả lương, 3334 → 0105 thuế TNDN, 211/213/241 → 0201 mua TSCĐ, 128 → 0203/0204, 22x → 0205/0206, 515 → 0207, 411 → 0301/0302, 341 → 0303/0304, 421 → 0306, 131/511 → 0101…) mà chọn mã khác.',
  f:r=>{if(!isCashLine(r)||r._cfAdj)return false;const cf=String(r.cf||'').trim();if(!cf)return false;const e=cfCode(cf);if(!e)return false;const rec=CASH3(r.dr),acc=rec?r.cr:r.dr,neg=r.amt<0;
   if(e==='TR')return `Chọn ${cf.slice(0,40)} (chuyển tiền nội bộ) nhưng đối ứng ${acc} không phải TK tiền`;
   if(!neg&&rec&&CF_PAY.has(e))return `Thu tiền (Nợ ${r.dr}) nhưng chọn mã CHI ${cf.slice(0,45)}`;
   if(!neg&&!rec&&CF_REC.has(e))return `Chi tiền (Có ${r.cr}) nhưng chọn mã THU ${cf.slice(0,45)}`;
   const au=rec?cfCls(acc,CF_IN):cfCls(acc,CF_OUT);if(['06','07','02'].includes(au))return false;
   const ok={'01':['01','06'],'21':['21'],'03':['03'],'24':['24','06'],'23':['23','07'],'27':['27','06'],'22':['22','06']}[au]||[au];
   return !ok.includes(e)&&`Chọn ${cf.slice(0,45)} nhưng TK đối ứng ${acc} → nên mã ${CF_ERP[au]||au}`}},
 // ---- Thiếu trường bắt buộc theo nghiệp vụ ----
 {k:'AP3311_NO_CONTRACT',s:'M',n:'Phải trả 3311 thiếu hợp đồng',d:'Dòng ghi TK 3311 (phải trả nhà cung cấp) nhưng không chọn trường Contract – không đối chiếu được công nợ, thanh toán theo hợp đồng.',
  f:r=>(/^3311/.test(r.dr)||/^3311/.test(r.cr))&&!String(r.contract||'').trim()&&'Thiếu Contract'},
 {k:'RENT_NO_SITE',s:'M',n:'Chi phí thuê vị trí thiếu mã vị trí',d:'Chi phí / trả trước thuê vị trí (thuê trạm BTS, phòng máy, mặt bằng, văn phòng, kho, cửa hàng) nhưng không có mã vị trí (BTS Site / Location) – không phân bổ chi phí theo trạm, không đối chiếu hợp đồng thuê.',
  f:r=>{if(!(isExp(r.dr)||/^242/.test(r.dr)))return false;const t=String(r.tcost||'');if(!/rental|thuê|lease|cell site|machine room/i.test(t))return false;return !String(r.bts||'').trim()&&!String(r.location||'').trim()&&'Thiếu BTS Site / Location'}},
 {k:'ASSET_NO_CODE',s:'M',n:'Hạch toán tài sản thiếu mã tài sản',d:'Dòng ghi Nợ/Có TK nguyên giá 211, 213 hoặc Nợ XDCB 241 nhưng không có mã tài sản (Asset) – không theo dõi được từng tài sản, khấu hao và đầu tư. Chỉ kiểm khi file có cột Asset (hoặc đã nạp file bổ sung).',
  f:r=>{if(isAuto(r))return false;if(!(/^21[13]/.test(r.dr)||/^21[13]/.test(r.cr)||/^241/.test(r.dr)))return false;if(!(r._enriched==1||/asset|tài sản/i.test(String(r._schema||''))))return false;return !String(r.asset||'').trim()&&'Thiếu mã tài sản'}},
 {k:'VEHICLE_NO_PLATE',s:'M',n:'Chi phí xe thiếu biển số',d:'Chi phí liên quan đến xe (xăng dầu, sửa chữa, bảo dưỡng, bảo hiểm, đăng kiểm xe…) nhưng không ghi biển số xe – không quản lý được chi phí theo từng xe. Chỉ kiểm khi file có cột biển số (hoặc đã nạp file bổ sung).',
  f:r=>{if(!isExp(r.dr))return false;const t=String(r.tcost||'')+' '+String(r.desc||'');if(!/\b(vehicle|vehicles|car|cars|motorbike|motorcycle|fuel|petrol|gasoline|diesel|xăng|dầu diesel|xe|ô tô|oto|xe máy)\b/i.test(t))return false;
   if(!(r._enriched==1||/plate|biển số|bien so|vehicle/i.test(String(r._schema||''))))return false;return !String(r.plate||'').trim()&&'Thiếu biển số xe'}},
 // ---- Bổ sung v2.3: rà soát nâng cao ----
 {k:'FUTURE_DATE',s:'H',n:'Ngày hạch toán ở tương lai',d:'Ngày hạch toán sau ngày hiện tại – nhập sai năm/tháng hoặc ghi sổ trước khi nghiệp vụ phát sinh.',
  f:r=>r.date&&r.date-Date.now()>864e5&&`Ngày ${r.date.toLocaleDateString('vi')}`},
 {k:'DESC_GENERIC',s:'M',n:'Diễn giải chung chung',d:'Diễn giải chỉ là từ chung (test, payment, thanh toán, chi phí, khác…) – không thể hiện nội dung, đối tượng, kỳ.',
  f:r=>{const t=String(r.desc).trim().toLowerCase();if(t.length<10||/^[a-z0-9\/_.-]+$/i.test(t))return false;return /^(test|abc|x+|n\/?a|none|null|payment|pay|paid|expense|expenses|other|others|misc|thanh to[aá]n|chi ph[ií]|chi|thu|kh[aá]c|t[aạ]m [uứ]ng|advance|transfer|chuy[eể]n kho[aả]n|[.\-_ ]+)$/i.test(t)&&`"${String(r.desc).trim()}"`}},
 {k:'PARTNER_NETTING',s:'L',n:'Bù trừ công nợ giữa hai đối tượng',d:'Nợ và Có cùng nhóm TK công nợ nhưng khác đối tượng – bù trừ/chuyển nợ giữa các đối tượng cần có biên bản ba bên.',
  f:r=>/^(131|331|141|136|336|138|338)/.test(r.dr)&&r.dr.slice(0,3)===r.cr.slice(0,3)&&r.bp&&r.bpCr&&r.bp!==r.bpCr&&`${String(r.bpCr).slice(0,40)} → ${String(r.bp).slice(0,40)}`},
 {k:'ASSET_TO_EXPENSE',s:'M',n:'Ghi giảm TSCĐ vào chi phí',d:'Nợ TK chi phí / Có TK nguyên giá TSCĐ (211, 213) – kiểm tra hồ sơ thanh lý, khấu hao hết, hoặc phân loại nhầm.',
  f:r=>isExp(r.dr)&&/^21[123]/.test(r.cr)&&!/^214/.test(r.cr)&&`Nợ ${r.dr} / Có ${r.crName}`},
 {k:'BIG_NO_REF',s:'M',n:'Chi phí lớn thiếu chứng từ tham chiếu',d:'Chi phí ≥ 10.000 không gắn hợp đồng, hoá đơn hay đề nghị tạm ứng/thanh toán.',
  f:r=>isExp(r.dr)&&r.amt>=CFG.bigExpense&&!r.contract&&!r.inv&&!r.adv&&!/^(214|242|241|154)/.test(r.cr)&&`${fmt2(r.amt)} không có hợp đồng/hoá đơn/đề nghị`},
 {k:'EDITED_BY_OTHER',s:'L',n:'Bút toán bị người khác sửa',d:'Người cập nhật khác người tạo – xác nhận việc sửa đã được phê duyệt.',
  f:r=>r.updUser&&r.user&&r.updUser!==r.user&&`Tạo: ${String(r.user).split('_')[0]} · Sửa: ${String(r.updUser).split('_')[0]}`},
 {k:'ROUND_EXPENSE',s:'L',n:'Chi phí số tròn lớn',d:'Chi phí ≥ 5.000 là số tròn nghìn – thường là ước tính/khoán, cần chứng từ chi tiết.',
  f:r=>isExp(r.dr)&&!isAuto(r)&&r.amt>=CFG.roundExpense&&r.amt%1000===0&&fmt2(r.amt)},
 {k:'MONTH_END_LARGE',s:'L',n:'Bút toán lớn sát cuối tháng',d:'Doanh thu/chi phí ≥ 50.000 ghi trong 2 ngày cuối tháng – rủi ro ghi nhận sai kỳ (cut-off).',
  f:r=>{if(!r.date||isAuto(r)||!(isExp(r.dr)||isRev(r.cr))||Math.abs(r.amt)<CFG.monthEndLarge)return false;const last=new Date(r.date.getFullYear(),r.date.getMonth()+1,0).getDate();return last-r.date.getDate()<2&&`${fmt2(r.amt)} ngày ${r.date.toLocaleDateString('vi')}`}},
 {k:'DUE_LONG',s:'L',n:'Hạn thanh toán quá dài',d:'Hạn thanh toán cách ngày hạch toán hơn 1 năm – kiểm tra nhập sai năm hoặc phân loại nợ dài hạn.',
  f:r=>r.due&&r.date&&(r.due-r.date)/864e5>CFG.dueLong&&`Hạn ${r.due.toLocaleDateString('vi')}`},
 {k:'DEP_MISMATCH',s:'M',n:'Khấu hao sai khoản mục',d:'Ghi Có 214 (hao mòn) nhưng khoản mục không phải khấu hao, hoặc khoản mục khấu hao nhưng không ghi Có 214.',
  f:r=>{if(!isExp(r.dr)||!r.tcost)return false;const dep=/dep\.|depreciation|kh[aấ]u hao|amorti/i.test(r.tcost);
   if(/^214/.test(r.cr)&&!dep)return `Có 214 nhưng khoản mục: ${String(r.tcost).slice(0,50)}`;if(dep&&!/^214/.test(r.cr)&&!/^242/.test(r.cr))return `Khoản mục khấu hao nhưng Có ${r.cr}`;return false}},
 {k:'REV_NO_INVOICE',s:'L',n:'Doanh thu không gắn hoá đơn',d:'Ghi Có TK doanh thu nhưng không có số hoá đơn – kiểm tra đã xuất hoá đơn hay doanh thu ước tính.',
  f:r=>isRev(r.cr)&&r.amt>0&&!r.inv&&'Thiếu Invoice'},
 {k:'MANUAL_JE_LARGE',s:'M',n:'Bút toán thủ công giá trị lớn',d:'Bút toán ghi sổ thủ công (GL Journal) ≥ 10.000 vào doanh thu, chi phí hoặc tiền – đối tượng kiểm toán viên chọn mẫu khi kiểm tra bút toán (journal entry testing).',
  f:r=>/GL_Journal|Journal/i.test(r.table||'')&&Math.abs(r.amt)>=CFG.manualJe&&(isRev(r.dr)||isRev(r.cr)||isExp(r.dr)||isExp(r.cr)||isCash(r.dr)||isCash(r.cr))&&`${fmt2(r.amt)} · Nợ ${r.dr} / Có ${r.cr}`},
 {k:'MANUAL_CASH',s:'H',n:'Bút toán tay (VTLMN) có phát sinh tiền',d:'Chứng từ VTLMN là bút toán tay; thu/chi tiền phải đi qua phân hệ thu chi (phiếu thu, phiếu chi, ngân hàng). Bút toán tay ghi Nợ/Có TK tiền 111, 112, 113 thường là nhân viên điều chỉnh sai.',
  f:r=>/^VTLMN/i.test(r.doc||'')&&(/^11[123]/.test(r.dr||'')||/^11[123]/.test(r.cr||''))&&`${r.doc} · Nợ ${r.drName||r.dr} / Có ${r.crName||r.cr} · ${fmt2(r.amt)}`},
 {k:'INV_NO_PRODUCT',s:'M',n:'Hàng tồn kho thiếu mã hàng',d:'Dòng ghi TK hàng tồn kho (151–158, trừ 154) nhưng không có mã hàng (Product) – không theo dõi được tồn kho và tuổi hàng theo mặt hàng.',
  f:r=>(r._schema>=2||r._enriched)&&(isInv(r.dr)||isInv(r.cr))&&!r.product&&`TK ${isInv(r.dr)?r.dr:r.cr} không có Product`},
];
const FIX={
 CF_MANUAL:'Đã được kế toán điều chỉnh lại loại dòng tiền – nhân viên lưu ý chọn đúng Cashflow activities theo TK đối ứng ở các lần sau.',
 CF_MISSING:'Chọn Cashflow activities cho bút toán thu / chi tiền (hoặc điều chỉnh ở Điều chỉnh dữ liệu → Loại dòng tiền).',
 CF_WRONG:'Chọn lại Cashflow activities đúng bản chất (thu / chi, TK đối ứng) – hoặc điều chỉnh ở Điều chỉnh dữ liệu → Loại dòng tiền.',
 AP3311_NO_CONTRACT:'Bổ sung trường Contract (số hợp đồng / PO) trên dòng 3311 – nhất là bút toán ghi nhận công nợ và thanh toán.',
 RENT_NO_SITE:'Chọn BTS Site (mã trạm) hoặc Location cho dòng chi phí / trả trước thuê vị trí.',
 ASSET_NO_CODE:'Gắn mã tài sản (Asset) khi ghi tăng / giảm nguyên giá và khi tập hợp XDCB 241.',
 VEHICLE_NO_PLATE:'Ghi biển số xe (License Plate) cho chi phí xăng dầu, sửa chữa, bảo dưỡng xe.',
 FUTURE_DATE:'Sửa ngày hạch toán theo ngày chứng từ; nếu nghiệp vụ chưa phát sinh thì huỷ bút toán.',
 DESC_GENERIC:'Viết lại diễn giải: nội dung cụ thể + đối tượng + kỳ + số hợp đồng/chứng từ tham chiếu.',
 PARTNER_NETTING:'Kiểm tra biên bản bù trừ/chuyển nợ có chữ ký các bên; nếu chọn nhầm đối tượng thì sửa lại Business Partner / Bpartner credit.',
 ASSET_TO_EXPENSE:'Đối chiếu hồ sơ thanh lý/nhượng bán TSCĐ; ghi giảm TSCĐ phải đồng thời ghi giảm hao mòn (214) và hạch toán chi phí khác (811) phần giá trị còn lại.',
 BIG_NO_REF:'Bổ sung số hợp đồng, hoá đơn hoặc đề nghị thanh toán vào bút toán; lưu chứng từ gốc kèm phê duyệt.',
 EDITED_BY_OTHER:'Xác nhận lý do chỉnh sửa và người phê duyệt; nếu không có phê duyệt thì báo kế toán trưởng.',
 ROUND_EXPENSE:'Yêu cầu chứng từ chi tiết (hoá đơn, bảng kê); nếu là khoán/ước tính thì cần quyết định phê duyệt và quyết toán sau.',
 MONTH_END_LARGE:'Đối chiếu ngày giao hàng/hoàn thành dịch vụ với kỳ ghi nhận; nếu thuộc kỳ sau thì điều chỉnh hoặc trích trước.',
 DUE_LONG:'Kiểm tra lại hạn thanh toán trên hợp đồng; nợ trên 12 tháng cần phân loại dài hạn khi lập báo cáo.',
 DEP_MISMATCH:'Chọn lại khoản mục chi phí khấu hao đúng nhóm tài sản (Dep.…) hoặc sửa TK đối ứng 214.',
 REV_NO_INVOICE:'Bổ sung số hoá đơn; nếu là doanh thu ước tính (accrual) thì ghi rõ trong diễn giải và đảo khi có hoá đơn.',
 INV_NO_PRODUCT:'Bổ sung mã hàng (Product) cho dòng nhập/xuất kho; chi phí mua hàng (thuế, vận chuyển) cần phân bổ vào đúng mã hàng.',
 INV_NEGATIVE:'Kiểm tra thứ tự nhập – xuất: xuất trước khi nhập, xuất nhầm mã hàng/kho, hoặc thiếu phiếu nhập. Điều chỉnh để tồn kho không âm.',
 MANUAL_CASH:'Kiểm tra lý do ghi bút toán tay vào TK tiền: nếu là thu/chi thực tế thì huỷ bút toán tay và lập lại qua phiếu thu/chi/ngân hàng; nếu điều chỉnh, đối chiếu số dư tiền với sổ phụ ngân hàng / biên bản kiểm quỹ và lưu phê duyệt.',
 MANUAL_JE_LARGE:'Lưu hồ sơ đầy đủ: lý do điều chỉnh, chứng từ gốc, người lập và người phê duyệt; bút toán thủ công lớn nên có phê duyệt của kế toán trưởng.',
 DOC_MULTI_MONTH:'Một chứng từ chỉ nên thuộc một kỳ; tách chứng từ hoặc sửa ngày hạch toán các dòng cho thống nhất.',
 SPLIT_PAYMENT:'Kiểm tra có chia nhỏ khoản chi để né hạn mức phê duyệt không; gộp hồ sơ và xin phê duyệt đúng cấp.',
 RARE_PAIR:'Cặp tài khoản đối ứng hiếm gặp – kiểm tra bản chất nghiệp vụ, có thể chọn nhầm tài khoản.',
 ACC_INVALID:'Chọn lại tài khoản Nợ/Có đúng theo hệ thống tài khoản. Không dùng mã 000; nếu là bút toán tạm thì phải có TK tạm (vd 1388/3388) và kế hoạch kết chuyển.',
 SAME_ACC:'Nếu là chuyển giữa hai tài khoản ngân hàng: kiểm tra đã ghi đúng Bank Account Nợ/Có. Nếu không: sửa lại TK đối ứng đúng bản chất nghiệp vụ.',
 AMT_ZERO:'Xoá dòng số tiền 0 hoặc nhập lại số tiền đúng theo chứng từ gốc.',
 AMT_NEG:'Thay vì ghi số âm, lập bút toán đảo (đổi Nợ/Có) có diễn giải lý do điều chỉnh và tham chiếu chứng từ gốc; lưu phê duyệt.',
 REV_REVERSED:'Doanh thu bị ghi Nợ: nếu là giảm trừ doanh thu thì dùng TK 521 kèm chứng từ (biên bản/HĐ điều chỉnh); nếu nhập nhầm chiều thì đảo Nợ/Có.',
 REV_NO_TYPE:'Bổ sung trường "Type of revenue" đúng loại dịch vụ để báo cáo doanh thu theo dịch vụ chính xác.',
 REV_NO_BP:'Bổ sung khách hàng (Business Partner) để theo dõi công nợ và đối chiếu.',
 EXP_REVERSED:'Chi phí ghi Có: kiểm tra chứng từ giảm chi phí (hoàn tiền, chiết khấu). Nếu là kết chuyển/phân bổ thì đối ứng phải là 154/911/242; nếu nhầm chiều thì đảo lại.',
 EXP_NO_TYPE:'Bổ sung "Type of cost" (khoản mục chi phí) để báo cáo quản trị chi phí đúng.',
 DESC_EMPTY:'Viết diễn giải đủ: nội dung nghiệp vụ + đối tượng + kỳ phát sinh + số chứng từ/hợp đồng tham chiếu.',
 DESC_MATH:'Đối chiếu lại đơn giá × số kỳ với hợp đồng. Sửa diễn giải hoặc số tiền cho khớp; nếu trả tỷ lệ (kỳ lẻ) thì ghi rõ cách tính.',
 QTY_PRICE:'Sửa số lượng/đơn giá hoặc số tiền cho khớp hoá đơn; nếu có thuế/phí/chiết khấu thì tách dòng riêng.',
 PREPAID_EXPENSED:'Chi phí cho nhiều kỳ: hạch toán Nợ 242 khi thanh toán, sau đó phân bổ hằng tháng vào chi phí (Nợ 627/641/642 – Có 242) theo số tháng hưởng lợi.',
 CUTOFF:'Chi phí/doanh thu kỳ trước: lẽ ra phải trích trước (335/338) ở kỳ phát sinh. Bổ sung trích trước cho các kỳ sau, đánh giá ảnh hưởng nếu trọng yếu.',
 PARTNER_MISSING:'Bổ sung đối tượng công nợ (khách hàng/nhà cung cấp/nhân viên) – thiếu đối tượng sẽ làm sai sổ chi tiết và tuổi nợ.',
 DUE_BEFORE_DOC:'Kiểm tra lại hạn thanh toán; nếu hạch toán chậm so với ngày chứng từ thì nhắc bộ phận chuyển chứng từ đúng hạn.',
 WEEKEND:'Xác nhận nghiệp vụ có thực sự phát sinh ngày nghỉ; nếu nhập nhầm ngày thì sửa Account Date.',
 CASH_ROUND:'Kiểm tra chứng từ gốc, phê duyệt và mục đích chi; tạm ứng số tròn lớn phải có kế hoạch quyết toán.',
 DUPLICATE:'So sánh các chứng từ trùng: nếu thanh toán/hạch toán hai lần thì huỷ một chứng từ và thu hồi tiền nếu đã chi.',
 ACCRUAL_NOT_REVERSED:'Đã ghi chi phí thực tế (Nợ 6xx/Có 331…) nhưng chưa huỷ khoản trích trước 335 cùng đối tượng, khoản mục, kỳ dịch vụ → chi phí bị ghi 2 lần. Lập bút toán huỷ trích (Nợ 6xx/Có 335 số âm, hoặc Nợ 335/Có 6xx) đúng số đã trích, hoặc ghi nhận chi phí thực tế qua Nợ 335/Có 331.',
 OUTLIER:'Kiểm tra nhầm đơn vị/thừa số 0 so với chứng từ gốc; nếu đúng thì ghi chú lý do số tiền lớn bất thường.',
};
// Quy tắc cần nhìn toàn bộ dữ liệu – được tính bằng SQL trong engine/setrules.js
const SET_RULES=[
 {k:'CF_MANUAL',s:'M',n:'Chọn sai loại dòng tiền (rà soát thủ công)',d:'Kế toán rà soát và điều chỉnh lại loại dòng tiền (Cashflow activities) của bút toán thu / chi tiền – ghi nhận là lỗi của người nhập để đánh giá. Lỗi được tạo khi điều chỉnh dòng tiền ở Điều chỉnh dữ liệu (tick "Ghi nhận lỗi nhân viên").'},
 {k:'INV_NEGATIVE',s:'H',n:'Xuất kho vượt tồn (âm kho)',d:'Giá trị luỹ kế theo mặt hàng bị âm tại thời điểm xuất – xuất quá số đã nhập. Chỉ xét mặt hàng có chứng từ đầu tiên trong dữ liệu là phiếu nhập từ ngoài kho có số lượng (tránh báo nhầm hàng tồn từ trước kỳ).'},
 {k:'DOC_MULTI_MONTH',s:'M',n:'Chứng từ trải nhiều kỳ',d:'Các dòng của cùng một số chứng từ có ngày hạch toán thuộc các tháng khác nhau.'},
 {k:'SPLIT_PAYMENT',s:'M',n:'Nghi chia nhỏ khoản chi',d:'Cùng đối tượng nhận tiền có từ 3 chứng từ chi tiền mặt/ngân hàng khác nhau trở lên trong cùng một ngày.'},
 {k:'RARE_PAIR',s:'L',n:'Cặp tài khoản đối ứng bất thường',d:'Cặp TK Nợ – Có (cấp 3) chỉ xuất hiện 1–2 lần trong toàn bộ dữ liệu (≥ 1.000 dòng).'},
 {k:'DUPLICATE',s:'H',n:'Nghi trùng lặp',d:'Cùng đối tượng, tài khoản, số tiền, diễn giải nhưng khác số chứng từ (loại trừ khấu hao/phân bổ).'},
 {k:'ACCRUAL_NOT_REVERSED',s:'H',n:'Đã ghi chi phí thực tế nhưng chưa huỷ trích',d:'Có chi phí thực tế (hoá đơn) cho cùng đối tượng × khoản mục × kỳ dịch vụ (đọc từ diễn giải "In April 2026", "tháng 10/2026"…) với khoản trích trước 335, nhưng số trích chưa được huỷ/quyết toán. Mức Cao: khớp đúng kỳ dịch vụ; Trung bình: kỳ suy ra từ tháng hạch toán.'},
 {k:'OUTLIER',s:'M',n:'Số tiền bất thường',d:'Số tiền lớn hơn 10 lần trung vị của cùng khoản mục chi phí (≥ 10 dòng, không tính khấu hao/phân bổ tự động) – kiểm tra nhầm số 0, nhầm đơn vị.'},
];
const ALL_RULES=[...RULES,...SET_RULES];
const ST={open:'Chưa xử lý',doing:'Đang xử lý',fixed:'Đã khắc phục',ignore:'Không phải lỗi'};
// Áp dụng các quy tắc từng dòng; trả về [{k,s,msg}]
function checkRow(r){
  const out=[];
  if(isOB(r))return out;
  for(const ru of RULES){let m;try{m=ru.f(r)}catch(e){m=false}if(m)out.push({k:ru.k,s:ru.s,msg:String(m)})}
  return out;
}
const errKey=(k,r)=>[k,r.doc,r.line,r.dr,r.cr,r.amt].join('|');
// Phân nhóm: 'staff' = sai sót thao tác của nhân viên nhập liệu; 'audit' = dấu hiệu kiểm toán viên thường chọn mẫu / nêu trong thư quản lý
const AUDIT_WHY={
 REV_REVERSED:'Ghi nhận doanh thu là rủi ro gian lận được giả định theo VSA 240 – giảm doanh thu bất thường luôn bị kiểm tra.',
 EXP_REVERSED:'Giảm chi phí không chứng từ làm tăng lợi nhuận – kiểm tra tính hiện hữu và đầy đủ của chi phí.',
 AMT_NEG:'Bút toán âm/điều chỉnh là đối tượng của thủ tục kiểm tra bút toán ghi sổ (VSA 240) – cần lý do và phê duyệt.',
 PREPAID_EXPENSED:'Vi phạm nguyên tắc phù hợp (VAS 01) – chi phí ghi nhận sai kỳ, kiểm toán thường đề nghị điều chỉnh qua 242.',
 CUTOFF:'Kiểm tra tính đúng kỳ (cut-off) là thủ tục bắt buộc với doanh thu và chi phí cuối kỳ.',
 MONTH_END_LARGE:'Bút toán lớn sát kỳ khoá sổ là tiêu chí chọn mẫu kinh điển khi kiểm tra bút toán ghi sổ.',
 DUPLICATE:'Thanh toán/ghi nhận trùng là sai sót trọng yếu dễ phát hiện bằng phân tích dữ liệu – kiểm toán luôn chạy kiểm tra này.',
 OUTLIER:'Giao dịch bất thường so với tổng thể được chọn để kiểm tra chi tiết (VSA 520 – thủ tục phân tích).',
 SPLIT_PAYMENT:'Chia nhỏ khoản chi để né hạn mức phê duyệt là dấu hiệu gian lận/kiểm soát nội bộ yếu.',
 CASH_ROUND:'Chi tiền số tròn lớn là dấu hiệu rủi ro (tạm ứng, chi không chứng từ) – thường được chọn mẫu.',
 ROUND_EXPENSE:'Số tròn gợi ý ước tính/khoán – kiểm toán yêu cầu chứng từ chi tiết.',
 BIG_NO_REF:'Thiếu bằng chứng kiểm toán thích hợp (VSA 500) – chi phí lớn không hợp đồng/hoá đơn có thể bị loại.',
 ASSET_TO_EXPENSE:'Ghi giảm TSCĐ cần hồ sơ thanh lý; sai sót ảnh hưởng cả bảng cân đối và kết quả kinh doanh.',
 PARTNER_NETTING:'Bù trừ công nợ cần biên bản ba bên – kiểm toán đối chiếu khi gửi thư xác nhận công nợ.',
 REV_NO_INVOICE:'Doanh thu không có hoá đơn cần giải trình (ước tính, chưa xuất hoá đơn) – rủi ro ghi nhận doanh thu.',
 RARE_PAIR:'Bút toán với cặp tài khoản bất thường là tiêu chí chọn mẫu khi kiểm tra bút toán ghi sổ (VSA 240).',
 INV_NEGATIVE:'Tồn kho âm cho thấy sai sót ghi nhận nhập – xuất, ảnh hưởng giá vốn và giá trị hàng tồn kho.',
 WEEKEND:'Bút toán ghi vào ngày nghỉ là tiêu chí chọn mẫu khi kiểm tra bút toán ghi sổ.',
 EDITED_BY_OTHER:'Sửa bút toán bởi người khác người lập – kiểm tra kiểm soát phân quyền và phê duyệt.',
 MANUAL_CASH:'Bút toán thủ công vào tài khoản tiền là rủi ro gian lận/sai sót cao (VSA 240) – kiểm toán đối chiếu với sổ phụ ngân hàng và biên bản kiểm quỹ.',
 MANUAL_JE_LARGE:'VSA 240 yêu cầu kiểm toán viên kiểm tra bút toán ghi sổ thủ công, đặc biệt giá trị lớn vào doanh thu/chi phí/tiền.',
 DESC_MATH:'Diễn giải tính sai cho thấy số tiền có thể sai so với hợp đồng – sai sót dễ bị phát hiện khi đối chiếu hồ sơ.',
};
const GROUP=Object.fromEntries(ALL_RULES.map(r=>[r.k,AUDIT_WHY[r.k]?'audit':'staff']));
const GROUPS={staff:'Sai sót nhân viên',audit:'Sai sót dễ bị kiểm toán'};
const meta=()=>({rules:ALL_RULES.map(({k,s,n,d})=>({k,s,n,d,fix:FIX[k]||'',g:GROUP[k],why:AUDIT_WHY[k]||''})),status:ST,groups:GROUPS});
const RULES_VERSION=16; // tăng khi thay đổi quy tắc để ứng dụng tự kiểm tra lại dữ liệu cũ
module.exports={cfSuggest:(dr,cr)=>{const rec=CASH3(dr),au=rec?cfCls(cr,CF_IN):cfCls(dr,CF_OUT);return {b03:au,erp:CF_ERP[au]||'',fixed:!['06','07','02'].includes(au)}},cfCode,CFG,CFG_DEFAULT,setConfig,GROUP,GROUPS,RULES_VERSION,RULES,SET_RULES,ALL_RULES,FIX,ST,checkRow,errKey,meta,isExp,isRev,code,fmt2};
