'use strict';
// Quy tắc kiểm tra lỗi nhập liệu – dùng chung cho tiến trình nạp dữ liệu và giao diện
const fmt=v=>v==null||isNaN(v)?'':Math.round(v).toLocaleString('en-US');
const fmt2=v=>(+v).toLocaleString('en-US',{maximumFractionDigits:2});
const num=v=>{if(v==null||v==='')return null;const n=typeof v==='number'?v:parseFloat(String(v).replace(/,/g,''));return isNaN(n)?null:n};
const code=s=>String(s??'').split('_')[0].trim();
const ym=d=>d?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'):'';
const isRev=a=>/^(511|512|515|711)/.test(a), isExp=a=>/^(6|8)/.test(a)&&!/^911/.test(a);
const isCash=a=>/^(111|112)/.test(a), isPartner=a=>/^(131|331|141|136|336)/.test(a);
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
 {k:'PARTNER_MISSING',s:'H',n:'Công nợ thiếu đối tượng',d:'Dòng ghi TK công nợ (131/331/141/136/336) nhưng không có đối tượng tương ứng.',
  f:r=>(isPartner(r.dr)&&!r.bp)||(isPartner(r.cr)&&!(r.bpCr||r.bp))?'Thiếu Business Partner':false},
 {k:'DUE_BEFORE_DOC',s:'L',n:'Hạn thanh toán trước ngày hạch toán',d:'Due Date sớm hơn Account Date quá 30 ngày – hạch toán chậm hoặc nhập sai hạn.',
  f:r=>r.due&&r.date&&(r.date-r.due)/864e5>30&&`Hạn ${r.due.toLocaleDateString('vi')} – HT ${r.date.toLocaleDateString('vi')}`},
 {k:'WEEKEND',s:'L',n:'Hạch toán ngày nghỉ',d:'Ngày hạch toán là Chủ nhật (trừ cuối tháng).',
  f:r=>r.date&&r.date.getDay()===0&&new Date(r.date.getFullYear(),r.date.getMonth()+1,0).getDate()!==r.date.getDate()&&'Chủ nhật'},
 {k:'CASH_ROUND',s:'L',n:'Chi tiền mặt số tròn lớn',d:'Chi/thu tiền mặt-ngân hàng số tròn ≥ 10.000 – rủi ro tạm ứng/thanh toán không chứng từ.',
  f:r=>(isCash(r.cr)||isCash(r.dr))&&Math.abs(r.amt)>=10000&&r.amt%1000===0&&`${fmt(r.amt)}`},
];
const FIX={
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
 OUTLIER:'Kiểm tra nhầm đơn vị/thừa số 0 so với chứng từ gốc; nếu đúng thì ghi chú lý do số tiền lớn bất thường.',
};
// Quy tắc cần nhìn toàn bộ dữ liệu – được tính bằng SQL trong engine/setrules.js
const SET_RULES=[
 {k:'DUPLICATE',s:'H',n:'Nghi trùng lặp',d:'Cùng đối tượng, tài khoản, số tiền, diễn giải nhưng khác số chứng từ (loại trừ khấu hao/phân bổ).'},
 {k:'OUTLIER',s:'M',n:'Số tiền bất thường',d:'Số tiền lớn hơn 10 lần trung vị của cùng khoản mục chi phí (≥ 10 dòng) – kiểm tra nhầm số 0, nhầm đơn vị.'},
];
const ALL_RULES=[...RULES,...SET_RULES];
const ST={open:'Chưa xử lý',doing:'Đang xử lý',fixed:'Đã khắc phục',ignore:'Không phải lỗi'};
// Áp dụng các quy tắc từng dòng; trả về [{k,s,msg}]
function checkRow(r){
  const out=[];
  for(const ru of RULES){let m;try{m=ru.f(r)}catch(e){m=false}if(m)out.push({k:ru.k,s:ru.s,msg:String(m)})}
  return out;
}
const errKey=(k,r)=>[k,r.doc,r.line,r.dr,r.cr,r.amt].join('|');
const meta=()=>({rules:ALL_RULES.map(({k,s,n,d})=>({k,s,n,d,fix:FIX[k]||''})),status:ST});
module.exports={RULES,SET_RULES,ALL_RULES,FIX,ST,checkRow,errKey,meta,isExp,isRev,code,fmt2};
