import { useCallback, useEffect, useState } from "react";
import {
  Activity, CarFront, CheckCircle2, Download, LayoutDashboard, LogOut,
  ReceiptText, RefreshCw, ShieldAlert, ShieldCheck, Users, XCircle
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
        <p className="eyebrow">ES4WOMEN&CHILDREN ADMINISTRATION</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in with your ES4WOMEN&CHILDREN administrator account.</p>
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
        <p className="login-footnote">ES4WOMEN&CHILDREN · Tailored for Women and Children</p>
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

// A complete submitted profile is required before an administrator can review it.
// This check only indicates that fields were submitted: the administrator must
// still inspect the identity documents before approval.
function missingDriverFields(driver) {
  const required = [
    [driver.license_number, "licence number"],
    [driver.vehicle_details, "vehicle description"],
    [driver.vehicle_color, "vehicle colour"],
    [driver.plate_number, "vehicle plate number"],
    [driver.headshot_url, "headshot"],
    [driver.certified_id_path, "certified ID"],
    [driver.certified_licence_path, "certified driver's licence"],
    [driver.gender, "gender"],
  ];
  return required.filter(([value]) => !String(value ?? "").trim()).map(([, label]) => label);
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

// Payment balances currently use test credits and are not connected to a bank.
function formatNAD(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value)) return "N$—";
  return `N$${(value / 100).toLocaleString("en-NA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Export the currently visible payment rows. Escape spreadsheet formulas in text cells.
function exportPaymentsCsv(records) {
  const columns = [
    ["Payment ID", r => r.paymentId],
    ["Ride ID", r => r.rideId],
    ["Paid at", r => r.paidAt],
    ["Passenger", r => r.passengerName],
    ["Driver", r => r.driverName],
    ["Ride status", r => r.rideStatus],
    ["Booking mode", r => r.bookingMode],
    ["Payment status", r => r.paymentStatus],
    ["Payment method", r => r.paymentMethod],
    ["Paid NAD", r => (r.paidCents / 100).toFixed(2)],
    ["Refund NAD", r => (r.refundedCents / 100).toFixed(2)],
    ["Net NAD", r => (r.netCents / 100).toFixed(2)],
    ["Driver credited NAD", r => (r.driverCreditedCents / 100).toFixed(2)],
  ];
  const csvCell = input => {
    let value = String(input ?? "");
    if (/^[\s]*[=+@-]/.test(value)) value = "'" + value;
    return `"${value.replace(/"/g, '""')}"`;
  };
  const lines = [
    columns.map(([name]) => csvCell(name)).join(","),
    ...records.map(record => columns.map(([, get]) => csvCell(get(record))).join(",")),
  ];
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ES4WOMEN&CHILDREN-payment-records.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("may_admin_token") || "");
  const [page, setPage] = useState("Overview");
  const [drivers, setDrivers] = useState([]);
  const [users, setUsers] = useState([]);
  const [rides, setRides] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [safetyAlerts,setSafetyAlerts]=useState([]);
  const [safetyError,setSafetyError]=useState("");
  const [safetyBusy,setSafetyBusy]=useState("");
  const [payments, setPayments] = useState([]);
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [paymentsError, setPaymentsError] = useState("");
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [irtError, setIrtError] = useState("");
  const [irtBusy, setIrtBusy] = useState("");
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
    setAlerts([]);
    setSafetyAlerts([]);
    setPayments([]);
    setPaymentSummary(null);
    setPaymentsError("");
    setIrtError("");
    setError("");
    setNotice("");
  }, []);

  const downloadDocument = async (driver,kind) => {
    try {
      const res = await fetch(`${API}/admin/driver-document/${driver.id}/${kind}`, {
        headers: {Authorization:`Bearer ${token}`}
      });
      if(!res.ok) throw new Error(`Could not open ${kind} document`);
      const blob=await res.blob();const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;
      a.download=`ES4WOMEN&CHILDREN_${driver.name||"driver"}_${kind}.${blob.type==="application/pdf"?"pdf":blob.type==="image/png"?"png":"jpg"}`;
      document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    } catch (err) { setError(err.message || "Document download failed"); }
  };

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

  // Keep SOS monitoring independent: a failed IRT request must not hide the admin dashboard.
  const loadAlerts = useCallback(async (activeToken) => {
    try {
      const records = await request("/admin/emergency", activeToken);
      setAlerts(Array.isArray(records) ? records : []);
      setIrtError("");
    } catch (err) {
      setIrtError(err.message || "Could not load SOS incidents.");
    }
  }, []);

  const loadSafetyAlerts=useCallback(async(activeToken)=>{
    try{
      const data=await request("/admin/safety-alerts",activeToken);
      setSafetyAlerts(Array.isArray(data)?data:[]);setSafetyError("");
    }catch(e){setSafetyError(e.message||"Could not load safety alerts");}
  },[]);

  async function reviewSafety(a,action){
    if(action==='rotate'&&!window.confirm(`Issue a new arrival code only after confirming ${a.passenger_name} is safe and the route anomaly has been investigated?`))return;
    if(action==='resolve'&&!window.confirm("Close this route alert without rotating the code?"))return;
    let note;
    if(action==='resolve_emergency'){
      note=window.prompt("Only after verifying safety, resolving SOS, and documenting calls to police and emergency contacts: enter a detailed verification note (15+ characters).", "");
      if(!note||note.trim().length<15)return;
    }
    setSafetyBusy(a.id);setSafetyError("");
    try{await request(`/admin/safety-alerts/${a.id}`,token,{method:"PATCH",body:JSON.stringify({action,...(note?{note}: {})})});
      setNotice(action==='rotate'?"New private arrival code issued to passenger. It is NOT displayed to drivers.":"Safety alert resolved.");
      await loadSafetyAlerts(token);
    }catch(e){setSafetyError(e.message||"Could not review alert");}
    finally{setSafetyBusy("");}
  }

  async function recordCall(a,kind){
    const note=window.prompt(`Document the ${kind==='police_called'?'police':'emergency-contact'} call you actually made:`, "Spoke to dispatcher / contact and shared ride reference");
    if(!note||note.trim().length<3)return;
    setIrtBusy(a.id);setIrtError("");
    try{await request(`/admin/emergency/${a.id}/escalation`,token,{method:"PATCH",body:JSON.stringify({kind,note})});
      await loadAlerts(token);setNotice("Call action logged in incident audit record.");}
    catch(e){setIrtError(e.message||"Could not record call");}
    finally{setIrtBusy("");}
  }

  // Payment records are loaded independently so an API problem does not break driver/IRT views.
  const loadPayments = useCallback(async (activeToken) => {
    setPaymentsLoading(true);
    try {
      const report = await request("/admin/payments", activeToken);
      setPayments(Array.isArray(report.records) ? report.records : []);
      setPaymentSummary(report.summary || null);
      setPaymentsError("");
    } catch (err) {
      setPaymentsError(err.message || "Could not load wallet payment records.");
    } finally {
      setPaymentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    localStorage.setItem("may_admin_token", token);
    loadData(token);
    loadAlerts(token);
    loadSafetyAlerts(token);
    loadPayments(token);
    const polling = window.setInterval(() => {loadAlerts(token);loadSafetyAlerts(token);}, 10000);
    return () => window.clearInterval(polling);
  }, [token, loadData, loadAlerts, loadSafetyAlerts, loadPayments]);

  function login(newToken) {
    localStorage.setItem("may_admin_token", newToken);
    setToken(newToken);
  }

  async function reviewDriver(driver, action) {
    if (!driver.id) {
      setError("This driver record has no ID.");
      return;
    }
    if (action === "approve") {
      const missing = missingDriverFields(driver);
      if (missing.length) {
        setNotice("");
        setError(`Cannot approve ${driver.name || "this driver"}. Missing: ${missing.join(", ")}.`);
        return;
      }
    }
    if (!window.confirm(`${action === "approve" ? "Approve" : "Reject"} ${driver.name || driver.email || "this driver"}? Confirm that you opened and verified the certified documents.`)) return;

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

  async function reviewIncident(incident, action) {
    let note;
    if (action === "resolve") {
      note = window.prompt(
        "Enter the incident resolution note:",
        "Reviewed by administrator"
      );
      if (note === null) return;
      if (note.trim().length < 3) {
        setIrtError("Please enter at least 3 characters in the resolution note.");
        return;
      }
    } else if (!window.confirm("Mark this incident as acknowledged?")) {
      return;
    }
    setIrtBusy(incident.id);
    setIrtError("");
    try {
      await request(`/admin/emergency/${incident.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ action, ...(note ? { note: note.trim() } : {}) })
      });
      setNotice(`SOS incident ${action === "resolve" ? "resolved" : "acknowledged"} in the incident record.`);
      await loadAlerts(token);
    } catch (err) {
      setIrtError(err.message || "Could not update incident.");
    } finally {
      setIrtBusy("");
    }
  }

  if (!token) return <Login onLogin={login} />;

  const openSOS = alerts.filter(a => a.status === "Open");
  const unresolvedSOS = alerts.filter(a => a.status !== "Resolved");
  const openRouteAlerts=safetyAlerts.filter(a=>["AwaitingPassenger","AwaitingAdmin","NeedsHelp"].includes(a.status));
  const pending = drivers.filter(d => String(d.vetting_status || "Pending").toLowerCase() === "pending");
  const match = values => values.some(v => String(v ?? "").toLowerCase().includes(search.toLowerCase()));
  const shownDrivers = drivers.filter(d => match([d.name, d.email, d.phone, d.vetting_status, d.licence_number, d.license_number]));
  const shownUsers = users.filter(u => match([u.name, u.email, u.phone, u.role]));
  const shownRides = rides.filter(r => match([r.id, r.passenger_name, r.driver_name, r.status]));
  const shownPayments = payments.filter(p => match([p.paymentId, p.rideId, p.passengerName, p.passengerEmail, p.driverName, p.bookingMode, p.rideStatus, p.paymentStatus]));

  const nav = [
    ["Overview", LayoutDashboard],
    ["Driver approvals", CarFront],
    ["Users", Users],
    ["Rides", Activity],
    ["Payments", ReceiptText],
    ["IRT / SOS", ShieldAlert],
    ["Route safety", ShieldCheck]
  ];

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small"><ShieldCheck size={23} /></div>
          <div><strong>ES4WOMEN&CHILDREN</strong><span>ADMIN PANEL</span></div>
        </div>
        <p className="nav-heading">WORKSPACE</p>
        <nav>
          {nav.map(([label, Icon]) => (
            <button key={label} className={`nav-item ${page === label ? "selected" : ""}`}
              onClick={() => { setPage(label); setSearch(""); setError(""); setNotice(""); }}>
              <Icon size={19} /><span>{label}</span>
              {label === "Driver approvals" && pending.length > 0 && <span className="nav-count">{pending.length}</span>}
              {label === "IRT / SOS" && unresolvedSOS.length > 0 && <span className="nav-count">{unresolvedSOS.length}</span>}
              {label === "Route safety" && openRouteAlerts.length > 0 && <span className="nav-count">{openRouteAlerts.length}</span>}
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
          <div><p className="eyebrow">ES4WOMEN&CHILDREN / ADMINISTRATION</p><h1>{page}</h1></div>
          <div className="topbar-right">
            <span className="admin-label"><ShieldCheck size={16} /> Administrator</span>
            <button className="icon-button" onClick={() => { loadData(token); loadAlerts(token); loadSafetyAlerts(token); loadPayments(token); }} title="Refresh"><RefreshCw size={18} /></button>
          </div>
        </header>

        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert success">{notice}</div>}
        {loading && <p className="loading-line">Loading ES4WOMEN&CHILDREN data...</p>}
        {irtError && <div className="alert error">IRT dashboard: {irtError}. Run the backend migration if the table is missing.</div>}

        {page === "Overview" && <>
          <section className="welcome-banner">
            <div><p className="banner-kicker">SAFETY. TRUST. ACCOUNTABILITY.</p>
              <h2>Welcome to ES4WOMEN&CHILDREN Administration</h2>
              <p>Manage drivers, monitor rides and help keep the ES4WOMEN&CHILDREN community safer.</p>
            </div>
            <ShieldCheck className="banner-shield" size={75} />
          </section>
          <section className="stats-grid">
            <Stat label="Registered users" value={users.length} icon={Users} color="blue" />
            <Stat label="Total drivers" value={drivers.length} icon={CarFront} color="purple" />
            <Stat label="Pending approvals" value={pending.length} icon={Activity} color="orange" />
            <Stat label="Total rides" value={rides.length} icon={CheckCircle2} color="green" />
            <Stat label="Open SOS" value={openSOS.length} icon={ShieldAlert} color="orange" />
            <Stat label="Route safety reviews" value={openRouteAlerts.length} icon={ShieldCheck} color="purple" />
            <Stat label="Wallet ride payments" value={paymentSummary?.paidRideCount ?? "—"} icon={ReceiptText} color="blue" />
            <Stat label="Net wallet receipts" value={paymentSummary ? formatNAD(paymentSummary.netPaidCents) : "—"} icon={CheckCircle2} color="green" />
          </section>
          <section className="content-card irt-banner">
            <div className="section-heading"><div><h2>Safety incidents</h2>
              <p>Alert records are monitored every 10 seconds. Dispatcher action is required for emergency escalation.</p></div>
              <button className="text-button" onClick={() => setPage("IRT / SOS")}>Open IRT queue ({unresolvedSOS.length})</button>
            </div>
            {unresolvedSOS.length > 0
              ? <IncidentTable alerts={unresolvedSOS.slice(0, 3)} review={reviewIncident} busyId={irtBusy} />
              : <p className="muted">No unresolved SOS incidents.</p>}
          </section>
          <section className="content-card">
            <div className="section-heading"><div><h2>Pending driver applications</h2><p>Review drivers before approving them to operate.</p></div>
              <button className="text-button" onClick={() => setPage("Driver approvals")}>View all</button></div>
            <DriverTable drivers={pending.slice(0, 5)} review={reviewDriver} downloadDocument={downloadDocument} />
          </section>
          <section className="content-card">
            <div className="section-heading"><div><h2>Recent rides</h2><p>Latest ride records.</p></div>
              <button className="text-button" onClick={() => setPage("Rides")}>View all</button></div>
            <RideTable rides={rides.slice(0, 5)} />
          </section>
          <section className="content-card">
            <div className="section-heading"><div><h2>Latest paid rides</h2>
              <p>Recorded ES4WOMEN&CHILDREN Wallet debits; refunds remain visible for accountability.</p></div>
              <button className="text-button" onClick={() => setPage("Payments")}>View all payments</button></div>
            <PaymentTable payments={payments.slice(0, 5)} />
          </section>
        </>}

        {page === "Driver approvals" && <section className="content-card">
          <div className="section-heading"><div><h2>Driver applications</h2><p>Review driver details, identity documents and vehicle information before approval.</p></div>
            <span className="status amber">{pending.length} pending</span></div>
          <input className="search-input" placeholder="Search drivers..." value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{marginTop:20,marginBottom:10}}>
            <h3>Awaiting verification ({shownDrivers.filter(d => String(d.vetting_status || "Pending").toLowerCase() === "pending").length})</h3>
            <p className="muted">These are the drivers who still need an administrator decision.</p>
          </div>
          <DriverTable drivers={shownDrivers.filter(d => String(d.vetting_status || "Pending").toLowerCase() === "pending")}
            review={reviewDriver} downloadDocument={downloadDocument} detailed />
          <div style={{marginTop:28,marginBottom:10}}>
            <h3>Previously reviewed drivers</h3>
            <p className="muted">Separate accounts. Older approvals may not have submitted today's required documents.</p>
          </div>
          <DriverTable drivers={shownDrivers.filter(d => String(d.vetting_status || "Pending").toLowerCase() !== "pending")}
            review={reviewDriver} downloadDocument={downloadDocument} detailed />
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

        {page === "IRT / SOS" && <section className="content-card">
          <div className="section-heading">
            <div><h2>Immediate Response Team — incident queue</h2>
              <p>Monitored every 10 seconds. Act promptly; emergency SMS requires credentials.</p></div>
            <button className="text-button" onClick={() => loadAlerts(token)}>Refresh alerts</button>
          </div>
          <div className="alert error">
            ES4WOMEN&CHILDREN does not contact police automatically. Trusted-contact SMS is attempted only if Twilio is configured; check each delivery status. Dispatcher must actually call emergency contacts and police and document the calls.
          </div>
          <IncidentTable alerts={alerts} review={reviewIncident} recordCall={recordCall} busyId={irtBusy} />
        </section>}

        {page === "Route safety" && <section className="content-card">
          <div className="section-heading"><div><h2>GPS route deviation and idle alerts</h2>
            <p>Automatic flags are advisory; investigate before confirming safety or issuing new codes.</p></div>
            <button className="text-button" onClick={()=>loadSafetyAlerts(token)}>Refresh</button></div>
          {safetyError && <div className="alert error">{safetyError}</div>}
          <div className="alert error">Replacement arrival codes are rotated automatically after an SOS, but emergency flags and ride-completion blocks remain active until administrator review. Do not mark an incident resolved without confirming safety.</div>
          <div className="table-wrap"><table><thead><tr><th>Reported</th><th>Passenger and trusted contact</th><th>Driver</th><th>Reason</th><th>Passenger status</th><th>Action</th></tr></thead>
          <tbody>{safetyAlerts.map(a=><tr key={a.id}>
            <td>{formatDate(a.created_at)}<small>#{String(a.ride_id).slice(0,8)}</small></td>
            <td>{a.passenger_name}<div className="muted">{a.passenger_phone}</div>
              <div className="muted">Trusted: {a.emergency_contact_name} — {a.emergency_contact_phone}</div></td>
            <td>{a.driver_name}<div className="muted">{a.driver_phone}</div></td>
            <td><strong>{a.reason?.replace(/_/g," ")}</strong><div className="muted">{a.pickup} → {a.dropoff}</div></td>
            <td><span className={statusClass(a.status)}>{a.status}</span>
              <div className="muted">{a.passenger_safe===true?"Confirmed safe":a.passenger_safe===false?"Needs urgent help":"Awaiting response"}</div></td>
            <td>{a.status==='AwaitingAdmin'&&a.passenger_safe===true&&!a.emergency_flag&&!a.driver_finished&&<>
              <button className="approve-button" disabled={safetyBusy===a.id} onClick={()=>reviewSafety(a,"rotate")}>Issue new code</button>
              <button className="text-button" disabled={safetyBusy===a.id} onClick={()=>reviewSafety(a,"resolve")}>Keep original code</button>
            </>}
            {a.status==='AwaitingPassenger'&&<span className="muted">Awaiting passenger</span>}
            {a.status==='NeedsHelp'&&<>
              <strong style={{color:"#9D562E"}}>URGENT — Call passenger, trusted contact, police</strong>
              {a.latest_sos_status==='Resolved'&&a.contact_called_at&&a.police_called_at&&!a.emergency_flag&&
                <button className="text-button" disabled={safetyBusy===a.id}
                  onClick={()=>reviewSafety(a,"resolve_emergency")}>Close after verified safety (no new code)</button>}
            </>}
            </td>
          </tr>)}</tbody></table>
          {safetyAlerts.length===0&&<div className="empty-state">No route anomalies recorded.</div>}
          </div>
        </section>}

        {page === "Rides" && <section className="content-card">
          <div className="section-heading"><div><h2>Ride monitoring</h2><p>Review recorded rides and their status.</p></div></div>
          <input className="search-input" placeholder="Search rides..." value={search} onChange={e => setSearch(e.target.value)} />
          <RideTable rides={shownRides} />
        </section>}

        {page === "Payments" && <>
          <section className="content-card">
            <div className="section-heading">
              <div><h2>ES4WOMEN&CHILDREN Wallet — paid rides register</h2>
                <p>Academic simulation · No actual MoMo, bank or card payments. Records are read-only.</p></div>
              <button className="text-button" disabled={paymentsLoading} onClick={() => loadPayments(token)}>
                {paymentsLoading ? "Refreshing..." : "Refresh payments"}
              </button>
            </div>
            {paymentsError && <div className="alert error">Payments: {paymentsError}. Ensure Revision 03 migration has run.</div>}
            <div className="payment-stats">
              <div><span>Paid bookings</span><strong>{paymentSummary?.paidRideCount ?? "—"}</strong></div>
              <div><span>Gross collected</span><strong>{paymentSummary ? formatNAD(paymentSummary.grossPaidCents) : "—"}</strong></div>
              <div><span>Refunds</span><strong>{paymentSummary ? formatNAD(paymentSummary.refundedCents) : "—"}</strong></div>
              <div><span>Net collected</span><strong>{paymentSummary ? formatNAD(paymentSummary.netPaidCents) : "—"}</strong></div>
              <div><span>Completed paid rides</span><strong>{paymentSummary?.completedPaidRideCount ?? "—"}</strong></div>
              <div><span>Driver wallet credits</span><strong>{paymentSummary ? formatNAD(paymentSummary.driverCreditedCents) : "—"}</strong></div>
            </div>
            <p className="muted">Payment is recorded at booking. Driver earnings are credited after Safe Arrival. Refunds remain in the history; figures are simulated NAD.</p>
            <div className="payment-toolbar">
              <input className="search-input" placeholder="Search passenger, driver, ride or payment status..." value={search} onChange={e => setSearch(e.target.value)} />
              <button className="text-button" disabled={!shownPayments.length} onClick={() => exportPaymentsCsv(shownPayments)}>
                <Download size={14} /> Export visible rows (CSV)
              </button>
            </div>
            <PaymentTable payments={shownPayments} />
            <p className="muted">Showing {shownPayments.length} matching records from up to 500 latest paid rides. Totals above include all paid rides.</p>
          </section>
        </>}

        <footer className="page-footer">ES4WOMEN&CHILDREN · Tailored for Women and Children <span>Administrator workspace</span></footer>
      </main>
    </div>
  );
}

function DriverTable({ drivers, review, downloadDocument, detailed = false }) {
  if (!drivers.length) return <div className="empty-state">No driver applications found.</div>;

  return <div className="table-wrap"><table>
    <thead><tr><th>Driver</th>{detailed && <th>Phone</th>}<th>Licence</th><th>Vehicle</th><th>Verified files</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>{drivers.map(d => {
      const status = d.vetting_status || "Pending";
      const missing = missingDriverFields(d);
      const isPending = String(status).toLowerCase() === "pending";
      const vehicle = [d.vehicle_details, d.vehicle_color, d.plate_number].filter(Boolean).join(" · ")
        || [d.vehicle_make, d.vehicle_model, d.vehicle_color, d.vehicle_registration].filter(Boolean).join(" · ")
        || "—";
      return <tr key={d.id}>
        <td><div className="person-cell"><div className="avatar">{d.headshot_url?<img src={`${API.replace(/\/api$/, "")}${d.headshot_url}`}
            alt="Driver headshot" style={{width:35,height:35,borderRadius:"50%",objectFit:"cover"}}/>:(d.name || "D").charAt(0).toUpperCase()}</div>
          <div><strong>{d.name || "Unnamed driver"}</strong><small>{d.email || "—"}</small><small>{d.gender||"Gender not provided"}</small></div></div></td>
        {detailed && <td>{d.phone || "—"}</td>}
        <td>{d.licence_number || d.license_number || "—"}</td><td>{vehicle}</td>
        <td><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          {d.certified_id_path ? <button className="text-button" onClick={()=>downloadDocument?.(d,"id")}>Certified ID</button> : <span className="muted">{isPending ? "ID needed" : "ID not on file (older record)"}</span>}
          {d.certified_licence_path ? <button className="text-button" onClick={()=>downloadDocument?.(d,"licence")}>Certified licence</button> : <span className="muted">{isPending ? "Licence needed" : "Licence not on file (older record)"}</span>}
        </div></td>
        <td><span className={statusClass(status)}>{status}</span></td>
        <td>{isPending ? <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {missing.length > 0 && <small className="muted">Missing: {missing.join(", ")}</small>}
          <div className="action-group">
            <button className="approve-button" onClick={() => review(d, "approve")}><CheckCircle2 size={15} /> Approve</button>
            <button className="reject-button" onClick={() => review(d, "reject")}><XCircle size={15} /> Reject</button>
          </div>
        </div> : <span className="muted">{missing.length ? "Previously reviewed · profile incomplete" : "Reviewed"}</span>}</td>
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
function PaymentTable({ payments }) {
  if (!payments.length) return <div className="empty-state">No wallet-paid rides recorded yet. Complete a wallet booking to create a record.</div>;
  return <div className="table-wrap"><table>
    <thead><tr><th>Payment date</th><th>Ride</th><th>Passenger</th><th>Driver</th><th>Mode</th><th>Ride status</th><th>Payment</th><th>Paid</th><th>Refund</th><th>Net</th><th>Driver credited</th></tr></thead>
    <tbody>{payments.map(p => <tr key={p.paymentId}>
      <td>{formatDate(p.paidAt)}</td>
      <td className="primary-cell" title={p.rideId}>#{String(p.rideId).slice(0, 8)}</td>
      <td>{p.passengerName || "—"}<div className="muted">{p.passengerEmail || ""}</div></td>
      <td>{p.driverName || "Unassigned"}</td>
      <td>{p.bookingMode || "—"}</td>
      <td><span className={statusClass(p.rideStatus)}>{p.rideStatus || "—"}</span></td>
      <td><span className={statusClass(p.paymentStatus === "Paid" ? "Completed" : "Cancelled")}>{p.paymentStatus}</span>
        <div className="muted">{p.paymentMethod}</div></td>
      <td className="payment-amount">{formatNAD(p.paidCents)}</td>
      <td>{formatNAD(p.refundedCents)}</td>
      <td className="payment-amount">{formatNAD(p.netCents)}</td>
      <td>{formatNAD(p.driverCreditedCents)}</td>
    </tr>)}</tbody>
  </table></div>;
}

function IncidentTable({ alerts, review, recordCall, busyId }) {
  if (!alerts.length) return <div className="empty-state">No SOS incidents recorded yet.</div>;
  return <div className="table-wrap"><table>
    <thead><tr><th>Reported</th><th>Passenger</th><th>Driver</th><th>Ride / route</th><th>Location</th><th>Status</th><th>Dispatch action</th></tr></thead>
    <tbody>{alerts.map(alert => {
      const validCoords = alert.latitude != null && alert.longitude != null;
      const locationUrl = validCoords
        ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(alert.latitude)}&mlon=${encodeURIComponent(alert.longitude)}#map=16/${encodeURIComponent(alert.latitude)}/${encodeURIComponent(alert.longitude)}`
        : null;
      return <tr key={alert.id}>
        <td>{formatDate(alert.created_at)}</td>
        <td className="primary-cell">{alert.passenger_name || "Passenger"}<div className="muted">{alert.passenger_phone || "No phone"}</div></td>
        <td>{alert.driver_name || "Not assigned"}<div className="muted">{alert.driver_phone || "No phone"}</div></td>
        <td><div style={{fontWeight:800}}>{alert.reported_by_role === "Driver" ? "DRIVER SOS · driver reports danger" : alert.affected_parties === "Both" ? "PASSENGER SOS · both may be at risk" : "PASSENGER SOS"}</div><div>{alert.pickup || "Pickup unknown"}</div><div className="muted">To: {alert.dropoff || "Destination unknown"}</div><div className="muted">Ride #{String(alert.ride_id).slice(0, 8)} ({alert.ride_status})</div></td>
        <td>{locationUrl ? <a href={locationUrl} target="_blank" rel="noopener noreferrer">View on map</a> : "Unavailable"}
          <div className="muted">{alert.location_source === "last_known" ? "Recent phone location" : alert.location_source === "pickup" ? "Booked pickup (not live)" : "No location"}</div></td>
        <td><span className={`status ${alert.status === "Resolved" ? "green" : alert.status === "Acknowledged" ? "amber" : "red"}`}>{alert.status}</span></td>
        <td>
          <div className="muted">Passenger contact: <strong>{alert.passenger_emergency_name||"Not on file"}</strong> ({alert.passenger_emergency_phone||"No number"})</div>
          {!!alert.passenger_emergency_phone&&<a href={`tel:${alert.passenger_emergency_phone}`}>Call passenger contact</a>}
          <div className="muted">Driver contact: {alert.driver_emergency_name||"Not on file"} ({alert.driver_emergency_phone||"No number"})</div>
          {!!alert.driver_emergency_phone&&<a href={`tel:${alert.driver_emergency_phone}`}>Call driver contact</a>}
          <div className="muted">SMS passenger: {alert.emergency_contact_sms_status === "not_configured" ? "Delivery unavailable" : (alert.emergency_contact_sms_status||"Delivery unavailable")}</div>
          <div className="muted">SMS driver: {alert.driver_contact_sms_status === "not_configured" ? "Delivery unavailable" : (alert.driver_contact_sms_status||"Delivery unavailable")}</div>
          <div className="muted">Contact called: {formatDate(alert.contact_called_at)}</div>
          <div className="muted">Police called: {formatDate(alert.police_called_at)}</div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:8}}>
            <button className="text-button" disabled={busyId===alert.id} onClick={()=>recordCall(alert,"contact_called")}>Record contact call</button>
            <button className="text-button" disabled={busyId===alert.id} onClick={()=>recordCall(alert,"police_called")}>Record police call</button>
          </div>
          {alert.status === "Open" &&
          <button className="approve-button" disabled={busyId === alert.id} onClick={() => review(alert, "acknowledge")}>Acknowledge</button>}
          {alert.status === "Acknowledged" &&
          <button className="approve-button" disabled={busyId === alert.id} onClick={() => review(alert, "resolve")}>Resolve</button>}
          {alert.status === "Resolved" && <div className="muted">{alert.resolution_note || "Closed"}</div>}
        </td>
      </tr>;
    })}</tbody>
  </table></div>;
}
