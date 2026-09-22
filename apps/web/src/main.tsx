import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

const API=import.meta.env.VITE_API_URL||'/api/v1';
const key=()=>localStorage.getItem('apiKey')||'';
const headers=()=>({'content-type':'application/json','x-api-key':key()});

function Login({onLogin}:{onLogin:(key:string)=>void}){
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [msg,setMsg]=useState('');
  async function submit(e:any){
    e.preventDefault();setMsg('Signing in...');
    try{
      const r=await fetch(API+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.message||'Login failed');
      localStorage.setItem('apiKey',d.apiKey);onLogin(d.apiKey);
    }catch(e:any){setMsg(e.message||'Login failed')}
  }
  return <div className="login"><form className="panel login-box" onSubmit={submit}>
    <h1>SMS Gateway</h1><p className="muted">Customer Login</p>
    <label>Username<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required/></label>
    <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>
    <button>Sign In</button><p>{msg}</p>
  </form></div>
}

function App(){
  const [logged,setLogged]=useState(!!key());
  const [summary,setSummary]=useState<any>(null);
  const [messages,setMessages]=useState<any[]>([]);
  const [keys,setKeys]=useState<any[]>([]);
  const [senders,setSenders]=useState<any[]>([]);
  const [transactions,setTransactions]=useState<any[]>([]);
  const [deposits,setDeposits]=useState<any[]>([]);
  const [to,setTo]=useState('');const [sender,setSender]=useState('');const [body,setBody]=useState('');
  const [keyName,setKeyName]=useState('');const [newKey,setNewKey]=useState('');const [msg,setMsg]=useState('');
  const [deposit,setDeposit]=useState('');const [reference,setReference]=useState('');
  const [sf,setSf]=useState({senderId:'',type:'non-masking',billMsisdn:''});
  const [campaigns,setCampaigns]=useState<any[]>([]);const [groups,setGroups]=useState<any[]>([]);const [templates,setTemplates]=useState<any[]>([]);const [imports,setImports]=useState<any[]>([]);
  const [campaign,setCampaign]=useState({senderId:'',body:'',recipients:'',groupIds:[] as string[],scheduledAt:''});const [importCsv,setImportCsv]=useState('');
  async function load(){
    if(!key())return;
    const h=headers();
    const [a,b,c,d,e,f,g,h,i,j]=await Promise.all([
      fetch(API+'/reports/summary',{headers:h}),fetch(API+'/reports/messages?limit=20',{headers:h}),
      fetch(API+'/api-keys',{headers:h}),fetch(API+'/senders',{headers:h}),
      fetch(API+'/billing/transactions?limit=30',{headers:h}),fetch(API+'/billing/deposits',{headers:h}),
      fetch(API+'/campaigns',{headers:h}),fetch(API+'/campaigns/groups',{headers:h}),fetch(API+'/campaigns/templates',{headers:h}),fetch(API+'/campaigns/imports',{headers:h})
    ]);
    if([a,b,c,d,e,f,g,h,i,j].some(x=>x.status===401)){localStorage.removeItem('apiKey');setLogged(false);return}
    setSummary(await a.json());setMessages(await b.json());setKeys(await c.json());setSenders(await d.json());setTransactions(await e.json());setDeposits(await f.json());setCampaigns(await g.json());setGroups(await h.json());setTemplates(await i.json());setImports(await j.json());
  }
  useEffect(()=>{load()},[logged]);
  function logout(){localStorage.removeItem('apiKey');setLogged(false)}
  async function send(e:any){e.preventDefault();setMsg('Sending...');
    const r=await fetch(API+'/sms/send',{method:'POST',headers:headers(),body:JSON.stringify({senderId:sender,to:to.split(/[,\s]+/).filter(Boolean),body,isUnicode:/[^\x00-\x7F]/.test(body)})});
    const d=await r.json();setMsg(r.ok?'SMS accepted: '+d.recipients+' recipients':(d.message||'Send failed'));if(r.ok){setTo('');setBody('');load()}
  }
  async function createKey(e:any){e.preventDefault();const r=await fetch(API+'/api-keys',{method:'POST',headers:headers(),body:JSON.stringify({name:keyName})});const d=await r.json();if(r.ok){setNewKey(d.apiKey);setKeyName('');load()}else setMsg(d.message||'API key creation failed')}
  async function createSender(e:any){e.preventDefault();const r=await fetch(API+'/senders',{method:'POST',headers:headers(),body:JSON.stringify(sf)});const d=await r.json();if(r.ok){setSf({senderId:'',type:'non-masking',billMsisdn:''});load()}else setMsg(d.message||'Sender creation failed')}
  async function toggleSender(id:string,status:string){await fetch(API+'/senders/'+id,{method:'PATCH',headers:headers(),body:JSON.stringify({status:status==='active'?'inactive':'active'})});load()}
  async function revoke(id:string){await fetch(API+'/api-keys/'+id,{method:'DELETE',headers:headers()});load()}
  async function requestDeposit(e:any){e.preventDefault();const r=await fetch(API+'/billing/deposits',{method:'POST',headers:headers(),body:JSON.stringify({amount:deposit,reference})});const d=await r.json();setMsg(r.ok?'Deposit request submitted':'Deposit request failed');if(r.ok){setDeposit('');setReference('');load()}}
  async function createCampaign(e:any){e.preventDefault();setMsg('Creating campaign...');const r=await fetch(API+'/campaigns',{method:'POST',headers:headers(),body:JSON.stringify({senderId:campaign.senderId,body:campaign.body,recipients:campaign.recipients.split(/[,s]+/).filter(Boolean),groupIds:campaign.groupIds,scheduledAt:campaign.scheduledAt||undefined})});const d=await r.json();setMsg(r.ok?'Campaign accepted: '+d.recipients+' recipients':(d.message||'Campaign failed'));if(r.ok){setCampaign({...campaign,body:'',recipients:''});load()}}
  async function campaignAction(id:string,action:string){await fetch(API+'/campaigns/'+id+'/'+action,{method:'POST',headers:headers()});load()}
  async function importContacts(e:any){e.preventDefault();const r=await fetch(API+'/campaigns/contacts/import',{method:'POST',headers:headers(),body:JSON.stringify({fileName:'contacts.csv',csv:importCsv})});const d=await r.json();setMsg(r.ok?'Import queued: '+d.importId:(d.message||'Import failed'));if(r.ok){setImportCsv('');load()}}
  if(!logged)return <Login onLogin={()=>setLogged(true)}/>;
  return <div className="app"><header><div><h1>SMS Gateway</h1><span className="muted">InfoZillion SMS Platform</span></div><div className="account">{summary?.username??'Customer'} <span className="balance">Balance: ৳{summary?.balance??'—'}</span> <button onClick={logout}>Logout</button></div></header>
  <main>
    <section className="cards">{[['Total',summary?.total],['Queued',summary?.queued],['Sent',summary?.sent],['Delivered',summary?.delivered],['Failed',summary?.failed],['Cost',summary?.total_cost]].map(x=><div className="card" key={String(x[0])}><small>{x[0]}</small><strong>{x[1]??'—'}</strong></div>)}</section>
    <section className="grid"><form className="panel" onSubmit={send}><h2>Send SMS</h2>
      <label>Sender ID<select value={sender} onChange={e=>setSender(e.target.value)} required><option value="">Select Sender</option>{senders.filter(s=>s.status==='active').map(s=><option key={s.id} value={s.senderId}>{s.senderId} ({s.type})</option>)}</select></label>
      <label>Recipients<textarea value={to} onChange={e=>setTo(e.target.value)} placeholder="8801XXXXXXXXX, 8801XXXXXXXXX" required/></label>
      <label>Message<textarea value={body} onChange={e=>setBody(e.target.value)} required/></label><button>Send SMS</button><p>{msg}</p>
    </form><section className="panel"><h2>Recent Messages</h2>{messages.map(m=><div className="row" key={m.externalId}><span>{m.to}</span><span>{m.status}</span><span>৳{m.cost}</span></div>)}</section></section>

    <section className="grid"><section className="panel"><h2>Transactions</h2>{transactions.map(t=><div className="row" key={t.id}><span>{t.description||'Transaction'}</span><span>{t.direction}</span><strong>৳{t.amount}</strong></div>)}</section>
    <section className="panel"><h2>Deposit Request</h2><form onSubmit={requestDeposit}><label>Amount<input value={deposit} onChange={e=>setDeposit(e.target.value)} placeholder="1000.00" required/></label><label>Reference<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Payment reference"/></label><button>Submit Deposit</button></form><hr/>{deposits.map(d=><div className="row" key={d.id}><span>৳{d.amount}</span><span>{d.status}</span><span>{d.reference||'—'}</span></div>)}</section></section>

    <section className="panel"><h2>Senders</h2><form className="inline" onSubmit={createSender}><input value={sf.senderId} onChange={e=>setSf({...sf,senderId:e.target.value})} placeholder="Sender ID" required/><select value={sf.type} onChange={e=>setSf({...sf,type:e.target.value})}><option>non-masking</option><option>masking</option><option>alphanumeric</option><option>numeric</option></select><input value={sf.billMsisdn} onChange={e=>setSf({...sf,billMsisdn:e.target.value})} placeholder="Bill MSISDN"/><button>Add Sender</button></form>{senders.map(s=><div className="row" key={s.id}><span>{s.senderId}</span><span>{s.type}</span><span>{s.billMsisdn||'—'}</span><span>{s.status}</span><button onClick={()=>toggleSender(String(s.id),s.status)}>{s.status==='active'?'Disable':'Enable'}</button></div>)}</section>

    <section className="panel keys"><h2>API Keys</h2><form onSubmit={createKey}><input value={keyName} onChange={e=>setKeyName(e.target.value)} placeholder="Key name" required/><button>Create API Key</button></form>{newKey&&<pre className="newkey">{newKey}</pre>}{keys.map(k=><div className="row" key={k.id}><span>{k.name}</span><span>{k.enabled?'Active':'Revoked'}</span><button disabled={!k.enabled} onClick={()=>revoke(String(k.id))}>Revoke</button></div>)}</section>
  </main></div>
}
createRoot(document.getElementById('root')!).render(<App/>);