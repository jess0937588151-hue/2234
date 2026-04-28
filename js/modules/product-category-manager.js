/* 中文備註：分類設定浮窗（v2.1.26）
 * 整合「改名 / 刪除 / 勾選商品」於同一個浮窗。
 * 點分類卡片 → 開浮窗。
 */
import { state, persistAll } from '../core/store.js';
import { escapeHtml, escapeAttr } from '../core/utils.js';

const MODAL_ID = '__categoryManageDynamicModal';

function ensureModal(){
  let modal = document.getElementById(MODAL_ID);
  if(modal) return modal;

  modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
      <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
        <h3 id="__catMgrTitle" style="margin:0;font-size:16px;">分類設定</h3>
        <button id="__catMgrClose" style="background:none;border:none;font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;display:flex;flex-direction:column;gap:10px;">
        <label style="font-size:13px;color:#475569;">分類名稱</label>
        <div style="display:flex;gap:8px;">
          <input id="__catMgrName" style="flex:1;padding:8px;border:1px solid #cbd5e1;border-radius:8px;">
          <button id="__catMgrDelete" style="padding:8px 12px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:8px;cursor:pointer;">刪除分類</button>
        </div>
        <input id="__catMgrSearch" placeholder="🔍 搜尋商品名稱或別名" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px;">
        <div style="display:flex;gap:6px;font-size:12px;color:#64748b;">
          <button id="__catMgrSelectAll" style="padding:4px 8px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer;">全選</button>
          <button id="__catMgrSelectNone" style="padding:4px 8px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer;">全不選</button>
          <span id="__catMgrCheckedCount" style="margin-left:auto;align-self:center;"></span>
        </div>
      </div>
      <div id="__catMgrBody" style="flex:1;overflow:auto;padding:8px 16px;"></div>
      <div style="padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;">
        <button id="__catMgrCancel" style="padding:8px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;">取消</button>
        <button id="__catMgrSave" style="padding:8px 16px;border:none;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer;">儲存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e)=>{ if(e.target === modal) closeCategoryManage(); });
  document.getElementById('__catMgrClose').addEventListener('click', closeCategoryManage);
  document.getElementById('__catMgrCancel').addEventListener('click', closeCategoryManage);
  document.getElementById('__catMgrSearch').addEventListener('input', renderCategoryManage);
  document.getElementById('__catMgrSelectAll').addEventListener('click', ()=>{
    (state.products || []).forEach(p => state.categoryManageDraft.add(p.id));
    renderCategoryManage();
  });
  document.getElementById('__catMgrSelectNone').addEventListener('click', ()=>{
    state.categoryManageDraft.clear();
    renderCategoryManage();
  });
  document.getElementById('__catMgrDelete').addEventListener('click', ()=>{
    const cat = state.categoryManageTarget;
    if(!cat) return;
    if(cat === '未分類'){ alert('「未分類」為系統預設，不可刪除'); return; }
    if(!confirm(`確定刪除分類「${cat}」？\n此分類下的商品會自動歸入「未分類」`)) return;
    state.categories = (state.categories || []).filter(c => c !== cat);
    (state.products || []).forEach(p=>{ if(p.category === cat) p.category = '未分類'; });
    if(state.settings && state.settings.selectedCategory === cat) state.settings.selectedCategory = '全部';
    persistAll();
    if(typeof window.refreshAllViews === 'function') window.refreshAllViews();
    closeCategoryManage();
  });
  document.getElementById('__catMgrSave').addEventListener('click', ()=>{
    saveCategoryManage();
    persistAll();
    if(typeof window.refreshAllViews === 'function') window.refreshAllViews();
  });
  return modal;
}

export function openCategoryManage(category){
  if(!category) return;
  state.categoryManageTarget = category;
  state.categoryManageDraft = new Set(
    (state.products || []).filter(p => p.category === category).map(p => p.id)
  );
  const modal = ensureModal();
  const titleEl = document.getElementById('__catMgrTitle');
  if(titleEl) titleEl.textContent = `分類設定：${category}`;
  const nameEl = document.getElementById('__catMgrName');
  if(nameEl) nameEl.value = category;
  const searchEl = document.getElementById('__catMgrSearch');
  if(searchEl) searchEl.value = '';
  const delBtn = document.getElementById('__catMgrDelete');
  if(delBtn) delBtn.style.display = (category === '未分類') ? 'none' : '';
  modal.style.display = 'flex';
  renderCategoryManage();
}

export function closeCategoryManage(){
  const modal = document.getElementById(MODAL_ID);
  if(modal) modal.style.display = 'none';
  state.categoryManageTarget = null;
}

export function renderCategoryManage(){
  const body = document.getElementById('__catMgrBody');
  if(!body) return;
  if(!state.categoryManageDraft) state.categoryManageDraft = new Set();
  const search = (document.getElementById('__catMgrSearch')?.value || '').trim();
  const list = (state.products || []).filter(p=>{
    if(!search) return true;
    const hay = (p.name || '') + ' ' + (p.aliases || []).join(' ');
    return hay.includes(search);
  });

  const countEl = document.getElementById('__catMgrCheckedCount');
  if(countEl) countEl.textContent = `已選 ${state.categoryManageDraft.size} / ${(state.products || []).length}`;

  if(!list.length){
    body.innerHTML = '<div style="color:#94a3b8;padding:20px;text-align:center;">沒有符合商品</div>';
    return;
  }
  body.innerHTML = list.map(p => `
    <label style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid #f1f5f9;cursor:pointer;">
      <input type="checkbox" data-product-id="${escapeAttr(p.id)}" ${state.categoryManageDraft.has(p.id) ? 'checked' : ''} style="width:18px;height:18px;">
      <div style="flex:1;">
        <div style="font-weight:600;">${escapeHtml(p.name)}</div>
        <div style="font-size:12px;color:#64748b;">$${Number(p.price || 0)} ・ 目前分類：${escapeHtml(p.category || '未分類')}</div>
      </div>
    </label>
  `).join('');
  body.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const pid = chk.dataset.productId;
      if(chk.checked) state.categoryManageDraft.add(pid);
      else state.categoryManageDraft.delete(pid);
      const c = document.getElementById('__catMgrCheckedCount');
      if(c) c.textContent = `已選 ${state.categoryManageDraft.size} / ${(state.products || []).length}`;
    });
  });
}

export function saveCategoryManage(){
  const oldCat = state.categoryManageTarget;
  if(!oldCat) return;
  // 1) 更名
  const newNameRaw = document.getElementById('__catMgrName')?.value || '';
  const newName = newNameRaw.trim();
  let finalCat = oldCat;
  if(newName && newName !== oldCat){
    if(oldCat === '未分類'){ alert('「未分類」不可改名'); }
    else if((state.categories || []).includes(newName)){ alert('分類名稱重複，僅儲存勾選商品變更'); }
    else {
      state.categories = (state.categories || []).map(c => c === oldCat ? newName : c);
      (state.products || []).forEach(p=>{ if(p.category === oldCat) p.category = newName; });
      finalCat = newName;
      if(state.settings && state.settings.selectedCategory === oldCat) state.settings.selectedCategory = newName;
    }
  }
  // 2) 套用勾選
  if(!state.categoryManageDraft) state.categoryManageDraft = new Set();
  (state.products || []).forEach(p=>{
    if(state.categoryManageDraft.has(p.id)) p.category = finalCat;
    else if(p.category === finalCat) p.category = '未分類';
  });
  closeCategoryManage();
}
