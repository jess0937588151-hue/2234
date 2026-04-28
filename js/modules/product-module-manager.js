/* 中文備註：模組設定浮窗（v2.1.26）
 * 整合「改名 / 規則 / 必選 / 子選項 / 刪除 / 勾選商品」於同一浮窗。
 * 點模組卡片 → 開浮窗。
 */
import { state, persistAll } from '../core/store.js';
import { escapeHtml, escapeAttr, id } from '../core/utils.js';

const MODAL_ID = '__moduleManageDynamicModal';

function ensureModal(){
  let modal = document.getElementById(MODAL_ID);
  if(modal) return modal;

  modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:640px;width:100%;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;">
      <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
        <h3 id="__modMgrTitle" style="margin:0;font-size:16px;">模組設定</h3>
        <button id="__modMgrClose" style="background:none;border:none;font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;display:flex;flex-direction:column;gap:10px;">
        <label style="font-size:13px;color:#475569;">模組名稱</label>
        <div style="display:flex;gap:8px;">
          <input id="__modMgrName" style="flex:1;padding:8px;border:1px solid #cbd5e1;border-radius:8px;">
          <button id="__modMgrDelete" style="padding:8px 12px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:8px;cursor:pointer;">刪除模組</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div>
            <label style="font-size:12px;color:#64748b;">選擇規則</label>
            <select id="__modMgrSelection" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;">
              <option value="single">單選</option>
              <option value="multi">多選</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px;color:#64748b;">是否必選</label>
            <select id="__modMgrRequired" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;">
              <option value="true">必選</option>
              <option value="false">非必選</option>
            </select>
          </div>
        </div>
        <div style="font-size:13px;color:#475569;">子選項</div>
        <div id="__modMgrOptions" style="display:flex;flex-direction:column;gap:4px;max-height:160px;overflow:auto;border:1px solid #f1f5f9;border-radius:8px;padding:6px;"></div>
        <button id="__modMgrAddOption" style="padding:6px;border:1px dashed #cbd5e1;background:#f8fafc;border-radius:8px;cursor:pointer;font-size:12px;">+ 新增子選項</button>
      </div>
      <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;display:flex;flex-direction:column;gap:8px;">
        <div style="font-size:13px;color:#475569;">套用到以下商品（勾選即套用）</div>
        <input id="__modMgrSearch" placeholder="🔍 搜尋商品名稱或別名" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px;">
        <div style="display:flex;gap:6px;font-size:12px;color:#64748b;">
          <button id="__modMgrSelectAll" style="padding:4px 8px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer;">全選</button>
          <button id="__modMgrSelectNone" style="padding:4px 8px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer;">全不選</button>
          <span id="__modMgrCheckedCount" style="margin-left:auto;align-self:center;"></span>
        </div>
      </div>
      <div id="__modMgrBody" style="flex:1;overflow:auto;padding:8px 16px;"></div>
      <div style="padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;">
        <button id="__modMgrCancel" style="padding:8px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;">取消</button>
        <button id="__modMgrSave" style="padding:8px 16px;border:none;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer;">儲存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e)=>{ if(e.target === modal) closeModuleManage(); });
  document.getElementById('__modMgrClose').addEventListener('click', closeModuleManage);
  document.getElementById('__modMgrCancel').addEventListener('click', closeModuleManage);
  document.getElementById('__modMgrSearch').addEventListener('input', renderModuleManage);
  document.getElementById('__modMgrSelectAll').addEventListener('click', ()=>{
    (state.products || []).forEach(p => state.moduleManageDraft.add(p.id));
    renderModuleManage();
  });
  document.getElementById('__modMgrSelectNone').addEventListener('click', ()=>{
    state.moduleManageDraft.clear();
    renderModuleManage();
  });
  document.getElementById('__modMgrAddOption').addEventListener('click', ()=>{
    const mod = (state.modules || []).find(m => m.id === state.moduleManageTarget);
    if(!mod) return;
    if(!Array.isArray(mod.options)) mod.options = [];
    mod.options.push({ id: id(), name:'', price:0, enabled:true });
    renderModuleOptions();
  });
  document.getElementById('__modMgrDelete').addEventListener('click', ()=>{
    const mid = state.moduleManageTarget;
    if(!mid) return;
    const mod = (state.modules || []).find(m => m.id === mid);
    if(!mod) return;
    if(!confirm(`確定刪除模組「${mod.name}」？\n所有商品上套用的此模組會一併移除`)) return;
    state.modules = (state.modules || []).filter(m => m.id !== mid);
    (state.products || []).forEach(p=>{
      p.modules = (p.modules || []).filter(att => (att.moduleId || att) !== mid);
    });
    persistAll();
    if(typeof window.refreshAllViews === 'function') window.refreshAllViews();
    closeModuleManage();
  });
  document.getElementById('__modMgrSave').addEventListener('click
