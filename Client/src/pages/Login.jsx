import { useEffect, useState } from "react";
import SeatSelectionButton from "../components/SeatSelectionButton";
import { useAccount } from "../context/AccountContext";
import "./Login.css";

const AUTH_INFO_STORAGE_KEY = "cinevillage_auth_info_message";

export default function Login() {
  const { loginCustomer, isAuthenticated, isAuthHydrating } = useAccount();
  const [form, setForm] = useState({
    email: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const storedMessage = window.sessionStorage.getItem(AUTH_INFO_STORAGE_KEY);
    if (storedMessage) {
      setInfo(storedMessage);
      window.sessionStorage.removeItem(AUTH_INFO_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!isAuthHydrating && isAuthenticated) {
      window.location.hash = "#";
    }
  }, [isAuthenticated, isAuthHydrating]);

  function handleChange(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value
    }));
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const email = form.email.trim();
    const password = form.password.trim();

    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      await loginCustomer({ email, password });
      window.location.hash = "#";
    } catch (loginError) {
      setError(loginError?.message || "Unable to login.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-client-page">
      <div className="auth-client-shell">
        <section className="auth-client-hero">
          <div className="auth-client-brand">
            <img src="/CVLogo2.png" alt="CineVillage Logo" className="auth-client-brand-logo" />
            <div>
              <h2>CineVillage</h2>
            </div>
          </div>

          <p className="auth-client-kicker">Member Access</p>
          <h1>Book Tickets Faster With Your CineVillage Account.</h1>
          <p>
            Sign in to view your tickets, manage bookings, and complete checkout with your saved details.
          </p>
        </section>

        <section className="auth-client-panel">
          <h2>Sign In</h2>
          <p className="auth-client-caption">Use your CineVillage customer credentials.</p>

          {info ? <div className="auth-client-info">{info}</div> : null}
          {error ? <div className="auth-client-error">{error}</div> : null}

          <form className="auth-client-form" onSubmit={handleSubmit}>
            <label className="auth-client-field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => handleChange("email", event.target.value)}
                placeholder="Enter your email"
                autoComplete="email"
              />
            </label>

            <label className="auth-client-field">
              <span>Password</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => handleChange("password", event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </label>

            <SeatSelectionButton type="submit" variant="primary" className="auth-client-submit" disabled={isSubmitting}>
              {isSubmitting ? "LOGGING IN..." : "LOGIN"}
            </SeatSelectionButton>
          </form>

          <p className="auth-client-help">
            New here?{" "}
            <a href="#create-account">
              Create new account
            </a>
          </p>

          <p className="auth-client-help">
            Forgot your password?{" "}
            <a href="#forgot-password">
              Reset here
            </a>
          </p>

          <div className="auth-client-actions">
            <SeatSelectionButton variant="secondary" onClick={() => { window.location.hash = "#"; }}>
              BACK TO HOME
            </SeatSelectionButton>
          </div>
        </section>
      </div>
    </section>
  );
}
