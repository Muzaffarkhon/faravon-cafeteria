/* eslint-disable */
// ═══════════════════════════════════════════════════════════
// PWA (Progressive Web App): добавление на домашний экран (Android / iOS / PC)
// ═══════════════════════════════════════════════════════════
(function initPWA(){
  // Очищаем старую блокировку на 7 дней, если она осталась в браузере
  try {
    localStorage.removeItem('faravon_pwa_dismissed');
  } catch (e) {}

  // 1. Всегда сразу регистрируем Service Worker
  if ('serviceWorker' in navigator) {
    var regSW = function(){
      navigator.serviceWorker.register('/sw.js').catch(function(){});
    };
    if (document.readyState === 'complete') {
      regSW();
    } else {
      window.addEventListener('load', regSW);
    }
  }

  // Не показываем внутри Telegram WebApp или если уже установлено (standalone)
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator && window.navigator.standalone);
  var isTelegram = Boolean(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);
  if (isStandalone || isTelegram) return;

  // Проверяем, не закрывал ли пользователь в текущей сессии
  var isDismissed = false;
  try {
    isDismissed = sessionStorage.getItem('faravon_pwa_closed') === '1';
  } catch (e) {}
  if (isDismissed) return;

  var deferredPrompt = window.__pwaPrompt || null;

  function dismiss(){
    try {
      sessionStorage.setItem('faravon_pwa_closed', '1');
    } catch (e) {}
    var b = document.getElementById('pwaInstallBanner');
    if(b) b.remove();
  }

  function showBanner(type){
    if(document.getElementById('pwaInstallBanner')) return;
    var host = document.createElement('div');
    host.id = 'pwaInstallBanner';
    host.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;max-width:440px;margin:0 auto;z-index:9999;background:var(--card,#ffffff);border:1px solid var(--border,#e2e8f0);box-shadow:0 12px 36px rgba(0,0,0,0.22);border-radius:14px;padding:12px 14px;font-family:inherit;display:flex;flex-direction:column;gap:10px;animation:pwaFadeIn .25s ease-out;';
    
    if(!document.getElementById('pwaAnimStyles')){
      var st = document.createElement('style');
      st.id = 'pwaAnimStyles';
      st.textContent = '@keyframes pwaFadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(st);
    }

    if(type === 'android'){
      host.innerHTML = 
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<img src="/icons/icon-192.png" width="42" height="42" style="border-radius:10px;flex:none;box-shadow:0 2px 6px rgba(0,0,0,0.12)">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:700;font-size:13.5px;color:var(--text,#0f172a);line-height:1.25">Кафетерий льгот «Фаровон»</div>' +
            '<div style="font-size:11.5px;color:var(--muted,#64748b);margin-top:2px">Установите на главный экран для быстрого доступа</div>' +
          '</div>' +
          '<button id="btnPwaClose" type="button" aria-label="Закрыть" style="border:none;background:transparent;color:var(--muted,#94a3b8);font-size:16px;cursor:pointer;padding:4px;line-height:1">✕</button>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px">' +
          '<button id="btnPwaLater" type="button" style="border:none;background:transparent;color:var(--muted,#64748b);font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer">Позже</button>' +
          '<button id="btnPwaInstall" type="button" style="min-height:32px;font-size:12px;padding:0 14px;border-radius:8px;cursor:pointer;background:#e11d48;color:#ffffff;border:none;font-weight:600">Установить</button>' +
        '</div>';
      document.body.appendChild(host);

      document.getElementById('btnPwaClose').onclick = dismiss;
      document.getElementById('btnPwaLater').onclick = dismiss;
      document.getElementById('btnPwaInstall').onclick = function(){
        if(deferredPrompt){
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function(choice){
            if(choice && choice.outcome === 'accepted'){
              dismiss();
            }
          });
        }
      };
    } else if(type === 'ios'){
      host.innerHTML = 
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<img src="/icons/apple-touch-icon.png" width="38" height="38" style="border-radius:9px;flex:none;box-shadow:0 2px 6px rgba(0,0,0,0.12)">' +
            '<div>' +
              '<div style="font-weight:700;font-size:13px;color:var(--text,#0f172a)">Установка на iPhone / iPad</div>' +
              '<div style="font-size:11.5px;color:var(--muted,#64748b)">Как добавить сайт на экран «Домой»:</div>' +
            '</div>' +
          '</div>' +
          '<button id="btnPwaClose" type="button" aria-label="Закрыть" style="border:none;background:transparent;color:var(--muted,#94a3b8);font-size:16px;cursor:pointer;padding:4px;line-height:1">✕</button>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--text,#0f172a);display:flex;flex-direction:column;gap:6px;padding-left:4px;margin-top:2px">' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span style="background:rgba(225,29,72,0.1);color:#e11d48;font-weight:700;font-size:10.5px;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center">1</span>' +
            '<span>Нажмите значок <b>«Поделиться»</b> внизу Safari:</span>' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2" style="flex:none"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span style="background:rgba(225,29,72,0.1);color:#e11d48;font-weight:700;font-size:10.5px;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center">2</span>' +
            '<span>В списке выберите <b>«На экран „Домой“»</b> (+)</span>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:2px">' +
          '<button id="btnPwaGotIt" type="button" style="min-height:30px;font-size:11.5px;padding:0 14px;border-radius:8px;cursor:pointer;background:#e11d48;color:#ffffff;border:none;font-weight:600">Понятно</button>' +
        '</div>';
      document.body.appendChild(host);

      document.getElementById('btnPwaClose').onclick = dismiss;
      document.getElementById('btnPwaGotIt').onclick = dismiss;
    }
  }

  // Если prompt уже был перехвачен
  if (deferredPrompt) {
    showBanner('android');
  }

  // 1. Android & Chrome Desktop: beforeinstallprompt
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    window.__pwaPrompt = e;
    showBanner('android');
  });

  // 2. iOS Safari
  var ua = (window.navigator.userAgent || '').toLowerCase();
  var isIos = /iphone|ipad|ipod/.test(ua);
  var isSafari = /safari/.test(ua) && !/chrome|crios|fxios|android/.test(ua);
  if(isIos && isSafari){
    setTimeout(function(){
      showBanner('ios');
    }, 1500);
  }
})();
