import { useEffect, useState } from "react";
import SeatSelectionButton from "../components/SeatSelectionButton";
import { resetCustomerPasswordWithToken, validateCustomerResetToken } from "../services/api";
import "./Login.css";

const AUTH_INFO_STORAGE_KEY = "cinevillage_auth_info_message";

export default function ResetPassword({ resetToken = "" }) {
  const [form, setForm] = useState({
    newPassword: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isTokenValid, setIsTokenValid] = useState(false);

  useEffect(() => {
    const token = (resetToken || "").trim();
    if (!token) {
      setIsTokenValid(false);
      setError("This reset link is invalid or has expired.");
      setIsValidating(false);
      return;
    }

    let isActive = true;
    async function validateToken() {
      try {
        setIsValidating(true);
        setError("");
        await validateCustomerResetToken(token);
        if (!isActive) return;
        setIsTokenValid(true);
      } catch (validationError) {
        if (!isActive) return;
        setIsTokenValid(false);
        setError(validationError?.message || "This reset link is invalid or has expired.");
      } finally {
        if (isActive) setIsValidating(false);
      }
    }

    validateToken();
    return () => {
      isActive = false;
    };
  }, [resetToken]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isTokenValid || isSubmitting) return;

    const newPassword = (form.newPassword || "").trim();
    const confirmPassword = (form.confirmPassword || "").trim();
    if (!newPassword || !confirmPassword) {
      setError("Please fill in both password fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      const response = await resetCustomerPasswordWithToken(resetToken, {
        newPassword,
        confirmPassword
      });
      setInfo(response?.message || "Password updated successfully. Please log in.");
      window.sessionStorage.setItem(
        AUTH_INFO_STORAGE_KEY,
        "Password updated successfully. Please log in."
      );
      window.location.hash = "#login";
    } catch (resetError) {
      setInfo("");
      setError(resetError?.message || "Failed to reset password.");
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
          <h1>Set A New Password.</h1>
          <p>Choose a new password to regain access to your customer account.</p>
        </section>

        <section className="auth-client-panel">
          <h2>Create New Password</h2>
          <p className="auth-client-caption">Your reset link is valid for a limited time.</p>

          {info ? <div className="auth-client-info">{info}</div> : null}
          {error ? <div className="auth-client-error">{error}</div> : null}

          {isValidating ? (
            <div className="auth-client-info">Validating reset link...</div>
          ) : null}

          {!isValidating && !isTokenValid ? (
            <p className="auth-client-help">
              Request a new link?{" "}
              <a href="#forgot-password">
                Reset here
              </a>
            </p>
          ) : null}

          {!isValidating && isTokenValid ? (
            <form className="auth-client-form" onSubmit={handleSubmit}>
              <label className="auth-client-field">
                <span>New Password</span>
                <input
                  type="password"
                  value={form.newPassword}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, newPassword: event.target.value }));
                    setError("");
                  }}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                />
              </label>

              <label className="auth-client-field">
                <span>Confirm Password</span>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, confirmPassword: event.target.value }));
                    setError("");
                  }}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                />
              </label>

              <SeatSelectionButton type="submit" variant="primary" className="auth-client-submit" disabled={isSubmitting}>
                {isSubmitting ? "UPDATING..." : "UPDATE PASSWORD"}
              </SeatSelectionButton>
            </form>
          ) : null}

          <p className="auth-client-help">
            Back to login?{" "}
            <a href="#login">
              Sign in here
            </a>
          </p>
        </section>
      </div>
    </section>
  );
}
