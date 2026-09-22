import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type NavItem = { label: string; icon: string; section?: string };

const nav: NavItem[] = [
  { label: 'Dashboard', icon: '⌂' },
  { label: 'Send SMS', icon: '➤', section: 'SMS MANAGEMENT' },
  { label: 'Bulk SMS', icon: '▤' },
  { label: 'Campaigns', icon: '◈' },
  { label: 'Templates', icon: '▣' },
  { label: 'Contacts', icon: '♙' },
  { label: 'Groups', icon: '♧' },
  { label: 'Sender IDs (CLI)', icon: '▱' },
  { label: 'Customers', icon: '♟', section: 'CUSTOMERS' },
  { label: 'Resellers', icon: '♟' },
  { label: 'Manage Users', icon: '♟' },
  { label: 'KYC & Verification', icon: '✓' },
  { label: 'Operators', icon: '◉', section: 'OPERATOR & TARIFF' },
  { label: 'Tariff Plans', icon: '◎' },
  { label: 'Routing Rules', icon: '⇄' },
  { label: 'Wallet & Transactions', icon: '▰', section: 'BILLING & PAYMENTS' },
  { label: 'Payment Gateways', icon: '▤' },
  { label: 'Packages & Plans', icon: '▦' },
  { label: 'Invoices', icon: '▤' },
  { label: 'SMS Reports', icon: '▥', section: 'REPORTS & ANALYTICS' },
  { label: 'Delivery Reports', icon: '◷' },
  { label: 'Usage Analytics', icon: '▥' },
  { label: 'Export Reports', icon: '⇩' },
  { label: 'Settings', icon: '⚙', section: 'SYSTEM' },
  { label: 'API & Webhooks', icon: '↗' },
  { label: 'Logs & Monitoring', icon: '≋' },
  { label: 'System Health', icon: '♥' },
];

const quick = [
  ['Send SMS', 'Send single SMS', '➤', 'quick-red'],
  ['Bulk SMS', 'Send to multiple numbers', '▤', 'quick-blue'],
  ['Campaigns', 'Create & manage campaigns', '◈', 'quick-green'],
  ['Manage Senders', 'Add & verify CLI/Sender IDs', '▣', 'quick-orange'],
  ['Add Customer', 'Create new customer', '♙', 'quick-purple'],
  ['View Reports', 'Delivery & analytics', '▥', 'quick-teal'],
  ['Manage Tariff', 'Operator rates & pricing', '◉', 'quick-yellow'],
  ['Wallet & Billing', 'Transactions & payments', '▰', 'quick-pink'],
  ['API & Webhooks', 'Integrate with your system', '↗', 'quick-cyan'],
  ['System Settings', 'Configuration & preferences', '⚙', 'quick-dark'],
];

const logs = [
  ['14:35', '+8801712345678', 'Your OTP is 123456', 'Delivered'],
  ['14:32', '+8801812345678', 'Welcome to SoftCents', 'Delivered'],
  ['14:28', '+8801612345678', 'Your order confirmed', 'Failed'],
  ['14:25', '+8801912345678', 'Special offer for you!', 'Delivered'],
  ['14:22', '+8801312345678', 'Your OTP is 987654', 'Delivered'],
];

