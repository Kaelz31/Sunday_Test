// Sunday web client — simple hold-to-talk, auto-restart, no buffering
(() => {
  "use strict";

  const API_CHAT = "/chat";
  const API_TTS  = "/tts";

  // Elements
  const chatEl     = document.getElementById("chat");
  const inputEl    = document.getElementById("userInput");
  const sendBtn    = document.getElementById("sendBtn");
  const pttBtn     = document.getElementById("pttBtn");
  const statusPill = document.getElementById("statusPill");

  // Sanity logs
  console.log("[Sunday] Client boot");
  console.log("[Sunday] Location:", window.location.href);
  console.log("[Sunday] Secure context:", window.isSecureContext, "(localhost ok)");

  if (!chatEl || !inputEl || !sendBtn || !pttBtn || !statusPill) {
    console.error("[Sunday] Missing DOM elements:", {
      chatEl: !!chatEl, inputEl: !!inputEl, sendBtn: !!sendBtn, pttBtn: !!pttBtn, statusPill: !!statusPill
    });
  }

  // State
  let currentAudio = null;
  let pttActive = false;

  // UI helpers
  function setStatus(mode){
    if (!statusPill) return;
    statusPill.className = "pill " + (mode==="Listening"?"listening":mode==="Speaking"?"speaking":"idle");
    statusPill.textContent = mode;
  }
  function escapeHTML(s){return String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function addMessage(sender, text, cls){
    if (!chatEl) return;
    const wrap = document.createElement("div");
    wrap.className = `msg ${cls}`;
    const ts = new Date().toLocaleTimeString();
    wrap.innerHTML = `<strong>${escapeHTML(sender)}</strong><span class="ts">${ts}</span><div>${escapeHTML(text)}</div>`;
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  // TTS
  function speak(text){
    if (currentAudio){ try{ currentAudio.pause(); currentAudio.src=''; }catch{} currentAudio=null; }
    if (!text) return;
    setStatus("Speaking");
    console.log("[Sunday] /tts ->", text.slice(0,64), "…");
    fetch(API_TTS, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ text })
    })
    .then(res => { if(!res.ok) throw new Error('TTS failed: '+res.status); return res.blob(); })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onended = () => { URL.revokeObjectURL(url); currentAudio=null; setStatus("Idle"); };
      audio.onerror = () => { URL.revokeObjectURL(url); currentAudio=null; setStatus("Idle"); };
      audio.play().catch(err => { console.error('[Sunday] Audio play failed:', err); setStatus("Idle"); });
    })
    .catch(err => { console.error('[Sunday] TTS error:', err); setStatus("Idle"); });
  }

  // Chat
  async function sendToSunday(message){
    console.log("[Sunday] /chat ->", message);
    try{
      const res = await fetch(API_CHAT, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ message })
      });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {
        console.warn("[Sunday] Non-JSON /chat response:", text.slice(0,200));
      }
      if (!res.ok) {
        const detail = data?.error || text || `HTTP ${res.status}`;
        addMessage('System', `Chat error: ${detail}`, 'sys');
        console.error("[Sunday] /chat error response:", detail);
        setStatus("Idle");
        return;
      }
      const reply = data.response || "[no reply]";
      console.log("[Sunday] /chat <-", reply.slice(0,128), "…");
      addMessage('Sunday', reply, 'ai');
      speak(reply);
    }catch(err){
      console.error("[Sunday] /chat network error:", err);
      addMessage('System', 'Network error contacting /chat', 'sys');
      setStatus("Idle");
    }
  }

  // Manual send
  sendBtn?.addEventListener('click', () => {
    const text = inputEl.value.trim();
    console.log("[Sunday] Send clicked:", text);
    if (!text) return;
    inputEl.value = '';
    addMessage('You', text, 'user');
    sendToSunday(text);
  });
  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
  });

  // Push-to-Talk: no buffer, immediate send per finalized result
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  console.log("[Sunday] SpeechRecognition available:", !!SpeechRecognition);

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("[Sunday] Recognition started");
      setStatus("Listening");
    };

    recognition.onresult = (e) => {
      const text = e?.results?.[0]?.[0]?.transcript?.trim() || "";
      console.log("[Sunday] Recognition result:", text);
      if (text) {
        addMessage('You', text, 'user');
        sendToSunday(text);
      }
    };

    recognition.onend = () => {
      console.log("[Sunday] Recognition ended. pttActive =", pttActive);
      if (pttActive) {
        // Auto-restart a new session while still holding
        try { recognition.start(); } catch (err) {
          console.warn("[Sunday] Restart failed:", err);
        }
      } else {
        if (!currentAudio) setStatus("Idle");
      }
    };

    recognition.onerror = (e) => {
      console.warn("[Sunday] Recognition error:", e.error);
      if (pttActive) {
        try { recognition.start(); } catch (err) {
          console.warn("[Sunday] Restart after error failed:", err);
        }
      } else {
        setStatus("Idle");
      }
    };
  } else {
    console.warn("[Sunday] SpeechRecognition not supported in this browser");
    pttBtn?.setAttribute("disabled", "true");
    pttBtn?.setAttribute("title", "Speech recognition not supported in this browser");
  }

  function startListening() {
    if (!recognition) { console.warn("[Sunday] No recognition instance"); return; }
    // Barge-in: stop TTS if playing
    if (currentAudio){ try{ currentAudio.pause(); currentAudio.src=''; }catch{} currentAudio=null; }
    pttActive = true;
    console.log("[Sunday] PTT start -> start()");
    try { recognition.start(); } catch (err) {
      console.error("[Sunday] recognition.start() failed:", err);
    }
  }

  function stopListening() {
    pttActive = false;
    console.log("[Sunday] PTT stop -> stop()");
    if (!recognition) return;
    try { recognition.stop(); } catch (err) {
      console.error("[Sunday] recognition.stop() failed:", err);
    }
  }

  // Bind PTT
  pttBtn?.addEventListener("mousedown", () => { console.log("[Sunday] PTT mousedown"); startListening(); });
  pttBtn?.addEventListener("mouseup",   () => { console.log("[Sunday] PTT mouseup");   stopListening();  });
  pttBtn?.addEventListener("mouseleave",() => { console.log("[Sunday] PTT mouseleave"); stopListening();  });
  pttBtn?.addEventListener("touchstart", (e) => { e.preventDefault(); console.log("[Sunday] PTT touchstart"); startListening(); }, { passive: false });
  pttBtn?.addEventListener("touchend",   (e) => { e.preventDefault(); console.log("[Sunday] PTT touchend");   stopListening();  }, { passive: false });
  pttBtn?.addEventListener("touchcancel",(e) => { e.preventDefault(); console.log("[Sunday] PTT touchcancel"); stopListening();  }, { passive: false });

  // Final init
  setStatus("Idle");
  console.log("[Sunday] Client ready");
})();