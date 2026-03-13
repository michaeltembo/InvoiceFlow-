import { useEffect, useState } from "react";
import axios from "axios";

const API = "http://localhost:3000";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState(null);

  const token = localStorage.getItem("token");

  const login = async () => {
    const res = await axios.post(`${API}/login`, { email, password });
    localStorage.setItem("token", res.data.token);
    window.location.reload();
  };

  const fetchInvoices = async () => {
    const res = await axios.get(`${API}/invoices`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setInvoices(res.data.results);
  };

  const fetchStats = async () => {
    const res = await axios.get(`${API}/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setStats(res.data);
  };

  useEffect(() => {
    if (token) {
      fetchInvoices();
      fetchStats();
    }
  }, [token]);

  if (!token) {
    return (
      <div>
        <h2>Login</h2>
        <input placeholder="Email" onChange={e => setEmail(e.target.value)} />
        <input
          placeholder="Password"
          type="password"
          onChange={e => setPassword(e.target.value)}
        />
        <button onClick={login}>Login</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Invoice Dashboard</h1>

      {stats && (
        <div>
          <p>Total Revenue: ${stats.totalRevenue}</p>
          <p>Unpaid Revenue: ${stats.unpaidRevenue}</p>
          <p>Total Invoices: {stats.totalInvoices}</p>
        </div>
      )}

      <h2>Invoices</h2>
      {invoices.map(inv => (
        <div key={inv.id}>
          {inv.client} - ${inv.amount} - {inv.status}
        </div>
      ))}
    </div>
  );
}

export default App;

