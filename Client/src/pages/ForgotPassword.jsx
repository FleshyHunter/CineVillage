import { useState } from "react";
import SeatSelectionButton from "../components/SeatSelectionButton";
import { requestCustomerPasswordReset } from "../services/api";
import "./Login.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedEmail = (email || "").trim();
    if (!trimmedEmail) {
      setError("Please enter your email.");
      setInfo("");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      const response = await requestCustomerPasswordReset({ email: trimmedEmail });
      setInfo(response?.message || "If an account exists for this email, a reset link has been sent.");
    } catch (requestError) {
      setInfo("");
      setError(requestError?.message || "Unable to send reset link right now.");
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

          <p className="auth-client-kicker">Recovery Access</p>
          <h1>Reset Your Customer Account Password.</h1>
          <p>Enter your account email and we will send a reset link.</p>
        </section>

        <section className="auth-client-panel">
          <h2>Forgot Password</h2>
          <p className="auth-client-caption">Use your CineVillage account email.</p>

          {info ? <div className="auth-client-info">{info}</div> : null}
          {error ? <div className="auth-client-error">{error}</div> : null}

          <form className="auth-client-form" onSubmit={handleSubmit}>
            <label className="auth-client-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                placeholder="Enter your email"
                autoComplete="email"
              />
            </label>

            <SeatSelectionButton type="submit" variant="primary" className="auth-client-submit" disabled={isSubmitting}>
              {isSubmitting ? "SENDING..." : "SEND RESET LINK"}
            </SeatSelectionButton>
          </form>

          <p className="auth-client-help">
            Back to login?{" "}
            <a href="#login">
              Sign in here
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
