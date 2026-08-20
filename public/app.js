let reminders = [];
const selectedDays = new Set([0,1,2,3,4,5,6]);
const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function renderDays(){
  document.getElementById("days").innerHTML = names.map((n,i)=>
    `<button class="day ${selectedDays.has(i)?"on":""}" onclick="toggleDay(${i})">${n}</button>`
  ).join("");
}
function toggleDay(i){
  selectedDays.has(i) ? selectedDays.delete(i) : selectedDays.add(i);
  renderDays();
}
async function load(){
  const r = await fetch("/api/reminders"); reminders = await r.json(); render();
}
function render(){
  const el=document.getElementById("list");
  if(!reminders.length){el.innerHTML='<p class="small">Nothing yet. Add your first reminder above.</p>';return;}
  el.innerHTML=[...reminders].sort((a,b)=>a.time.localeCompare(b.time)).map(r=>
    `<div class="rem">
      <div><div class="time">${r.time}</div><div>${escapeHtml(r.text)}</div>
      <div class="small">${r.days.length===7?"Every day":r.days.map(d=>names[d]).join(", ")}</div></div>
      <button class="delete" onclick="removeReminder('${r.id}')">Delete</button>
    </div>`
  ).join("");
}
function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
async function addReminder(){
  const text=document.getElementById("text").value.trim(), time=document.getElementById("time").value;
  if(!text||!time) return alert("Add a reminder and a time.");
  const res=await fetch("/api/reminders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,time,days:[...selectedDays].sort()})});
  if(res.ok){document.getElementById("text").value="";load();}
}
async function removeReminder(id){await fetch("/api/reminders/"+id,{method:"DELETE"});load();}

async function enableNotifications(){
  if(!("Notification" in window) || !("serviceWorker" in navigator)){return setStatus("This browser doesn't support web notifications.");}
  const permission=await Notification.requestPermission();
  if(permission!=="granted") return setStatus("Notifications were not allowed.");
  const reg=await navigator.serviceWorker.register("/sw.js");
  const cfg=await (await fetch("/api/config")).json();
  if(!cfg.vapidPublicKey) return setStatus("The server needs its VAPID keys configured first.");
  const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(cfg.vapidPublicKey)});
  await fetch("/api/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(sub)});
  setStatus("✅ Notifications enabled. You're all set!");
}async function createAIReminder(){
  const input = document.getElementById("reminderMessage");
  const message = input.value.trim();

  if (!message) {
    return setStatus("Tell me what you'd like to be reminded about.");
  }

  setStatus("🤖 Understanding your reminder...");

  try {
    const response = await fetch("/api/parse-reminder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message })
    });

    const reminder = await response.json();

    if (!response.ok) {
      throw new Error(reminder.error || "Could not understand reminder");
    }

    if (!reminder.time) {
      return setStatus("⏰ What time should I remind you?");
    }

    const saved = await fetch("/api/reminders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: reminder.text,
        time: reminder.time,
        days: reminder.days
      })
    });

    if (!saved.ok) {
      throw new Error("Could not save reminder");
    }

    input.value = "";
    setStatus("✅ Reminder added!");
    await load();

  } catch (error) {
    console.error(error);
    setStatus("❌ I couldn't understand that reminder.");
  }
}
function setStatus(t){document.getElementById("status").textContent=t;}
function urlBase64ToUint8Array(base64String){
  const padding="=".repeat((4-base64String.length%4)%4), base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
  return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
}
renderDays(); load();
