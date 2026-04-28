/* 中文備註：商品管理頁（Batch 06.10/5-fix2 - 適配字串陣列分類 + 名稱模組）。
 * - state.categories 是字串陣列 ["未分類","主餐",...]
 * - state.products[*].modules 是模組「名稱」字串陣列 ["辣度","灑粉"]
 * - state.modules 是物件陣列 [{id,name,options}]
 */
import { state, persistAll } from '../core/store.js';
import { escapeHtml, money } from '../core/utils.js';
import { openCategoryManage } from '../modules/product-category-manager.js';
import { openModuleManage } from '../modules/product-module-manager.js';

function rid(){ return Math.random().toString(36).slice(2,10); }

/* ---- 渲染：分類清單 ---- */
function renderCategoryList(){
  const wrap = document.getElementById('categoryList');
  if (!wrap) return;
  const cats = state.categories || [];
  wrap.innerHTML = cats.length ? cats.map(name => {
    const count = (state.products||[]).filter(p => p.category === name).length;
    return `<div class="card" data-cname="${escapeHtml(name)}">
      <div>
        <div class="card-title">${escapeHtml(name)}</div>
        <div class="card-meta">${count} 項商品</div>
      </div>
      <div class="card-actions"><button class="btn small">設定</button></div>
    </div>`;
  }).join('') : '<div class="muted" style="padding:12px;text-align:center;">尚未建立分類</div>';

  wrap.querySelectorAll('.card').forEach(card=>{
    card.addEventListener('click', ()=>{
      const cname = card.getAttribute('data-cname');
      openCategoryManage(cname);
    });
  });
}

/* ---- 渲染：模組清單 ---- */
function renderModuleLibrary(){
  const wrap = document.getElementById('moduleLibrary');
  if (!wrap) return;
  const mods = state.modules || [];
  wrap.innerHTML = mods.length ? mods.map(m => {
    const cnt = (state.products||[]).filter(p =>
      Array.isArray(p.modules) && p.modules.includes(m.name)
    ).length;
    const ruleTxt = (m.rule === 'multi' || m.multi || m.selection === 'multi') ? '複選' : '單選';
    const reqTxt = m.required ? '・必選' : '';
    return `<div class="card" data-mid="${m.id}">
      <div>
        <div class="card-title">${escapeHtml(m.name)}</div>
        <div class="card-meta">${ruleTxt}${reqTxt}・${(m.options||[]).length} 個子選項・${cnt} 項商品使用</div>
      </div>
      <div class="card-actions"><button class="btn small">設定</button></div>
    </div>`;
  }).join('') : '<div class="muted" style="padding:12px;text-align:center;">尚未建立模組</div>';

  wrap.querySelectorAll('.card').forEach(card=>{
    card.addEventListener('click', ()=>{
      const mid = card.getAttribute('data-mid');
      openModuleManage(mid);
    });
  });
}

/* ---- 渲染：商品列表 ---- */
function renderProductTable(){
  const wrap = document.getElementById('productTable');
  if (!wrap) return;
  const term = (document.getElementById('productSearchTop')?.value || '').trim().toLowerCase();
  const list = (state.products||[]).filter(p => !term || (p.name||'').toLowerCase().includes(term));
  const lbl = document.getElementById('productCountLabel');
  if (lbl) lbl.textContent = `共 ${list.length} 項`;
  wrap.innerHTML = list.length ? list.map(p => {
    // p.modules 是名稱字串陣列
    const modNames = (p.modules||[]).filter(Boolean).join('、') || '—';
    return `<div class="card" data-pid="${p.id}">
      <div style="flex:1">
        <div class="card-title">${escapeHtml(p.name||'(未命名)')} <span class="muted" style="font-weight:400">${money(p.price||0)}</span></div>
        <div class="card-meta">分類：${escapeHtml(p.category||'未分類')}・模組：${escapeHtml(modNames)}</div>
      </div>
      <div class="card-actions">
        <button class="btn small" data-act="edit">編輯</button>
        <button class="btn small danger" data-act="del">刪除</button>
      </div>
    </div>`;
  }).join('') : '<div class="muted" style="padding:12px;text-align:center;">沒有商品</div>';

  wrap.querySelectorAll('.card').forEach(card=>{
    const pid = card.getAttribute('data-pid');
    card.querySelector('[data-act="edit"]')?.addEventListener('click', (e)=>{ e.stopPropagation(); openProductEditor(pid); });
    card.querySelector('[data-act="del"]')?.addEventListener('click', (e)=>{
      e.stopPropagation();
      const p = (state.products||[]).find(x => x.id === pid);
      if (!p) return;
      if (!confirm(`確定刪除商品「${p.name}」？`)) return;
      state.products = state.products.filter(x => x.id !== pid);
      persistAll();
      refreshAll();
    });
  });
}

