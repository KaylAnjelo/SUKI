(function(){
  // simple reusable confirmation modal
  function createModal(){
    const el = document.createElement('div');
    el.id = 'customConfirmModal';
    el.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);z-index:2000;';
    el.innerHTML = `
      <div style="background:#fff;border-radius:10px;max-width:420px;width:92%;padding:18px;box-shadow:0 10px 30px rgba(2,6,23,0.2);">
        <div id="customConfirmMessage" style="font-size:15px;color:#111;margin-bottom:14px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button id="customConfirmCancel" style="padding:8px 14px;border-radius:6px;border:1px solid #e5e7eb;background:#f3f4f6;">Cancel</button>
          <button id="customConfirmOk" style="padding:8px 14px;border-radius:6px;border:none;background:#7c0f0f;color:#fff;">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    return el;
  }

  let modal = null;
  function ensure(){ if(!modal) modal = createModal(); }

  window.customConfirm = function(message){
    ensure();
    return new Promise((resolve)=>{
      const m = document.getElementById('customConfirmModal');
      const msg = document.getElementById('customConfirmMessage');
      const ok = document.getElementById('customConfirmOk');
      const cancel = document.getElementById('customConfirmCancel');
      if(!m || !msg || !ok || !cancel) return resolve(window.confirm(message));
      msg.textContent = message;
      m.style.display = 'flex';
      function cleanup(){
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        m.style.display = 'none';
      }
      function onOk(){ cleanup(); resolve(true); }
      function onCancel(){ cleanup(); resolve(false); }
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
    });
  };

})();
