import { useCallback, useEffect, useState } from "react";
import {
  Activity, CarFront, CheckCircle2, LayoutDashboard, LogOut,
  RefreshCw, ShieldCheck, Users, XCircle
} from "lucide-react";
import "./App.css";

const API = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/$/, "");

async function request(path, token, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const result = await request("/auth/login", null, {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      const token = result.token || result.accessToken || result.access_token;
      const user = result.user || result.data?.user;

      if (!token) throw new Error("No token returned. Check the backend login response.");
      if (user?.role && user.role.toLowerCase() !== "admin") {
        throw new Error("This account is not an administrator.");
      }

      onLogin(token, user);
    } catch (err) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark"><ShieldCheck size={30} /></div>
        <p className="eyebrow">MAY ADMINISTRATION</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in with your May administrator account.</p>
        {error && <div className="alert error">{error}</div>}
        <label htmlFor="email">Email address</label>
        <input id="email" type="email" autoComplete="username"
          value={email} onChange={e => setEmail(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)} required />
        <button className="primary-button full-button" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
        <p className="login-footnote">May · Safe for Her</p>
      </form>
    </main>
  );
}

function Stat({ label, value, icon: Icon, color }) {
  return (
    <article className="stat-card">
      <div><p className="stat-label">{label}</p><h2>{value}</h2></div>
      <div className={`stat-icon ${color}`}><Icon size={23} /></div>
    </article>
  );
}