function App() {
  const [active, setActive] = useState('Dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [period, setPeriod] = useState('Last 30 Days');
  const [search, setSearch] = useState('');

  const visibleNav = useMemo(
    () => nav.filter(item => !search || item.label.toLowerCase().includes(search.toLowerCase())),
    [search],
  );

  return (
    <div className={collapsed ? 'app collapsed' : 'app'}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">☁</div>
          <div><strong>SoftCents</strong><span>SMS Admin Panel</span></div>
        </div>
        <div className="nav-scroll">
          {visibleNav.map((item, i) => (
            <React.Fragment key={item.label}>
              {item.section && <div className="nav-section">{item.section}</div>}
              <button className={active === item.label ? 'nav-item active' : 'nav-item'} onClick={() => setActive(item.label)}>
                <span className="nav-icon">{item.icon}</span><span className="nav-label">{item.label}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="side-footer">v1.0.0<br/><span>© 2026 SoftCents</span></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setCollapsed(!collapsed)}>☰</button>
          <div className="search"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search anything..." /></div>
          <div className="top-actions">
            <button>☼</button><button className="bell">♧<i>5</i></button>
            <div className="avatar">A</div><div className="profile"><b>Admin</b><span>Super Admin</span></div><span>⌄</span>
          </div>
        </header>

        <section className="content">
          <div className="page-head">
            <div><h1>{active === 'Dashboard' ? 'Dashboard' : active}</h1><p>Welcome to SoftCents SMS Admin Panel. Here's what's happening today.</p></div>
            <div className="head-actions"><button className="date">▣ &nbsp; Sep 1, 2026 - Sep 22, 2026 &nbsp;⌄</button><button className="refresh">↻ &nbsp; Refresh</button></div>
          </div>

          <div className="stats">
            <Stat icon="➤" title="Total SMS Sent" value="1,245,430" note="↗ +12.5% from last month" cls="blue"/>
            <Stat icon="✓" title="Delivered" value="1,189,220" note="↗ 95.5% success rate" cls="green"/>
            <Stat icon="×" title="Failed" value="56,210" note="↗ 4.5% failure rate" cls="red"/>
            <Stat icon="▰" title="Total Revenue" value="৳ 248,650.00" note="↗ +18.2% from last month" cls="purple"/>
          </div>

          <div className="section-title"><div><h2>Quick Actions</h2><span>Complete SMS management at your fingertips</span></div><button>⚙ Customize</button></div>
          <div className="quick-grid">
            {quick.map(([title, sub, icon, cls]) => <button key={title} className={`quick-card ${cls}`} onClick={() => setActive(title)}>
              <span className="quick-icon">{icon}</span><span><b>{title}</b><small>{sub}</small></span><em>›</em>
            </button>)}
          </div>

          <div className="analytics">
            <div className="panel traffic">
              <div className="panel-head"><div><h3>SMS Traffic Overview</h3><p>Daily SMS activity for the selected period</p></div>
                <select value={period} onChange={e => setPeriod(e.target.value)}><option>Last 30 Days</option><option>This Month</option><option>Last 7 Days</option></select>
              </div>
              <div className="legend"><span><i className="dot sent"/>Sent</span><span><i className="dot delivered"/>Delivered</span><span><i className="dot failed"/>Failed</span></div>
              <div className="chart"><div className="ylabels"><span>40K</span><span>30K</span><span>20K</span><span>10K</span><span>0</span></div><div className="graph"><div className="line sent-line"/><div className="line delivered-line"/><div className="line failed-line"/><div className="grid-lines"/></div></div>
              <div className="xlabels"><span>Sep 1</span><span>Sep 4</span><span>Sep 7</span><span>Sep 10</span><span>Sep 13</span><span>Sep 16</span><span>Sep 19</span><span>Sep 22</span></div>
            </div>
            <div className="panel operator">
              <div className="panel-head"><div><h3>SMS by Operator</h3><p>Distribution by mobile operator</p></div><select><option>This Month</option><option>Last Month</option></select></div>
              <div className="donut-wrap"><div className="donut"><strong>1.24M</strong><span>Total SMS</span></div><div className="op-list">
                <Op name="Grameenphone" pct="42.5%" count="529,310" c="c1"/><Op name="Robi" pct="28.1%" count="349,930" c="c2"/><Op name="Banglalink" pct="20.3%" count="252,780" c="c3"/><Op name="Teletalk" pct="7.4%" count="92,140" c="c4"/><Op name="Others" pct="1.7%" count="21,270" c="c5"/>
              </div></div>
            </div>
          </div>

          <div className="bottom-grid">
            <div className="panel table-panel"><div className="panel-title"><h3>Recent SMS Logs</h3><button>View All</button></div><table><thead><tr><th>Time</th><th>Number</th><th>Message</th><th>Status</th></tr></thead><tbody>{logs.map(l => <tr key={l[0]}><td>{l[0]}</td><td>{l[1]}</td><td>{l[2]}</td><td><span className={l[3] === 'Delivered' ? 'status ok' : 'status bad'}>● {l[3]}</span></td></tr>)}</tbody></table></div>
            <div className="panel customers"><div className="panel-title"><h3>Latest Customers</h3><button>View All</button></div><table><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Balance</th><th>Status</th></tr></thead><tbody><tr><td>#1001</td><td>ABC Ltd</td><td>Corporate</td><td>৳ 12,450</td><td><span className="status ok">● Active</span></td></tr><tr><td>#1002</td><td>Rahim Telecom</td><td>Reseller</td><td>৳ 5,230</td><td><span className="status ok">● Active</span></td></tr><tr><td>#1003</td><td>Digital Solutions</td><td>Corporate</td><td>৳ 25,800</td><td><span className="status ok">● Active</span></td></tr><tr><td>#1004</td><td>Smart IT</td><td>Reseller</td><td>৳ 2,450</td><td><span className="status pending">● Pending</span></td></tr></tbody></table></div>
            <div className="panel health"><div className="panel-title"><h3>System Status</h3><button>View All</button></div><Health name="Database" time="12 ms"/><Health name="RabbitMQ" time="8 ms"/><Health name="SMS Gateway (InfoZillion)" time="24 ms"/><Health name="Storage" time="45% used"/><Health name="API Server" time="6 ms"/></div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({icon,title,value,note,cls}:{icon:string;title:string;value:string;note:string;cls:string}) {
  return <div className={`stat ${cls}`}><div className="stat-icon">{icon}</div><div><span>{title}</span><strong>{value}</strong><small>{note}</small></div><b className="mini-chart">▥</b></div>;
}
function Op({name,pct,count,c}:{name:string;pct:string;count:string;c:string}) { return <div className="op"><span><i className={`dot ${c}`}/>{name}</span><b>{pct}</b><small>{count}</small></div>; }
function Health({name,time}:{name:string;time:string}) { return <div className="health-row"><span>▣ &nbsp;{name}</span><b><i/>Online</b><small>{time}</small></div>; }

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
