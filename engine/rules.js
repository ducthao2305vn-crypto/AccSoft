'use strict';
// Quy tắc kiểm tra lỗi nhập liệu – dùng chung cho tiến trình nạp dữ liệu và giao diện
const fmt=v=>v==null||isNaN(v)?'':Math.round(v).toLocaleString('en-US');
const fmt2=v=>(+v).toLocaleString('en-US',{maximumFractionDigits:2});
const num=v=>{if(v==null||v==='')return null;const n=typeof v==='number'?v:parseFloat(String(v).replace(/,/g,''));return isNaN(n)?null:n};
const code=s=>String(s??'').split('_')[0].trim();
const ym=d=>d?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'):'';
const isRev=a=>/^(511|512|515|711)/.test(a), isExp=a=>/^(6|8)/.test(a)&&!/^911/.test(a);
const isAuto=r=>/Depreciation|Distribution|CIP/i.test(r.table||''); // bút toán hệ thống tự sinh
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
  f:r=>isExp(r.dr)&&r.amt>=10000&&!r.contract&&!r.inv&&!r.adv&&!/^(214|242|241|154)/.test(r.cr)&&`${fmt2(r.amt)} không có hợp đồng/hoá đơn/đề nghị`},
 {k:'EDITED_BY_OTHER',s:'L',n:'Bút toán bị người khác sửa',d:'Người cập nhật khác người tạo – xác nhận việc sửa đã được phê duyệt.',
  f:r=>r.updUser&&r.user&&r.updUser!==r.user&&`Tạo: ${String(r.user).split('_')[0]} · Sửa: ${String(r.updUser).split('_')[0]}`},
 {k:'ROUND_EXPENSE',s:'L',n:'Chi phí số tròn lớn',d:'Chi phí ≥ 5.000 là số tròn nghìn – thường là ước tính/khoán, cần chứng từ chi tiết.',
  f:r=>isExp(r.dr)&&!isAuto(r)&&r.amt>=5000&&r.amt%1000===0&&fmt2(r.amt)},
 {k:'MONTH_END_LARGE',s:'L',n:'Bút toán lớn sát cuối tháng',d:'Doanh thu/chi phí ≥ 50.000 ghi trong 2 ngày cuối tháng – rủi ro ghi nhận sai kỳ (cut-off).',
  f:r=>{if(!r.date||isAuto(r)||!(isExp(r.dr)||isRev(r.cr))||Math.abs(r.amt)<50000)return false;const last=new Date(r.date.getFullYear(),r.date.getMonth()+1,0).getDate();return last-r.date.getDate()<2&&`${fmt2(r.amt)} ngày ${r.date.toLocaleDateString('vi')}`}},
 {k:'DUE_LONG',s:'L',n:'Hạn thanh toán quá dài',d:'Hạn thanh toán cách ngày hạch toán hơn 1 năm – kiểm tra nhập sai năm hoặc phân loại nợ dài hạn.',
  f:r=>r.due&&r.date&&(r.due-r.date)/864e5>365&&`Hạn ${r.due.toLocaleDateString('vi')}`},
 {k:'DEP_MISMATCH',s:'M',n:'Khấu hao sai khoản mục',d:'Ghi Có 214 (hao mòn) nhưng khoản mục không phải khấu hao, hoặc khoản mục khấu hao nhưng không ghi Có 214.',
  f:r=>{if(!isExp(r.dr)||!r.tcost)return false;const dep=/dep\.|depreciation|kh[aấ]u hao|amorti/i.test(r.tcost);
   if(/^214/.test(r.cr)&&!dep)return `Có 214 nhưng khoản mục: ${String(r.tcost).slice(0,50)}`;if(dep&&!/^214/.test(r.cr)&&!/^242/.test(r.cr))return `Khoản mục khấu hao nhưng Có ${r.cr}`;return false}},
 {k:'REV_NO_INVOICE',s:'L',n:'Doanh thu không gắn hoá đơn',d:'Ghi Có TK doanh thu nhưng không có số hoá đơn – kiểm tra đã xuất hoá đơn hay doanh thu ước tính.',
  f:r=>isRev(r.cr)&&r.amt>0&&!r.inv&&'Thiếu Invoice'},
];
const FIX={
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
 OUTLIER:'Kiểm tra nhầm đơn vị/thừa số 0 so với chứng từ gốc; nếu đúng thì ghi chú lý do số tiền lớn bất thường.',
};
// Quy tắc cần nhìn toàn bộ dữ liệu – được tính bằng SQL trong engine/setrules.js
const SET_RULES=[
 {k:'DOC_MULTI_MONTH',s:'M',n:'Chứng từ trải nhiều kỳ',d:'Các dòng của cùng một số chứng từ có ngày hạch toán thuộc các tháng khác nhau.'},
 {k:'SPLIT_PAYMENT',s:'M',n:'Nghi chia nhỏ khoản chi',d:'Cùng đối tượng nhận tiền có từ 3 chứng từ chi tiền mặt/ngân hàng khác nhau trở lên trong cùng một ngày.'},
 {k:'RARE_PAIR',s:'L',n:'Cặp tài khoản đối ứng bất thường',d:'Cặp TK Nợ – Có (cấp 3) chỉ xuất hiện 1–2 lần trong toàn bộ dữ liệu (≥ 1.000 dòng).'},
 {k:'DUPLICATE',s:'H',n:'Nghi trùng lặp',d:'Cùng đối tượng, tài khoản, số tiền, diễn giải nhưng khác số chứng từ (loại trừ khấu hao/phân bổ).'},
 {k:'OUTLIER',s:'M',n:'Số tiền bất thường',d:'Số tiền lớn hơn 10 lần trung vị của cùng khoản mục chi phí (≥ 10 dòng, không tính khấu hao/phân bổ tự động) – kiểm tra nhầm số 0, nhầm đơn vị.'},
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
const RULES_VERSION=5; // tăng khi thay đổi quy tắc để ứng dụng tự kiểm tra lại dữ liệu cũ
module.exports={RULES_VERSION,RULES,SET_RULES,ALL_RULES,FIX,ST,checkRow,errKey,meta,isExp,isRev,code,fmt2};