function statusClass(value) {
  const s = String(value || "Unknown").toLowerCase();
  if (["approved", "completed", "active", "verified"].includes(s)) return "status green";
  if (["rejected", "cancelled", "canceled"].includes(s)) return "status red";
  return "status amber";
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("may_admin_token") || "");
  const [page, setPage] = useState("Overview");
  const [drivers, setDrivers] = useState([]);
  const [users, setUsers] = useState([]);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const logout = useCallback(() => {
    localStorage.removeItem("may_admin_token");
    setToken("");
    setDrivers([]);
    setUsers([]);
    setRides([]);
    setError("");
    setNotice("");
  }, []);

  const loadData = useCallback(async (activeToken) => {
    setLoading(true);
    setError("");

    try {
      const [d, u, r] = await Promise.all([
        request("/admin/drivers", activeToken),
        request("/admin/users", activeToken),
        request("/admin/rides", activeToken)
      ]);
      setDrivers(Array.isArray(d) ? d : d.drivers || []);
      setUsers(Array.isArray(u) ? u : u.users || []);
      setRides(Array.isArray(r) ? r : r.rides || []);
    } catch (err) {
      setError(err.message || "Could not load dashboard data.");
      if (/unauthorized|forbidden|invalid token|token expired/i.test(err.message)) logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    if (token) {
      localStorage.setItem("may_admin_token", token);
      loadData(token);
    }
  }, [token, loadData]);

  function login(newToken) {
    localStorage.setItem("may_admin_token", newToken);
    setToken(newToken);
  }

  async function reviewDriver(driver, action) {
    if (!driver.id) {
      setError("This driver record has no ID.");
      return;
    }
    if (!window.confirm(`${action === "approve" ? "Approve" : "Reject"} ${driver.name || "this driver"}?`)) return;

    setError("");
    setNotice("");
    try {
      await request(`/admin/approve-driver/${driver.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ action })
      });
      setNotice(`Driver ${action === "approve" ? "approved" : "rejected"} successfully.`);
      await loadData(token);
    } catch (err) {
      setError(err.message || "Could not update driver.");
    }
  }

  if (!token) return <Login onLogin={login} />;

  const pending = drivers.filter(d => String(d.vetting_status || "Pending").toLowerCase() === "pending");
  const match = values => values.some(v => String(v ?? "").toLowerCase().includes(search.toLowerCase()));
  const shownDrivers = drivers.filter(d => match([d.name, d.email, d.phone, d.vetting_status, d.licence_number, d.license_number]));
  const shownUsers = users.filter(u => match([u.name, u.email, u.phone, u.role]));
  const shownRides = rides.filter(r => match([r.id, r.passenger_name, r.driver_name, r.status]));

  const nav = [
    ["Overview", LayoutDashboard],
    ["Driver approvals", CarFront],
    ["Users", Users],
    ["Rides", Activity]
  ];

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small"><ShieldCheck size={23} /></div>
          <div><strong>MAY</strong><span>ADMIN PANEL</span></div>
        </div>
        <p className="nav-heading">WORKSPACE</p>
        <nav>
          {nav.map(([label, Icon]) => (
            <button key={label} className={`nav-item ${page === label ? "selected" : ""}`}
              onClick={() => { setPage(label); setSearch(""); setError(""); setNotice(""); }}>
              <Icon size={19} /><span>{label}</span>
              {label === "Driver approvals" && pending.length > 0 && <span className="nav-count">{pending.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note"><ShieldCheck size={20} /><div><strong>Safety first</strong><p>Every driver matters.</p></div></div>
          <button className="logout-button" onClick={logout}><LogOut size={18} /> Sign out</button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div><p className="eyebrow">MAY / ADMINISTRATION</p><h1>{page}</h1></div>
          <div className="topbar-right">
            <span className="admin-label"><ShieldCheck size={16} /> Administrator</span>
            <button className="icon-button" onClick={() => loadData(token)} title="Refresh"><RefreshCw size={18} /></button>
          </div>
        </header>

        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert success">{notice}</div>}
        {loading && <p className="loading-line">Loading May data...</p>}

        {page === "Overview" && <>
          <section className="welcome-banner">
            <div><p className="banner-kicker">SAFETY. TRUST. ACCOUNTABILITY.</p>
              <h2>Welcome to May Administration</h2>
              <p>Manage drivers, monitor rides and help keep the May community safer.</p>
            </div>
            <ShieldCheck className="banner-shield" size={75} />
          </section>
          <section className="stats-grid">
            <Stat label="Registered users" value={users.length} icon={Users} color="blue" />
            <Stat label="Total drivers" value={drivers.length} icon={CarFront} color="purple" />
            <Stat label="Pending approvals" value={pending.length} icon={Activity} color="orange" />
            <Stat label="Total rides" value={rides.length} icon={CheckCircle2} color="green" />
          </section>
          <section className="content-card">
            <div className="section-heading"><div><h2>Pending driver applications</h2><p>Review drivers before approving them to operate.</p></div>
              <button className="text-button" onClick={() => setPage("Driver approvals")}>View all</button></div>
            <DriverTable drivers={pending.slice(0, 5)} review={reviewDriver} />
          </section>
          <section className="content-card">
            <div className="section-heading"><div><h2>Recent rides</h2><p>Latest ride records.</p></div>
              <button className="text-button" onClick={() => setPage("Rides")}>View all</button></div>
            <RideTable rides={rides.slice(0, 5)} />
          </section>
        </>}

        {page === "Driver approvals" && <section className="content-card">
          <div className="section-heading"><div><h2>Driver applications</h2><p>Review applications and make approval decisions.</p></div>
            <span className="status amber">{pending.length} pending</span></div>
          <input className="search-input" placeholder="Search drivers..." value={search} onChange={e => setSearch(e.target.value)} />
          <DriverTable drivers={shownDrivers} review={reviewDriver} detailed />
        </section>}

        {page === "Users" && <section className="content-card">
          <div className="section-heading"><div><h2>Registered users</h2><p>Accounts, roles and verification status.</p></div></div>
          <input className="search-input" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Verification</th><th>Joined</th></tr></thead>
            <tbody>{shownUsers.map(u => <tr key={u.id}>
              <td className="primary-cell">{u.name || "—"}</td><td>{u.email || "—"}</td><td>{u.phone || "—"}</td>
              <td><span className="role-pill">{u.role || "—"}</span></td>
              <td><span className={statusClass(u.is_verified ? "Verified" : "Pending")}>{u.is_verified ? "Verified" : "Unverified"}</span></td>
              <td>{formatDate(u.created_at)}</td>
            </tr>)}</tbody></table>
            {shownUsers.length === 0 && <div className="empty-state">No users found.</div>}
          </div>
        </section>}

        {page === "Rides" && <section className="content-card">
          <div className="section-heading"><div><h2>Ride monitoring</h2><p>Review recorded rides and their status.</p></div></div>
          <input className="search-input" placeholder="Search rides..." value={search} onChange={e => setSearch(e.target.value)} />
          <RideTable rides={shownRides} />
        </section>}

        <footer className="page-footer">May · Safe for Her <span>Administrator workspace</span></footer>
      </main>
    </div>
  );
}

function DriverTable({ drivers, review, detailed = false }) {
  if (!drivers.length) return <div className="empty-state">No driver applications found.</div>;

  return <div className="table-wrap"><table>
    <thead><tr><th>Driver</th>{detailed && <th>Phone</th>}<th>Licence</th><th>Vehicle</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>{drivers.map(d => {
      const status = d.vetting_status || "Pending";
      const vehicle = [d.vehicle_make, d.vehicle_model, d.vehicle_color].filter(Boolean).join(" ") || d.vehicle_registration || "—";
      return <tr key={d.id}>
        <td><div className="person-cell"><div className="avatar">{(d.name || "D").charAt(0).toUpperCase()}</div>
          <div><strong>{d.name || "Unnamed driver"}</strong><small>{d.email || "—"}</small></div></div></td>
        {detailed && <td>{d.phone || "—"}</td>}
        <td>{d.licence_number || d.license_number || "—"}</td><td>{vehicle}</td>
        <td><span className={statusClass(status)}>{status}</span></td>
        <td>{String(status).toLowerCase() === "pending" ? <div className="action-group">
          <button className="approve-button" onClick={() => review(d, "approve")}><CheckCircle2 size={15} /> Approve</button>
          <button className="reject-button" onClick={() => review(d, "reject")}><XCircle size={15} /> Reject</button>
        </div> : <span className="muted">No action</span>}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}

function RideTable({ rides }) {
  if (!rides.length) return <div className="empty-state">No ride records found.</div>;
  return <div className="table-wrap"><table><thead><tr><th>Ride ID</th><th>Passenger</th><th>Driver</th><th>Status</th><th>Date</th></tr></thead>
    <tbody>{rides.map(r => <tr key={r.id}>
      <td className="primary-cell">#{String(r.id).slice(0, 8)}</td>
      <td>{r.passenger_name || r.passenger_id || "—"}</td><td>{r.driver_name || r.driver_id || "Unassigned"}</td>
      <td><span className={statusClass(r.status)}>{r.status || "Unknown"}</span></td><td>{formatDate(r.created_at)}</td>
    </tr>)}</tbody></table></div>;
}