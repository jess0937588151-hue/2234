/* 中文備註：線上點餐頁邏輯，顧客送單後會等待 POS 確認，確認後才完成訂購。 */
import { state } from '../core/store.js';
import { escapeHtml, id, money } from '../core/utils.js';
import { getRealtimeConfig, pushOnlineOrder, watchCustomerOrder, fetchMenuFromFirebase, startMenuAutoWatch } from '../modules/realtime-order-service.js';

const onlineState = {
  selectedCategory: '全部',
  cart: [],
  currentSelections: {},
  configTarget: null
};

function showOnlineToast(message){
  let toast = document.getElementById('onlineToast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'onlineToast';
    toast.className = 'online-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showOnlineToast._timer);
  showOnlineToast._timer = setTimeout(()=> toast.classList.remove('show'), 1600);
}

function getStoreName(){
  return state.settings?.realtimeOrder?.onlineStoreTitle || state.settings?.printConfig?.storeName || '立即點餐';
}

function getStoreMeta(){
  return state.settings?.realtimeOrder?.onlineStoreSubtitle || '內用 / 外帶皆可';
}

function createConfigState(product){
  const selections = {};
  for(const att of product.modules || []){
    const mod = state.modules.find(m => m.id === att.moduleId);
    if(mod) selections[mod.id] = mod.selection === 'multi' ? [] : null;
  }
  return selections;
}

function flattenSelections(product){
  const rows = [];
  for(const att of product.modules || []){
    const mod = state.modules.find(m => m.id === att.moduleId);
    if(!mod) continue;
    const val = onlineState.currentSelections[mod.id];
    if(Array.isArray(val)){
      val.forEach(idv=>{
        const opt = mod.options.find(o=>o.id===idv);
        if(opt) rows.push({moduleId:mod.id, moduleName:mod.name, optionId:opt.id, optionName:opt.name, price:opt.price});
      });
    }else if(val){
      const opt = mod.options.find(o=>o.id===val);
      if(opt) rows.push({moduleId:mod.id, moduleName:mod.name, optionId:opt.id, optionName:opt.name, price:opt.price});
    }
  }
  return rows;
}

function sameSelections(a=[], b=[]){
  if(a.length !== b.length) return false;
  const format = rows => rows.map(x=>`${x.moduleId}:${x.optionId}`).sort().join('|');
  return format(a) === format(b);
}

function mergeOrPushCartItem(payload){
  const existing = onlineState.cart.find(item =>
    item.productId === payload.productId &&
    String(item.note || '') === String(payload.note || '') &&
    Number(item.basePrice || 0) === Number(payload.basePrice || 0) &&
    Number(item.extraPrice || 0) === Number(payload.extraPrice || 0) &&
    sameSelections(item.selections || [], payload.selections || [])
  );
  if(existing) existing.qty += payload.qty;
  else onlineState.cart.push(payload);
}

function renderCategoryTabs(){
  const wrap = document.getElementById('onlineCategoryTabs');
  const categories = ['全部', ...state.categories.filter(c => c && c !== '全部')];
  wrap.innerHTML = categories.map(c => `<button class="online-category-chip ${onlineState.selectedCategory===c ? 'active' : ''}" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');
  wrap.querySelectorAll('button').forEach(btn=>{
    btn.onclick = ()=>{
      onlineState.selectedCategory = btn.dataset.category;
      renderCategoryTabs();
      renderProducts();
    };
  });
}

function renderProducts(){
  const keyword = document.getElementById('onlineSearchInput').value.trim();
  const grid = document.getElementById('onlineProductGrid');
  const list = [...state.products].sort((a,b)=>a.sortOrder-b.sortOrder).filter(p=>{
    if(p.enabled === false) return false;
    const catOk = onlineState.selectedCategory === '全部' || p.category === onlineState.selectedCategory;
    const kwOk = !keyword || [p.name, p.category, ...(p.aliases||[])].join(' ').includes(keyword);
    return catOk && kwOk;
  });
  if(!list.length){
    grid.innerHTML = '<div class="online-empty card">目前沒有符合的商品</div>';
    return;
  }
  grid.innerHTML = '';
  list.forEach(p=>{
    const moduleNames = (p.modules||[]).map(att=> state.modules.find(m=>m.id===att.moduleId)?.name).filter(Boolean);
    const card = document.createElement('div');
    card.className = 'online-product-card';
        card.innerHTML = `
      ${p.image ? `<div class="online-product-image"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}"></div>` : '<div class="online-product-image"></div>'}
      <div class="online-product-body">
        <div class="online-product-title-row">
          <div class="online-product-name">${escapeHtml(p.name)}</div>
          <div class="online-product-price">${money(p.price)}</div>
        </div>
        ${p.description ? `<div class="online-product-desc">${escapeHtml(p.description)}</div>` : ''}
        <div class="online-product-footer"><button class="primary-btn full">加入購物車</button></div>
      </div>
    `;


    card.querySelector('button').onclick = ()=> openProductConfigForNew(p.id);
    grid.appendChild(card);
  });
}

function updateItemPricePreview(product){
  let add = 0;
  const selections = flattenSelections(product);
  selections.forEach(s=> add += Number(s.price || 0));
  const qty = Math.max(1, Number(document.getElementById('onlineItemQtyInput').value || 1));
  document.getElementById('onlineItemPricePreview').textContent = '小計：' + money((Number(product.price||0) + add) * qty);
}

function renderProductConfig(product){
  document.getElementById('onlineModalTitle').textContent = product.name;
  const imageWrap = document.getElementById('onlineModalImageWrap');
    imageWrap.innerHTML = '';
    imageWrap.classList.add('hidden');

  const wrap = document.getElementById('onlineModalModules');
  wrap.innerHTML = '';
  (product.modules || []).forEach(att=>{
    const mod = state.modules.find(m=>m.id===att.moduleId);
    if(!mod) return;
    const required = att.requiredOverride === null ? mod.required : att.requiredOverride;
    const block = document.createElement('div');
    block.className = 'module-block';
    block.innerHTML = `
      <div class="module-header">
        <div>
          <strong>${escapeHtml(mod.name)}</strong>
          <div class="muted">${required ? '必選' : '非必選'}・${mod.selection === 'multi' ? '多選' : '單選'}</div>
        </div>
      </div>
      <div class="option-list"></div>
    `;
    const list = block.querySelector('.option-list');
    mod.options.filter(o=>o.enabled!==false).forEach(opt=>{
      const active = Array.isArray(onlineState.currentSelections[mod.id])
        ? onlineState.currentSelections[mod.id].includes(opt.id)
        : onlineState.currentSelections[mod.id] === opt.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-chip' + (active ? ' active' : '');
      btn.innerHTML = `<span>${escapeHtml(opt.name)}</span><strong>${opt.price ? '+' + money(opt.price) : money(0)}</strong>`;
      btn.onclick = ()=>{
        if(mod.selection === 'multi'){
          const arr = onlineState.currentSelections[mod.id] || [];
          if(arr.includes(opt.id)) onlineState.currentSelections[mod.id] = arr.filter(x=>x!==opt.id);
          else onlineState.currentSelections[mod.id] = [...arr, opt.id];
        } else {
          onlineState.currentSelections[mod.id] = onlineState.currentSelections[mod.id] === opt.id ? null : opt.id;
        }
        renderProductConfig(product);
      };
      list.appendChild(btn);
    });
    wrap.appendChild(block);
  });
  updateItemPricePreview(product);
}

function openProductConfigForNew(productId){
  const product = state.products.find(p=>p.id===productId && p.enabled!==false);
  if(!product) return;
  onlineState.configTarget = { mode:'new', productId };
  onlineState.currentSelections = createConfigState(product);
  document.getElementById('onlineItemNoteInput').value = '';
  document.getElementById('onlineItemQtyInput').value = 1;
  renderProductConfig(product);
  document.getElementById('onlineProductModal').classList.remove('hidden');
}

function openProductConfigForEdit(rowId){
  const item = onlineState.cart.find(x=>x.rowId===rowId);
  if(!item) return;
  const product = state.products.find(p=>p.id===item.productId && p.enabled!==false);
  if(!product) return;
  onlineState.configTarget = { mode:'edit', rowId, productId:item.productId };
  onlineState.currentSelections = createConfigState(product);
  (item.selections || []).forEach(sel=>{
    if(Array.isArray(onlineState.currentSelections[sel.moduleId])) onlineState.currentSelections[sel.moduleId].push(sel.optionId);
    else onlineState.currentSelections[sel.moduleId] = sel.optionId;
  });
  document.getElementById('onlineItemNoteInput').value = item.note || '';
  document.getElementById('onlineItemQtyInput').value = item.qty || 1;
  renderProductConfig(product);
  document.getElementById('onlineProductModal').classList.remove('hidden');
}

function closeProductConfig(){
  document.getElementById('onlineProductModal').classList.add('hidden');
  onlineState.configTarget = null;
  onlineState.currentSelections = {};
}

function renderCart(){
  const list = document.getElementById('onlineCartList');
  list.innerHTML = '';
  if(!onlineState.cart.length){
    list.innerHTML = '<div class="online-empty">尚未加入商品</div>';
  }else{
    onlineState.cart.forEach(item=>{
      const desc = (item.selections||[]).map(s=> `${s.moduleName}:${s.optionName}`).join(' / ');
      const row = document.createElement('div');
      row.className = 'online-cart-item';
      row.innerHTML = `
        <div class="row between wrap">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            ${desc ? `<div class="muted">${escapeHtml(desc)}</div>` : ''}
            ${item.note ? `<div class="muted">備註：${escapeHtml(item.note)}</div>` : ''}
          </div>
          <strong>${money((item.basePrice + item.extraPrice) * item.qty)}</strong>
        </div>
        <div class="row gap wrap" style="margin-top:10px">
          <button class="secondary-btn small-btn minus-btn">-</button>
          <span>${item.qty}</span>
          <button class="secondary-btn small-btn plus-btn">+</button>
          <button class="secondary-btn small-btn edit-btn">編輯</button>
          <button class="danger-btn small-btn delete-btn">刪除</button>
        </div>
      `;
      row.querySelector('.minus-btn').onclick = ()=>{ item.qty = Math.max(1, item.qty - 1); renderCart(); };
      row.querySelector('.plus-btn').onclick = ()=>{ item.qty += 1; renderCart(); };
      row.querySelector('.edit-btn').onclick = ()=> openProductConfigForEdit(item.rowId);
      row.querySelector('.delete-btn').onclick = ()=>{ onlineState.cart = onlineState.cart.filter(x => x.rowId !== item.rowId); renderCart(); };
      list.appendChild(row);
    });
  }
  const subtotal = onlineState.cart.reduce((s,x)=>s + (x.basePrice + x.extraPrice) * x.qty, 0);
  const totalQty = onlineState.cart.reduce((s,x)=>s + x.qty, 0);
  document.getElementById('onlineSubtotalText').textContent = money(subtotal);
  document.getElementById('onlineTotalQtyText').textContent = String(totalQty);
  document.getElementById('openCartBtn').innerHTML = `購物車 <span id="cartQtyBadge">${totalQty}</span>`;
      updateFloatingCartBadge();

}

function openCartDrawer(){ document.getElementById('onlineCartDrawer').classList.remove('hidden'); }
function closeCartDrawer(){ document.getElementById('onlineCartDrawer').classList.add('hidden'); }

function openStatusOverlay(title, text, closable = false){
  document.getElementById('onlineOrderStatusTitle').textContent = title;
  document.getElementById('onlineOrderStatusText').textContent = text;
  document.getElementById('closeOnlineStatusBtn').classList.toggle('hidden', !closable);
  document.getElementById('onlineOrderStatusOverlay').classList.remove('hidden');
}
function closeStatusOverlay(){ document.getElementById('onlineOrderStatusOverlay').classList.add('hidden'); }

function formatDateTimeText(isoString){
  if(!isoString) return '';
  const date = new Date(isoString);
  if(Number.isNaN(date.getTime())) return String(isoString).replace('T',' ').slice(0,16);
  return date.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function buildConfirmedMessage(remote, orderId){
  const parts = [`訂單編號：${remote.orderNo || orderId}`];
  if(remote.prepTimeMinutes) parts.push(`預估備餐 ${remote.prepTimeMinutes} 分鐘`);
  if(remote.estimatedReadyAt) parts.push(`預計完成時間：${formatDateTimeText(remote.estimatedReadyAt)}`);
  if(remote.replyMessage) parts.push(remote.replyMessage);
  return parts.join('，');
}
// ── 預約功能 ──
const WEEKDAY_MAP = ['sun','mon','tue','wed','thu','fri','sat'];

function getBusinessHoursConfig(){
  const bh = (state.settings && state.settings.businessHours) || {};
  ['mon','tue','wed','thu','fri','sat','sun'].forEach(k => { if(!Array.isArray(bh[k])) bh[k] = []; });
  return bh;
}

function pad2(n){ return String(n).padStart(2,'0'); }

function ceilToQuarter(date){
  // 進到下一個 15 分鐘整點
  const d = new Date(date);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  const next = Math.ceil(m / 15) * 15;
  if(next === m){
    // 已經是 15 分整點，往後一個（避免剛好等於起始時間）
    d.setMinutes(m + 15);
  } else if(next >= 60){
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else {
    d.setMinutes(next);
  }
  return d;
}

function buildReservationSlots(){
  const bh = getBusinessHoursConfig();
  const now = new Date();
  const earliest = new Date(now.getTime() + 60 * 60 * 1000); // +1 小時
  const start = ceilToQuarter(earliest);

  const slots = [];
  for(let dayOffset = 0; dayOffset < 2; dayOffset++){
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const wkKey = WEEKDAY_MAP[day.getDay()];
    const segments = bh[wkKey] || [];
    if(!segments.length) continue; // 公休不顯示

    segments.forEach(seg => {
      const [sH, sM] = seg.start.split(':').map(Number);
      const [eH, eM] = seg.end.split(':').map(Number);
      const segStart = new Date(day);
      segStart.setHours(sH, sM, 0, 0);
      const segEnd = new Date(day);
      segEnd.setHours(eH, eM, 0, 0);
      // 跨日（end < start）
      if(segEnd <= segStart) segEnd.setDate(segEnd.getDate() + 1);

      let cursor = new Date(segStart);
      while(cursor < segEnd){
        if(cursor >= start){
          slots.push(new Date(cursor));
        }
        cursor.setMinutes(cursor.getMinutes() + 15);
      }
    });
  }
  return slots;
}

function formatSlotLabel(date){
  const today = new Date();
  const isToday = date.getFullYear()===today.getFullYear() && date.getMonth()===today.getMonth() && date.getDate()===today.getDate();
  const tmr = new Date(today);
  tmr.setDate(tmr.getDate()+1);
  const isTmr = date.getFullYear()===tmr.getFullYear() && date.getMonth()===tmr.getMonth() && date.getDate()===tmr.getDate();
  const prefix = isToday ? '今天' : (isTmr ? '明天' : `${date.getMonth()+1}/${date.getDate()}`);
  return `${prefix} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function renderReservationSlots(){
  const sel = document.getElementById('onlineReservationSlot');
  if(!sel) return;
  const slots = buildReservationSlots();
  sel.innerHTML = '';
  if(!slots.length){
    sel.innerHTML = '<option value="">目前無可預約時段（公休或已過營業時間）</option>';
    return;
  }
  sel.innerHTML = '<option value="">請選擇時段</option>' + slots.map(d => {
    const iso = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
    return `<option value="${iso}">${formatSlotLabel(d)}</option>`;
  }).join('');
}

function toggleReservationBlock(){
  const type = document.getElementById('onlineOrderType').value;
  const block = document.getElementById('onlineReservationBlock');
  if(!block) return;
  if(type === '預約'){
    block.style.display = 'block';
    renderReservationSlots();
  } else {
    block.style.display = 'none';
  }
}


// ── 預約功能 ──
const WEEKDAY_MAP = ['sun','mon','tue','wed','thu','fri','sat'];

function getBusinessHoursConfig(){
  const bh = (state.settings && state.settings.businessHours) || {};
  ['mon','tue','wed','thu','fri','sat','sun'].forEach(k => { if(!Array.isArray(bh[k])) bh[k] = []; });
  return bh;
}

function pad2(n){ return String(n).padStart(2,'0'); }

function ceilToQuarter(date){
  // 進到下一個 15 分鐘整點
  const d = new Date(date);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  const next = Math.ceil(m / 15) * 15;
  if(next === m){
    // 已經是 15 分整點，往後一個（避免剛好等於起始時間）
    d.setMinutes(m + 15);
  } else if(next >= 60){
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else {
    d.setMinutes(next);
  }
  return d;
}

function buildReservationSlots(){
  const bh = getBusinessHoursConfig();
  const now = new Date();
  const earliest = new Date(now.getTime() + 60 * 60 * 1000); // +1 小時
  const start = ceilToQuarter(earliest);

  const slots = [];
  for(let dayOffset = 0; dayOffset < 2; dayOffset++){
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const wkKey = WEEKDAY_MAP[day.getDay()];
    const segments = bh[wkKey] || [];
    if(!segments.length) continue; // 公休不顯示

    segments.forEach(seg => {
      const [sH, sM] = seg.start.split(':').map(Number);
      const [eH, eM] = seg.end.split(':').map(Number);
      const segStart = new Date(day);
      segStart.setHours(sH, sM, 0, 0);
      const segEnd = new Date(day);
      segEnd.setHours(eH, eM, 0, 0);
      // 跨日（end < start）
      if(segEnd <= segStart) segEnd.setDate(segEnd.getDate() + 1);

      let cursor = new Date(segStart);
      while(cursor < segEnd){
        if(cursor >= start){
          slots.push(new Date(cursor));
        }
        cursor.setMinutes(cursor.getMinutes() + 15);
      }
    });
  }
  return slots;
}

function formatSlotLabel(date){
  const today = new Date();
  const isToday = date.getFullYear()===today.getFullYear() && date.getMonth()===today.getMonth() && date.getDate()===today.getDate();
  const tmr = new Date(today);
  tmr.setDate(tmr.getDate()+1);
  const isTmr = date.getFullYear()===tmr.getFullYear() && date.getMonth()===tmr.getMonth() && date.getDate()===tmr.getDate();
  const prefix = isToday ? '今天' : (isTmr ? '明天' : `${date.getMonth()+1}/${date.getDate()}`);
  return `${prefix} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function renderReservationSlots(){
  const sel = document.getElementById('onlineReservationSlot');
  if(!sel) return;
  const slots = buildReservationSlots();
  sel.innerHTML = '';
  if(!slots.length){
    sel.innerHTML = '<option value="">目前無可預約時段（公休或已過營業時間）</option>';
    return;
  }
  sel.innerHTML = '<option value="">請選擇時段</option>' + slots.map(d => {
    const iso = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
    return `<option value="${iso}">${formatSlotLabel(d)}</option>`;
  }).join('');
}

function toggleReservationBlock(){
  const type = document.getElementById('onlineOrderType').value;
  const block = document.getElementById('onlineReservationBlock');
  if(!block) return;
  if(type === '預約'){
    block.style.display = 'block';
    renderReservationSlots();
  } else {
    block.style.display = 'none';
  }
}


async function init(){
  document.getElementById('onlineStoreName').textContent = getStoreName();
  document.getElementById('onlineStoreMeta').textContent = getStoreMeta();
    try {
    await fetchMenuFromFirebase();
    await startMenuAutoWatch(() => {
      renderCategoryTabs();
      renderProducts();
    });
  } catch(err) {
    console.error('讀取雲端菜單失敗：', err);
  }


  
  renderCategoryTabs();
  renderProducts();
  renderCart();
    const _savedName = localStorage.getItem('online_customer_name') || '';
    const _savedPhone = localStorage.getItem('online_customer_phone') || '';
    const _nameEl = document.getElementById('onlineCustomerName');
    const _phoneEl = document.getElementById('onlineCustomerPhone');
    if(_nameEl && _savedName) _nameEl.value = _savedName;
    if(_phoneEl && _savedPhone) _phoneEl.value = _savedPhone;

      // 浮動購物車按鈕
    let floatBtn = document.getElementById('floatingCartBtn');
    if (!floatBtn) {
      floatBtn = document.createElement('button');
      floatBtn.id = 'floatingCartBtn';
      floatBtn.innerHTML = '🛒<span id="floatingCartBadge" style="display:none;">0</span>';
      floatBtn.onclick = () => {
        const drawer = document.getElementById('onlineCartDrawer');
        if (drawer) drawer.classList.remove('hidden');
      };
      document.body.appendChild(floatBtn);
    }
    updateFloatingCartBadge();
  
  // 訂單類型切換時更新預約區塊
  document.getElementById('onlineOrderType').addEventListener('change', toggleReservationBlock);
  toggleReservationBlock();


  document.getElementById('onlineSearchInput').addEventListener('input', renderProducts);
  document.getElementById('onlineItemQtyInput').addEventListener('input', ()=>{
    const p = state.products.find(x=>x.id===onlineState.configTarget?.productId);
    if(p) updateItemPricePreview(p);
  });

  document.getElementById('openCartBtn').onclick = openCartDrawer;
  document.getElementById('closeCartBtn').onclick = closeCartDrawer;
  document.querySelector('.online-drawer-backdrop').onclick = closeCartDrawer;
  document.getElementById('closeOnlineProductModal').onclick = closeProductConfig;
  document.getElementById('cancelOnlineProductBtn').onclick = closeProductConfig;
  document.querySelector('#onlineProductModal .modal-backdrop').onclick = closeProductConfig;

  document.getElementById('saveOnlineProductBtn').onclick = ()=>{
    const product = state.products.find(p=>p.id===onlineState.configTarget?.productId);
    if(!product) return closeProductConfig();
    for(const att of product.modules || []){
      const mod = state.modules.find(m=>m.id===att.moduleId);
      if(!mod) continue;
      const required = att.requiredOverride === null ? mod.required : att.requiredOverride;
      const val = onlineState.currentSelections[mod.id];
      const missing = Array.isArray(val) ? val.length === 0 : !val;
      if(required && missing) return alert(`請先選擇「${mod.name}」`);
    }
    const selections = flattenSelections(product);
    const extra = selections.reduce((s,x)=>s + Number(x.price||0), 0);
    const payload = {
      rowId: onlineState.configTarget?.mode === 'edit' ? onlineState.configTarget.rowId : id(),
      productId: product.id,
      name: product.name,
      basePrice: Number(product.price||0),
      qty: Math.max(1, Number(document.getElementById('onlineItemQtyInput').value || 1)),
      note: document.getElementById('onlineItemNoteInput').value.trim(),
      selections,
      extraPrice: extra
    };
    if(onlineState.configTarget?.mode === 'edit'){
      const idx = onlineState.cart.findIndex(x=>x.rowId===onlineState.configTarget.rowId);
      if(idx >= 0) onlineState.cart[idx] = payload;
      showOnlineToast('已更新購物車商品');
    }else{
      mergeOrPushCartItem(payload);
      showOnlineToast('已加入購物車');
    }
    closeProductConfig();
    renderCart();
  };

  document.getElementById('submitOnlineOrderBtn').onclick = submitOnlineOrder;
  document.getElementById('closeOnlineStatusBtn').onclick = closeStatusOverlay;
}
function updateFloatingCartBadge() {
  const badge = document.getElementById('floatingCartBadge');
  if (!badge) return;
  const count = onlineState.cart.reduce((s, i) => s + i.qty, 0);
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

init();