/* ---- 商品新增/編輯 ---- */
const PRODUCT_MODAL_ID = '__productEditorDynamicModal';
function ensureProductModal(){
  let el = document.getElementById(PRODUCT_MODAL_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = PRODUCT_MODAL_ID;
  el.className = 'dyn-modal-backdrop';
  el.style.display = 'none';
  el.innerHTML = `
    <div class="dyn-modal">
      <div class="dyn-head">
        <h3 id="${PRODUCT_MODAL_ID}_title">商品設定</h3>
        <button class="btn small" data-act="close">✕</button>
      </div>
      <div class="dyn-body">
        <div class="form-row"><label>名稱</label><input class="input" id="${PRODUCT_MODAL_ID}_name"></div>
        <div class="form-row"><label>價格</label><input class="input" type="number" step="1" id="${PRODUCT_MODAL_ID}_price"></div>
        <div class="form-row"><label>分類</label><select id="${PRODUCT_MODAL_ID}_cat"></select></div>
        <div style="margin:10px 0 6px;font-weight:600;">套用模組</div>
        <div id="${PRODUCT_MODAL_ID}_mods"></div>
      </div>
      <div class="dyn-foot">
        <button class="btn" data-act="close">取消</button>
        <button class="btn primary" data-act="save">儲存</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e)=>{
    if (e.target === el){ el.style.display='none'; return; }
    const act = e.target.getAttribute('data-act');
    if (act === 'close') el.style.display='none';
    else if (act === 'save') saveProductEditor();
  });
  return el;
}

let editingPid = null;
function openProductEditor(pid){
  editingPid = pid;
  const el = ensureProductModal();
  const p = pid ? (state.products||[]).find(x=>x.id===pid) : { name:'', price:0, category:'未分類', modules:[] };
  if (!p){ alert('找不到商品'); return; }
  el.querySelector(`#${PRODUCT_MODAL_ID}_title`).textContent = pid ? `編輯：${p.name}` : '新增商品';
  el.querySelector(`#${PRODUCT_MODAL_ID}_name`).value = p.name||'';
  el.querySelector(`#${PRODUCT_MODAL_ID}_price`).value = Number(p.price)||0;
  const catSel = el.querySelector(`#${PRODUCT_MODAL_ID}_cat`);
  catSel.innerHTML = (state.categories||[]).map(name =>
    `<option value="${escapeHtml(name)}" ${name===(p.category||'未分類')?'selected':''}>${escapeHtml(name)}</option>`
  ).join('');
  const modsWrap = el.querySelector(`#${PRODUCT_MODAL_ID}_mods`);
  const cur = new Set(p.modules||[]);  // p.modules 是名稱字串陣列
  modsWrap.innerHTML = (state.modules||[]).map(m =>
    `<label class="product-pick-row"><input type="checkbox" value="${escapeHtml(m.name)}" ${cur.has(m.name)?'checked':''}> ${escapeHtml(m.name)}</label>`
  ).join('') || '<div class="muted">尚未建立模組</div>';
  el.style.display = 'flex';
}

function saveProductEditor(){
  const el = document.getElementById(PRODUCT_MODAL_ID);
  if (!el) return;
  const name = (el.querySelector(`#${PRODUCT_MODAL_ID}_name`).value||'').trim();
  if (!name){ alert('名稱不可空白'); return; }
  const price = Number(el.querySelector(`#${PRODUCT_MODAL_ID}_price`).value)||0;
  const category = el.querySelector(`#${PRODUCT_MODAL_ID}_cat`).value || '未分類';
  // mods 存模組「名稱」字串
  const mods = Array.from(el.querySelectorAll(`#${PRODUCT_MODAL_ID}_mods input:checked`)).map(i=>i.value);
  if (editingPid){
    const p = state.products.find(x=>x.id===editingPid);
    if (p){ p.name=name; p.price=price; p.category=category; p.modules=mods; }
  } else {
    state.products = state.products || [];
    state.products.push({ id: rid(), name, price, category, modules: mods, enabled:true, sortOrder:0, aliases:[], image:'' });
  }
  persistAll();
  el.style.display='none';
  refreshAll();
}

/* ---- 新增分類 / 模組 ---- */
function addCategory(){
  const name = prompt('輸入新分類名稱');
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  if ((state.categories||[]).includes(trimmed)){ alert('已存在相同分類'); return; }
  state.categories = state.categories || [];
  state.categories.push(trimmed);
  persistAll();
  refreshAll();
}
function addModule(){
  const name = prompt('輸入新模組名稱');
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  if ((state.modules||[]).some(m=>m.name===trimmed)){ alert('已存在相同模組'); return; }
  state.modules = state.modules || [];
  const newMod = { id: rid(), name: trimmed, rule:'single', required:false, options:[] };
  state.modules.push(newMod);
  persistAll();
  refreshAll();
  openModuleManage(newMod.id);
}

/* ---- 雲端 / Excel ---- */
function bindExcelButtons(){
  document.getElementById('excelTemplateBtn')?.addEventListener('click', ()=>{
    try { window.downloadExcelTemplate ? window.downloadExcelTemplate() : alert('Excel 模板功能未載入'); }
    catch(e){ alert('下載失敗：'+e.message); }
  });
  document.getElementById('excelImportInput')?.addEventListener('change', (e)=>{
    const f = e.target.files?.[0]; if (!f) return;
    try { window.importExcelFile ? window.importExcelFile(f).then(refreshAll) : alert('Excel 匯入功能未載入'); }
    catch(err){ alert('匯入失敗：'+err.message); }
    e.target.value = '';
  });
  document.getElementById('syncMenuBtn')?.addEventListener('click', ()=>{
    try { window.syncMenuToCloud ? window.syncMenuToCloud() : alert('雲端同步功能未載入'); }
    catch(err){ alert('同步失敗：'+err.message); }
  });
}

/* ---- 共用刷新 ---- */
function refreshAll(){
  renderCategoryList();
  renderModuleLibrary();
  renderProductTable();
  try { window.refreshPublicProducts && window.refreshPublicProducts(); } catch(e){}
}

/* ---- 入口 ---- */
export function initProductsPage(){
  document.getElementById('addCategoryBtn')?.addEventListener('click', addCategory);
  document.getElementById('addModuleBtn')?.addEventListener('click', addModule);
  document.getElementById('addProductBtnTop')?.addEventListener('click', ()=> openProductEditor(null));
  document.getElementById('productSearchTop')?.addEventListener('input', renderProductTable);
  bindExcelButtons();
  refreshAll();
}

export { renderCategoryList, renderModuleLibrary, renderProductTable, refreshAll };

// === 兼容 app.js 舊 import 名稱 ===
export { renderProductTable as renderProductsTable };
export function renderCategoryOptions(){}
export function renderModuleSelect(){}
export function renderProductModulesEditor(){}
export function renderPendingMenuList(){
  const wrap = document.getElementById('pendingMenuList');
  if (wrap) wrap.innerHTML = '';
}

window.refreshProductsPage = refreshAll;
