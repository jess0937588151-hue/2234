/* 中文備註：分類商品管理（v2.1.25 Hotfix 06.9）
 * 改用動態建立 modal，不依賴 index.html 的舊元素，避免 null is not an object 錯誤。
 * 功能：
 *   - 點分類卡片的「管理」按鈕 → 跳出商品清單 modal，可勾選要歸入此分類的商品
 *   - 內建搜尋框
 *   - 儲存時：勾選的設成此分類；原本是此分類但被取消勾的退回「未分類」
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
    <div style="background:#fff;border-radius:12px;max-width:520px;width:100%;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;">
      <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
        <h3 id="__catMgrTitle" style="margin:0;font-size:16px;">分類商品管理</h3>
        <button id="__catMgrClose" style="background:none;border:none;font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
        <input id="__catMgrSearch" placeholder="搜尋商品名稱或別名" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
      </div>
      <div id="__catMgrBody" style="flex:1;overflow:auto;padding:8px 16px;"></div>
      <div style="padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;">
        <button id="__catMgrCancel" style="padding:8px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;">取消</button>
        <button id="__catMgrSave" style="padding:8px 16px;border:none;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer;">儲存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // 綁事件
  modal.addEventListener('click', (e)=>{
    if(e.target === modal) closeCategoryManage();
  });
  document.getElementById('__catMgrClose').addEventListener('click', closeCategoryManage);
  document.getElementById('__catMgrCancel').addEventListener('click', closeCategoryManage);
  document.getElementById('__catMgrSave').addEventListener('click', ()=>{
    saveCategoryManage();
    persistAll();
    if(typeof window.refreshAllViews === 'function') window.refreshAllViews();
  });
  document.getElementById('__catMgrSearch').addEventListener('input', renderCategoryManage);
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
  if(titleEl) titleEl.textContent = `分類商品管理：${category}`;
  const searchEl = document.getElementById('__catMgrSearch');
  if(searchEl) searchEl.value = '';
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
  const searchEl = document.getElementById('__catMgrSearch');
  const search = (searchEl?.value || '').trim();
  const list = (state.products || []).filter(p => {
    if(!search) return true;
    const hay = (p.name || '') + ' ' + (p.aliases || []).join(' ');
    return hay.includes(search);
  });

  if(!list.length){
    body.innerHTML = '<div style="color:#94a3b8;padding:20px;text-align:center;">沒有符合商品</div>';
    return;
  }

  body.innerHTML = list.map(p => `
    <label style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid #f1f5f9;cursor:pointer;">
      <input type="checkbox" data-product-id="${escapeAttr(p.id)}" ${state.categoryManageDraft.has(p.id) ? 'checked' : ''} style="width:18px;height:18px;">
      <div style="flex:1;">
        <div style="font-weight:600;">${escapeHtml(p.name)}</div>
        <div style="font-size:12px;color:#64748b;">$${Number(p.price || 0)} ・ ${escapeHtml(p.category || '未分類')}</div>
      </div>
    </label>
  `).join('');

  body.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const pid = chk.dataset.productId;
      if(chk.checked) state.categoryManageDraft.add(pid);
      else state.categoryManageDraft.delete(pid);
    });
  });
}

export function saveCategoryManage(){
  const category = state.categoryManageTarget;
  if(!category) return;
  if(!state.categoryManageDraft) state.categoryManageDraft = new Set();
  (state.products || []).forEach(p=>{
    if(state.categoryManageDraft.has(p.id)) p.category = category;
    else if(p.category === category) p.category = '未分類';
  });
  closeCategoryManage();
}
