/* 中文備註：模組套用商品（v2.1.25 Hotfix 06.9）
 * 改用動態建立 modal，不依賴 index.html 的舊元素。
 * 功能：
 *   - 點模組卡片的「套用」按鈕 → 跳出商品清單 modal，可勾選要套用此模組的商品
 *   - 儲存時：勾選的商品加上此模組（如果還沒有）；取消勾選的商品移除此模組
 */
import { state, persistAll } from '../core/store.js';
import { escapeHtml, escapeAttr } from '../core/utils.js';

const MODAL_ID = '__moduleManageDynamicModal';

function ensureModal(){
  let modal = document.getElementById(MODAL_ID);
  if(modal) return modal;

  modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:520px;width:100%;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;">
      <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
        <h3 id="__modMgrTitle" style="margin:0;font-size:16px;">模組套用商品</h3>
        <button id="__modMgrClose" style="background:none;border:none;font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
        <input id="__modMgrSearch" placeholder="搜尋商品名稱或別名" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
      </div>
      <div id="__modMgrBody" style="flex:1;overflow:auto;padding:8px 16px;"></div>
      <div style="padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;">
        <button id="__modMgrCancel" style="padding:8px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;">取消</button>
        <button id="__modMgrSave" style="padding:8px 16px;border:none;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer;">儲存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e)=>{
    if(e.target === modal) closeModuleManage();
  });
  document.getElementById('__modMgrClose').addEventListener('click', closeModuleManage);
  document.getElementById('__modMgrCancel').addEventListener('click', closeModuleManage);
  document.getElementById('__modMgrSave').addEventListener('click', ()=>{
    saveModuleManage();
    persistAll();
    if(typeof window.refreshAllViews === 'function') window.refreshAllViews();
  });
  document.getElementById('__modMgrSearch').addEventListener('input', renderModuleManage);
  return modal;
}

export function openModuleManage(moduleId){
  if(!moduleId) return;
  state.moduleManageTarget = moduleId;
  state.moduleManageDraft = new Set(
    (state.products || [])
      .filter(p => (p.modules || []).some(m => (m.moduleId || m) === moduleId))
      .map(p => p.id)
  );
  const mod = (state.modules || []).find(m => m.id === moduleId);
  const modal = ensureModal();
  const titleEl = document.getElementById('__modMgrTitle');
  if(titleEl) titleEl.textContent = `模組套用商品：${mod?.name || ''}`;
  const searchEl = document.getElementById('__modMgrSearch');
  if(searchEl) searchEl.value = '';
  modal.style.display = 'flex';
  renderModuleManage();
}

export function closeModuleManage(){
  const modal = document.getElementById(MODAL_ID);
  if(modal) modal.style.display = 'none';
  state.moduleManageTarget = null;
}

export function renderModuleManage(){
  const body = document.getElementById('__modMgrBody');
  if(!body) return;
  const searchEl = document.getElementById('__modMgrSearch');
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
      <input type="checkbox" data-product-id="${escapeAttr(p.id)}" ${state.moduleManageDraft.has(p.id) ? 'checked' : ''} style="width:18px;height:18px;">
      <div style="flex:1;">
        <div style="font-weight:600;">${escapeHtml(p.name)}</div>
        <div style="font-size:12px;color:#64748b;">$${Number(p.price || 0)} ・ ${escapeHtml(p.category || '未分類')}</div>
      </div>
    </label>
  `).join('');

  body.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const pid = chk.dataset.productId;
      if(chk.checked) state.moduleManageDraft.add(pid);
      else state.moduleManageDraft.delete(pid);
    });
  });
}

export function saveModuleManage(){
  const moduleId = state.moduleManageTarget;
  if(!moduleId) return;
  if(!state.moduleManageDraft) state.moduleManageDraft = new Set();
  (state.products || []).forEach(p=>{
    const hasModule = (p.modules || []).some(m => (m.moduleId || m) === moduleId);
    const shouldHave = state.moduleManageDraft.has(p.id);
    if(shouldHave && !hasModule){
      p.modules = [...(p.modules || []), { moduleId, requiredOverride: null }];
    }
    if(!shouldHave && hasModule){
      p.modules = (p.modules || []).filter(m => (m.moduleId || m) !== moduleId);
    }
  });
  closeModuleManage();
}
