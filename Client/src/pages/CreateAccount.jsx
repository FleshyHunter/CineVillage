import { useState } from "react";
import SeatSelectionButton from "../components/SeatSelectionButton";
import { useAccount } from "../context/AccountContext";
import "./Login.css";

const AUTH_INFO_STORAGE_KEY = "cinevillage_auth_info_message";

export default function CreateAccount() {
  const { registerCustomer } = useAccount();
  const [form, setForm] = useState({
    name: "",
    email: "",
    contact: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value
    }));
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim();
    const contact = form.contact.trim();
    const password = form.password.trim();

    if (!name || !email || !contact || !password) {
      setError("Name, email, contact, and password are required.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      await registerCustomer({
        name,
        email,
        contact,
        password
      });

      window.sessionStorage.setItem(
        AUTH_INFO_STORAGE_KEY,
        "Account created. Please log in using your email and password."
      );
      window.location.hash = "#login";
    } catch (createError) {
      setError(createError?.message || "Failed to create account.");
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
              <p>Customer Portal</p>
            </div>
          </div>

          <p className="auth-client-kicker">Create Account</p>
          <h1>Set Up Your CineVillage Member Profile.</h1>
          <p>
            Register once to manage your bookings and access your tickets from one place.
          </p>
        </section>

        <section className="auth-client-panel">
          <h2>Create Account</h2>
          <p className="auth-client-caption">Enter your details below.</p>

          {error ? <div className="auth-client-error">{error}</div> : null}

          <form className="auth-client-form" onSubmit={handleSubmit}>
            <label className="auth-client-field">
              <span>Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => handleChange("name", event.target.value)}
                placeholder="Enter your name"
                autoComplete="name"
              />
            </label>

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
              <span>Contact</span>
              <input
                type="text"
                value={form.contact}
                onChange={(event) => handleChange("contact", event.target.value)}
                placeholder="Enter your contact number"
                autoComplete="tel"
              />
            </label>

            <label className="auth-client-field">
              <span>Password</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => handleChange("password", event.target.value)}
                placeholder="Create your password"
                autoComplete="new-password"
              />
            </label>

            <SeatSelectionButton type="submit" variant="primary" className="auth-client-submit" disabled={isSubmitting}>
              {isSubmitting ? "CREATING..." : "CREATE ACCOUNT"}
            </SeatSelectionButton>
          </form>

          <p className="auth-client-help">
            Already have an account?{" "}
            <a href="#login">
              Back to login
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
